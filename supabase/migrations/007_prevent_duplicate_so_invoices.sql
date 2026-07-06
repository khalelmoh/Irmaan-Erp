create or replace function public.validate_invoice_source_uniqueness(
  p_invoice_id uuid,
  p_document jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sales_order_id text;
  existing_invoice public.invoices;
begin
  if p_document->>'type' <> 'invoice' then
    return;
  end if;
  if p_document->>'status' = 'cancelled' then
    return;
  end if;

  sales_order_id := nullif(p_document->>'salesOrderId', '');
  if sales_order_id is null then
    return;
  end if;

  select * into existing_invoice
  from public.invoices
  where id <> p_invoice_id
    and document->>'type' = 'invoice'
    and document->>'salesOrderId' = sales_order_id
    and document->>'status' <> 'cancelled'
  limit 1;

  if existing_invoice.id is not null then
    raise exception 'Sales order is already linked to invoice %',
      coalesce(existing_invoice.document->>'invoiceNumber', existing_invoice.id::text)
      using errcode = '23505';
  end if;
end;
$$;

create unique index if not exists invoices_one_active_invoice_per_sales_order_idx
on public.invoices ((document->>'salesOrderId'))
where document->>'type' = 'invoice'
  and nullif(document->>'salesOrderId', '') is not null
  and document->>'status' <> 'cancelled';

create or replace function public.create_invoice(p_document jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor public.users;
  invoice_id uuid := gen_random_uuid();
  invoice_number text;
  doc jsonb;
begin
  actor := public.require_invoice_role();
  invoice_number := public.claim_document_number('invoices', 'INV', 5);
  doc := public.build_invoice_document(invoice_id, p_document, invoice_number, actor.uid);
  doc := doc || jsonb_build_object('createdBy', actor.uid::text);

  if doc->>'type' = 'credit_note' and actor.role = 'sales' and doc->>'status' = 'sent' then
    doc := doc || jsonb_build_object('status', 'draft', 'approvalStatus', 'pending');
  end if;

  perform public.validate_invoice_source_uniqueness(invoice_id, doc);

  insert into public.invoices (id, document)
  values (invoice_id, doc);

  if doc->>'status' <> 'draft' then
    perform public.apply_invoice_activation(invoice_id, doc, actor.uid);
  end if;

  return invoice_id;
end;
$$;

create or replace function public.update_invoice(p_id uuid, p_document jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor public.users;
  invoice public.invoices;
  doc jsonb;
begin
  actor := public.require_invoice_role();
  select * into invoice from public.invoices where id = p_id for update;
  if invoice.id is null then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if invoice.document->>'status' <> 'draft' then
    raise exception 'Issued invoices cannot be edited' using errcode = '22023';
  end if;

  doc := public.build_invoice_document(
    p_id,
    invoice.document || p_document,
    invoice.document->>'invoiceNumber',
    actor.uid,
    invoice.document->>'createdAt'
  );
  doc := doc || jsonb_build_object('createdBy', coalesce(invoice.document->>'createdBy', actor.uid::text));

  if doc->>'type' = 'credit_note' and actor.role = 'sales' and doc->>'status' = 'sent' then
    raise exception 'Manager approval is required to activate a credit note' using errcode = '42501';
  end if;

  perform public.validate_invoice_source_uniqueness(p_id, doc);

  update public.invoices
  set document = doc,
      updated_at = now()
  where id = p_id;

  if doc->>'status' <> 'draft' then
    perform public.apply_invoice_activation(p_id, doc, actor.uid);
  end if;

  return p_id;
end;
$$;

create or replace function public.transition_invoice(p_id uuid, p_status text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor public.users;
  invoice public.invoices;
  doc jsonb;
begin
  actor := public.require_invoice_role();
  if p_status not in ('sent', 'cancelled') then
    raise exception 'Invalid invoice transition' using errcode = '22023';
  end if;
  select * into invoice from public.invoices where id = p_id for update;
  if invoice.id is null then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  doc := invoice.document;

  if doc->>'type' = 'credit_note' and p_status = 'sent' and actor.role = 'sales' then
    raise exception 'Manager approval is required to activate a credit note' using errcode = '42501';
  end if;

  if doc->>'status' = 'draft' and p_status = 'sent' then
    doc := doc || jsonb_build_object('status', 'sent', 'updatedAt', now()::text);
    if doc->>'type' = 'credit_note' then
      doc := doc || jsonb_build_object('approvalStatus', 'approved', 'approvedBy', actor.uid::text, 'approvedAt', now()::text);
    end if;
    perform public.validate_invoice_source_uniqueness(p_id, doc);
    perform public.apply_invoice_activation(p_id, doc, actor.uid);
    update public.invoices set document = doc, updated_at = now() where id = p_id;
    return p_id;
  end if;

  if doc->>'status' <> 'draft' and doc->>'status' <> 'cancelled' and p_status = 'cancelled' then
    perform public.apply_invoice_cancellation(p_id, doc, actor.uid);
    update public.invoices
    set document = document || jsonb_build_object('status', 'cancelled', 'updatedAt', now()::text),
        updated_at = now()
    where id = p_id;
    return p_id;
  end if;

  raise exception 'Unsupported transition from % to %', doc->>'status', p_status using errcode = '22023';
end;
$$;
