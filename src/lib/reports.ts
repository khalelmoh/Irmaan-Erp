/**
 * Pure aggregation helpers used by every report page.
 * Kept side-effect free so they're trivial to unit-test later.
 */
import type { Invoice, Payment, PurchaseOrder, SupplierPayment, Product, Customer, Supplier, DeliveryOrder, SalesOrder } from "@/types";
import { outstanding, effectiveStatus } from "./invoice";
import { poOutstanding } from "./purchase-order";

// ─── Date helpers ─────────────────────────────────────────────────────────
export const startOfDay = (d: Date) => {
  const x = new Date(d); x.setHours(0,0,0,0); return x;
};
export const endOfDay = (d: Date) => {
  const x = new Date(d); x.setHours(23,59,59,999); return x;
};
export const addDays = (d: Date, n: number) => {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
};
export const startOfMonth = (d: Date) => {
  const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x;
};

export const monthKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
export const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
};

export type DateRange = { from: string; to: string };

export const inRange = (iso: string, r: DateRange) => {
  const t = new Date(iso).getTime();
  return t >= startOfDay(new Date(r.from)).getTime() && t <= endOfDay(new Date(r.to)).getTime();
};

export const defaultRange = (): DateRange => {
  const now = new Date();
  const from = startOfMonth(addDays(now, -90));
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
};

export const presetRanges = () => {
  const now = new Date();
  return [
    { label: "Last 7 days", from: addDays(now, -7), to: now },
    { label: "Last 30 days", from: addDays(now, -30), to: now },
    { label: "This month", from: startOfMonth(now), to: now },
    { label: "Last 90 days", from: addDays(now, -90), to: now },
    { label: "Year to date", from: new Date(now.getFullYear(), 0, 1), to: now },
  ].map((r) => ({
    label: r.label,
    from: r.from.toISOString().slice(0, 10),
    to: r.to.toISOString().slice(0, 10),
  }));
};

// ─── Sales ────────────────────────────────────────────────────────────────
export function salesSummary(invoices: Invoice[], payments: Payment[], r: DateRange) {
  const inv = invoices.filter((i) => inRange(i.issueDate, r) && i.status !== "cancelled");
  const regularInv = inv.filter((i) => i.type !== "credit_note");
  const creditNotes = inv.filter((i) => i.type === "credit_note");
  const billed = regularInv.reduce((s, i) => s + i.total, 0) - creditNotes.reduce((s, i) => s + i.total, 0);
  const pay = payments.filter((p) => inRange(p.paidAt, r));
  const collected = pay.reduce((s, p) => s + p.amount, 0);
  return {
    billed: round2(billed),
    collected: round2(collected),
    invoiceCount: regularInv.length,
    avgInvoice: regularInv.length ? round2(billed / regularInv.length) : 0,
  };
}

/** Monthly billed + collected trend. */
export function salesByMonth(invoices: Invoice[], payments: Payment[], r: DateRange) {
  const buckets = monthBuckets(r);
  invoices.forEach((i) => {
    if (i.status === "cancelled" || !inRange(i.issueDate, r)) return;
    const k = monthKey(i.issueDate);
    if (buckets[k]) {
      // Credit notes reduce billed; regular invoices add to it
      buckets[k].billed += i.type === "credit_note" ? -i.total : i.total;
    }
  });
  payments.forEach((p) => {
    if (!inRange(p.paidAt, r)) return;
    const k = monthKey(p.paidAt);
    if (buckets[k]) buckets[k].collected += p.amount;
  });
  return Object.entries(buckets)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => ({ month: monthLabel(k), billed: round2(v.billed), collected: round2(v.collected) }));
}

