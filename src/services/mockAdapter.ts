/**
 * In-memory data adapter. Persists to localStorage so reloads keep state.
 * Mirrors the FirebaseAdapter API exactly so it can be swapped 1:1.
 */
import type { DataAdapter, Listable, CompanySettings, ListPageOptions, ListPageResult } from "./types";
import type {
  Customer,
  Supplier,
  Product,
  SalesOrder,
  SOStatus,
  DeliveryOrder,
  PurchaseOrder,
  POAllocation,
  POStatus,
  Invoice,
  InvoiceStatus,
  Payment,
  SupplierPayment,
  StockMovement,
  StockMovementKind,
  ActivityLog,
  User,
} from "@/types";
import {
  seedCustomers, seedProducts, seedDOs, seedUsers,
  seedInvoices, seedPayments,
  seedSuppliers, seedPOs, seedSupplierPayments,
  seedSalesOrders, seedPOAllocations,
} from "./seed";
import { padNumber } from "@/lib/utils";

// ─── persistence ───────────────────────────────────────────────────────────
// v10: Change admin user name to Khalel Mohamed
// Bumping the key triggers a clean reseed for users on older versions.
const KEY = "irmaan-erp:v10";

const DEFAULT_SETTINGS: CompanySettings = {
  companyName: "Irmaan Trading & Logistics",
  address: "Hargeisa, Somaliland",
  phone: "+252 63 4 000 000",
  email: "info@irmaan.co",
  taxId: "",
  currency: "USD",
  currencySymbol: "$",
  defaultTaxRate: 0.05,
  defaultPaymentTerms: 30,
  invoiceFooter: "Thank you for your business. Payment is due within the terms stated above.",
};

type Store = {
  users: User[];
  customers: Customer[];
  suppliers: Supplier[];
  products: Product[];
  salesOrders: SalesOrder[];
  deliveryOrders: DeliveryOrder[];
  purchaseOrders: PurchaseOrder[];
  invoices: Invoice[];
  payments: Payment[];
  supplierPayments: SupplierPayment[];
  stockMovements: StockMovement[];
  poAllocations: POAllocation[];
  activityLog: ActivityLog[];
  companySettings: CompanySettings;
  counters: { so: number; do: number; po: number; inv: number; cust: number; sup: number; prd: number };
  session?: { uid: string } | null;
};

function defaults(): Store {
  // IMPORTANT: deep-clone seed arrays so this function is idempotent.
  // The seed arrays are module-level singletons — never mutate them directly.
  const products: Product[] = seedProducts.map((p) => ({ ...p }));
  const dos: DeliveryOrder[] = seedDOs.map((d) => ({
    ...d,
    items: d.items.map((it) => ({ ...it })),
    invoiceId: d.id === "do2" ? "inv1" : d.invoiceId,
  }));

  // ─── Reconstruct realistic stock history ──────────────────────────────
  // We'll walk through historical events and let our central applyStockChange-like
  // logic compute running balances. The product `stock` values in the seed
  // represent OPENING balance (before any PO receipt / DO issue).
  const movements: StockMovement[] = [];
  const balances: Record<string, number> = {};
  const baseTime = Date.now() - 86400000 * 30; // 30 days ago

  // 1. Opening balance for each product
  products.forEach((p) => {
    balances[p.id] = p.stock;
    movements.push({
      id: crypto.randomUUID(),
      productId: p.id,
      productName: p.name,
      unit: p.unit,
      qty: p.stock,
      kind: "opening_balance",
      balanceAfter: p.stock,
      recordedBy: "u_admin",
      at: new Date(baseTime).toISOString(),
    });
  });

  // 2. PO-00001 partial receipt (1,200 bags of cement)
  const poP1 = products.find((p) => p.id === "p1");
  if (poP1) {
    balances["p1"] += 1200;
    poP1.stock = balances["p1"];
    movements.push({
      id: crypto.randomUUID(),
      productId: "p1",
      productName: poP1.name,
      unit: poP1.unit,
      qty: 1200,
      kind: "po_receipt",
      sourceType: "purchase_order",
      sourceId: "po1",
      sourceNumber: "PO-00001",
      balanceAfter: balances["p1"],
      recordedBy: "u_admin",
      at: new Date(Date.now() - 86400000 * 3).toISOString(),
    });
  }

  // 3. Seeded DOs that have status "delivered" or "issued" consumed stock
  dos.forEach((d) => {
    if (d.status !== "delivered" && d.status !== "issued") return;
    d.items.forEach((it) => {
      const prod = products.find((p) => p.id === it.productId);
      if (!prod) return;
      balances[it.productId] = (balances[it.productId] ?? prod.stock) - it.quantity;
      prod.stock = balances[it.productId];
      movements.push({
        id: crypto.randomUUID(),
        productId: it.productId,
        productName: prod.name,
        unit: prod.unit,
        qty: -it.quantity,
        kind: "do_issue",
        sourceType: "delivery_order",
        sourceId: d.id,
        sourceNumber: d.doNumber,
        balanceAfter: balances[it.productId],
        recordedBy: d.createdBy ?? "u_admin",
        at: d.createdAt,
      });
    });
  });

  return {
    users: seedUsers,
    customers: seedCustomers.map((c) => ({ ...c })),
    suppliers: seedSuppliers.map((s) => ({ ...s })),
    products,
    deliveryOrders: dos,
    purchaseOrders: seedPOs.map((p) => ({ ...p, items: p.items.map((it) => ({ ...it })) })),
    invoices: seedInvoices.map((i) => ({ ...i, items: i.items.map((it) => ({ ...it })) })),
    payments: seedPayments.map((p) => ({ ...p })),
    supplierPayments: seedSupplierPayments.map((p) => ({ ...p })),
    salesOrders: seedSalesOrders.map((s) => ({ ...s, items: s.items.map((it) => ({ ...it })) })),
    stockMovements: movements,
    poAllocations: seedPOAllocations.map(a => ({...a})),
    activityLog: [],
    companySettings: { ...DEFAULT_SETTINGS },
    counters: {
      so: seedSalesOrders.length,
      do: seedDOs.length,
      po: seedPOs.length,
      inv: seedInvoices.length,
      cust: seedCustomers.length,
      sup: seedSuppliers.length,
      prd: seedProducts.length,
    },
    session: null,
  };
}

function load(): Store {
  if (typeof window === "undefined") return defaults();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      const d = defaults();
      window.localStorage.setItem(KEY, JSON.stringify(d));
      return d;
    }
    return JSON.parse(raw);
  } catch {
    return defaults();
  }
}

function save(s: Store) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

function tx<T>(fn: (s: Store) => T): T {
  const s = load();
  const out = fn(s);
  save(s);
  return out;
}

