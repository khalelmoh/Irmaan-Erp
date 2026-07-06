create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists purchase_orders_touch_updated_at on public.purchase_orders;
create trigger purchase_orders_touch_updated_at
before update on public.purchase_orders
for each row execute function public.touch_updated_at();

drop trigger if exists supplier_payments_touch_updated_at on public.supplier_payments;
create trigger supplier_payments_touch_updated_at
before update on public.supplier_payments
for each row execute function public.touch_updated_at();

create index if not exists purchase_orders_po_number_idx
on public.purchase_orders ((document->>'poNumber'));

create index if not exists purchase_orders_status_idx
on public.purchase_orders ((document->>'status'));

create index if not exists purchase_orders_created_at_idx
on public.purchase_orders (created_at desc);

create index if not exists supplier_payments_po_idx
on public.supplier_payments ((document->>'purchaseOrderId'));

create index if not exists supplier_payments_supplier_idx
on public.supplier_payments ((document->>'supplierId'));

alter table public.purchase_orders enable row level security;
alter table public.supplier_payments enable row level security;

drop policy if exists "erp users can read purchase orders" on public.purchase_orders;
create policy "erp users can read purchase orders"
on public.purchase_orders for select
to authenticated
using (public.is_active_erp_user());

drop policy if exists "erp users can read supplier payments" on public.supplier_payments;
create policy "erp users can read supplier payments"
on public.supplier_payments for select
to authenticated
using (public.is_active_erp_user());

create or replace function public.require_purchase_order_role(p_roles text[] default array['admin', 'manager'])
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
    raise exception 'You do not have permission to manage purchase orders' using errcode = '42501';
  end if;
  return actor;
end;
$$;

