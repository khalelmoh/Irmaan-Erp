create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists invoices_touch_updated_at on public.invoices;
create trigger invoices_touch_updated_at
before update on public.invoices
for each row execute function public.touch_updated_at();

drop trigger if exists payments_touch_updated_at on public.payments;
create trigger payments_touch_updated_at
before update on public.payments
for each row execute function public.touch_updated_at();

create index if not exists invoices_invoice_number_idx
on public.invoices ((document->>'invoiceNumber'));

create index if not exists invoices_status_idx
on public.invoices ((document->>'status'));

create index if not exists invoices_customer_idx
on public.invoices ((document->>'customerId'));

create index if not exists invoices_created_at_idx
on public.invoices (created_at desc);

create index if not exists payments_invoice_idx
on public.payments ((document->>'invoiceId'));

create index if not exists payments_customer_idx
on public.payments ((document->>'customerId'));

alter table public.invoices enable row level security;
alter table public.payments enable row level security;

drop policy if exists "erp users can read invoices" on public.invoices;
create policy "erp users can read invoices"
on public.invoices for select
to authenticated
using (public.is_active_erp_user());

drop policy if exists "erp users can read payments" on public.payments;
create policy "erp users can read payments"
on public.payments for select
to authenticated
using (public.is_active_erp_user());

create or replace function public.require_invoice_role(p_roles text[] default array['admin', 'manager', 'sales'])
returns public.users
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor public.users;
begin
  select * into actor from public.current_erp_user();
  if actor.uid is null then
    raise exception 'Sign in required' using errcode = '28000';
  end if;
  if not actor.role = any(p_roles) then
    raise exception 'You do not have permission to manage invoices' using errcode = '42501';
  end if;
  return actor;
end;
$$;

