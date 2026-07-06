create or replace function public.require_stock_adjustment_role()
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
  if actor.role not in ('admin', 'manager') then
    raise exception 'You do not have permission to adjust stock' using errcode = '42501';
  end if;
  return actor;
end;
$$;

create or replace function public.adjust_stock(
  p_product_id uuid,
  p_quantity numeric,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor public.users;
  product_row public.products;
  movement_id uuid := gen_random_uuid();
  quantity numeric := round(coalesce(p_quantity, 0), 2);
  balance_after numeric;
  reason text := btrim(coalesce(p_reason, ''));
begin
  actor := public.require_stock_adjustment_role();

  if quantity = 0 then
    raise exception 'Adjustment quantity cannot be zero' using errcode = '22023';
  end if;
  if length(reason) < 2 then
    raise exception 'Adjustment reason is required' using errcode = '22023';
  end if;

  select * into product_row
  from public.products
  where id = p_product_id
  for update;

  if product_row.id is null then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;

  balance_after := round(coalesce((product_row.document->>'stock')::numeric, 0) + quantity, 2);
  if balance_after < 0 then
    raise exception 'Insufficient stock for adjustment' using errcode = '22023';
  end if;

  update public.products
  set document = jsonb_set(
        jsonb_set(document, '{stock}', to_jsonb(balance_after), true),
        '{updatedAt}',
        to_jsonb(now()::text),
        true
      ),
      updated_at = now()
  where id = p_product_id;

  insert into public.stock_movements (id, document)
  values (
    movement_id,
    jsonb_build_object(
      'productId', p_product_id::text,
      'productName', coalesce(product_row.document->>'name', ''),
      'unit', coalesce(product_row.document->>'unit', ''),
      'qty', quantity,
      'kind', case when quantity > 0 then 'adjustment_in' else 'adjustment_out' end,
      'sourceType', 'adjustment',
      'reason', reason,
      'balanceAfter', balance_after,
      'recordedBy', actor.uid::text,
      'at', now()::text
    )
  );

  return jsonb_build_object(
    'productId', p_product_id::text,
    'movementId', movement_id::text
  );
end;
$$;

create or replace function public.verify_document(p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  document_id uuid;
  doc jsonb;
  items jsonb;
begin
  if p_id is null or btrim(p_id) = '' or length(p_id) > 200 then
    raise exception 'Document ID is required' using errcode = '22023';
  end if;

  begin
    document_id := p_id::uuid;
  exception when invalid_text_representation then
    return null;
  end;

  select document into doc from public.sales_orders where id = document_id;
  if doc is not null then
    select coalesce(jsonb_agg(jsonb_build_object('quantity', item->'quantity')), '[]'::jsonb)
    into items
    from jsonb_array_elements(coalesce(doc->'items', '[]'::jsonb)) as item;

    return jsonb_build_object(
      'kind', 'so',
      'doc', jsonb_strip_nulls(jsonb_build_object(
        'id', document_id::text,
        'soNumber', doc->>'soNumber',
        'customerSnapshot', jsonb_build_object(
          'name', coalesce(doc#>>'{customerSnapshot,name}', 'Unknown')
        ),
        'salespersonName', coalesce(doc->>'salespersonName', ''),
        'orderDate', doc->>'orderDate',
        'validUntil', nullif(doc->>'validUntil', ''),
        'items', items,
        'total', coalesce((doc->>'total')::numeric, 0),
        'status', doc->>'status'
      ))
    );
  end if;

  select document into doc from public.invoices where id = document_id;
  if doc is not null then
    return jsonb_build_object(
      'kind', 'invoice',
      'doc', jsonb_build_object(
        'id', document_id::text,
        'invoiceNumber', doc->>'invoiceNumber',
        'type', doc->>'type',
        'customerSnapshot', jsonb_build_object(
          'name', coalesce(doc#>>'{customerSnapshot,name}', 'Unknown')
        ),
        'issueDate', doc->>'issueDate',
        'dueDate', doc->>'dueDate',
        'total', coalesce((doc->>'total')::numeric, 0),
        'amountPaid', coalesce((doc->>'amountPaid')::numeric, 0),
        'status', doc->>'status'
      )
    );
  end if;

  select document into doc from public.purchase_orders where id = document_id;
  if doc is not null then
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'quantity', item->'quantity',
        'receivedQty', coalesce((item->>'receivedQty')::numeric, 0)
      )),
      '[]'::jsonb
    )
    into items
    from jsonb_array_elements(coalesce(doc->'items', '[]'::jsonb)) as item;

    return jsonb_build_object(
      'kind', 'po',
      'doc', jsonb_strip_nulls(jsonb_build_object(
        'id', document_id::text,
        'poNumber', doc->>'poNumber',
        'supplierSnapshot', jsonb_build_object(
          'name', coalesce(doc#>>'{supplierSnapshot,name}', 'Unknown')
        ),
        'orderDate', doc->>'orderDate',
        'expectedDelivery', nullif(doc->>'expectedDelivery', ''),
        'items', items,
        'total', coalesce((doc->>'total')::numeric, 0),
        'amountPaid', coalesce((doc->>'amountPaid')::numeric, 0),
        'status', doc->>'status'
      ))
    );
  end if;

  select document into doc from public.delivery_orders where id = document_id;
  if doc is not null then
    select coalesce(jsonb_agg(jsonb_build_object('quantity', item->'quantity')), '[]'::jsonb)
    into items
    from jsonb_array_elements(coalesce(doc->'items', '[]'::jsonb)) as item;

    return jsonb_build_object(
      'kind', 'do',
      'doc', jsonb_build_object(
        'id', document_id::text,
        'doNumber', doc->>'doNumber',
        'customerSnapshot', jsonb_build_object(
          'name', coalesce(doc#>>'{customerSnapshot,name}', 'Unknown')
        ),
        'loadingDetails', jsonb_build_object(
          'destination', coalesce(doc#>>'{loadingDetails,destination}', ''),
          'truckPlate', coalesce(doc#>>'{loadingDetails,truckPlate}', ''),
          'driverName', coalesce(doc#>>'{loadingDetails,driverName}', '')
        ),
        'salespersonName', coalesce(doc->>'salespersonName', ''),
        'createdAt', coalesce(doc->>'createdAt', ''),
        'items', items,
        'status', doc->>'status'
      )
    );
  end if;

  return null;
end;
$$;

revoke execute on function public.adjust_stock(uuid, numeric, text) from anon;
grant execute on function public.adjust_stock(uuid, numeric, text) to authenticated;
grant execute on function public.verify_document(text) to anon, authenticated;
