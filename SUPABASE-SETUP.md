# Supabase Setup

This migration wires Supabase into the existing `DataAdapter` boundary for auth,
company settings, users, customers, suppliers, products, activity logs, document
counters, Sales Orders, Delivery Orders, Purchase Orders, Invoices, stock
movements, FIFO PO allocations, supplier payments, customer payments, user
invitations, and admin backups.

Sales Orders, Delivery Orders, Purchase Orders, Invoices, stock adjustments, and
public document verification now run through Supabase RPC/Postgres functions.
Delivery Orders allocate FIFO from received Purchase Order stock when issued.

## 1. Create the Supabase Project

Create a Supabase project and copy these values into `.env.local`:

```env
NEXT_PUBLIC_USE_SUPABASE=true
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SUPABASE_ADMIN_EMAIL=admin@irmaan.co
SUPABASE_ADMIN_PASSWORD=CHOOSE_A_STRONG_PASSWORD
SUPABASE_ADMIN_NAME=Admin User
```

If `NEXT_PUBLIC_USE_FIREBASE=true` is still present, Supabase wins when
`NEXT_PUBLIC_USE_SUPABASE=true` is also set.

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Do not prefix it with
`NEXT_PUBLIC_`.

## 2. Apply the SQL Migrations

Run these SQL files in order:

```text
supabase/migrations/001_initial_supabase_foundation.sql
supabase/migrations/002_sales_orders.sql
supabase/migrations/003_delivery_orders.sql
supabase/migrations/004_purchase_orders.sql
supabase/migrations/005_invoices.sql
supabase/migrations/006_stock_and_verification.sql
supabase/migrations/007_prevent_duplicate_so_invoices.sql
```

You can paste it into the Supabase SQL editor, or run it through the Supabase
CLI once the project is linked.

## 3. Create the First Admin

After migrations are applied, create or repair the first admin account:

```bash
npm run supabase:create-admin
```

After that, sign in with the Supabase Auth email/password.

## 4. Verify the Supabase Project

Run the smoke test after applying migrations:

```bash
npm run supabase:smoke
```

It checks the expected tables, key RPCs, and the default settings row.

## Next Migration Step

Validate the full Supabase flow against a live project. Once sign-in, document
creation, stock movements, payments, user invites, and backups pass live testing,
Firebase can be removed from the runtime code and dependencies.