export function topCustomers(invoices: Invoice[], customers: Customer[], r: DateRange, limit = 10) {
  const map: Record<string, { customerId: string; name: string; billed: number; outstanding: number; count: number }> = {};
  invoices.forEach((i) => {
    if (i.status === "cancelled" || !inRange(i.issueDate, r)) return;
    const key = i.customerId;
    if (!map[key]) {
      const c = customers.find((x) => x.id === key);
      map[key] = { customerId: key, name: c?.name ?? i.customerSnapshot.name, billed: 0, outstanding: 0, count: 0 };
    }
    const sign = i.type === "credit_note" ? -1 : 1;
    map[key].billed += sign * i.total;
    map[key].outstanding += sign * outstanding(i);
    map[key].count += i.type === "credit_note" ? 0 : 1;
  });
  return Object.values(map)
    .map((x) => ({ ...x, billed: round2(x.billed), outstanding: round2(x.outstanding) }))
    .sort((a, b) => b.billed - a.billed)
    .slice(0, limit);
}

// ─── Receivables (A/R) ───────────────────────────────────────────────────
export interface AgingBucket {
  label: string;
  invoices: Invoice[];
  total: number;
}

/** Aging buckets based on dueDate. Negative days = not yet due. */
export function arAging(invoices: Invoice[]): AgingBucket[] {
  const open = invoices.filter((i) => {
    // Credit notes are liabilities, not receivables — exclude them
    if (i.type === "credit_note") return false;
    const st = effectiveStatus(i);
    if (st === "cancelled" || st === "draft" || st === "paid") return false;
    // Safety: skip if already fully paid (stale status edge case)
    return outstanding(i) > 0.001;
  });
  const now = Date.now();
  const buckets: AgingBucket[] = [
    { label: "Not yet due", invoices: [], total: 0 },
    { label: "1-30 days", invoices: [], total: 0 },
    { label: "31-60 days", invoices: [], total: 0 },
    { label: "61-90 days", invoices: [], total: 0 },
    { label: "90+ days", invoices: [], total: 0 },
  ];
  open.forEach((i) => {
    const daysOverdue = Math.floor((now - new Date(i.dueDate).getTime()) / 86400000);
    const out = outstanding(i);
    let idx = 0;
    if (daysOverdue <= 0) idx = 0;
    else if (daysOverdue <= 30) idx = 1;
    else if (daysOverdue <= 60) idx = 2;
    else if (daysOverdue <= 90) idx = 3;
    else idx = 4;
    buckets[idx].invoices.push(i);
    buckets[idx].total += out;
  });
  buckets.forEach((b) => (b.total = round2(b.total)));
  return buckets;
}

// ─── Purchases ───────────────────────────────────────────────────────────
export function purchaseSummary(pos: PurchaseOrder[], supplierPays: SupplierPayment[], r: DateRange) {
  // Exclude both cancelled and draft POs — drafts aren't committed spend
  const filt = pos.filter((p) => inRange(p.orderDate, r) && p.status !== "cancelled" && p.status !== "draft");
  const ordered = filt.reduce((s, p) => s + p.total, 0);
  const paid = supplierPays.filter((p) => inRange(p.paidAt, r)).reduce((s, p) => s + p.amount, 0);
  return {
    ordered: round2(ordered),
    paid: round2(paid),
    poCount: filt.length,
    avgPO: filt.length ? round2(ordered / filt.length) : 0,
  };
}

export function purchasesByMonth(pos: PurchaseOrder[], supplierPays: SupplierPayment[], r: DateRange) {
  const buckets = monthBuckets(r);
  pos.forEach((p) => {
    if (p.status === "cancelled" || !inRange(p.orderDate, r)) return;
    const k = monthKey(p.orderDate);
    if (buckets[k]) buckets[k].billed += p.total;
  });
  supplierPays.forEach((p) => {
    if (!inRange(p.paidAt, r)) return;
    const k = monthKey(p.paidAt);
    if (buckets[k]) buckets[k].collected += p.amount;
  });
  return Object.entries(buckets)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => ({ month: monthLabel(k), ordered: round2(v.billed), paid: round2(v.collected) }));
}

