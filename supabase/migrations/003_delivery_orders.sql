create table if not exists public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.po_allocations (
  id uuid primary key default gen_random_uuid(),
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists delivery_orders_touch_updated_at on public.delivery_orders;
create trigger delivery_orders_touch_updated_at
before update on public.delivery_orders
for each row execute function public.touch_updated_at();

drop trigger if exists stock_movements_touch_updated_at on public.stock_movements;
create trigger stock_movements_touch_updated_at
before update on public.stock_movements
for each row execute function public.touch_updated_at();

drop trigger if exists po_allocations_touch_updated_at on public.po_allocations;
create trigger po_allocations_touch_updated_at
before update on public.po_allocations
for each row execute function public.touch_updated_at();

create index if not exists delivery_orders_do_number_idx
on public.delivery_orders ((document->>'doNumber'));

create index if not exists delivery_orders_status_idx
on public.delivery_orders ((document->>'status'));

create index if not exists delivery_orders_created_at_idx
on public.delivery_orders (created_at desc);

create index if not exists stock_movements_product_idx
on public.stock_movements ((document->>'productId'));

create index if not exists po_allocations_do_idx
on public.po_allocations ((document->>'deliveryOrderId'));

create index if not exists po_allocations_po_idx
on public.po_allocations ((document->>'purchaseOrderId'));

alter table public.delivery_orders enable row level security;
alter table public.stock_movements enable row level security;
alter table public.po_allocations enable row level security;

drop policy if exists "erp users can read delivery orders" on public.delivery_orders;
create policy "erp users can read delivery orders"
on public.delivery_orders for select
to authenticated
using (public.is_active_erp_user());

drop policy if exists "erp users can read stock movements" on public.stock_movements;
create policy "erp users can read stock movements"
on public.stock_movements for select
to authenticated
using (public.is_active_erp_user());

drop policy if exists "erp users can read po allocations" on public.po_allocations;
create policy "erp users can read po allocations"
on public.po_allocations for select
to authenticated
using (public.is_active_erp_user());

create or replace function public.require_delivery_order_role()
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
  if actor.role not in ('admin', 'manager', 'sales', 'warehouse') then
    raise exception 'You do not have permission to manage delivery orders' using errcode = '42501';
  end if;
  return actor;
end;
$$;

create or replace function public.compute_sales_order_status(p_document jsonb)
returns text
language plpgsql
immutable
as $$
declare
  item jsonb;
  ordered numeric := 0;
  delivered numeric := 0;
  invoiced numeric := 0;
  current_status text := p_document->>'status';
begin
  if current_status in ('cancelled', 'quotation') then
    return current_status;
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_document->'items', '[]'::jsonb)) loop
    ordered := ordered + coalesce((item->>'quantity')::numeric, 0);
    delivered := delivered + coalesce((item->>'deliveredQty')::numeric, 0);
    invoiced := invoiced + coalesce((item->>'invoicedQty')::numeric, 0);
  end loop;

  if ordered > 0 and invoiced + 0.001 >= ordered then
    return 'invoiced';
  end if;
  if ordered > 0 and delivered + 0.001 >= ordered then
    return 'fully_delivered';
  end if;
  return 'confirmed';
end;
$$;

