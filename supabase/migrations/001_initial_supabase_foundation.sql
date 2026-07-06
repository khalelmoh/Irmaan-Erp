create extension if not exists pgcrypto;

create table if not exists public.users (
  uid uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  role text not null check (role in ('admin', 'manager', 'sales', 'warehouse')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.company_settings (
  id text primary key default 'default',
  document jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint company_settings_singleton check (id = 'default')
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists company_settings_touch_updated_at on public.company_settings;
create trigger company_settings_touch_updated_at
before update on public.company_settings
for each row execute function public.touch_updated_at();

drop trigger if exists customers_touch_updated_at on public.customers;
create trigger customers_touch_updated_at
before update on public.customers
for each row execute function public.touch_updated_at();

drop trigger if exists suppliers_touch_updated_at on public.suppliers;
create trigger suppliers_touch_updated_at
before update on public.suppliers
for each row execute function public.touch_updated_at();

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
before update on public.products
for each row execute function public.touch_updated_at();

drop trigger if exists activity_logs_touch_updated_at on public.activity_logs;
create trigger activity_logs_touch_updated_at
before update on public.activity_logs
for each row execute function public.touch_updated_at();

create or replace function public.current_erp_user()
returns public.users
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.users
  where uid = auth.uid()
    and active = true
  limit 1
$$;

create or replace function public.current_erp_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.current_erp_user()
$$;

create or replace function public.is_active_erp_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.current_erp_user())
$$;

create or replace function public.can_manage_master_data()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_erp_role() in ('admin', 'manager', 'sales', 'warehouse')
$$;

create or replace function public.can_manage_settings()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_erp_role() = 'admin'
$$;

alter table public.users enable row level security;
alter table public.company_settings enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists "erp users can read users" on public.users;
create policy "erp users can read users"
on public.users for select
to authenticated
using (public.is_active_erp_user());

drop policy if exists "admins can insert users" on public.users;
create policy "admins can insert users"
on public.users for insert
to authenticated
with check (public.current_erp_role() = 'admin');

drop policy if exists "admins can update users" on public.users;
create policy "admins can update users"
on public.users for update
to authenticated
using (public.current_erp_role() = 'admin')
with check (public.current_erp_role() = 'admin');

drop policy if exists "erp users can read settings" on public.company_settings;
create policy "erp users can read settings"
on public.company_settings for select
to authenticated
using (public.is_active_erp_user());

drop policy if exists "admins can write settings" on public.company_settings;
create policy "admins can write settings"
on public.company_settings for all
to authenticated
using (public.can_manage_settings())
with check (public.can_manage_settings());

drop policy if exists "erp users can read customers" on public.customers;
create policy "erp users can read customers"
on public.customers for select
to authenticated
using (public.is_active_erp_user());

drop policy if exists "permitted users can write customers" on public.customers;
create policy "permitted users can write customers"
on public.customers for all
to authenticated
using (public.can_manage_master_data())
with check (public.can_manage_master_data());

drop policy if exists "erp users can read suppliers" on public.suppliers;
create policy "erp users can read suppliers"
on public.suppliers for select
to authenticated
using (public.is_active_erp_user());

drop policy if exists "permitted users can write suppliers" on public.suppliers;
create policy "permitted users can write suppliers"
on public.suppliers for all
to authenticated
using (public.can_manage_master_data())
with check (public.can_manage_master_data());

drop policy if exists "erp users can read products" on public.products;
create policy "erp users can read products"
on public.products for select
to authenticated
using (public.is_active_erp_user());

drop policy if exists "permitted users can write products" on public.products;
create policy "permitted users can write products"
on public.products for all
to authenticated
using (public.can_manage_master_data())
with check (public.can_manage_master_data());

drop policy if exists "erp users can read activity logs" on public.activity_logs;
create policy "erp users can read activity logs"
on public.activity_logs for select
to authenticated
using (public.is_active_erp_user());

drop policy if exists "erp users can append activity logs" on public.activity_logs;
create policy "erp users can append activity logs"
on public.activity_logs for insert
to authenticated
with check (public.is_active_erp_user());

insert into public.company_settings (id, document)
values (
  'default',
  '{
    "companyName": "Irmaan Trading & Logistics",
    "address": "Hargeisa, Somaliland",
    "phone": "+252 63 4 000 000",
    "email": "info@irmaan.co",
    "taxId": "",
    "currency": "USD",
    "currencySymbol": "$",
    "defaultTaxRate": 0.05,
    "defaultPaymentTerms": 30,
    "invoiceFooter": ""
  }'::jsonb
)
on conflict (id) do nothing;