export function topSuppliers(pos: PurchaseOrder[], suppliers: Supplier[], r: DateRange, limit = 10) {
  const map: Record<string, { supplierId: string; name: string; ordered: number; outstanding: number; count: number }> = {};
  pos.forEach((p) => {
    if (p.status === "cancelled" || !inRange(p.orderDate, r)) return;
    const key = p.supplierId;
    if (!map[key]) {
      const s = suppliers.find((x) => x.id === key);
      map[key] = { supplierId: key, name: s?.name ?? p.supplierSnapshot.name, ordered: 0, outstanding: 0, count: 0 };
    }
    map[key].ordered += p.total;
    map[key].outstanding += poOutstanding(p);
    map[key].count += 1;
  });
  return Object.values(map)
    .map((x) => ({ ...x, ordered: round2(x.ordered), outstanding: round2(x.outstanding) }))
    .sort((a, b) => b.ordered - a.ordered)
    .slice(0, limit);
}

// ─── Payables (A/P) ──────────────────────────────────────────────────────
export interface APBucket {
  label: string;
  pos: PurchaseOrder[];
  total: number;
}

export function apAging(pos: PurchaseOrder[]): APBucket[] {
  // No "due date" on PO yet — use orderDate + 30 days as proxy, or expectedDelivery if set
  const open = pos.filter((p) => p.status !== "cancelled" && p.status !== "draft" && poOutstanding(p) > 0);
  const now = Date.now();
  const buckets: APBucket[] = [
    { label: "Current (<30d)", pos: [], total: 0 },
    { label: "31-60 days", pos: [], total: 0 },
    { label: "61-90 days", pos: [], total: 0 },
    { label: "90+ days", pos: [], total: 0 },
  ];
  open.forEach((p) => {
    const due = p.expectedDelivery ? new Date(p.expectedDelivery).getTime() : new Date(p.orderDate).getTime() + 30 * 86400000;
    const daysOverdue = Math.max(0, Math.floor((now - due) / 86400000));
    const out = poOutstanding(p);
    let idx = 0;
    if (daysOverdue <= 30) idx = 0;
    else if (daysOverdue <= 60) idx = 1;
    else if (daysOverdue <= 90) idx = 2;
    else idx = 3;
    buckets[idx].pos.push(p);
    buckets[idx].total += out;
  });
  buckets.forEach((b) => (b.total = round2(b.total)));
  return buckets;
}

// ─── Inventory ───────────────────────────────────────────────────────────
export function inventoryValuation(products: Product[]) {
  return products.map((p) => {
    const costValue = round2(p.stock * (p.cost ?? 0));
    const retailValue = round2(p.stock * p.unitPrice);
    return {
      ...p,
      costValue,
      retailValue,
      potentialMargin: round2(retailValue - costValue),
    };
  });
}

export function inventoryTotals(products: Product[]) {
  const rows = inventoryValuation(products);
  return {
    skuCount: products.length,
    totalUnits: products.reduce((s, p) => s + p.stock, 0),
    totalCost: round2(rows.reduce((s, p) => s + p.costValue, 0)),
    totalRetail: round2(rows.reduce((s, p) => s + p.retailValue, 0)),
    potentialMargin: round2(rows.reduce((s, p) => s + p.potentialMargin, 0)),
    lowStock: products.filter((p) => p.reorderLevel != null && p.stock <= p.reorderLevel).length,
  };
}