create or replace function public.apply_sales_order_delivery_progress(
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
    raise exception 'Delivery order cannot update a % sales order', sales_order.document->>'status' using errcode = '22023';
  end if;

  for request_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    matched := false;
    for so_item in select * from jsonb_array_elements(coalesce(sales_order.document->'items', '[]'::jsonb)) loop
      if so_item->>'productId' = request_item->>'productId' then
        matched := true;
        next_qty := coalesce((so_item->>'deliveredQty')::numeric, 0)
          + (coalesce((request_item->>'quantity')::numeric, 0) * p_direction);
        if next_qty < -0.001 then
          raise exception '% delivery quantity cannot be negative', sales_order.document->>'soNumber' using errcode = '22023';
        end if;
        if next_qty > coalesce((so_item->>'quantity')::numeric, 0) + 0.001 then
          raise exception 'Cannot deliver more than the sales order quantity for %', so_item->>'name' using errcode = '22023';
        end if;
        sales_order.document := jsonb_set(
          sales_order.document,
          array['items', (select ordinality - 1 from jsonb_array_elements(sales_order.document->'items') with ordinality elem(value, ordinality) where value = so_item limit 1)::text, 'deliveredQty'],
          to_jsonb(greatest(0, public.round_money(next_qty))),
          false
        );
        exit;
      end if;
    end loop;
    if not matched then
      raise exception 'Product % is not on the sales order', request_item->>'productId' using errcode = '22023';
    end if;
  end loop;

  final_document := sales_order.document
    || jsonb_build_object(
      'status', public.compute_sales_order_status(sales_order.document),
      'updatedAt', now()::text
    );

  update public.sales_orders
  set document = final_document,
      updated_at = now()
  where id = p_sales_order_id;
end;
$$;

create or replace function public.normalized_delivery_items(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  item jsonb;
  product_id uuid;
  product_row public.products;
  quantity numeric;
  unit_price numeric;
  items jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) is distinct from 'array'
     or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'At least one item is required' using errcode = '22023';
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    product_id := nullif(item->>'productId', '')::uuid;
    if product_id is null then
      raise exception 'Product is required' using errcode = '22023';
    end if;
    select * into product_row from public.products where id = product_id;
    if product_row.id is null then
      raise exception 'Product % not found', product_id using errcode = 'P0002';
    end if;

    quantity := coalesce((item->>'quantity')::numeric, 0);
    unit_price := coalesce((item->>'unitPrice')::numeric, 0);
    if quantity <= 0 then
      raise exception 'Quantity must be greater than zero' using errcode = '22023';
    end if;
    if unit_price < 0 then
      raise exception 'Unit price cannot be negative' using errcode = '22023';
    end if;

    items := items || jsonb_build_array(
      jsonb_build_object(
        'productId', product_row.id::text,
        'name', product_row.document->>'name',
        'quantity', quantity,
        'unit', product_row.document->>'unit',
        'unitPrice', unit_price
      )
    );
  end loop;

  return items;
end;
$$;

create or replace function public.apply_delivery_stock(
  p_delivery_order_id uuid,
  p_do_number text,
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
  current_stock numeric;
  quantity numeric;
  next_stock numeric;
  movement_kind text;
begin
  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    product_id := (item->>'productId')::uuid;
    quantity := coalesce((item->>'quantity')::numeric, 0);
    select * into product_row from public.products where id = product_id for update;
    if product_row.id is null then
      raise exception 'Product % not found', product_id using errcode = 'P0002';
    end if;

    current_stock := coalesce((product_row.document->>'stock')::numeric, 0);
    next_stock := public.round_money(current_stock + (quantity * p_direction));
    if next_stock < -0.001 then
      raise exception 'Insufficient stock for %', product_row.document->>'name' using errcode = '22023';
    end if;

    update public.products
    set document = jsonb_set(
          jsonb_set(document, '{stock}', to_jsonb(greatest(0, next_stock)), true),
          '{updatedAt}',
          to_jsonb(now()::text),
          true
        ),
        updated_at = now()
    where id = product_id;

    movement_kind := case when p_direction < 0 then 'do_issue' else 'do_cancel' end;
    insert into public.stock_movements (document)
    values (
      jsonb_build_object(
        'productId', product_id::text,
        'productName', product_row.document->>'name',
        'unit', product_row.document->>'unit',
        'qty', quantity * p_direction,
        'kind', movement_kind,
        'sourceType', 'delivery_order',
        'sourceId', p_delivery_order_id::text,
        'sourceNumber', p_do_number,
        'reason', case when p_direction > 0 then 'Cancellation of ' || p_do_number else null end,
        'balanceAfter', greatest(0, next_stock),
        'recordedBy', p_actor_uid::text,
        'at', now()::text
      )
    );
  end loop;
end;
$$;

create or replace function public.create_delivery_order(p_document jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor public.users;
  customer_id uuid;
  customer_row public.customers;
  sales_order_id uuid;
  sales_order public.sales_orders;
  status text;
  items jsonb;
  do_number text;
  created_id uuid := gen_random_uuid();
  now_text text := now()::text;
  final_document jsonb;
begin
  actor := public.require_delivery_order_role();
  status := p_document->>'status';
  if status not in ('draft', 'issued') then
    raise exception 'Delivery order must be draft or issued' using errcode = '22023';
  end if;

  customer_id := nullif(p_document->>'customerId', '')::uuid;
  if customer_id is null then
    raise exception 'Customer is required' using errcode = '22023';
  end if;
  select * into customer_row from public.customers where id = customer_id;
  if customer_row.id is null then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;

  items := public.normalized_delivery_items(p_document->'items');
  sales_order_id := nullif(p_document->>'salesOrderId', '')::uuid;
  if sales_order_id is not null then
    select * into sales_order from public.sales_orders where id = sales_order_id;
    if sales_order.id is null then
      raise exception 'Sales order not found' using errcode = 'P0002';
    end if;
    if sales_order.document->>'customerId' <> customer_id::text then
      raise exception 'Delivery order customer does not match the sales order' using errcode = '22023';
    end if;
  end if;

  do_number := public.claim_document_number('delivery_orders', 'DO', 5);
  final_document := jsonb_build_object(
    'doNumber', do_number,
    'customerId', customer_id::text,
    'customerSnapshot', jsonb_build_object(
      'name', customer_row.document->>'name',
      'address', coalesce(customer_row.document->>'address', ''),
      'phone', coalesce(customer_row.document->>'phone', '')
    ),
    'salespersonId', actor.uid::text,
    'salespersonName', btrim(coalesce(p_document->>'salespersonName', '')),
    'orderDate', p_document->>'orderDate',
    'items', items,
    'loadingDetails', coalesce(p_document->'loadingDetails', '{}'::jsonb),
    'status', status,
    'authorizedBy', coalesce(p_document->>'authorizedBy', ''),
    'qrPayload', '/verify/' || created_id::text,
    'notes', btrim(coalesce(p_document->>'notes', '')),
    'createdBy', actor.uid::text,
    'createdAt', now_text,
    'updatedAt', now_text,
    'allocations', '[]'::jsonb
  );
  if sales_order_id is not null then
    final_document := final_document || jsonb_build_object('salesOrderId', sales_order_id::text);
  end if;

  if final_document->>'salespersonName' = '' then
    raise exception 'Salesperson is required' using errcode = '22023';
  end if;
  if coalesce(final_document->>'orderDate', '') = '' then
    raise exception 'Order date is required' using errcode = '22023';
  end if;

  insert into public.delivery_orders (id, document)
  values (created_id, final_document);

  if status = 'issued' then
    perform public.apply_delivery_stock(created_id, do_number, items, -1, actor.uid);
    if sales_order_id is not null then
      perform public.apply_sales_order_delivery_progress(sales_order_id, items, 1);
    end if;
  end if;

  return created_id;
end;
$$;

create or replace function public.update_delivery_order(p_id uuid, p_document jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  delivery_order public.delivery_orders;
  actor public.users;
  customer_id uuid;
  customer_row public.customers;
  sales_order_id uuid;
  sales_order public.sales_orders;
  next_status text;
  items jsonb;
  final_document jsonb;
begin
  actor := public.require_delivery_order_role();
  select * into delivery_order from public.delivery_orders where id = p_id for update;
  if delivery_order.id is null then
    raise exception 'Delivery order not found' using errcode = 'P0002';
  end if;
  if delivery_order.document->>'status' <> 'draft' then
    raise exception 'Only draft delivery orders can be edited' using errcode = '22023';
  end if;

  next_status := coalesce(p_document->>'status', 'draft');
  if next_status not in ('draft', 'issued') then
    raise exception 'Draft delivery orders can only be saved or issued' using errcode = '22023';
  end if;

  customer_id := nullif(coalesce(p_document->>'customerId', delivery_order.document->>'customerId'), '')::uuid;
  select * into customer_row from public.customers where id = customer_id;
  if customer_row.id is null then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;

  items := public.normalized_delivery_items(coalesce(p_document->'items', delivery_order.document->'items'));
  sales_order_id := nullif(coalesce(p_document->>'salesOrderId', delivery_order.document->>'salesOrderId', ''), '')::uuid;
  if sales_order_id is not null then
    select * into sales_order from public.sales_orders where id = sales_order_id;
    if sales_order.id is null then
      raise exception 'Sales order not found' using errcode = 'P0002';
    end if;
    if sales_order.document->>'customerId' <> customer_id::text then
      raise exception 'Delivery order customer does not match the sales order' using errcode = '22023';
    end if;
  end if;

  final_document := delivery_order.document
    || jsonb_build_object(
      'customerId', customer_id::text,
      'customerSnapshot', jsonb_build_object(
        'name', customer_row.document->>'name',
        'address', coalesce(customer_row.document->>'address', ''),
        'phone', coalesce(customer_row.document->>'phone', '')
      ),
      'salespersonId', actor.uid::text,
      'salespersonName', btrim(coalesce(p_document->>'salespersonName', delivery_order.document->>'salespersonName', '')),
      'orderDate', coalesce(p_document->>'orderDate', delivery_order.document->>'orderDate'),
      'items', items,
      'loadingDetails', coalesce(p_document->'loadingDetails', delivery_order.document->'loadingDetails', '{}'::jsonb),
      'status', next_status,
      'authorizedBy', coalesce(p_document->>'authorizedBy', delivery_order.document->>'authorizedBy', ''),
      'notes', btrim(coalesce(p_document->>'notes', delivery_order.document->>'notes', '')),
      'updatedAt', now()::text
    );
  if sales_order_id is not null then
    final_document := final_document || jsonb_build_object('salesOrderId', sales_order_id::text);
  else
    final_document := final_document - 'salesOrderId';
  end if;

  update public.delivery_orders
  set document = final_document,
      updated_at = now()
  where id = p_id;

  if next_status = 'issued' then
    perform public.apply_delivery_stock(p_id, delivery_order.document->>'doNumber', items, -1, actor.uid);
    if sales_order_id is not null then
      perform public.apply_sales_order_delivery_progress(sales_order_id, items, 1);
    end if;
  end if;

  return p_id;
end;
$$;

create or replace function public.transition_delivery_order(p_id uuid, p_status text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor public.users;
  delivery_order public.delivery_orders;
  current_status text;
  sales_order_id uuid;
begin
  actor := public.require_delivery_order_role();
  if p_status not in ('issued', 'delivered', 'cancelled') then
    raise exception 'Invalid delivery-order transition' using errcode = '22023';
  end if;

  select * into delivery_order from public.delivery_orders where id = p_id for update;
  if delivery_order.id is null then
    raise exception 'Delivery order not found' using errcode = 'P0002';
  end if;

  current_status := delivery_order.document->>'status';
  sales_order_id := nullif(delivery_order.document->>'salesOrderId', '')::uuid;

  if current_status = 'draft' and p_status = 'issued' then
    return public.update_delivery_order(p_id, delivery_order.document || jsonb_build_object('status', 'issued'));
  end if;

  if current_status = 'issued' and p_status = 'delivered' then
    update public.delivery_orders
    set document = document || jsonb_build_object('status', 'delivered', 'updatedAt', now()::text),
        updated_at = now()
    where id = p_id;
    return p_id;
  end if;

  if current_status = 'draft' and p_status = 'cancelled' then
    update public.delivery_orders
    set document = document || jsonb_build_object('status', 'cancelled', 'updatedAt', now()::text),
        updated_at = now()
    where id = p_id;
    return p_id;
  end if;

  if current_status in ('issued', 'delivered') and p_status = 'cancelled' then
    if nullif(delivery_order.document->>'invoiceId', '') is not null then
      raise exception 'Cancel the linked invoice before cancelling this delivery order' using errcode = '22023';
    end if;

    perform public.apply_delivery_stock(
      p_id,
      delivery_order.document->>'doNumber',
      delivery_order.document->'items',
      1,
      actor.uid
    );
    if sales_order_id is not null then
      perform public.apply_sales_order_delivery_progress(sales_order_id, delivery_order.document->'items', -1);
    end if;

    update public.delivery_orders
    set document = document
        || jsonb_build_object('status', 'cancelled', 'allocations', '[]'::jsonb, 'updatedAt', now()::text),
        updated_at = now()
    where id = p_id;

    delete from public.po_allocations where document->>'deliveryOrderId' = p_id::text;
    return p_id;
  end if;

  raise exception 'Unsupported transition from % to %', current_status, p_status using errcode = '22023';
end;
$$;