// ─── generic CRUD factory ──────────────────────────────────────────────────
function crud<K extends keyof Store, T extends { id: string }>(
  bucket: K,
): Listable<T> {
  return {
    async list() {
      return (load()[bucket] as unknown as T[]).slice().reverse();
    },
    async get(id: string) {
      return (load()[bucket] as unknown as T[]).find((x) => x.id === id) ?? null;
    },
    async create(input) {
      return tx((s) => {
        const arr = s[bucket] as unknown as T[];
        const now = new Date().toISOString();
        const item = {
          ...(input as object),
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        } as unknown as T;
        arr.push(item);
        return item;
      });
    },
    async update(id, patch) {
      return tx((s) => {
        const arr = s[bucket] as unknown as T[];
        const idx = arr.findIndex((x) => x.id === id);
        if (idx === -1) throw new Error("Not found");
        arr[idx] = {
          ...arr[idx],
          ...patch,
          updatedAt: new Date().toISOString(),
        } as T;
        return arr[idx];
      });
    },
    async remove(id) {
      tx((s) => {
        const arr = s[bucket] as unknown as T[];
        const idx = arr.findIndex((x) => x.id === id);
        if (idx !== -1) arr.splice(idx, 1);
      });
    },
  };
}

// ─── adapter ───────────────────────────────────────────────────────────────
function mockListPage<T extends { id: string; status: string }>(
  items: T[],
  options: ListPageOptions,
  numberField: keyof T,
  status?: string | string[],
): ListPageResult<T> {
  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize) || 25, 1), 100);
  const offset = typeof options.cursor === "number" ? options.cursor : 0;
  const search = options.search?.trim().toUpperCase() ?? "";
  const statuses = Array.isArray(status) ? status : status && status !== "all" ? [status] : [];
  let result = items.slice().reverse();

  if (statuses.length > 0) {
    result = result.filter((item) => statuses.includes(item.status));
  }

  if (search) {
    result = result.filter((item) => String(item[numberField]).toUpperCase() === search);
  }

  const page = result.slice(offset, offset + pageSize);
  const nextOffset = offset + page.length;

  return {
    items: page,
    nextCursor: nextOffset < result.length ? nextOffset : null,
    hasMore: nextOffset < result.length,
  };
}

function effectiveInvoiceStatusForList(invoice: Invoice): InvoiceStatus {
  if (invoice.status === "cancelled" || invoice.status === "draft" || invoice.status === "paid") {
    return invoice.status;
  }
  if (invoice.amountPaid > 0 && invoice.amountPaid + 0.001 < invoice.total) return "partial";
  if (new Date(invoice.dueDate).getTime() < Date.now()) return "overdue";
  return "sent";
}

function mockInvoiceListPage(options: ListPageOptions<InvoiceStatus>): ListPageResult<Invoice> {
  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize) || 25, 1), 100);
  const offset = typeof options.cursor === "number" ? options.cursor : 0;
  const search = options.search?.trim().toUpperCase() ?? "";
  let result = load().invoices.slice().reverse();

  if (search) {
    result = result.filter((invoice) => invoice.invoiceNumber.toUpperCase() === search);
  }

  if (options.status && options.status !== "all") {
    result = result.filter((invoice) => effectiveInvoiceStatusForList(invoice) === options.status);
  }

  const page = result.slice(offset, offset + pageSize);
  const nextOffset = offset + page.length;

  return {
    items: page,
    nextCursor: nextOffset < result.length ? nextOffset : null,
    hasMore: nextOffset < result.length,
  };
}

const customers = crud<"customers", Customer>("customers");
const suppliers = crud<"suppliers", Supplier>("suppliers");
const products = crud<"products", Product>("products");

// Override create for customers/suppliers/products to generate codes
const _custCreate = customers.create.bind(customers);
customers.create = async (input) => {
  const c = await _custCreate(input as never);
  return tx((s) => {
    s.counters.cust += 1;
    const idx = s.customers.findIndex((x) => x.id === c.id);
    s.customers[idx] = { ...s.customers[idx], code: `CUST-${padNumber(s.counters.cust, 4)}` };
    return s.customers[idx];
  });
};

const _supCreate = suppliers.create.bind(suppliers);
suppliers.create = async (input) => {
  const c = await _supCreate(input as never);
  return tx((s) => {
    s.counters.sup += 1;
    const idx = s.suppliers.findIndex((x) => x.id === c.id);
    s.suppliers[idx] = { ...s.suppliers[idx], code: `SUP-${padNumber(s.counters.sup, 4)}` };
    return s.suppliers[idx];
  });
};

const _prodCreate = products.create.bind(products);
products.create = async (input) => {
  const p = await _prodCreate(input as never);
  return tx((s) => {
    s.counters.prd += 1;
    const idx = s.products.findIndex((x) => x.id === p.id);
    s.products[idx] = { ...s.products[idx], sku: `PRD-${padNumber(s.counters.prd, 4)}` };
    return s.products[idx];
  });
};

// ─── central stock-change helper ──────────────────────────────────────────
/**
 * Single source of truth for ALL stock mutations.
 * Updates product.stock and writes a StockMovement audit row.
 * Caller is responsible for being inside a `tx()` block.
 */
function applyStockChange(
  s: Store,
  args: {
    productId: string;
    qty: number;           // positive = IN, negative = OUT
    kind: StockMovementKind;
    sourceType?: StockMovement["sourceType"];
    sourceId?: string;
    sourceNumber?: string;
    reason?: string;
    recordedBy: string;
  },
): StockMovement | null {
  const product = s.products.find((p) => p.id === args.productId);
  if (!product) return null;
  // Guard against negative stock for outgoing movements
  const newStock = Math.round((product.stock + args.qty) * 100) / 100;
  if (newStock < -0.001) {
    throw new Error(
      `Insufficient stock for "${product.name}": have ${product.stock} ${product.unit}, trying to remove ${Math.abs(args.qty)}`,
    );
  }
  product.stock = newStock;
  product.updatedAt = new Date().toISOString();

  const movement: StockMovement = {
    id: crypto.randomUUID(),
    productId: product.id,
    productName: product.name,
    unit: product.unit,
    qty: args.qty,
    kind: args.kind,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    sourceNumber: args.sourceNumber,
    reason: args.reason,
    balanceAfter: newStock,
    recordedBy: args.recordedBy,
    at: new Date().toISOString(),
  };
  s.stockMovements.push(movement);
  return movement;
}

// ─── FIFO PO Allocation ───────────────────────────────────────────────────