// ─── Profitability ───────────────────────────────────────────────────────
/** Rough profit estimate from invoices: revenue (line price) - cost (product.cost × qty). */
export function profitByProduct(invoices: Invoice[], products: Product[], r: DateRange) {
  const map: Record<string, { productId: string; name: string; qty: number; revenue: number; cost: number }> = {};
  invoices.forEach((inv) => {
    if (inv.status === "cancelled" || !inRange(inv.issueDate, r)) return;
    // Credit notes represent returned goods — subtract from revenue and qty
    const sign = inv.type === "credit_note" ? -1 : 1;
    inv.items.forEach((it) => {
      if (!map[it.productId]) {
        const p = products.find((x) => x.id === it.productId);
        map[it.productId] = { productId: it.productId, name: it.name, qty: 0, revenue: 0, cost: (p?.cost ?? 0) };
      }
      map[it.productId].qty += sign * it.quantity;
      map[it.productId].revenue += sign * it.lineTotal;
    });
  });
  return Object.values(map)
    .map((x) => {
      const totalCost = round2(x.qty * x.cost);
      const profit = round2(x.revenue - totalCost);
      const marginPct = x.revenue > 0 ? round2((profit / x.revenue) * 100) : 0;
      return { ...x, revenue: round2(x.revenue), totalCost, profit, marginPct };
    })
    .sort((a, b) => b.profit - a.profit);
}

export function profitSummary(invoices: Invoice[], products: Product[], r: DateRange) {
  const rows = profitByProduct(invoices, products, r);
  const revenue = round2(rows.reduce((s, x) => s + x.revenue, 0));
  const cogs = round2(rows.reduce((s, x) => s + x.totalCost, 0));
  const profit = round2(revenue - cogs);
  const marginPct = revenue > 0 ? round2((profit / revenue) * 100) : 0;
  return { revenue, cogs, profit, marginPct };
}

// ─── Monthly operations snapshot ─────────────────────────────────────────
/** Range from 1st of the current month through today. */
export function thisMonthRange(): DateRange {
  const now = new Date();
  const from = startOfMonth(now);
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

export interface MonthlyOpsResult {
  bagsSold: number;
  doCount: number;
  poCount: number;
  bagsPurchased: number;
  revenueBilled: number;
  cashCollected: number;
  supplierSpend: number;
  newCustomers: number;
}

/** Aggregate operational KPIs for a given month range. */
export function monthlyOperations(
  deliveryOrders: DeliveryOrder[],
  purchaseOrders: PurchaseOrder[],
  invoices: Invoice[],
  payments: Payment[],
  supplierPayments: SupplierPayment[],
  customers: Customer[],
  r: DateRange,
): MonthlyOpsResult {
  // DOs this month (non-cancelled)
  const dosInRange = deliveryOrders.filter(
    (d) => d.status !== "cancelled" && inRange(d.orderDate, r),
  );
  const bagsSold = dosInRange.reduce(
    (s, d) => s + d.items.reduce((t, it) => t + it.quantity, 0),
    0,
  );

  // POs this month (non-cancelled, non-draft)
  const posInRange = purchaseOrders.filter(
    (p) => p.status !== "cancelled" && p.status !== "draft" && inRange(p.orderDate, r),
  );
  const bagsPurchased = posInRange.reduce(
    (s, p) => s + p.items.reduce((t, it) => t + it.quantity, 0),
    0,
  );

  // Invoices this month (non-cancelled)
  const invoicesInRange = invoices.filter(
    (i) => i.status !== "cancelled" && i.type !== "credit_note" && inRange(i.issueDate, r),
  );
  const creditNotesInRange = invoices.filter(
    (i) => i.status !== "cancelled" && i.type === "credit_note" && inRange(i.issueDate, r),
  );
  const revenueBilled =
    invoicesInRange.reduce((s, i) => s + i.total, 0) -
    creditNotesInRange.reduce((s, i) => s + i.total, 0);

  // Payments collected this month
  const cashCollected = payments
    .filter((p) => inRange(p.paidAt, r))
    .reduce((s, p) => s + p.amount, 0);

  // Supplier payments this month
  const supplierSpend = supplierPayments
    .filter((p) => inRange(p.paidAt, r))
    .reduce((s, p) => s + p.amount, 0);

  // New customers this month
  const newCustomers = customers.filter((c) => inRange(c.createdAt, r)).length;

  return {
    bagsSold: round2(bagsSold),
    doCount: dosInRange.length,
    poCount: posInRange.length,
    bagsPurchased: round2(bagsPurchased),
    revenueBilled: round2(revenueBilled),
    cashCollected: round2(cashCollected),
    supplierSpend: round2(supplierSpend),
    newCustomers,
  };
}

/** Compute the range for the month before the given "YYYY-MM" string. */
export function prevMonthRange(ym: string): DateRange {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  const prevYm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: lastDay.toISOString().slice(0, 10),
  };
}

