# Irmaan ERP — Trading & Logistics Management System

A professional ERP-lite for trading / logistics companies. Manages **Delivery Orders (D.O)**, **Purchase Orders (P.O)**, and **Invoices** with role-based access, QR verification, and print-ready PDF documents.

> **Status:** Phase 1 + Phase 2 (Delivery Orders) implemented in this scaffold. PO / Invoice / Reports modules are stubbed with the same architecture and ready to be filled in.

---

## 1. System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser)                            │
│  Next.js 14 App Router · React 18 · TypeScript · Tailwind · ShadCN   │
└──────────────────────────────────────────────────────────────────────┘
                │                          │
                │ React Server Components  │ Client Components
                ▼                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       APPLICATION LAYER                              │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │   Pages    │  │  Components  │  │    Hooks     │  │  Contexts  │ │
│  │ (app/...)  │  │  (ui, forms) │  │ (useAuth...) │  │ (Auth, UI) │ │
│  └────────────┘  └──────────────┘  └──────────────┘  └────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    SERVICE / ADAPTER LAYER                           │
│  Pure functions: customerService, productService, doService, ...    │
│  ── Pluggable data source ──                                         │
│   ▸ MockAdapter   (in-memory, used for preview/dev)                 │
│   ▸ FirebaseAdapter (Firestore + Storage + Auth)                    │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                            BACKEND                                   │
│  Firebase Auth · Firestore · Storage · Vercel API routes             │
│  (transactions, document numbers, audit logs, user administration)  │
└──────────────────────────────────────────────────────────────────────┘
```

### Why this shape?

* **Service/Adapter layer** means the UI never imports Firebase directly. Swap `MockAdapter` → `FirebaseAdapter` by changing one line in `src/services/index.ts`. Unit tests stay fast, the preview works without credentials, and migration is painless.
* **App Router** lets us co-locate route, loading, and error states per module.
* **Server components for lists**, client components for forms and interactive document builders.
* **Vercel API routes** own anything that must be authoritative: sequential document numbers (`DO-00001`), stock transactions, payments, and activity logs. Firebase ID tokens and role profiles are verified on the server.

---

## 2. Folder Structure

```
irmaan-erp/
├── public/
│   └── logo/                       # SVG logo + favicon
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── layout.tsx              # Root layout + providers
│   │   ├── page.tsx                # Landing → redirects to /dashboard or /login
│   │   ├── globals.css             # Tailwind + print styles
│   │   ├── login/                  # Auth pages
│   │   ├── dashboard/              # KPIs, recent orders, charts
│   │   ├── customers/              # CRUD + history
│   │   ├── products/               # CRUD + stock
│   │   ├── delivery-orders/
│   │   │   ├── page.tsx            # List + filters
│   │   │   ├── new/page.tsx        # Create D.O wizard
│   │   │   └── [id]/
│   │   │       ├── page.tsx        # View / print-ready
│   │   │       └── pdf/page.tsx    # React-PDF download route
│   │   ├── purchase-orders/        # (stub, same pattern as DO)
│   │   ├── invoices/               # (stub)
│   │   ├── reports/                # (stub)
│   │   └── verify/[id]/page.tsx    # Public QR verification page
│   ├── components/
│   │   ├── ui/                     # ShadCN primitives (button, input, ...)
│   │   ├── layout/                 # Sidebar, Topbar, PageHeader
│   │   ├── forms/                  # DeliveryOrderForm, CustomerForm, ...
│   │   └── documents/              # DOPrintView, DOPdfDocument, QRBlock
│   ├── services/                   # ⭐ Data access layer (adapter pattern)
│   │   ├── index.ts                # Exports active adapter
│   │   ├── types.ts                # DataAdapter interface
│   │   ├── mockAdapter.ts          # In-memory implementation
│   │   ├── firebaseAdapter.ts      # Firestore implementation
│   │   ├── seed.ts                 # Demo data
│   │   └── numbering.ts            # DO/PO/INV sequence helper
│   ├── lib/
│   │   ├── firebase.ts             # Firebase init (lazy)
│   │   ├── utils.ts                # cn(), formatters
│   │   ├── auth.ts                 # Role guard helpers
│   │   └── validators.ts           # Zod schemas
│   ├── types/                      # Domain types (User, Customer, DO, ...)
│   ├── hooks/                      # useAuth, useToast, useDocuments
│   └── contexts/                   # AuthContext
├── firestore.rules                 # Security rules
├── firestore.indexes.json
├── functions/                      # Shared authoritative operation handlers
│   └── src/index.ts                # transactions reused by the Vercel API
├── tailwind.config.ts
├── next.config.mjs
├── tsconfig.json
└── package.json
```

---

## 3. Firestore Schema

All documents include `createdAt`, `updatedAt`, `createdBy`, `updatedBy`.

### `users/{uid}`
```ts
{
  uid: string;
  email: string;
  displayName: string;
  role: "admin" | "manager" | "sales" | "warehouse";
  active: boolean;
  createdAt: Timestamp;
}
```

### `customers/{customerId}`
```ts
{
  code: string;           // CUST-0001
  name: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  address: string;
  city?: string;
  country?: string;
  taxId?: string;
  balance: number;        // running A/R, updated by CF on invoice events
  notes?: string;
  active: boolean;
}
```

### `suppliers/{supplierId}` — same shape as customers, `balance` = A/P.

### `products/{productId}`
```ts
{
  sku: string;            // PRD-0001
  name: string;
  description?: string;
  unit: "Bag" | "Box" | "Pcs" | "Ton" | "Liter" | string;
  unitPrice: number;
  cost?: number;
  stock: number;          // updated by CF on DO/PO events
  reorderLevel?: number;
  category?: string;
  active: boolean;
}
```

### `delivery_orders/{doId}`
```ts
{
  doNumber: string;           // DO-00001 (assigned by the server transaction)
  customerId: string;
  customerSnapshot: {         // denormalized for historic accuracy
    name: string;
    address: string;
    phone: string;
  };
  salespersonId: string;
  salespersonName: string;
  orderDate: Timestamp;
  items: Array<{
    productId: string;
    name: string;             // snapshot
    quantity: number;
    unit: string;
    unitPrice?: number;       // optional on DO
  }>;
  loadingDetails: {
    driverName: string;
    mobile: string;
    truckPlate: string;
    owner: string;
    destination: string;
  };
  status: "draft" | "issued" | "delivered" | "cancelled";
  authorizedBy?: string;
  invoiceId?: string;         // link when invoiced
  qrPayload: string;          // signed URL for /verify/{id}
  notes?: string;
}
```

### `purchase_orders/{poId}` — mirror of DO, `supplierId` + `expectedDelivery`.

### `invoices/{invoiceId}`
```ts
{
  invoiceNumber: string;      // INV-00001
  customerId: string;
  customerSnapshot: {...};
  doIds: string[];            // linked DOs
  issueDate: Timestamp;
  dueDate: Timestamp;
  items: Array<{ productId, name, quantity, unit, unitPrice, lineTotal }>;
  subtotal: number;
  taxRate: number;            // e.g. 0.05
  taxAmount: number;
  total: number;
  amountPaid: number;
  status: "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled";
}
```

### `payments/{paymentId}`
```ts
{
  invoiceId: string;
  customerId: string;
  amount: number;
  method: "cash" | "bank" | "mobile_money" | "cheque";
  reference?: string;
  paidAt: Timestamp;
  recordedBy: string;
}
```

### `activity_logs/{logId}` (append-only, written by the server API)
```ts
{
  actor: string;              // uid
  action: string;             // "do.create" | "invoice.pay" | ...
  entity: { type: string; id: string };
  diff?: Record<string, unknown>;
  at: Timestamp;
}
```

### `counters/{counter}` (single doc per sequence, used by transaction)
```ts
{ value: number }     // e.g. counters/delivery_orders => { value: 42 }
```

---

## 4. Authentication Flow

```
                ┌──────────────┐
                │   /login     │
                └──────┬───────┘
                       │  email + password
                       ▼
              Firebase Auth signIn
                       │
                       ▼
        Read users/{uid} for role + active flag
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
       active=true           active=false
            │                     │
            ▼                     ▼
   AuthContext sets user    Sign out + toast
   middleware allows app    redirect /login
