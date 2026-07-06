create table if not exists public.document_counters (
  name text primary key,
  value integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists document_counters_touch_updated_at on public.document_counters;
create trigger document_counters_touch_updated_at
before update on public.document_counters
for each row execute function public.touch_updated_at();

drop trigger if exists sales_orders_touch_updated_at on public.sales_orders;
create trigger sales_orders_touch_updated_at
before update on public.sales_orders
for each row execute function public.touch_updated_at();

create index if not exists sales_orders_so_number_idx
on public.sales_orders ((document->>'soNumber'));

create index if not exists sales_orders_status_idx
on public.sales_orders ((document->>'status'));

create index if not exists sales_orders_created_at_idx
on public.sales_orders (created_at desc);

alter table public.document_counters enable row level security;
alter table public.sales_orders enable row level security;

drop policy if exists "erp users can read document counters" on public.document_counters;
create policy "erp users can read document counters"
on public.document_counters for select
to authenticated
using (public.is_active_erp_user());

drop policy if exists "erp users can read sales orders" on public.sales_orders;
create policy "erp users can read sales orders"
on public.sales_orders for select
to authenticated
using (public.is_active_erp_user());

create or replace function public.pad_document_number(p_value integer, p_width integer default 5)
returns text
language sql
immutable
as $$
  select lpad(p_value::text, p_width, '0')
$$;

create or replace function public.preview_document_number(
  p_name text,
  p_prefix text,
  p_width integer default 5
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p_prefix || '-' || public.pad_document_number(
    coalesce((select value from public.document_counters where name = p_name), 0) + 1,
    p_width
  )
$$;

create or replace function public.claim_document_number(
  p_name text,
  p_prefix text,
  p_width integer default 5
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  next_value integer;
begin
  insert into public.document_counters (name, value)
  values (p_name, 1)
  on conflict (name) do update
    set value = public.document_counters.value + 1,
        updated_at = now()
  returning value into next_value;

  return p_prefix || '-' || public.pad_document_number(next_value, p_width);
end;
$$;

create or replace function public.round_money(p_value numeric)
returns numeric
language sql
immutable
as $$
  select round(coalesce(p_value, 0), 2)
$$;

create or replace function public.require_sales_order_role()
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
  if actor.role not in ('admin', 'manager', 'sales') then
    raise exception 'You do not have permission to manage sales orders' using errcode = '42501';
  end if;
  return actor;
end;
$$;

create or replace function public.create_sales_order(p_document jsonb)
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
  item jsonb;
  product_id uuid;
  product_row public.products;
  items jsonb := '[]'::jsonb;
  line_total numeric;
  subtotal numeric := 0;
  tax_rate numeric;
  tax_amount numeric;
  requested_status text;
  salesperson_name text;
  order_date_text text;
  valid_until_text text;
  so_number text;
  created_id uuid := gen_random_uuid();
  now_text text := now()::text;
  final_document jsonb;
begin
  actor := public.require_sales_order_role();

  requested_status := p_document->>'status';
  if requested_status not in ('quotation', 'confirmed') then
    raise exception 'Sales order must start as a quotation or confirmed' using errcode = '22023';
  end if;

  customer_id := nullif(p_document->>'customerId', '')::uuid;
  if customer_id is null then
    raise exception 'Customer is required' using errcode = '22023';
  end if;

  select * into customer_row from public.customers where id = customer_id;
  if customer_row.id is null then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;

  salesperson_name := btrim(coalesce(p_document->>'salespersonName', ''));
  if salesperson_name = '' then
    raise exception 'Salesperson is required' using errcode = '22023';
  end if;

  order_date_text := p_document->>'orderDate';
  if order_date_text is null or order_date_text = '' then
    raise exception 'Order date is required' using errcode = '22023';
  end if;

  valid_until_text := nullif(p_document->>'validUntil', '');
  tax_rate := coalesce((p_document->>'taxRate')::numeric, 0);
  if tax_rate < 0 or tax_rate > 1 then
    raise exception 'Tax rate must be between 0 and 1' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_document->'items', 'null'::jsonb)) is distinct from 'array'
     or jsonb_array_length(coalesce(p_document->'items', '[]'::jsonb)) = 0 then
    raise exception 'At least one item is required' using errcode = '22023';
  end if;

  for item in select * from jsonb_array_elements(p_document->'items') loop
    product_id := nullif(item->>'productId', '')::uuid;
    if product_id is null then
      raise exception 'Product is required' using errcode = '22023';
    end if;
    select * into product_row from public.products where id = product_id;
    if product_row.id is null then
      raise exception 'Product % not found', product_id using errcode = 'P0002';
    end if;
    if coalesce((item->>'quantity')::numeric, 0) <= 0 then
      raise exception 'Quantity must be greater than zero' using errcode = '22023';
    end if;
    if coalesce((item->>'unitPrice')::numeric, 0) < 0 then
      raise exception 'Unit price cannot be negative' using errcode = '22023';
    end if;

    line_total := public.round_money((item->>'quantity')::numeric * (item->>'unitPrice')::numeric);
    subtotal := subtotal + line_total;
    items := items || jsonb_build_array(
      jsonb_build_object(
        'productId', product_row.id::text,
        'name', product_row.document->>'name',
        'quantity', (item->>'quantity')::numeric,
        'deliveredQty', 0,
        'invoicedQty', 0,
        'unit', product_row.document->>'unit',
        'unitPrice', (item->>'unitPrice')::numeric,
        'lineTotal', line_total
      )
    );
  end loop;

  subtotal := public.round_money(subtotal);
  tax_amount := public.round_money(subtotal * tax_rate);
  so_number := public.claim_document_number('sales_orders', 'SO', 5);

  final_document := jsonb_build_object(
    'soNumber', so_number,
    'customerId', customer_row.id::text,
    'customerSnapshot', jsonb_build_object(
      'name', customer_row.document->>'name',
      'address', coalesce(customer_row.document->>'address', ''),
      'phone', coalesce(customer_row.document->>'phone', '')
    ),
    'salespersonId', actor.uid::text,
    'salespersonName', salesperson_name,
    'orderDate', order_date_text,
    'items', items,
    'subtotal', subtotal,
    'taxRate', tax_rate,
    'taxAmount', tax_amount,
    'total', public.round_money(subtotal + tax_amount),
    'status', requested_status,
    'notes', btrim(coalesce(p_document->>'notes', '')),
    'createdBy', actor.uid::text,
    'createdAt', now_text,
    'updatedAt', now_text
  );

  if valid_until_text is not null then
    final_document := final_document || jsonb_build_object('validUntil', valid_until_text);
  end if;

  insert into public.sales_orders (id, document)
  values (created_id, final_document);

  return created_id;
end;
$$;

create or replace function public.transition_sales_order(p_id uuid, p_status text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor public.users;
  sales_order public.sales_orders;
  current_status text;
  has_progress boolean;
begin
  actor := public.require_sales_order_role();

  if p_status not in ('confirmed', 'cancelled') then
    raise exception 'Unsupported sales-order transition' using errcode = '22023';
  end if;

  select * into sales_order from public.sales_orders where id = p_id for update;
  if sales_order.id is null then
    raise exception 'Sales order not found' using errcode = 'P0002';
  end if;

  current_status := sales_order.document->>'status';
  if not (
    (current_status = 'quotation' and p_status = 'confirmed') or
    (current_status in ('quotation', 'confirmed') and p_status = 'cancelled')
  ) then
    raise exception 'Cannot change sales order from % to %', current_status, p_status using errcode = '22023';
  end if;

  if p_status = 'cancelled' then
    select exists(
      select 1
      from jsonb_array_elements(sales_order.document->'items') as item
      where coalesce((item->>'deliveredQty')::numeric, 0) > 0
         or coalesce((item->>'invoicedQty')::numeric, 0) > 0
    ) into has_progress;

    if has_progress then
      raise exception 'A sales order with delivery or invoice progress cannot be cancelled' using errcode = '22023';
    end if;
  end if;

  update public.sales_orders
  set document = sales_order.document
      || jsonb_build_object('status', p_status, 'updatedAt', now()::text),
      updated_at = now()
  where id = p_id;

  insert into public.activity_logs (document)
  values (
    jsonb_build_object(
      'at', now()::text,
      'actorUid', actor.uid::text,
      'actorName', coalesce(actor.display_name, actor.email, 'User'),
      'action', case when p_status = 'confirmed' then 'so.confirm' else 'so.cancel' end,
      'entityType', 'sales_order',
      'entityId', p_id::text,
      'entityLabel', sales_order.document->>'soNumber',
      'summary', case
        when p_status = 'confirmed' then 'Confirmed sales order ' || (sales_order.document->>'soNumber')
        else 'Cancelled sales order ' || (sales_order.document->>'soNumber')
      end
    )
  );

  return p_id;
end;
$$;