function allocateFromPOs(s: Store, doId: string, doNumber: string, items: { productId: string; name: string; quantity: number }[], recordedBy: string): POAllocation[] {
  const newAllocations: POAllocation[] = [];
  const now = new Date().toISOString();

  for (const item of items) {
    let remainingToAllocate = item.quantity;
    if (remainingToAllocate <= 0) continue;

    // Find all POs that have received stock for this product
    const candidatePOs = s.purchaseOrders.filter(po => 
      po.status !== "cancelled" && po.status !== "draft"
    ).sort((a, b) => new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime());

    for (const po of candidatePOs) {
      const poLine = po.items.find(it => it.productId === item.productId);
      if (!poLine) continue;

      const received = poLine.receivedQty ?? 0;
      const allocated = poLine.allocatedQty ?? 0;
      const available = received - allocated;

      if (available <= 0) continue;

      const allocateQty = Math.min(available, remainingToAllocate);
      poLine.allocatedQty = allocated + allocateQty;
      remainingToAllocate -= allocateQty;

      const allocation: POAllocation = {
        id: crypto.randomUUID(),
        deliveryOrderId: doId,
        doNumber,
        purchaseOrderId: po.id,
        poNumber: po.poNumber,
        productId: item.productId,
        productName: item.name,
        quantity: allocateQty,
        allocatedAt: now,
        allocatedBy: recordedBy,
      };
      s.poAllocations.push(allocation);
      newAllocations.push(allocation);

      if (remainingToAllocate <= 0.001) break;
    }

  }

  return newAllocations;
}

function deallocateFromPOs(s: Store, doId: string) {
  const allocations = s.poAllocations.filter(a => a.deliveryOrderId === doId);
  for (const alloc of allocations) {
    const po = s.purchaseOrders.find(p => p.id === alloc.purchaseOrderId);
    if (!po) continue;
    const poLine = po.items.find(it => it.productId === alloc.productId);
    if (poLine) {
      poLine.allocatedQty = Math.max(0, (poLine.allocatedQty ?? 0) - alloc.quantity);
    }
  }
  // Remove allocations
  s.poAllocations = s.poAllocations.filter(a => a.deliveryOrderId !== doId);
}


// ─── Sales Orders ───────────────────────────────────────────────────────────────
const soBase = crud<"salesOrders", SalesOrder>("salesOrders");

function computeAutoSOStatus(so: SalesOrder): SOStatus {
  if (so.status === "cancelled" || so.status === "quotation") return so.status;
  const totalOrdered = so.items.reduce((s, i) => s + i.quantity, 0);
  const totalInvoiced = so.items.reduce((s, i) => s + (i.invoicedQty ?? 0), 0);
  if (totalInvoiced + 0.001 >= totalOrdered) return "invoiced";
  const totalDelivered = so.items.reduce((s, i) => s + (i.deliveredQty ?? 0), 0);
  if (totalDelivered + 0.001 >= totalOrdered) return "fully_delivered";
  return "confirmed";
}

function updateSOProgress(
  s: Store,
  soId: string | undefined,
  items: Array<{ productId: string; quantity: number }>,
  field: "deliveredQty" | "invoicedQty",
) {
  if (!soId || items.length === 0) return;
  const so = s.salesOrders.find((x) => x.id === soId);
  if (!so) throw new Error("Sales order not found");
  if (so.status === "cancelled") throw new Error("Cannot update a cancelled sales order");

  for (const r of items) {
    const line = so.items.find((it) => it.productId === r.productId);
    if (!line) throw new Error(`Item ${r.productId} is not on ${so.soNumber}`);
    const next = Math.round(((line[field] ?? 0) + r.quantity) * 100) / 100;
    if (next < -0.001) {
      throw new Error(`${so.soNumber} ${field === "deliveredQty" ? "delivery" : "invoice"} quantity cannot be negative`);
    }
    if (next > line.quantity + 0.001) {
      const action = field === "deliveredQty" ? "deliver" : "invoice";
      throw new Error(
        `Cannot ${action} ${r.quantity} ${line.unit} of ${line.name}; ${so.soNumber} has only ${Math.max(0, line.quantity - (line[field] ?? 0))} remaining`,
      );
    }
    line[field] = Math.max(0, next);
  }

  so.status = computeAutoSOStatus(so);
  so.updatedAt = new Date().toISOString();
}

const salesOrders: DataAdapter["salesOrders"] = {
  ...soBase,
  async nextNumber() {
    return tx((s) => `SO-${padNumber(s.counters.so + 1, 5)}`);
  },
  async create(input) {
    return tx((s) => {
      s.counters.so += 1;
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const item: SalesOrder = {
        ...(input as Omit<SalesOrder, "id" | "createdAt" | "updatedAt" | "soNumber">),
        id,
        soNumber: `SO-${padNumber(s.counters.so, 5)}`,
        createdAt: now,
        updatedAt: now,
      } as SalesOrder;
      // Ensure deliveredQty/invoicedQty start at 0
      item.items = item.items.map((it) => ({ ...it, deliveredQty: it.deliveredQty ?? 0, invoicedQty: it.invoicedQty ?? 0 }));
      s.salesOrders.push(item);
      return item;
    });
  },
  async update(id, patch) {
    return tx((s) => {
      const idx = s.salesOrders.findIndex((x) => x.id === id);
      if (idx === -1) throw new Error("Not found");
      s.salesOrders[idx] = { ...s.salesOrders[idx], ...patch, updatedAt: new Date().toISOString() };
      s.salesOrders[idx].status = computeAutoSOStatus(s.salesOrders[idx]);
      return s.salesOrders[idx];
    });
  },
  async confirm(soId) {
    return tx((s) => {
      const so = s.salesOrders.find((x) => x.id === soId);
      if (!so) throw new Error("Sales order not found");
      if (so.status !== "quotation") throw new Error("Only quotations can be confirmed");
      so.status = "confirmed";
      so.updatedAt = new Date().toISOString();
      return so;
    });
  },
  async updateDeliveredQty(soId, items) {
    return tx((s) => {
      updateSOProgress(s, soId, items, "deliveredQty");
      const so = s.salesOrders.find((x) => x.id === soId)!;
      return so;
    });
  },
  async updateInvoicedQty(soId, items) {
    return tx((s) => {
      updateSOProgress(s, soId, items, "invoicedQty");
      const so = s.salesOrders.find((x) => x.id === soId)!;
      return so;
    });
  },
};

const doBase = crud<"deliveryOrders", DeliveryOrder>("deliveryOrders");

function validateDeliverySalesOrder(s: Store, deliveryOrder: DeliveryOrder) {
  if (!deliveryOrder.salesOrderId) return;
  const salesOrder = s.salesOrders.find((so) => so.id === deliveryOrder.salesOrderId);
  if (!salesOrder) throw new Error("Sales order not found");
  if (salesOrder.customerId !== deliveryOrder.customerId) {
    throw new Error("Delivery order customer does not match the sales order");
  }
}