create or replace function public.bump_customer_balance(
  p_customer_id uuid,
  p_delta numeric
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  customer_row public.customers;
  next_balance numeric;
begin
  select * into customer_row from public.customers where id = p_customer_id for update;
  if customer_row.id is null then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;

  next_balance := public.round_money(coalesce((customer_row.document->>'balance')::numeric, 0) + p_delta);
  update public.customers
  set document = jsonb_set(
        jsonb_set(document, '{balance}', to_jsonb(next_balance), true),
        '{updatedAt}',
        to_jsonb(now()::text),
        true
      ),
      updated_at = now()
  where id = p_customer_id;
end;
$$;

create or replace function public.normalized_invoice_items(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  item jsonb;
  quantity numeric;
  unit_price numeric;
  items jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) is distinct from 'array'
     or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'At least one item is required' using errcode = '22023';
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    quantity := coalesce((item->>'quantity')::numeric, 0);
    unit_price := coalesce((item->>'unitPrice')::numeric, 0);
    if quantity <= 0 then
      raise exception 'Quantity must be greater than zero' using errcode = '22023';
    end if;
    if unit_price < 0 then
      raise exception 'Unit price cannot be negative' using errcode = '22023';
    end if;
    if btrim(coalesce(item->>'name', '')) = '' then
      raise exception 'Item description is required' using errcode = '22023';
    end if;

    items := items || jsonb_build_array(
      jsonb_build_object(
        'productId', coalesce(item->>'productId', ''),
        'name', btrim(item->>'name'),
        'quantity', quantity,
        'unit', coalesce(item->>'unit', ''),
        'unitPrice', unit_price,
        'lineTotal', public.round_money(quantity * unit_price)
      )
    );
  end loop;

  return items;
end;
$$;

create or replace function public.apply_sales_order_invoice_progress(
  p_sales_order_id uuid,
  p_items jsonb,
  p_direction integer
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  sales_order public.sales_orders;
  so_item jsonb;
  request_item jsonb;
  next_qty numeric;
  updated_items jsonb := '[]'::jsonb;
  matched boolean;
  final_document jsonb;
begin
  select * into sales_order from public.sales_orders where id = p_sales_order_id for update;
  if sales_order.id is null then
    raise exception 'Sales order not found' using errcode = 'P0002';
  end if;
  if sales_order.document->>'status' in ('quotation', 'cancelled') then
    raise exception 'Invoice cannot update a % sales order', sales_order.document->>'status' using errcode = '22023';
  end if;

  for so_item in select * from jsonb_array_elements(coalesce(sales_order.document->'items', '[]'::jsonb)) loop
    matched := false;
    for request_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
      if so_item->>'productId' = request_item->>'productId' then
        matched := true;
        next_qty := coalesce((so_item->>'invoicedQty')::numeric, 0)
          + (coalesce((request_item->>'quantity')::numeric, 0) * p_direction);
        if next_qty < -0.001 then
          raise exception '% invoice quantity cannot be negative', sales_order.document->>'soNumber' using errcode = '22023';
        end if;
        if next_qty > coalesce((so_item->>'quantity')::numeric, 0) + 0.001 then
          raise exception 'Cannot invoice more than the sales order quantity for %', so_item->>'name' using errcode = '22023';
        end if;
        so_item := so_item || jsonb_build_object('invoicedQty', greatest(0, public.round_money(next_qty)));
      end if;
    end loop;
    updated_items := updated_items || jsonb_build_array(so_item);
  end loop;

  final_document := sales_order.document
    || jsonb_build_object(
      'items', updated_items,
      'updatedAt', now()::text
    );
  final_document := final_document
    || jsonb_build_object('status', public.compute_sales_order_status(final_document));

  update public.sales_orders
  set document = final_document,
      updated_at = now()
  where id = p_sales_order_id;
end;
$$;

create or replace function public.apply_credit_note_stock(
  p_invoice_id uuid,
  p_invoice_number text,
  p_items jsonb,
  p_direction integer,
  p_actor_uid uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  item jsonb;
  product_id uuid;
  product_row public.products;
  quantity numeric;
  current_stock numeric;
  next_stock numeric;
  movement_kind text;
begin
  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    product_id := nullif(item->>'productId', '')::uuid;
    if product_id is null then
      raise exception 'Credit note item % is not linked to a product', item->>'name' using errcode = '22023';
    end if;
    quantity := coalesce((item->>'quantity')::numeric, 0);
    select * into product_row from public.products where id = product_id for update;
    if product_row.id is null then
      raise exception 'Product % not found', product_id using errcode = 'P0002';
    end if;

    current_stock := coalesce((product_row.document->>'stock')::numeric, 0);
    next_stock := public.round_money(current_stock + (quantity * p_direction));
    if next_stock < -0.001 then
      raise exception 'Insufficient stock to reverse credit note for %', item->>'name' using errcode = '22023';
    end if;
    movement_kind := case when p_direction > 0 then 'adjustment_in' else 'adjustment_out' end;

    update public.products
    set document = jsonb_set(
          jsonb_set(document, '{stock}', to_jsonb(greatest(0, next_stock)), true),
          '{updatedAt}',
          to_jsonb(now()::text),
          true
        ),
        updated_at = now()
    where id = product_id;

    insert into public.stock_movements (document)
    values (
      jsonb_build_object(
        'productId', product_id::text,
        'productName', product_row.document->>'name',
        'unit', product_row.document->>'unit',
        'qty', quantity * p_direction,
        'kind', movement_kind,
        'sourceType', 'adjustment',
        'sourceId', p_invoice_id::text,
        'sourceNumber', p_invoice_number,
        'reason', case
          when p_direction > 0 then 'Return on Credit Note ' || p_invoice_number
          else 'Cancellation of Credit Note ' || p_invoice_number
        end,
        'balanceAfter', greatest(0, next_stock),
        'recordedBy', p_actor_uid::text,
        'at', now()::text
      )
    );
  end loop;
end;
$$;

create or replace function public.validate_invoice_activation(
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
  do_id_text text;
  delivery_order public.delivery_orders;
  sales_order public.sales_orders;
  original public.invoices;
  prior_total numeric;
begin
  if p_document->>'type' = 'invoice' then
    for do_id_text in select * from jsonb_array_elements_text(coalesce(p_document->'doIds', '[]'::jsonb)) loop
      select * into delivery_order from public.delivery_orders where id = do_id_text::uuid;
      if delivery_order.id is null then
        raise exception 'Delivery order % not found', do_id_text using errcode = 'P0002';
      end if;
      if delivery_order.document->>'status' not in ('issued', 'delivered') then
        raise exception '% must be issued before invoicing', delivery_order.document->>'doNumber' using errcode = '22023';
      end if;
      if delivery_order.document->>'customerId' <> p_document->>'customerId' then
        raise exception '% belongs to another customer', delivery_order.document->>'doNumber' using errcode = '22023';
      end if;
      if nullif(delivery_order.document->>'invoiceId', '') is not null
         and delivery_order.document->>'invoiceId' <> p_invoice_id::text then
        raise exception '% is already linked to an invoice', delivery_order.document->>'doNumber' using errcode = '23505';
      end if;
      if nullif(p_document->>'salesOrderId', '') is not null
         and nullif(delivery_order.document->>'salesOrderId', '') is not null
         and delivery_order.document->>'salesOrderId' <> p_document->>'salesOrderId' then
        raise exception '% belongs to another sales order', delivery_order.document->>'doNumber' using errcode = '22023';
      end if;
    end loop;

    if nullif(p_document->>'salesOrderId', '') is not null then
      select * into sales_order from public.sales_orders where id = (p_document->>'salesOrderId')::uuid;
      if sales_order.id is null then
        raise exception 'Sales order not found' using errcode = 'P0002';
      end if;
      if sales_order.document->>'customerId' <> p_document->>'customerId' then
        raise exception 'Invoice customer does not match the sales order' using errcode = '22023';
      end if;
    end if;
  else
    select * into original from public.invoices where id = nullif(p_document->>'originalInvoiceId', '')::uuid;
    if original.id is null then
      raise exception 'Original invoice not found' using errcode = 'P0002';
    end if;
    if original.document->>'type' = 'credit_note'
       or original.document->>'status' = 'cancelled'
       or original.document->>'customerId' <> p_document->>'customerId' then
      raise exception 'Original invoice is not creditable' using errcode = '22023';
    end if;
    select coalesce(sum(coalesce((document->>'total')::numeric, 0)), 0)
    into prior_total
    from public.invoices
    where document->>'originalInvoiceId' = original.id::text
      and id <> p_invoice_id
      and document->>'status' <> 'cancelled';
    if prior_total + coalesce((p_document->>'total')::numeric, 0)
       > coalesce((original.document->>'total')::numeric, 0) + 0.01 then
      raise exception 'Credit notes exceed the original invoice balance' using errcode = '22023';
    end if;
  end if;
end;
$$;

create or replace function public.apply_invoice_activation(
  p_invoice_id uuid,
  p_document jsonb,
  p_actor_uid uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  do_id_text text;
  delta numeric;
begin
  perform public.validate_invoice_activation(p_invoice_id, p_document);
  delta := case
    when p_document->>'type' = 'credit_note' then -coalesce((p_document->>'total')::numeric, 0)
    else coalesce((p_document->>'total')::numeric, 0)
  end;
  perform public.bump_customer_balance((p_document->>'customerId')::uuid, delta);

  if p_document->>'type' = 'invoice' then
    for do_id_text in select * from jsonb_array_elements_text(coalesce(p_document->'doIds', '[]'::jsonb)) loop
      update public.delivery_orders
      set document = document || jsonb_build_object('invoiceId', p_invoice_id::text, 'updatedAt', now()::text),
          updated_at = now()
      where id = do_id_text::uuid;
    end loop;
    if nullif(p_document->>'salesOrderId', '') is not null then
      perform public.apply_sales_order_invoice_progress((p_document->>'salesOrderId')::uuid, p_document->'items', 1);
    end if;
  else
    perform public.apply_credit_note_stock(
      p_invoice_id,
      p_document->>'invoiceNumber',
      p_document->'items',
      1,
      p_actor_uid
    );
  end if;
end;
$$;

create or replace function public.apply_invoice_cancellation(
  p_invoice_id uuid,
  p_document jsonb,
  p_actor_uid uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  do_id_text text;
  delta numeric;
begin
  if coalesce((p_document->>'amountPaid')::numeric, 0) > 0.001 then
    raise exception 'Reverse recorded payments before cancelling this invoice' using errcode = '22023';
  end if;

  delta := case
    when p_document->>'type' = 'credit_note' then coalesce((p_document->>'total')::numeric, 0)
    else -coalesce((p_document->>'total')::numeric, 0)
  end;
  perform public.bump_customer_balance((p_document->>'customerId')::uuid, delta);

  if p_document->>'type' = 'invoice' then
    for do_id_text in select * from jsonb_array_elements_text(coalesce(p_document->'doIds', '[]'::jsonb)) loop
      update public.delivery_orders
      set document = document - 'invoiceId' || jsonb_build_object('updatedAt', now()::text),
          updated_at = now()
      where id = do_id_text::uuid
        and document->>'invoiceId' = p_invoice_id::text;
    end loop;
    if nullif(p_document->>'salesOrderId', '') is not null then
      perform public.apply_sales_order_invoice_progress((p_document->>'salesOrderId')::uuid, p_document->'items', -1);
    end if;
  else
    perform public.apply_credit_note_stock(
      p_invoice_id,
      p_document->>'invoiceNumber',
      p_document->'items',
      -1,
      p_actor_uid
    );
  end if;
end;
$$;

create or replace function public.build_invoice_document(
  p_invoice_id uuid,
  p_document jsonb,
  p_invoice_number text,
  p_actor_uid uuid,
  p_keep_created text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  customer_id uuid;
  customer_row public.customers;
  items jsonb;
  item jsonb;
  do_ids jsonb;
  subtotal numeric := 0;
  tax_rate numeric;
  tax_amount numeric;
  total numeric;
  doc_type text;
  status text;
  final_document jsonb;
begin
  doc_type := case when p_document->>'type' = 'credit_note' then 'credit_note' else 'invoice' end;
  status := p_document->>'status';
  if status not in ('draft', 'sent') then
    raise exception 'Invoice must be draft or sent' using errcode = '22023';
  end if;
  customer_id := nullif(p_document->>'customerId', '')::uuid;
  if customer_id is null then
    raise exception 'Customer required' using errcode = '22023';
  end if;
  select * into customer_row from public.customers where id = customer_id;
  if customer_row.id is null then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;
  tax_rate := coalesce((p_document->>'taxRate')::numeric, 0);
  if tax_rate < 0 or tax_rate > 1 then
    raise exception 'Tax rate must be between 0 and 1' using errcode = '22023';
  end if;
  items := public.normalized_invoice_items(p_document->'items');
  for item in select * from jsonb_array_elements(items) loop
    subtotal := subtotal + coalesce((item->>'lineTotal')::numeric, 0);
  end loop;
  subtotal := public.round_money(subtotal);
  tax_amount := public.round_money(subtotal * tax_rate);
  total := public.round_money(subtotal + tax_amount);
  do_ids := coalesce(p_document->'doIds', '[]'::jsonb);
  if jsonb_typeof(do_ids) is distinct from 'array' then
    do_ids := '[]'::jsonb;
  end if;

  final_document := jsonb_build_object(
    'invoiceNumber', p_invoice_number,
    'type', doc_type,
    'customerId', customer_id::text,
    'customerSnapshot', jsonb_build_object(
      'name', customer_row.document->>'name',
      'address', coalesce(customer_row.document->>'address', ''),
      'phone', coalesce(customer_row.document->>'phone', '')
    ),
    'doIds', do_ids,
    'issueDate', p_document->>'issueDate',
    'dueDate', p_document->>'dueDate',
    'items', items,
    'subtotal', subtotal,
    'taxRate', tax_rate,
    'taxAmount', tax_amount,
    'total', total,
    'amountPaid', coalesce((p_document->>'amountPaid')::numeric, 0),
    'status', status,
    'notes', btrim(coalesce(p_document->>'notes', '')),
    'createdAt', coalesce(p_keep_created, now()::text),
    'updatedAt', now()::text
  );
  if nullif(p_document->>'salesOrderId', '') is not null then
    final_document := final_document || jsonb_build_object('salesOrderId', p_document->>'salesOrderId');
  end if;
  if nullif(p_document->>'originalInvoiceId', '') is not null then
    final_document := final_document || jsonb_build_object('originalInvoiceId', p_document->>'originalInvoiceId');
  end if;
  if doc_type = 'credit_note' then
    final_document := final_document || jsonb_build_object(
      'approvalStatus', case when status = 'sent' then 'approved' else 'pending' end
    );
    if status = 'sent' then
      final_document := final_document || jsonb_build_object('approvedBy', p_actor_uid::text, 'approvedAt', now()::text);
    end if;
  end if;
  if coalesce(final_document->>'issueDate', '') = '' or coalesce(final_document->>'dueDate', '') = '' then
    raise exception 'Issue date and due date are required' using errcode = '22023';
  end if;
  return final_document;
end;
$$;

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

create or replace function public.record_invoice_payment(p_invoice_id uuid, p_payment jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor public.users;
  invoice public.invoices;
  payment_id uuid := gen_random_uuid();
  amount numeric;
  remaining numeric;
  method text;
  amount_paid numeric;
  next_status text;
begin
  actor := public.require_invoice_role(array['admin', 'manager']);
  amount := coalesce((p_payment->>'amount')::numeric, 0);
  method := p_payment->>'method';
  if amount <= 0 then
    raise exception 'A positive payment amount is required' using errcode = '22023';
  end if;
  if method not in ('cash', 'bank', 'mobile_money', 'cheque') then
    raise exception 'Invalid payment method' using errcode = '22023';
  end if;

  select * into invoice from public.invoices where id = p_invoice_id for update;
  if invoice.id is null then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if invoice.document->>'status' in ('draft', 'cancelled') then
    raise exception 'Invoice is not payable' using errcode = '22023';
  end if;
  if invoice.document->>'type' = 'credit_note' then
    raise exception 'Credit notes cannot receive payments' using errcode = '22023';
  end if;

  remaining := coalesce((invoice.document->>'total')::numeric, 0) - coalesce((invoice.document->>'amountPaid')::numeric, 0);
  if amount > remaining + 0.01 then
    raise exception 'Payment exceeds outstanding balance' using errcode = '22023';
  end if;
  amount_paid := public.round_money(coalesce((invoice.document->>'amountPaid')::numeric, 0) + amount);
  next_status := case
    when amount_paid + 0.001 >= coalesce((invoice.document->>'total')::numeric, 0) then 'paid'
    else 'partial'
  end;

  update public.invoices
  set document = jsonb_set(document, '{amountPaid}', to_jsonb(amount_paid), true)
      || jsonb_build_object('status', next_status, 'updatedAt', now()::text),
      updated_at = now()
  where id = p_invoice_id;

  perform public.bump_customer_balance((invoice.document->>'customerId')::uuid, -amount);

  insert into public.payments (id, document)
  values (
    payment_id,
    jsonb_build_object(
      'invoiceId', p_invoice_id::text,
      'invoiceNumber', invoice.document->>'invoiceNumber',
      'customerId', invoice.document->>'customerId',
      'amount', amount,
      'method', method,
      'reference', coalesce(p_payment->>'reference', ''),
      'paidAt', p_payment->>'paidAt',
      'recordedBy', actor.uid::text,
      'notes', coalesce(p_payment->>'notes', ''),
      'createdAt', now()::text
    )
  );

  return payment_id;
end;
$$;