create or replace function public.bump_supplier_balance(
  p_supplier_id uuid,
  p_delta numeric
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  supplier_row public.suppliers;
  next_balance numeric;
begin
  select * into supplier_row from public.suppliers where id = p_supplier_id for update;
  if supplier_row.id is null then
    raise exception 'Supplier not found' using errcode = 'P0002';
  end if;

  next_balance := public.round_money(coalesce((supplier_row.document->>'balance')::numeric, 0) + p_delta);
  update public.suppliers
  set document = jsonb_set(
        jsonb_set(document, '{balance}', to_jsonb(next_balance), true),
        '{updatedAt}',
        to_jsonb(now()::text),
        true
      ),
      updated_at = now()
  where id = p_supplier_id;
end;
$$;

create or replace function public.compute_purchase_order_status(p_items jsonb, p_current text)
returns text
language plpgsql
immutable
as $$
declare
  item jsonb;
  ordered numeric := 0;
  received numeric := 0;
begin
  if p_current in ('cancelled', 'draft') then
    return p_current;
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    ordered := ordered + coalesce((item->>'quantity')::numeric, 0);
    received := received + coalesce((item->>'receivedQty')::numeric, 0);
  end loop;

  if received <= 0 then
    return 'sent';
  end if;
  if ordered > 0 and received + 0.001 >= ordered then
    return 'received';
  end if;
  return 'partial_received';
end;
$$;

create or replace function public.normalized_purchase_order_items(p_items jsonb)
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
  line_total numeric;
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

    line_total := public.round_money(quantity * unit_price);
    items := items || jsonb_build_array(
      jsonb_build_object(
        'productId', product_row.id::text,
        'name', product_row.document->>'name',
        'quantity', quantity,
        'receivedQty', coalesce((item->>'receivedQty')::numeric, 0),
        'allocatedQty', coalesce((item->>'allocatedQty')::numeric, 0),
        'unit', product_row.document->>'unit',
        'unitPrice', unit_price,
        'lineTotal', line_total
      )
    );
  end loop;

  return items;
end;
$$;

create or replace function public.create_purchase_order(p_document jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor public.users;
  supplier_id uuid;
  supplier_row public.suppliers;
  items jsonb;
  item jsonb;
  subtotal numeric := 0;
  tax_rate numeric;
  tax_amount numeric;
  total numeric;
  requested_status text;
  status text;
  po_number text;
  created_id uuid := gen_random_uuid();
  now_text text := now()::text;
  final_document jsonb;
begin
  actor := public.require_purchase_order_role(array['admin', 'manager']);
  requested_status := p_document->>'status';
  if requested_status not in ('draft', 'sent') then
    raise exception 'Purchase order must be draft or sent' using errcode = '22023';
  end if;

  supplier_id := nullif(p_document->>'supplierId', '')::uuid;
  if supplier_id is null then
    raise exception 'Supplier is required' using errcode = '22023';
  end if;
  select * into supplier_row from public.suppliers where id = supplier_id;
  if supplier_row.id is null then
    raise exception 'Supplier not found' using errcode = 'P0002';
  end if;

  tax_rate := coalesce((p_document->>'taxRate')::numeric, 0);
  if tax_rate < 0 or tax_rate > 1 then
    raise exception 'Tax rate must be between 0 and 1' using errcode = '22023';
  end if;

  items := public.normalized_purchase_order_items(p_document->'items');
  for item in select * from jsonb_array_elements(items) loop
    subtotal := subtotal + coalesce((item->>'lineTotal')::numeric, 0);
  end loop;
  subtotal := public.round_money(subtotal);
  tax_amount := public.round_money(subtotal * tax_rate);
  total := public.round_money(subtotal + tax_amount);
  status := case when actor.role = 'manager' and requested_status = 'sent' then 'draft' else requested_status end;
  po_number := public.claim_document_number('purchase_orders', 'PO', 5);

  final_document := jsonb_build_object(
    'poNumber', po_number,
    'supplierId', supplier_id::text,
    'supplierSnapshot', jsonb_build_object(
      'name', supplier_row.document->>'name',
      'address', coalesce(supplier_row.document->>'address', ''),
      'phone', coalesce(supplier_row.document->>'phone', '')
    ),
    'orderDate', p_document->>'orderDate',
    'items', items,
    'subtotal', subtotal,
    'taxRate', tax_rate,
    'taxAmount', tax_amount,
    'total', total,
    'amountPaid', 0,
    'status', status,
    'approvalStatus', case
      when status = 'sent' then 'approved'
      when actor.role = 'manager' and requested_status = 'sent' then 'pending'
      else 'not_requested'
    end,
    'qrPayload', '/verify/' || created_id::text,
    'notes', btrim(coalesce(p_document->>'notes', '')),
    'createdBy', actor.uid::text,
    'createdAt', now_text,
    'updatedAt', now_text
  );

  if nullif(p_document->>'expectedDelivery', '') is not null then
    final_document := final_document || jsonb_build_object('expectedDelivery', p_document->>'expectedDelivery');
  end if;
  if actor.role = 'manager' and requested_status = 'sent' then
    final_document := final_document || jsonb_build_object(
      'approvalRequestedBy', actor.uid::text,
      'approvalRequestedAt', now_text
    );
  end if;
  if status = 'sent' then
    final_document := final_document || jsonb_build_object(
      'approvedBy', actor.uid::text,
      'approvedAt', now_text
    );
  end if;

  if coalesce(final_document->>'orderDate', '') = '' then
    raise exception 'Order date is required' using errcode = '22023';
  end if;

  insert into public.purchase_orders (id, document)
  values (created_id, final_document);

  if status = 'sent' then
    perform public.bump_supplier_balance(supplier_id, total);
  end if;

  return created_id;
end;
$$;

create or replace function public.update_purchase_order(p_id uuid, p_document jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor public.users;
  purchase_order public.purchase_orders;
  supplier_id uuid;
  supplier_row public.suppliers;
  items jsonb;
  item jsonb;
  subtotal numeric := 0;
  tax_rate numeric;
  tax_amount numeric;
  total numeric;
  requested_status text;
  status text;
  now_text text := now()::text;
  final_document jsonb;
begin
  actor := public.require_purchase_order_role(array['admin', 'manager']);
  select * into purchase_order from public.purchase_orders where id = p_id for update;
  if purchase_order.id is null then
    raise exception 'Purchase order not found' using errcode = 'P0002';
  end if;
  if purchase_order.document->>'status' <> 'draft'
     or coalesce((purchase_order.document->>'amountPaid')::numeric, 0) > 0 then
    raise exception 'Only unpaid draft purchase orders can be edited' using errcode = '22023';
  end if;

  requested_status := coalesce(p_document->>'status', 'draft');
  if requested_status not in ('draft', 'sent') then
    raise exception 'Draft purchase orders may only be saved or sent' using errcode = '22023';
  end if;

  supplier_id := nullif(p_document->>'supplierId', '')::uuid;
  if supplier_id is null then
    raise exception 'Supplier is required' using errcode = '22023';
  end if;
  select * into supplier_row from public.suppliers where id = supplier_id;
  if supplier_row.id is null then
    raise exception 'Supplier not found' using errcode = 'P0002';
  end if;

  tax_rate := coalesce((p_document->>'taxRate')::numeric, 0);
  if tax_rate < 0 or tax_rate > 1 then
    raise exception 'Tax rate must be between 0 and 1' using errcode = '22023';
  end if;

  items := public.normalized_purchase_order_items(p_document->'items');
  for item in select * from jsonb_array_elements(items) loop
    subtotal := subtotal + coalesce((item->>'lineTotal')::numeric, 0);
  end loop;
  subtotal := public.round_money(subtotal);
  tax_amount := public.round_money(subtotal * tax_rate);
  total := public.round_money(subtotal + tax_amount);
  status := case when actor.role = 'manager' and requested_status = 'sent' then 'draft' else requested_status end;

  final_document := purchase_order.document
    || jsonb_build_object(
      'supplierId', supplier_id::text,
      'supplierSnapshot', jsonb_build_object(
        'name', supplier_row.document->>'name',
        'address', coalesce(supplier_row.document->>'address', ''),
        'phone', coalesce(supplier_row.document->>'phone', '')
      ),
      'orderDate', p_document->>'orderDate',
      'items', items,
      'subtotal', subtotal,
      'taxRate', tax_rate,
      'taxAmount', tax_amount,
      'total', total,
      'status', status,
      'approvalStatus', case
        when status = 'sent' then 'approved'
        when actor.role = 'manager' and requested_status = 'sent' then 'pending'
        else 'not_requested'
      end,
      'notes', btrim(coalesce(p_document->>'notes', '')),
      'updatedAt', now_text
    );

  if nullif(p_document->>'expectedDelivery', '') is not null then
    final_document := final_document || jsonb_build_object('expectedDelivery', p_document->>'expectedDelivery');
  else
    final_document := final_document - 'expectedDelivery';
  end if;

  final_document := final_document - 'rejectedBy' - 'rejectedAt' - 'rejectionReason';
  if actor.role = 'manager' and requested_status = 'sent' then
    final_document := final_document
      - 'approvedBy'
      - 'approvedAt'
      || jsonb_build_object(
        'approvalRequestedBy', actor.uid::text,
        'approvalRequestedAt', now_text
      );
  elsif status = 'sent' then
    final_document := final_document || jsonb_build_object(
      'approvedBy', actor.uid::text,
      'approvedAt', now_text
    );
  end if;

  update public.purchase_orders
  set document = final_document,
      updated_at = now()
  where id = p_id;

  if status = 'sent' then
    perform public.bump_supplier_balance(supplier_id, total);
  end if;

  return p_id;
end;
$$;

create or replace function public.transition_purchase_order(p_id uuid, p_status text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor public.users;
  purchase_order public.purchase_orders;
  supplier_id uuid;
  current_status text;
  has_activity boolean;
  final_document jsonb;
begin
  actor := public.require_purchase_order_role(array['admin', 'manager']);
  if p_status not in ('sent', 'cancelled') then
    raise exception 'Purchase order and target status are required' using errcode = '22023';
  end if;

  select * into purchase_order from public.purchase_orders where id = p_id for update;
  if purchase_order.id is null then
    raise exception 'Purchase order not found' using errcode = 'P0002';
  end if;
  supplier_id := (purchase_order.document->>'supplierId')::uuid;
  current_status := purchase_order.document->>'status';

  if p_status = 'sent' and current_status <> 'draft' then
    raise exception 'Only a draft purchase order can be sent' using errcode = '22023';
  end if;
  if p_status = 'sent' and actor.role = 'manager' and purchase_order.document->>'approvalStatus' <> 'approved' then
    raise exception 'Administrator approval is required before sending this purchase order' using errcode = '22023';
  end if;
  if p_status = 'cancelled' and current_status not in ('draft', 'sent') then
    raise exception 'This purchase order cannot be cancelled' using errcode = '22023';
  end if;

  select exists(
    select 1
    from jsonb_array_elements(coalesce(purchase_order.document->'items', '[]'::jsonb)) item
    where coalesce((item->>'receivedQty')::numeric, 0) > 0
       or coalesce((item->>'allocatedQty')::numeric, 0) > 0
  ) into has_activity;

  if p_status = 'cancelled'
     and (has_activity or coalesce((purchase_order.document->>'amountPaid')::numeric, 0) > 0) then
    raise exception 'A purchase order with receipts, allocations, or payments cannot be cancelled' using errcode = '22023';
  end if;

  final_document := purchase_order.document || jsonb_build_object('status', p_status, 'updatedAt', now()::text);
  if p_status = 'sent' and actor.role = 'admin' and purchase_order.document->>'approvalStatus' <> 'approved' then
    final_document := final_document || jsonb_build_object(
      'approvalStatus', 'approved',
      'approvedBy', actor.uid::text,
      'approvedAt', now()::text
    );
  end if;

  update public.purchase_orders
  set document = final_document,
      updated_at = now()
  where id = p_id;

  if current_status = 'sent' and p_status = 'cancelled' then
    perform public.bump_supplier_balance(supplier_id, -coalesce((purchase_order.document->>'total')::numeric, 0));
  elsif current_status <> 'sent' and p_status = 'sent' then
    perform public.bump_supplier_balance(supplier_id, coalesce((purchase_order.document->>'total')::numeric, 0));
  end if;

  return p_id;
end;
$$;

create or replace function public.request_purchase_order_approval(p_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor public.users;
  purchase_order public.purchase_orders;
begin
  actor := public.require_purchase_order_role(array['admin', 'manager']);
  select * into purchase_order from public.purchase_orders where id = p_id for update;
  if purchase_order.id is null then
    raise exception 'Purchase order not found' using errcode = 'P0002';
  end if;
  if purchase_order.document->>'status' <> 'draft' then
    raise exception 'Only draft purchase orders need approval' using errcode = '22023';
  end if;
  if purchase_order.document->>'approvalStatus' = 'pending' then
    raise exception 'Approval has already been requested' using errcode = '23505';
  end if;

  update public.purchase_orders
  set document = document
      - 'approvedBy' - 'approvedAt' - 'rejectedBy' - 'rejectedAt' - 'rejectionReason'
      || jsonb_build_object(
        'approvalStatus', 'pending',
        'approvalRequestedBy', actor.uid::text,
        'approvalRequestedAt', now()::text,
        'updatedAt', now()::text
      ),
      updated_at = now()
  where id = p_id;

  return p_id;
end;
$$;

create or replace function public.decide_purchase_order_approval(
  p_id uuid,
  p_decision text,
  p_reason text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor public.users;
  purchase_order public.purchase_orders;
  reason text := btrim(coalesce(p_reason, ''));
begin
  actor := public.require_purchase_order_role(array['admin']);
  if p_decision not in ('approved', 'rejected') or (p_decision = 'rejected' and length(reason) < 3) then
    raise exception 'Purchase order, decision, and rejection reason are required' using errcode = '22023';
  end if;

  select * into purchase_order from public.purchase_orders where id = p_id for update;
  if purchase_order.id is null then
    raise exception 'Purchase order not found' using errcode = 'P0002';
  end if;
  if purchase_order.document->>'status' <> 'draft' or purchase_order.document->>'approvalStatus' <> 'pending' then
    raise exception 'No pending approval exists' using errcode = '22023';
  end if;

  if p_decision = 'approved' then
    update public.purchase_orders
    set document = document
        - 'rejectedBy' - 'rejectedAt' - 'rejectionReason'
        || jsonb_build_object(
          'approvalStatus', 'approved',
          'approvedBy', actor.uid::text,
          'approvedAt', now()::text,
          'updatedAt', now()::text
        ),
        updated_at = now()
    where id = p_id;
  else
    update public.purchase_orders
    set document = document
        - 'approvedBy' - 'approvedAt'
        || jsonb_build_object(
          'approvalStatus', 'rejected',
          'rejectedBy', actor.uid::text,
          'rejectedAt', now()::text,
          'rejectionReason', reason,
          'updatedAt', now()::text
        ),
        updated_at = now()
    where id = p_id;
  end if;

  return p_id;
end;
$$;

create or replace function public.receive_purchase_order(
  p_purchase_order_id uuid,
  p_receipts jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor public.users;
  purchase_order public.purchase_orders;
  receipt jsonb;
  po_item jsonb;
  product_row public.products;
  product_id uuid;
  quantity numeric;
  remaining numeric;
  received_qty numeric;
  updated_items jsonb := '[]'::jsonb;
  seen uuid[] := array[]::uuid[];
  changed boolean;
  total_ordered numeric := 0;
  total_received numeric := 0;
  next_status text;
  current_stock numeric;
  next_stock numeric;
begin
  actor := public.require_purchase_order_role(array['admin', 'manager', 'warehouse']);
  if jsonb_typeof(coalesce(p_receipts, 'null'::jsonb)) is distinct from 'array'
     or jsonb_array_length(coalesce(p_receipts, '[]'::jsonb)) = 0 then
    raise exception 'Receipt lines are required' using errcode = '22023';
  end if;

  select * into purchase_order from public.purchase_orders where id = p_purchase_order_id for update;
  if purchase_order.id is null then
    raise exception 'Purchase order not found' using errcode = 'P0002';
  end if;
  if purchase_order.document->>'status' in ('draft', 'cancelled') then
    raise exception 'Purchase order cannot receive stock' using errcode = '22023';
  end if;

  for receipt in select * from jsonb_array_elements(p_receipts) loop
    product_id := nullif(receipt->>'productId', '')::uuid;
    quantity := coalesce((receipt->>'quantity')::numeric, 0);
    if product_id is null or quantity <= 0 or product_id = any(seen) then
      raise exception 'Invalid or duplicate receipt line' using errcode = '22023';
    end if;
    seen := array_append(seen, product_id);
  end loop;

  for po_item in select * from jsonb_array_elements(purchase_order.document->'items') loop
    changed := false;
    received_qty := coalesce((po_item->>'receivedQty')::numeric, 0);
    for receipt in select * from jsonb_array_elements(p_receipts) loop
      product_id := (receipt->>'productId')::uuid;
      quantity := (receipt->>'quantity')::numeric;
      if po_item->>'productId' = product_id::text then
        changed := true;
        remaining := coalesce((po_item->>'quantity')::numeric, 0) - received_qty;
        if quantity > remaining + 0.001 then
          raise exception 'Receipt for % exceeds remaining quantity', po_item->>'name' using errcode = '22023';
        end if;

        select * into product_row from public.products where id = product_id for update;
        if product_row.id is null then
          raise exception 'Product % not found', product_id using errcode = 'P0002';
        end if;
        current_stock := coalesce((product_row.document->>'stock')::numeric, 0);
        next_stock := public.round_money(current_stock + quantity);
        update public.products
        set document = jsonb_set(
              jsonb_set(document, '{stock}', to_jsonb(next_stock), true),
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
            'qty', quantity,
            'kind', 'po_receipt',
            'sourceType', 'purchase_order',
            'sourceId', p_purchase_order_id::text,
            'sourceNumber', purchase_order.document->>'poNumber',
            'balanceAfter', next_stock,
            'recordedBy', actor.uid::text,
            'at', now()::text
          )
        );

        received_qty := public.round_money(received_qty + quantity);
      end if;
    end loop;

    po_item := po_item || jsonb_build_object('receivedQty', received_qty);
    updated_items := updated_items || jsonb_build_array(po_item);
    total_ordered := total_ordered + coalesce((po_item->>'quantity')::numeric, 0);
    total_received := total_received + received_qty;
  end loop;

  foreach product_id in array seen loop
    if not exists (
      select 1
      from jsonb_array_elements(purchase_order.document->'items') item
      where item->>'productId' = product_id::text
    ) then
      raise exception 'Product % is not on this PO', product_id using errcode = '22023';
    end if;
  end loop;

  next_status := case
    when total_received + 0.001 >= total_ordered then 'received'
    else 'partial_received'
  end;

  update public.purchase_orders
  set document = document
      || jsonb_build_object(
        'items', updated_items,
        'status', next_status,
        'updatedAt', now()::text
      )
      || case when next_status = 'received' then jsonb_build_object('receivedAt', now()::text) else '{}'::jsonb end,
      updated_at = now()
  where id = p_purchase_order_id;

  return p_purchase_order_id;
end;
$$;

create or replace function public.available_po_stock(p_product_id uuid)
returns table(po_id uuid, po_number text, order_date text, remaining numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    po.id,
    po.document->>'poNumber',
    po.document->>'orderDate',
    coalesce((line->>'receivedQty')::numeric, 0) - coalesce((line->>'allocatedQty')::numeric, 0)
  from public.purchase_orders po
  cross join lateral jsonb_array_elements(po.document->'items') line
  where po.document->>'status' not in ('draft', 'cancelled')
    and line->>'productId' = p_product_id::text
    and coalesce((line->>'receivedQty')::numeric, 0) - coalesce((line->>'allocatedQty')::numeric, 0) > 0.001
  order by po.document->>'orderDate' asc, po.created_at asc
$$;

create or replace function public.record_supplier_payment(
  p_purchase_order_id uuid,
  p_payment jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor public.users;
  purchase_order public.purchase_orders;
  payment_id uuid := gen_random_uuid();
  amount numeric;
  remaining numeric;
  method text;
begin
  actor := public.require_purchase_order_role(array['admin', 'manager']);
  amount := coalesce((p_payment->>'amount')::numeric, 0);
  method := p_payment->>'method';
  if amount <= 0 then
    raise exception 'A positive payment amount is required' using errcode = '22023';
  end if;
  if method not in ('cash', 'bank', 'mobile_money', 'cheque') then
    raise exception 'Invalid payment method' using errcode = '22023';
  end if;

  select * into purchase_order from public.purchase_orders where id = p_purchase_order_id for update;
  if purchase_order.id is null then
    raise exception 'Purchase order not found' using errcode = 'P0002';
  end if;
  if purchase_order.document->>'status' in ('draft', 'cancelled') then
    raise exception 'Purchase order is not payable' using errcode = '22023';
  end if;

  remaining := coalesce((purchase_order.document->>'total')::numeric, 0)
    - coalesce((purchase_order.document->>'amountPaid')::numeric, 0);
  if amount > remaining + 0.01 then
    raise exception 'Payment exceeds outstanding balance' using errcode = '22023';
  end if;

  update public.purchase_orders
  set document = jsonb_set(
        document,
        '{amountPaid}',
        to_jsonb(public.round_money(coalesce((document->>'amountPaid')::numeric, 0) + amount)),
        true
      ) || jsonb_build_object('updatedAt', now()::text),
      updated_at = now()
  where id = p_purchase_order_id;

  perform public.bump_supplier_balance((purchase_order.document->>'supplierId')::uuid, -amount);

  insert into public.supplier_payments (id, document)
  values (
    payment_id,
    jsonb_build_object(
      'purchaseOrderId', p_purchase_order_id::text,
      'poNumber', purchase_order.document->>'poNumber',
      'supplierId', purchase_order.document->>'supplierId',
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

create or replace function public.allocate_delivery_order_fifo(
  p_delivery_order_id uuid,
  p_do_number text,
  p_items jsonb,
  p_actor_uid uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  request_item jsonb;
  po_row public.purchase_orders;
  po_item jsonb;
  updated_items jsonb;
  remaining_to_allocate numeric;
  available numeric;
  quantity numeric;
  changed boolean;
  allocations jsonb := '[]'::jsonb;
  allocation_id uuid;
begin
  delete from public.po_allocations where document->>'deliveryOrderId' = p_delivery_order_id::text;

  for request_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    remaining_to_allocate := coalesce((request_item->>'quantity')::numeric, 0);

    for po_row in
      select *
      from public.purchase_orders
      where document->>'status' not in ('draft', 'cancelled')
      order by document->>'orderDate' asc, created_at asc
      for update
    loop
      exit when remaining_to_allocate <= 0.001;
      updated_items := '[]'::jsonb;
      changed := false;

      for po_item in select * from jsonb_array_elements(po_row.document->'items') loop
        if po_item->>'productId' = request_item->>'productId' then
          available := coalesce((po_item->>'receivedQty')::numeric, 0) - coalesce((po_item->>'allocatedQty')::numeric, 0);
          if available > 0.001 then
            quantity := least(available, remaining_to_allocate);
            po_item := po_item || jsonb_build_object(
              'allocatedQty',
              public.round_money(coalesce((po_item->>'allocatedQty')::numeric, 0) + quantity)
            );
            allocation_id := gen_random_uuid();
            insert into public.po_allocations (id, document)
            values (
              allocation_id,
              jsonb_build_object(
                'deliveryOrderId', p_delivery_order_id::text,
                'doNumber', p_do_number,
                'purchaseOrderId', po_row.id::text,
                'poNumber', po_row.document->>'poNumber',
                'productId', request_item->>'productId',
                'productName', request_item->>'name',
                'quantity', quantity,
                'allocatedAt', now()::text,
                'allocatedBy', p_actor_uid::text
              )
            );
            allocations := allocations || jsonb_build_array(
              jsonb_build_object(
                'id', allocation_id::text,
                'deliveryOrderId', p_delivery_order_id::text,
                'doNumber', p_do_number,
                'purchaseOrderId', po_row.id::text,
                'poNumber', po_row.document->>'poNumber',
                'productId', request_item->>'productId',
                'productName', request_item->>'name',
                'quantity', quantity,
                'allocatedAt', now()::text,
                'allocatedBy', p_actor_uid::text
              )
            );
            remaining_to_allocate := remaining_to_allocate - quantity;
            changed := true;
          end if;
        end if;
        updated_items := updated_items || jsonb_build_array(po_item);
      end loop;

      if changed then
        update public.purchase_orders
        set document = po_row.document || jsonb_build_object('items', updated_items, 'updatedAt', now()::text),
            updated_at = now()
        where id = po_row.id;
      end if;
    end loop;
  end loop;

  return allocations;
end;
$$;

create or replace function public.deallocate_delivery_order_fifo(p_delivery_order_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  allocation public.po_allocations;
  po_row public.purchase_orders;
  po_item jsonb;
  updated_items jsonb;
begin
  for allocation in
    select * from public.po_allocations where document->>'deliveryOrderId' = p_delivery_order_id::text
  loop
    select * into po_row
    from public.purchase_orders
    where id = (allocation.document->>'purchaseOrderId')::uuid
    for update;
    if po_row.id is not null then
      updated_items := '[]'::jsonb;
      for po_item in select * from jsonb_array_elements(po_row.document->'items') loop
        if po_item->>'productId' = allocation.document->>'productId' then
          po_item := po_item || jsonb_build_object(
            'allocatedQty',
            greatest(
              0,
              public.round_money(
                coalesce((po_item->>'allocatedQty')::numeric, 0)
                - coalesce((allocation.document->>'quantity')::numeric, 0)
              )
            )
          );
        end if;
        updated_items := updated_items || jsonb_build_array(po_item);
      end loop;
      update public.purchase_orders
      set document = po_row.document || jsonb_build_object('items', updated_items, 'updatedAt', now()::text),
          updated_at = now()
      where id = po_row.id;
    end if;
  end loop;

  delete from public.po_allocations where document->>'deliveryOrderId' = p_delivery_order_id::text;
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
  allocations jsonb := '[]'::jsonb;
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
  if status = 'issued' then
    perform public.apply_delivery_stock(created_id, do_number, items, -1, actor.uid);
    allocations := public.allocate_delivery_order_fifo(created_id, do_number, items, actor.uid);
    if sales_order_id is not null then
      perform public.apply_sales_order_delivery_progress(sales_order_id, items, 1);
    end if;
  end if;

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
    'allocations', allocations
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
  allocations jsonb := '[]'::jsonb;
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

  if next_status = 'issued' then
    perform public.apply_delivery_stock(p_id, delivery_order.document->>'doNumber', items, -1, actor.uid);
    allocations := public.allocate_delivery_order_fifo(p_id, delivery_order.document->>'doNumber', items, actor.uid);
    if sales_order_id is not null then
      perform public.apply_sales_order_delivery_progress(sales_order_id, items, 1);
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
      'allocations', allocations,
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
    perform public.deallocate_delivery_order_fifo(p_id);
    if sales_order_id is not null then
      perform public.apply_sales_order_delivery_progress(sales_order_id, delivery_order.document->'items', -1);
    end if;

    update public.delivery_orders
    set document = document
        || jsonb_build_object('status', 'cancelled', 'allocations', '[]'::jsonb, 'updatedAt', now()::text),
        updated_at = now()
    where id = p_id;

    return p_id;
  end if;

  raise exception 'Unsupported transition from % to %', current_status, p_status using errcode = '22023';
end;
$$;