const deliveryOrders: DataAdapter["deliveryOrders"] = {
  ...doBase,
  async nextNumber() {
    return tx((s) => `DO-${padNumber(s.counters.do + 1, 5)}`);
  },
  async listPage(options) {
    return mockListPage(load().deliveryOrders, options, "doNumber", options.status);
  },
  async create(input) {
    return tx((s) => {
      s.counters.do += 1;
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const item: DeliveryOrder = {
        ...(input as Omit<DeliveryOrder, "id" | "createdAt" | "updatedAt" | "doNumber">),
        id,
        doNumber: `DO-${padNumber(s.counters.do, 5)}`,
        createdAt: now,
        updatedAt: now,
      } as DeliveryOrder;
      item.qrPayload = `/verify/${id}`;

      // Decrement stock for each line when DO is created in "issued" status.
      // (Drafts don't reserve stock.)
      if (item.status === "issued" || item.status === "delivered") {
        validateDeliverySalesOrder(s, item);
        for (const it of item.items) {
          applyStockChange(s, {
            productId: it.productId,
            qty: -it.quantity,
            kind: "do_issue",
            sourceType: "delivery_order",
            sourceId: item.id,
            sourceNumber: item.doNumber,
            recordedBy: item.createdBy ?? "system",
          });
        }
        item.allocations = allocateFromPOs(s, item.id, item.doNumber, item.items, item.createdBy ?? "system");
        updateSOProgress(s, item.salesOrderId, item.items, "deliveredQty");
      }

      s.deliveryOrders.push(item);
      return item;
    });
  },
  async update(id, patch) {
    return tx((s) => {
      const idx = s.deliveryOrders.findIndex((x) => x.id === id);
      if (idx === -1) throw new Error("Not found");
      const before = s.deliveryOrders[idx];
      const after = { ...before, ...patch, updatedAt: new Date().toISOString() };

      // Cancellation returns stock if the DO had previously consumed it
      const wasConsumed = before.status === "issued" || before.status === "delivered";
      const isCancelled = after.status === "cancelled";
      const itemsChanged = JSON.stringify(before.items) !== JSON.stringify(after.items);
      const statusChanged = before.status !== after.status;
      const validTransition =
        !statusChanged ||
        (before.status === "draft" && ["issued", "cancelled"].includes(after.status)) ||
        (before.status === "issued" && ["delivered", "cancelled"].includes(after.status)) ||
        (before.status === "delivered" && after.status === "cancelled");
      if (!validTransition) {
        throw new Error(`Unsupported delivery-order transition from ${before.status} to ${after.status}`);
      }
      if (isCancelled && before.invoiceId) {
        throw new Error("Cancel the linked invoice before cancelling this delivery order");
      }
      if (wasConsumed && !isCancelled && itemsChanged) {
        throw new Error("Issued delivery order items cannot be edited. Cancel the D.O and create a replacement.");
      }
      if (wasConsumed && isCancelled) {
        for (const it of before.items) {
          applyStockChange(s, {
            productId: it.productId,
            qty: it.quantity,
            kind: "do_cancel",
            sourceType: "delivery_order",
            sourceId: before.id,
            sourceNumber: before.doNumber,
            reason: `Cancellation of ${before.doNumber}`,
            recordedBy: "system",
          });
        }
        deallocateFromPOs(s, before.id);
        updateSOProgress(s, before.salesOrderId, before.items.map((it) => ({ ...it, quantity: -it.quantity })), "deliveredQty");
        after.allocations = [];
      }

      // If transitioning from draft to issued, consume stock
      const isBecomingIssued = before.status === "draft" && (after.status === "issued" || after.status === "delivered");
      if (isBecomingIssued) {
        validateDeliverySalesOrder(s, after);
        for (const it of after.items) {
          applyStockChange(s, {
            productId: it.productId,
            qty: -it.quantity,
            kind: "do_issue",
            sourceType: "delivery_order",
            sourceId: after.id,
            sourceNumber: after.doNumber,
            recordedBy: "system",
          });
        }
        after.allocations = allocateFromPOs(s, after.id, after.doNumber, after.items, "system");
        updateSOProgress(s, after.salesOrderId, after.items, "deliveredQty");
      }

      s.deliveryOrders[idx] = after;
      return after;
    });
  },
};

// ─── purchase orders (mirror of invoices, with stock receiving) ───────────
const poBase = crud<"purchaseOrders", PurchaseOrder>("purchaseOrders");

function computePOStatus(po: PurchaseOrder): POStatus {
  if (po.status === "cancelled" || po.status === "draft") return po.status;
  const totalOrdered = po.items.reduce((s, i) => s + i.quantity, 0);
  const totalReceived = po.items.reduce((s, i) => s + (i.receivedQty ?? 0), 0);
  if (totalReceived <= 0) return "sent";
  if (totalReceived + 0.001 >= totalOrdered) return "received";
  return "partial_received";
}

/** Recalculate supplier A/P from all non-cancelled, non-draft POs. */
function recomputeSupplierBalance(s: Store, supplierId: string) {
  const sup = s.suppliers.find((x) => x.id === supplierId);
  if (!sup) return;
  const owed = s.purchaseOrders
    .filter((p) => p.supplierId === supplierId && p.status !== "cancelled" && p.status !== "draft")
    .reduce((sum, p) => sum + (p.total - p.amountPaid), 0);
  sup.balance = Math.round(owed * 100) / 100;
  sup.updatedAt = new Date().toISOString();
}