/** Compute the percentage change between current and previous. */
export function computeDelta(current: number, previous: number): { pct: number; direction: "up" | "down" | "flat" } {
  if (previous === 0 && current === 0) return { pct: 0, direction: "flat" };
  if (previous === 0) return { pct: 100, direction: "up" };
  const pct = round2(((current - previous) / previous) * 100);
  return { pct: Math.abs(pct), direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
}

// ─── Top products by volume ──────────────────────────────────────────────
export function topProductsByVolume(
  deliveryOrders: DeliveryOrder[],
  r: DateRange,
  limit = 5,
) {
  const map: Record<string, { name: string; qty: number }> = {};
  deliveryOrders.forEach((d) => {
    if (d.status === "cancelled" || !inRange(d.orderDate, r)) return;
    d.items.forEach((it) => {
      if (!map[it.productId]) map[it.productId] = { name: it.name, qty: 0 };
      map[it.productId].qty += it.quantity;
    });
  });
  return Object.values(map)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit)
    .map((x) => ({ ...x, qty: round2(x.qty) }));
}

// ─── Sales Order Pipeline ────────────────────────────────────────────────
export function soPipelineSummary(salesOrders: SalesOrder[], r: DateRange) {
  const inR = salesOrders.filter((s) => s.status !== "cancelled" && inRange(s.orderDate, r));
  const total = inR.length;
  const pipelineValue = round2(inR.reduce((s, o) => s + o.total, 0));
  const confirmed = inR.filter((s) => s.status !== "quotation").length;
  const fullyDelivered = inR.filter((s) => s.status === "fully_delivered" || s.status === "invoiced").length;
  const conversionRate = total > 0 ? round2((confirmed / total) * 100) : 0;
  const fulfillmentRate = confirmed > 0 ? round2((fullyDelivered / confirmed) * 100) : 0;
  const avgValue = total > 0 ? round2(pipelineValue / total) : 0;
  return { total, pipelineValue, confirmed, fullyDelivered, conversionRate, fulfillmentRate, avgValue };
}

export function soStatusBreakdown(salesOrders: SalesOrder[], r: DateRange) {
  const statuses: Record<string, number> = {};
  salesOrders.forEach((s) => {
    if (s.status === "cancelled" || !inRange(s.orderDate, r)) return;
    statuses[s.status] = (statuses[s.status] || 0) + 1;
  });
  return Object.entries(statuses).map(([status, count]) => ({ name: status, value: count }));
}

export function soByMonth(salesOrders: SalesOrder[], r: DateRange) {
  const buckets = monthBuckets(r);
  salesOrders.forEach((s) => {
    if (s.status === "cancelled" || !inRange(s.orderDate, r)) return;
    const k = monthKey(s.orderDate);
    if (buckets[k]) buckets[k].billed += s.total;
  });
  return Object.entries(buckets)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => ({ month: monthLabel(k), value: round2(v.billed), count: 0 }));
}

// ─── Salesperson Performance ─────────────────────────────────────────────
export interface SalespersonRow {
  id: string;
  name: string;
  soCount: number;
  doCount: number;
  revenue: number;
  bagsSold: number;
  avgDeal: number;
}