```

**Role matrix:**

| Action                  | admin | manager | sales | warehouse |
|-------------------------|:-----:|:-------:|:-----:|:---------:|
| Manage users            |   ✓   |         |       |           |
| Manage customers        |   ✓   |    ✓    |   ✓   |           |
| Manage products / stock |   ✓   |    ✓    |       |     ✓     |
| Create / issue D.O      |   ✓   |    ✓    |   ✓   |     ✓     |
| Create P.O              |   ✓   |    ✓    |       |           |
| Create / send Invoice   |   ✓   |    ✓    |   ✓   |           |
| Record payment          |   ✓   |    ✓    |       |           |
| View Reports            |   ✓   |    ✓    |       |           |

Enforced in **three** places: UI (hide controls), middleware (`/api/*`), Firestore rules (authoritative).

---

## 5. Auto-numbering

Sequence generation runs inside a Firestore **transaction** on the `counters/{name}` doc:

```ts
// Shared server operation handler
export const nextDocNumber = onCall(async ({ data, auth }) => {
  assertAuthed(auth);
  const { sequence, prefix } = data; // "delivery_orders", "DO"
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`counters/${sequence}`);
    const snap = await tx.get(ref);
    const next = (snap.exists ? snap.data()!.value : 0) + 1;
    tx.set(ref, { value: next }, { merge: true });
    return `${prefix}-${String(next).padStart(5, "0")}`;
  });
});
```

The mock adapter mimics this with an atomic counter so dev/preview behave identically.

---

## 6. Running

```bash
cd irmaan-erp
npm install
npm run dev      # http://localhost:3000 — runs against MockAdapter by default
```

To connect Firebase:
1. Copy `.env.example` → `.env.local` and paste your project keys.
2. Edit `src/services/index.ts` and switch `dataAdapter` to `firebaseAdapter`.
3. Deploy rules: `firebase deploy --only firestore:rules`.
4. Configure the public Firebase variables plus `FIREBASE_PROJECT_ID`,
   `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` in Vercel.

---

## 7. Implemented in this scaffold

- ✅ Full project + folder structure
- ✅ Type system + Zod validators
- ✅ MockAdapter with seed data (customers, products, DOs, sample invoice + partial payment)
- ✅ FirebaseAdapter skeleton (drop-in)
- ✅ Auth context + role guard (mock login: `admin@irmaan.co` / any password)
- ✅ App shell (sidebar, topbar, breadcrumbs)
- ✅ Dashboard with real KPIs: total billed, A/R outstanding, collected this month, overdue
- ✅ Customers CRUD with auto-maintained A/R balance
- ✅ Products CRUD
- ✅ **Delivery Order**: list, create wizard, view, print, React-PDF download, QR verification, "Create Invoice" link
- ✅ **Invoice module** (NEW):
  - List with status filter + 4 KPIs (billed / collected / outstanding / overdue)
  - Create invoice from one or more DOs (items + customer auto-fill)
  - Standalone invoice creation
  - Editable tax rate per invoice
  - Print view + React-PDF download (with bank instructions + QR)
  - **Record payment** dialog: cash / bank / mobile money / cheque
  - Full payment history per invoice
  - Auto status: draft → sent → partial → paid (or → overdue)
  - Automatic customer balance updates
  - Invoice cancellation
- ✅ Public verification page handles both DOs **and** invoices
- ✅ Firestore security rules (incl. payment validation)
- ✅ Transaction-safe server numbering

- ✅ **Suppliers module** (NEW): full CRUD with auto-maintained A/P balance
- ✅ **Purchase Orders module** (NEW):
  - List with 4 KPIs (ordered / A/P / awaiting receipt / drafts), status filter, search
  - Create P.O wizard with supplier picker + product cost-price defaults
  - Print view + React-PDF download with QR
  - **Receive Items** dialog: full or partial receipt per line, **automatic stock increase**
  - Receiving progress bar (% received vs ordered)
  - **Record supplier payment** dialog (cash / bank / mobile money / cheque)
  - Full supplier-payment history
  - Auto status: draft → sent → partial_received → received
  - Automatic supplier A/P balance updates
  - P.O cancellation
- ✅ Verify page handles DOs, Invoices, **and** Purchase Orders
- ✅ Dashboard now shows A/R + A/P + net cash this month

- ✅ **Reports & Analytics module** (NEW — final core module):
  - `/reports` hub with snapshot KPIs + 6 report tiles
  - **Sales report**: billed/collected, monthly trend chart, top customers
  - **A/R aging**: 5-bucket breakdown (not due, 1-30, 31-60, 61-90, 90+), donut chart, invoice drill-down
  - **Purchases report**: spend, monthly orders-vs-paid trend, top suppliers
  - **A/P aging**: 4-bucket breakdown, donut chart, PO drill-down
  - **Inventory report**: stock valued at cost + retail, potential margin, low-stock alerts with reorder suggestions
  - **Profitability report**: revenue − COGS = gross profit, margin % per product
  - Every report: date range picker (with 5 presets), CSV export, print-optimized layout
  - Interactive charts: line, bar (incl. horizontal), donut — all responsive via Recharts

**All core modules are complete.** The system now covers the full operating cycle of a trading business: customers → DOs → invoices → payments → A/R, and suppliers → POs → receiving → supplier payments → A/P → inventory → profitability.