const purchaseOrders: DataAdapter["purchaseOrders"] = {
  ...poBase,
  async nextNumber() {
    return tx((s) => `PO-${padNumber(s.counters.po + 1, 5)}`);
  },
  async listPage(options) {
    return mockListPage(
      load().purchaseOrders,
      options,
      "poNumber",
      options.status === "pending_receipt" ? ["sent", "partial_received"] : options.status,
    );
  },
  async requestApproval(poId) {
    return tx((s) => {
      const po = s.purchaseOrders.find((item) => item.id === poId);
      if (!po) throw new Error("Purchase order not found");
      if (po.status !== "draft") throw new Error("Only draft purchase orders need approval");
      if (po.approvalStatus === "pending") throw new Error("Approval has already been requested");
      const actor = s.session ? s.users.find((user) => user.uid === s.session!.uid) : null;
      if (!actor || !["admin", "manager"].includes(actor.role)) {
        throw new Error("Manager access required");
      }
      po.approvalStatus = "pending";
      po.approvalRequestedBy = actor.uid;
      po.approvalRequestedAt = new Date().toISOString();
      po.approvedBy = undefined;
      po.approvedAt = undefined;
      po.rejectedBy = undefined;
      po.rejectedAt = undefined;
      po.rejectionReason = undefined;
      po.updatedAt = new Date().toISOString();
      return po;
    });
  },
  async decideApproval(poId, decision, reason) {
    return tx((s) => {
      const po = s.purchaseOrders.find((item) => item.id === poId);
      if (!po) throw new Error("Purchase order not found");
      const actor = s.session ? s.users.find((user) => user.uid === s.session!.uid) : null;
      if (!actor || actor.role !== "admin") throw new Error("Administrator access required");
      if (po.status !== "draft" || po.approvalStatus !== "pending") {
        throw new Error("No pending approval exists");
      }
      if (decision === "rejected" && (!reason || reason.trim().length < 3)) {
        throw new Error("A rejection reason is required");
      }
      po.approvalStatus = decision;
      if (decision === "approved") {
        po.approvedBy = actor.uid;
        po.approvedAt = new Date().toISOString();
        po.rejectedBy = undefined;
        po.rejectedAt = undefined;
        po.rejectionReason = undefined;
      } else {
        po.rejectedBy = actor.uid;
        po.rejectedAt = new Date().toISOString();
        po.rejectionReason = reason!.trim();
        po.approvedBy = undefined;
        po.approvedAt = undefined;
      }
      po.updatedAt = new Date().toISOString();
      return po;
    });
  },
  async create(input) {
    return tx((s) => {
      s.counters.po += 1;
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const item: PurchaseOrder = {
        ...(input as Omit<PurchaseOrder, "id" | "createdAt" | "updatedAt" | "poNumber">),
        id,
        poNumber: `PO-${padNumber(s.counters.po, 5)}`,
        amountPaid: 0,
        qrPayload: `/verify/${id}`,
        createdAt: now,
        updatedAt: now,
      } as PurchaseOrder;
      const actor = s.session ? s.users.find((user) => user.uid === s.session!.uid) : null;
      if (item.status === "sent" && actor?.role === "manager") {
        item.status = "draft";
        item.approvalStatus = "pending";
        item.approvalRequestedBy = actor.uid;
        item.approvalRequestedAt = now;
      } else if (item.status === "sent") {
        item.approvalStatus = "approved";
        item.approvedBy = actor?.uid ?? item.createdBy;
        item.approvedAt = now;
      } else {
        item.approvalStatus = "not_requested";
      }
      // Ensure receivedQty starts at 0
      item.items = item.items.map((it) => ({ ...it, receivedQty: it.receivedQty ?? 0 }));
      s.purchaseOrders.push(item);
      recomputeSupplierBalance(s, item.supplierId);
      return item;
    });
  },
  async update(id, patch) {
    return tx((s) => {
      const idx = s.purchaseOrders.findIndex((x) => x.id === id);
      if (idx === -1) throw new Error("Not found");
      const before = s.purchaseOrders[idx];
      const after = { ...before, ...patch, updatedAt: new Date().toISOString() };
      const actor = s.session ? s.users.find((user) => user.uid === s.session!.uid) : null;
      if (before.status === "draft" && patch.status === "sent") {
        if (actor?.role === "manager" && before.approvalStatus !== "approved") {
          after.status = "draft";
          after.approvalStatus = "pending";
          after.approvalRequestedBy = actor.uid;
          after.approvalRequestedAt = new Date().toISOString();
        } else {
          after.approvalStatus = "approved";
          after.approvedBy = actor?.uid ?? before.createdBy;
          after.approvedAt = new Date().toISOString();
        }
      }
      const itemsChanged = JSON.stringify(before.items) !== JSON.stringify(after.items);
      const hasReceipts = before.items.some((it) => (it.receivedQty ?? 0) > 0);
      const hasAllocations = before.items.some((it) => (it.allocatedQty ?? 0) > 0);

      if (itemsChanged && (hasReceipts || before.amountPaid > 0)) {
        throw new Error("Purchase order items cannot be edited after receipts or payments. Create a correction instead.");
      }

      // If cancelling a PO that already had stock received, reverse those receipts.
      const becomingCancelled = before.status !== "cancelled" && after.status === "cancelled";
      if (becomingCancelled) {
        if (hasAllocations) {
          throw new Error("Cannot cancel a purchase order with stock already allocated to delivery orders.");
        }
        if (before.amountPaid > 0) {
          throw new Error("Cannot cancel a purchase order with supplier payments recorded.");
        }
        for (const it of before.items) {
          const received = it.receivedQty ?? 0;
          if (received > 0) {
            applyStockChange(s, {
              productId: it.productId,
              qty: -received,
              kind: "po_receipt_reverse",
              sourceType: "purchase_order",
              sourceId: before.id,
              sourceNumber: before.poNumber,
              reason: `Cancellation of ${before.poNumber}`,
              recordedBy: "system",
            });
          }
        }
      }

      s.purchaseOrders[idx] = after;
      s.purchaseOrders[idx].status = computePOStatus(s.purchaseOrders[idx]);
      recomputeSupplierBalance(s, s.purchaseOrders[idx].supplierId);
      return s.purchaseOrders[idx];
    });
  },
  async remove(id) {
    tx((s) => {
      const po = s.purchaseOrders.find((x) => x.id === id);
      if (!po) return;
      // Drop related supplier payments
      s.supplierPayments = s.supplierPayments.filter((p) => p.purchaseOrderId !== id);
      s.purchaseOrders = s.purchaseOrders.filter((x) => x.id !== id);
      recomputeSupplierBalance(s, po.supplierId);
    });
  },
  async receiveItems(poId, receipts, receivedBy) {
    return tx((s) => {
      const po = s.purchaseOrders.find((x) => x.id === poId);
      if (!po) throw new Error("Purchase order not found");
      if (po.status === "cancelled") throw new Error("Cannot receive a cancelled PO");

      for (const r of receipts) {
        const line = po.items.find((it) => it.productId === r.productId);
        if (!line) throw new Error(`Item ${r.productId} not on this PO`);
        const alreadyReceived = line.receivedQty ?? 0;
        const remaining = line.quantity - alreadyReceived;
        if (r.quantity < 0) throw new Error("Receive quantity cannot be negative");
        if (r.quantity > remaining + 0.001) {
          throw new Error(
            `Receiving ${r.quantity} ${line.unit} of ${line.name} exceeds remaining ${remaining}`,
          );
        }
        line.receivedQty = alreadyReceived + r.quantity;
        // Record stock movement (and bump product.stock atomically)
        applyStockChange(s, {
          productId: r.productId,
          qty: r.quantity,
          kind: "po_receipt",
          sourceType: "purchase_order",
          sourceId: po.id,
          sourceNumber: po.poNumber,
          recordedBy: receivedBy || "system",
        });
      }

      po.status = computePOStatus(po);
      if (po.status === "received") po.receivedAt = new Date().toISOString();
      po.updatedAt = new Date().toISOString();
      return po;
    });
  },
  async markFullyReceived(poId, receivedBy) {
    return tx((s) => {
      const po = s.purchaseOrders.find((x) => x.id === poId);
      if (!po) throw new Error("Purchase order not found");
      if (po.status === "cancelled") throw new Error("Cannot receive a cancelled PO");
      const receipts = po.items
        .map((it) => ({
          productId: it.productId,
          quantity: it.quantity - (it.receivedQty ?? 0),
        }))
        .filter((r) => r.quantity > 0);
      if (receipts.length === 0) return po;
      for (const r of receipts) {
        const line = po.items.find((it) => it.productId === r.productId)!;
        line.receivedQty = (line.receivedQty ?? 0) + r.quantity;
        applyStockChange(s, {
          productId: r.productId,
          qty: r.quantity,
          kind: "po_receipt",
          sourceType: "purchase_order",
          sourceId: po.id,
          sourceNumber: po.poNumber,
          recordedBy: receivedBy || "system",
        });
      }
      po.status = computePOStatus(po);
      po.receivedAt = new Date().toISOString();
      po.updatedAt = new Date().toISOString();
      return po;
    });
  },
  async recordPayment(poId, paymentInput) {
    return tx((s) => {
      const po = s.purchaseOrders.find((x) => x.id === poId);
      if (!po) throw new Error("Purchase order not found");
      if (po.status === "cancelled") throw new Error("PO is cancelled");
      const remaining = po.total - po.amountPaid;
      if (paymentInput.amount > remaining + 0.01) {
        throw new Error(
          `Payment ($${paymentInput.amount.toFixed(2)}) exceeds outstanding balance ($${remaining.toFixed(2)})`,
        );
      }
      const now = new Date().toISOString();
      const payment: SupplierPayment = {
        id: crypto.randomUUID(),
        purchaseOrderId: poId,
        poNumber: po.poNumber,
        supplierId: po.supplierId,
        amount: paymentInput.amount,
        method: paymentInput.method,
        reference: paymentInput.reference,
        paidAt: paymentInput.paidAt,
        recordedBy: paymentInput.recordedBy,
        notes: paymentInput.notes,
        createdAt: now,
      };
      s.supplierPayments.push(payment);
      po.amountPaid = Math.round((po.amountPaid + paymentInput.amount) * 100) / 100;
      po.updatedAt = now;
      recomputeSupplierBalance(s, po.supplierId);
      return { po, payment };
    });
  },
  async payments(poId) {
    return load()
      .supplierPayments.filter((p) => p.purchaseOrderId === poId)
      .sort((a, b) => +new Date(b.paidAt) - +new Date(a.paidAt));
  },
  async availableStock(productId) {
    const s = load();
    const candidatePOs = s.purchaseOrders.filter(po => 
      po.status !== "cancelled" && po.status !== "draft"
    ).sort((a, b) => new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime());

    const result = [];
    for (const po of candidatePOs) {
      const line = po.items.find(it => it.productId === productId);
      if (!line) continue;
      const received = line.receivedQty ?? 0;
      const allocated = line.allocatedQty ?? 0;
      const remaining = received - allocated;
      if (remaining > 0) {
        result.push({
          poId: po.id,
          poNumber: po.poNumber,
          orderDate: po.orderDate,
          remaining,
        });
      }
    }
    return result;
  },
};