export function salespersonPerformance(
  salesOrders: SalesOrder[],
  deliveryOrders: DeliveryOrder[],
  invoices: Invoice[],
  r: DateRange,
): SalespersonRow[] {
  const map: Record<string, SalespersonRow> = {};
  const ensure = (id: string, name: string) => {
    if (!map[id]) map[id] = { id, name, soCount: 0, doCount: 0, revenue: 0, bagsSold: 0, avgDeal: 0 };
  };

  salesOrders.forEach((s) => {
    if (s.status === "cancelled" || !inRange(s.orderDate, r)) return;
    ensure(s.salespersonId, s.salespersonName);
    map[s.salespersonId].soCount += 1;
  });

  deliveryOrders.forEach((d) => {
    if (d.status === "cancelled" || !inRange(d.orderDate, r)) return;
    ensure(d.salespersonId, d.salespersonName);
    map[d.salespersonId].doCount += 1;
    map[d.salespersonId].bagsSold += d.items.reduce((t, it) => t + it.quantity, 0);
  });

  invoices.forEach((inv) => {
    if (inv.status === "cancelled" || inv.type === "credit_note" || !inRange(inv.issueDate, r)) return;
    // Link via salesOrderId if available — otherwise skip (can't attribute)
    const so = salesOrders.find((s) => s.id === inv.salesOrderId);
    if (so) {
      ensure(so.salespersonId, so.salespersonName);
      map[so.salespersonId].revenue += inv.total;
    }
  });

  return Object.values(map)
    .map((x) => ({
      ...x,
      revenue: round2(x.revenue),
      bagsSold: round2(x.bagsSold),
      avgDeal: x.soCount > 0 ? round2(x.revenue / x.soCount) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

// ─── Delivery Performance ────────────────────────────────────────────────
export function deliverySummary(deliveryOrders: DeliveryOrder[], r: DateRange) {
  const inR = deliveryOrders.filter((d) => d.status !== "cancelled" && inRange(d.orderDate, r));
  const total = inR.length;
  const delivered = inR.filter((d) => d.status === "delivered").length;
  const deliveredRate = total > 0 ? round2((delivered / total) * 100) : 0;
  const bagsDelivered = round2(
    inR.filter((d) => d.status === "delivered").reduce(
      (s, d) => s + d.items.reduce((t, it) => t + it.quantity, 0), 0,
    ),
  );
  const totalBags = round2(
    inR.reduce((s, d) => s + d.items.reduce((t, it) => t + it.quantity, 0), 0),
  );
  return { total, delivered, deliveredRate, bagsDelivered, totalBags };
}

export function deliveriesByDestination(deliveryOrders: DeliveryOrder[], r: DateRange, limit = 8) {
  const map: Record<string, { destination: string; count: number; bags: number }> = {};
  deliveryOrders.forEach((d) => {
    if (d.status === "cancelled" || !inRange(d.orderDate, r)) return;
    const dest = d.loadingDetails?.destination || "Unknown";
    if (!map[dest]) map[dest] = { destination: dest, count: 0, bags: 0 };
    map[dest].count += 1;
    map[dest].bags += d.items.reduce((t, it) => t + it.quantity, 0);
  });
  return Object.values(map)
    .sort((a, b) => b.bags - a.bags)
    .slice(0, limit);
}

export function deliveriesByMonth(deliveryOrders: DeliveryOrder[], r: DateRange) {
  const buckets = monthBuckets(r);
  deliveryOrders.forEach((d) => {
    if (d.status === "cancelled" || !inRange(d.orderDate, r)) return;
    const k = monthKey(d.orderDate);
    if (buckets[k]) {
      buckets[k].billed += 1; // reuse billed as count
      buckets[k].collected += d.items.reduce((t, it) => t + it.quantity, 0); // reuse collected as bags
    }
  });
  return Object.entries(buckets)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => ({ month: monthLabel(k), deliveries: v.billed, bags: round2(v.collected) }));
}

// ─── Utilities ───────────────────────────────────────────────────────────
function monthBuckets(r: DateRange): Record<string, { billed: number; collected: number }> {
  const buckets: Record<string, { billed: number; collected: number }> = {};
  const start = startOfMonth(new Date(r.from));
  const end = startOfMonth(new Date(r.to));
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    const k = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
    buckets[k] = { billed: 0, collected: 0 };
    cur.setMonth(cur.getMonth() + 1);
  }
  return buckets;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