// ─── PO Allocations ───────────────────────────────────────────────────────
const poAllocations: DataAdapter["poAllocations"] = {
  async list() {
    return load().poAllocations.slice().reverse();
  },
  async byDeliveryOrder(doId) {
    return load().poAllocations.filter(a => a.deliveryOrderId === doId);
  },
  async byPurchaseOrder(poId) {
    return load().poAllocations.filter(a => a.purchaseOrderId === poId);
  },
};

// ─── invoices + payments (the business logic) ─────────────────────────────
const invBase = crud<"invoices", Invoice>("invoices");

/** Recalculate amountPaid + status from the payments table. */
function recomputeInvoice(s: Store, invoiceId: string): Invoice | null {
  const inv = s.invoices.find((i) => i.id === invoiceId);
  if (!inv) return null;
  const paid = s.payments
    .filter((p) => p.invoiceId === invoiceId)
    .reduce((sum, p) => sum + p.amount, 0);
  inv.amountPaid = Math.round(paid * 100) / 100;
  // Status transitions: don't overwrite "cancelled" or "draft" manually set
  let status: InvoiceStatus = inv.status;
  if (status !== "cancelled" && status !== "draft") {
    if (inv.amountPaid <= 0) {
      status = isOverdue(inv) ? "overdue" : "sent";
    } else if (inv.amountPaid + 0.001 < inv.total) {
      status = "partial";
    } else {
      status = "paid";
    }
  }
  inv.status = status;
  inv.updatedAt = new Date().toISOString();
  return inv;
}

function isOverdue(inv: Invoice) {
  return new Date(inv.dueDate).getTime() < Date.now();
}

function countsTowardSOInvoice(inv: Invoice) {
  return inv.type !== "credit_note" && inv.status !== "draft" && inv.status !== "cancelled";
}

function validateAndLinkInvoiceDOs(s: Store, inv: Invoice) {
  for (const doId of inv.doIds) {
    const d = s.deliveryOrders.find((x) => x.id === doId);
    if (!d) throw new Error(`Delivery order ${doId} not found`);
    if (d.status !== "issued" && d.status !== "delivered") {
      throw new Error(`${d.doNumber} must be issued before invoicing`);
    }
    if (d.customerId !== inv.customerId) {
      throw new Error(`${d.doNumber} belongs to a different customer`);
    }
    if (inv.salesOrderId && d.salesOrderId && d.salesOrderId !== inv.salesOrderId) {
      throw new Error(`${d.doNumber} belongs to a different sales order`);
    }
    if (d.invoiceId && d.invoiceId !== inv.id) {
      throw new Error(`${d.doNumber} is already linked to an invoice`);
    }
  }

  if (inv.salesOrderId) {
    const salesOrder = s.salesOrders.find((so) => so.id === inv.salesOrderId);
    if (!salesOrder) throw new Error("Sales order not found");
    if (salesOrder.customerId !== inv.customerId) {
      throw new Error("Invoice customer does not match the sales order");
    }
  }

  inv.doIds.forEach((doId) => {
    const d = s.deliveryOrders.find((x) => x.id === doId);
    if (d) d.invoiceId = inv.id;
  });
}

/** Recompute a customer's outstanding A/R from invoices. */
function recomputeCustomerBalance(s: Store, customerId: string) {
  const c = s.customers.find((x) => x.id === customerId);
  if (!c) return;
  const owed = s.invoices
    .filter((i) => i.customerId === customerId && i.status !== "cancelled" && i.status !== "draft")
    .reduce((sum, i) => {
      const bal = i.total - i.amountPaid;
      return sum + (i.type === "credit_note" ? -bal : bal);
    }, 0);
  c.balance = Math.round(owed * 100) / 100;
  c.updatedAt = new Date().toISOString();
}

const invoices: DataAdapter["invoices"] = {
  ...invBase,
  async nextNumber() {
    return tx((s) => `INV-${padNumber(s.counters.inv + 1, 5)}`);
  },
  async listPage(options) {
    return mockInvoiceListPage(options);
  },
  async create(input) {
    return tx((s) => {
      s.counters.inv += 1;
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const item: Invoice = {
        ...(input as Omit<Invoice, "id" | "createdAt" | "updatedAt" | "invoiceNumber">),
        id,
        invoiceNumber: `INV-${padNumber(s.counters.inv, 5)}`,
        type: (input as Record<string, unknown>).type === "credit_note" ? "credit_note" : "invoice",
        amountPaid: 0,
        createdAt: now,
        updatedAt: now,
      } as Invoice;
      const actor = s.session ? s.users.find((user) => user.uid === s.session!.uid) : null;
      if (item.type === "credit_note") {
        if (actor?.role === "sales" && item.status !== "draft") item.status = "draft";
        item.approvalStatus = item.status === "draft" ? "pending" : "approved";
        if (item.status !== "draft") {
          item.approvedBy = actor?.uid ?? "system";
          item.approvedAt = now;
        }
      }
      s.invoices.push(item);
      if (countsTowardSOInvoice(item)) {
        validateAndLinkInvoiceDOs(s, item);
        updateSOProgress(s, item.salesOrderId, item.items, "invoicedQty");
      }

      // Handle stock reversal for credit notes (goods returned)
      if (item.type === "credit_note" && item.status !== "draft") {
        for (const it of item.items) {
          applyStockChange(s, {
            productId: it.productId,
            qty: it.quantity, // +quantity because goods are returning to stock
            kind: "adjustment_in",
            sourceType: "adjustment", // Use adjustment for now or add a new kind
            sourceId: item.id,
            sourceNumber: item.invoiceNumber,
            reason: `Return on Credit Note ${item.invoiceNumber}`,
            recordedBy: "system",
          });
        }
      }

      recomputeInvoice(s, id);
      recomputeCustomerBalance(s, item.customerId);
      return item;
    });
  },
  async update(id, patch) {
    return tx((s) => {
      const idx = s.invoices.findIndex((x) => x.id === id);
      const before = s.invoices[idx];
      const after = { ...before, ...patch, updatedAt: new Date().toISOString() };
      const actor = s.session ? s.users.find((user) => user.uid === s.session!.uid) : null;
      const isActivatingCredit =
        before.type === "credit_note" &&
        before.status === "draft" &&
        patch.status !== undefined &&
        patch.status !== "draft" &&
        patch.status !== "cancelled";
      if (isActivatingCredit && actor?.role === "sales") {
        throw new Error("Manager approval is required to activate a credit note");
      }
      if (isActivatingCredit) {
        after.approvalStatus = "approved";
        after.approvedBy = actor?.uid ?? "system";
        after.approvedAt = new Date().toISOString();
      }
      s.invoices[idx] = after;

      const beforeCounts = countsTowardSOInvoice(before);
      const afterCounts = countsTowardSOInvoice(after);
      const itemsChanged = JSON.stringify(before.items) !== JSON.stringify(after.items);
      const doIdsChanged = JSON.stringify(before.doIds) !== JSON.stringify(after.doIds);
      if (beforeCounts && afterCounts && (itemsChanged || doIdsChanged)) {
        throw new Error("Issued invoice lines and delivery-order links cannot be edited. Cancel the invoice and create a replacement.");
      }
      if (!beforeCounts && afterCounts) {
        validateAndLinkInvoiceDOs(s, after);
        updateSOProgress(s, after.salesOrderId, after.items, "invoicedQty");
      }
      if (beforeCounts && !afterCounts) {
        updateSOProgress(s, before.salesOrderId, before.items.map((it) => ({ ...it, quantity: -it.quantity })), "invoicedQty");
        before.doIds.forEach((doId) => {
          const d = s.deliveryOrders.find((x) => x.id === doId);
          if (d && d.invoiceId === before.id) d.invoiceId = undefined;
        });
      }

      // Handle stock reversal for credit notes if transitioning from draft to sent/paid
      const isBecomingActive = before.status === "draft" && (after.status === "sent" || after.status === "paid" || after.status === "partial");
      if (after.type === "credit_note" && isBecomingActive) {
        for (const it of after.items) {
          applyStockChange(s, {
            productId: it.productId,
            qty: it.quantity, // +quantity because goods are returning to stock
            kind: "adjustment_in",
            sourceType: "adjustment", // Use adjustment for now or add a new kind
            sourceId: after.id,
            sourceNumber: after.invoiceNumber,
            reason: `Return on Credit Note ${after.invoiceNumber}`,
            recordedBy: "system",
          });
        }
      }

      const updated = recomputeInvoice(s, id)!;
      recomputeCustomerBalance(s, updated.customerId);
      return updated;
    });
  },
  async remove(id) {
    tx((s) => {
      const inv = s.invoices.find((x) => x.id === id);
      if (!inv) return;
      // Unlink DOs
      inv.doIds.forEach((doId) => {
        const d = s.deliveryOrders.find((x) => x.id === doId);
        if (d && d.invoiceId === id) d.invoiceId = undefined;
      });
      // Drop related payments
      s.payments = s.payments.filter((p) => p.invoiceId !== id);
      s.invoices = s.invoices.filter((x) => x.id !== id);
      recomputeCustomerBalance(s, inv.customerId);
    });
  },
  async recordPayment(invoiceId, paymentInput) {
    return tx((s) => {
      const inv = s.invoices.find((x) => x.id === invoiceId);
      if (!inv) throw new Error("Invoice not found");
      if (inv.status === "cancelled") throw new Error("Invoice is cancelled");
      const remaining = inv.total - inv.amountPaid;
      if (paymentInput.amount > remaining + 0.01) {
        throw new Error(
          `Payment ($${paymentInput.amount.toFixed(2)}) exceeds outstanding balance ($${remaining.toFixed(2)})`,
        );
      }
      const now = new Date().toISOString();
      const payment: Payment = {
        id: crypto.randomUUID(),
        invoiceId,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        amount: paymentInput.amount,
        method: paymentInput.method,
        reference: paymentInput.reference,
        paidAt: paymentInput.paidAt,
        recordedBy: paymentInput.recordedBy,
        notes: paymentInput.notes,
        createdAt: now,
      };
      s.payments.push(payment);
      const updated = recomputeInvoice(s, invoiceId)!;
      recomputeCustomerBalance(s, inv.customerId);
      return { invoice: updated, payment };
    });
  },
  async payments(invoiceId) {
    return load()
      .payments.filter((p) => p.invoiceId === invoiceId)
      .sort((a, b) => +new Date(b.paidAt) - +new Date(a.paidAt));
  },
};

const payments: DataAdapter["payments"] = {
  async list() {
    return load().payments.slice().sort((a, b) => +new Date(b.paidAt) - +new Date(a.paidAt));
  },
  async byCustomer(customerId) {
    return load()
      .payments.filter((p) => p.customerId === customerId)
      .sort((a, b) => +new Date(b.paidAt) - +new Date(a.paidAt));
  },
};

const supplierPayments: DataAdapter["supplierPayments"] = {
  async list() {
    return load().supplierPayments.slice().sort((a, b) => +new Date(b.paidAt) - +new Date(a.paidAt));
  },
  async bySupplier(supplierId) {
    return load()
      .supplierPayments.filter((p) => p.supplierId === supplierId)
      .sort((a, b) => +new Date(b.paidAt) - +new Date(a.paidAt));
  },
};

const activityLog: DataAdapter["activityLog"] = {
  async list(filter) {
    const all = load().activityLog.slice().sort((a, b) => +new Date(b.at) - +new Date(a.at));
    let result = all;
    if (filter?.actorUid) result = result.filter((e) => e.actorUid === filter.actorUid);
    if (filter?.entityType) result = result.filter((e) => e.entityType === filter.entityType);
    if (filter?.limit) result = result.slice(0, filter.limit);
    return result;
  },
  async byEntity(entityType, entityId) {
    return load()
      .activityLog.filter((e) => e.entityType === entityType && e.entityId === entityId)
      .sort((a, b) => +new Date(b.at) - +new Date(a.at));
  },
  async log(entry) {
    return tx((s) => {
      const item: ActivityLog = {
        ...entry,
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
      };
      s.activityLog.push(item);
      // Cap at 5000 entries in mock — prevents localStorage from bloating
      if (s.activityLog.length > 5000) {
        s.activityLog = s.activityLog.slice(-5000);
      }
      return item;
    });
  },
};

const users: DataAdapter["users"] = {
  async list() {
    return load().users.slice().sort((a, b) => a.displayName.localeCompare(b.displayName));
  },
  async get(uid) {
    return load().users.find((u) => u.uid === uid) ?? null;
  },
  async invite(input) {
    return tx((s) => {
      if (s.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
        throw new Error("A user with this email already exists");
      }
      const user: User = {
        uid: crypto.randomUUID(),
        email: input.email,
        displayName: input.displayName,
        role: input.role,
        active: true,
        createdAt: new Date().toISOString(),
      };
      s.users.push(user);
      return user;
    });
  },
  async update(uid, patch) {
    return tx((s) => {
      const idx = s.users.findIndex((u) => u.uid === uid);
      if (idx === -1) throw new Error("User not found");
      s.users[idx] = { ...s.users[idx], ...patch };
      return s.users[idx];
    });
  },
};

const stockMovements: DataAdapter["stockMovements"] = {
  async list() {
    return load().stockMovements.slice().sort((a, b) => +new Date(b.at) - +new Date(a.at));
  },
  async byProduct(productId) {
    return load()
      .stockMovements.filter((m) => m.productId === productId)
      .sort((a, b) => +new Date(b.at) - +new Date(a.at));
  },
  async adjust(productId, qty, reason, recordedBy) {
    return tx((s) => {
      const actor = s.session ? s.users.find((user) => user.uid === s.session!.uid) : null;
      if (!actor || (actor.role !== "admin" && actor.role !== "manager")) {
        throw new Error("Manager approval is required for stock adjustments");
      }
      const movement = applyStockChange(s, {
        productId,
        qty,
        kind: qty >= 0 ? "adjustment_in" : "adjustment_out",
        sourceType: "adjustment",
        reason,
        recordedBy,
      });
      if (!movement) throw new Error("Product not found");
      const product = s.products.find((p) => p.id === productId)!;
      return { product, movement };
    });
  },
};

// ─── Company Settings ──────────────────────────────────────────────────────
const settings: DataAdapter["settings"] = {
  async get() {
    return load().companySettings;
  },
  async update(patch) {
    return tx((s) => {
      s.companySettings = { ...s.companySettings, ...patch };
      return s.companySettings;
    });
  },
};

export const mockAdapter: DataAdapter = {
  async signIn(email) {
    const u = load().users.find((x) => x.email.toLowerCase() === email.toLowerCase());
    if (!u) throw new Error("Invalid credentials");
    if (!u.active) throw new Error("This account has been deactivated");
    tx((s) => {
      s.session = { uid: u.uid };
    });
    await activityLog.log({
      actorUid: u.uid,
      actorName: u.displayName,
      action: "auth.login",
      entityType: "user",
      entityId: u.uid,
      entityLabel: u.email,
      summary: `${u.displayName} signed in`,
    });
    return u;
  },
  async signOut() {
    const current = load();
    const u = current.session ? current.users.find((x) => x.uid === current.session!.uid) : null;
    if (u) {
      await activityLog.log({
        actorUid: u.uid,
        actorName: u.displayName,
        action: "auth.logout",
        entityType: "user",
        entityId: u.uid,
        entityLabel: u.email,
        summary: `${u.displayName} signed out`,
      });
    }
    tx((s) => {
      s.session = null;
    });
  },
  async currentUser() {
    const s = load();
    if (!s.session) return null;
    const user = s.users.find((u) => u.uid === s.session!.uid) ?? null;
    if (!user?.active) {
      tx((store) => {
        store.session = null;
      });
      return null;
    }
    return user;
  },
  async requestPasswordReset(email) {
    // Mock: just verify the user exists. In Firebase this triggers an actual email.
    const u = load().users.find((x) => x.email.toLowerCase() === email.toLowerCase());
    if (!u) throw new Error("No account found for this email address");
    // Log it for the audit trail
    await activityLog.log({
      actorUid: u.uid,
      actorName: u.displayName,
      action: "auth.password_reset_requested",
      entityType: "user",
      entityId: u.uid,
      entityLabel: u.email,
      summary: `Password reset requested for ${u.email}`,
    });
  },
  verification: {
    async get(id) {
      const s = load();
      const salesOrder = s.salesOrders.find((item) => item.id === id);
      if (salesOrder) return { kind: "so", doc: salesOrder };
      const invoice = s.invoices.find((item) => item.id === id);
      if (invoice) return { kind: "invoice", doc: invoice };
      const po = s.purchaseOrders.find((item) => item.id === id);
      if (po) return { kind: "po", doc: po };
      const deliveryOrder = s.deliveryOrders.find((item) => item.id === id);
      if (deliveryOrder) return { kind: "do", doc: deliveryOrder };
      return null;
    },
  },
  settings,
  customers,
  suppliers,
  products,
  salesOrders,
  deliveryOrders,
  purchaseOrders,
  invoices,
  payments,
  supplierPayments,
  stockMovements,
  poAllocations,
  activityLog,
  users,
};

