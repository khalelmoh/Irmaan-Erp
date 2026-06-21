"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { dataAdapter } from "@/services";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { KpiTile } from "@/components/reports/KpiTile";
import { BarSeriesChart } from "@/components/reports/charts";
import {
  TrendingUp, Wallet, ShoppingBag, CreditCard, Boxes, Coins, ArrowRight,
  Package, Truck, DollarSign, ShoppingCart, UserPlus, CalendarDays, Scale,
  ChevronLeft, ChevronRight, Activity, Users, MapPin, Pickaxe, Printer
} from "lucide-react";
import { currency } from "@/lib/utils";
import {
  defaultRange, salesSummary, purchaseSummary, inventoryTotals, profitSummary, arAging, apAging,
  monthlyOperations, prevMonthRange, computeDelta, topProductsByVolume,
} from "@/lib/reports";
import type { DateRange } from "@/lib/reports";
import type { Invoice, Payment, PurchaseOrder, SupplierPayment, Product, DeliveryOrder, Customer } from "@/types";

const REPORTS = [
  {
    href: "/reports/sales",
    title: "Sales Report",
    description: "Billing, collections, top customers, monthly revenue trend.",
    icon: TrendingUp,
    tone: "text-brand-700 bg-brand-50",
  },
  {
    href: "/reports/receivables",
    title: "Accounts Receivable (Aging)",
    description: "Outstanding invoices bucketed by overdue days.",
    icon: Wallet,
    tone: "text-amber-700 bg-amber-50",
  },
  {
    href: "/reports/sales-orders",
    title: "Sales Order Pipeline",
    description: "Conversion rates, open order value, and fulfillment status.",
    icon: Activity,
    tone: "text-blue-700 bg-blue-50",
  },
  {
    href: "/reports/purchases",
    title: "Purchases Report",
    description: "Supplier spend, payment activity, monthly trend.",
    icon: ShoppingBag,
    tone: "text-indigo-700 bg-indigo-50",
  },
  {
    href: "/reports/payables",
    title: "Accounts Payable (Aging)",
    description: "What you owe suppliers, bucketed by age.",
    icon: CreditCard,
    tone: "text-red-700 bg-red-50",
  },
  {
    href: "/reports/inventory",
    title: "Inventory Report",
    description: "Stock valuation at cost and retail, low-stock alerts.",
    icon: Boxes,
    tone: "text-emerald-700 bg-emerald-50",
  },
  {
    href: "/reports/profit",
    title: "Profitability Report",
    description: "Revenue vs cost of goods sold, gross margin by product.",
    icon: Coins,
    tone: "text-sky-700 bg-sky-50",
  },
  {
    href: "/reports/salesperson",
    title: "Salesperson Performance",
    description: "Leaderboard of revenue, orders, and average deal size.",
    icon: Users,
    tone: "text-purple-700 bg-purple-50",
  },
  {
    href: "/reports/delivery",
    title: "Delivery Performance",
    description: "Delivery times, destination breakdown, and fulfillment.",
    icon: MapPin,
    tone: "text-teal-700 bg-teal-50",
  },
  {
    href: "/reports/reconciliation",
    title: "Ledger Reconciliation",
    description: "Detect A/R, A/P, stock, and FIFO allocation inconsistencies.",
    icon: Scale,
    tone: "text-rose-700 bg-rose-50",
  },
];

/** Build a DateRange for a given "YYYY-MM" string (1st of month → last day of month, capped at today). */
function rangeForMonth(ym: string): DateRange {
  const [y, m] = ym.split("-").map(Number);
  const from = new Date(y, m - 1, 1);
  // Last day of that month
  const lastDay = new Date(y, m, 0);
  const now = new Date();
  // Cap 'to' at today if the selected month is the current month or future
  const to = lastDay > now ? now : lastDay;
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

/** Format "YYYY-MM" to a readable label like "June 2026" */
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Get "YYYY-MM" for today */
function currentYM(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function ReportsHubPage() {
  const [data, setData] = useState<{
    invoices: Invoice[]; payments: Payment[]; pos: PurchaseOrder[];
    supplierPays: SupplierPayment[]; products: Product[];
    deliveryOrders: DeliveryOrder[]; customers: Customer[];
  } | null>(null);

  useEffect(() => {
    Promise.all([
      dataAdapter.invoices.list(),
      dataAdapter.payments.list(),
      dataAdapter.purchaseOrders.list(),
      dataAdapter.supplierPayments.list(),
      dataAdapter.products.list(),
      dataAdapter.deliveryOrders.list(),
      dataAdapter.customers.list(),
    ]).then(([invoices, payments, pos, supplierPays, products, deliveryOrders, customers]) =>
      setData({ invoices, payments, pos, supplierPays, products, deliveryOrders, customers }),
    );
  }, []);

  // ── Month picker state ──
  const [selectedMonth, setSelectedMonth] = useState(currentYM);
  const monthRange = useMemo(() => rangeForMonth(selectedMonth), [selectedMonth]);
  const isCurrentMonth = selectedMonth === currentYM();

  const goToPrevMonth = useCallback(() => {
    setSelectedMonth((prev) => {
      const [y, m] = prev.split("-").map(Number);
      const d = new Date(y, m - 2, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setSelectedMonth((prev) => {
      const [y, m] = prev.split("-").map(Number);
      const d = new Date(y, m, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      // Don't go past the current month
      return ym > currentYM() ? prev : ym;
    });
  }, []);

  const monthlyOps = useMemo(() => {
    if (!data) return null;
    const current = monthlyOperations(
      data.deliveryOrders, data.pos, data.invoices,
      data.payments, data.supplierPays, data.customers,
      monthRange,
    );
    const prevRange = prevMonthRange(selectedMonth);
    const prev = monthlyOperations(
      data.deliveryOrders, data.pos, data.invoices,
      data.payments, data.supplierPays, data.customers,
      prevRange,
    );

    const topProducts = topProductsByVolume(data.deliveryOrders, monthRange, 5);

    return {
      current,
      deltas: {
        bagsSold: computeDelta(current.bagsSold, prev.bagsSold),
        doCount: computeDelta(current.doCount, prev.doCount),
        poCount: computeDelta(current.poCount, prev.poCount),
        bagsPurchased: computeDelta(current.bagsPurchased, prev.bagsPurchased),
        revenueBilled: computeDelta(current.revenueBilled, prev.revenueBilled),
        cashCollected: computeDelta(current.cashCollected, prev.cashCollected),
        supplierSpend: computeDelta(current.supplierSpend, prev.supplierSpend),
        newCustomers: computeDelta(current.newCustomers, prev.newCustomers),
        netCashFlow: computeDelta(current.cashCollected - current.supplierSpend, prev.cashCollected - prev.supplierSpend),
      },
      topProducts,
    };
  }, [data, monthRange, selectedMonth]);

  const headlines = useMemo(() => {
    if (!data) return null;
    const r = defaultRange();
    const sales = salesSummary(data.invoices, data.payments, r);
    const purch = purchaseSummary(data.pos, data.supplierPays, r);
    const inv = inventoryTotals(data.products);
    const profit = profitSummary(data.invoices, data.products, r);
    const ar = arAging(data.invoices).reduce((s, b) => s + b.total, 0);
    const ap = apAging(data.pos).reduce((s, b) => s + b.total, 0);
    return { sales, purch, inv, profit, ar, ap };
  }, [data]);

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        description="Insights derived from the data you collect across the system. All reports support date filtering, CSV export, and print."
        actions={
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 h-9 px-4 rounded-lg bg-white border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm print:hidden"
          >
            <Printer className="h-4 w-4 text-slate-500" />
            Print / PDF
          </button>
        }
      />

      {!data ? (
        <ReportsSkeleton />
      ) : (
        <>
          {/* ── Monthly Operations Snapshot ────────────────────────────────── */}
          {monthlyOps && (
            <div className="mb-8">
              {/* Section header with month picker */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-brand-600 to-indigo-600 flex items-center justify-center shadow-sm">
                    <CalendarDays className="h-4.5 w-4.5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
                      {monthLabel(selectedMonth)}
                      <span className="text-slate-400 font-normal"> · </span>
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-indigo-600 font-semibold">
                        Operations Snapshot
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isCurrentMonth ? "Real-time metrics for the current month" : `Historical data for ${monthLabel(selectedMonth)}`}
                    </p>
                  </div>
                </div>

                {/* Month navigation */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={goToPrevMonth}
                    className="h-8 w-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 hover:border-slate-300 transition-colors"
                    title="Previous month"
                  >
                    <ChevronLeft className="h-4 w-4 text-slate-600" />
                  </button>
                  <input
                    type="month"
                    value={selectedMonth}
                    max={currentYM()}
                    onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
                    className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-colors cursor-pointer"
                  />
                  <button
                    onClick={goToNextMonth}
                    disabled={isCurrentMonth}
                    className="h-8 w-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-slate-200"
                    title="Next month"
                  >
                    <ChevronRight className="h-4 w-4 text-slate-600" />
                  </button>
                  {!isCurrentMonth && (
                    <button
                      onClick={() => setSelectedMonth(currentYM())}
                      className="ml-1 h-8 px-3 rounded-lg border border-brand-200 bg-brand-50 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
                    >
                      This month
                    </button>
                  )}
                </div>
              </div>

              {/* Row 1 — Operations Volume */}
              <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50/80 to-white p-4 mb-3">
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-medium mb-3 flex items-center gap-1.5">
                  <Package className="h-3 w-3" /> Operations Volume
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiTile
                    label="Bags Sold"
                    value={monthlyOps.current.bagsSold.toLocaleString()}
                    icon={Package}
                    tone="success"
                    hint={`via ${monthlyOps.current.doCount} delivery order${monthlyOps.current.doCount !== 1 ? "s" : ""}`}
                    delta={monthlyOps.deltas.bagsSold}
                  />
                  <KpiTile
                    label="Delivery Orders"
                    value={monthlyOps.current.doCount}
                    icon={Truck}
                    tone="info"
                    delta={monthlyOps.deltas.doCount}
                  />
                  <KpiTile
                    label="Purchase Orders"
                    value={monthlyOps.current.poCount}
                    icon={ShoppingCart}
                    tone="warning"
                    delta={monthlyOps.deltas.poCount}
                  />
                  <KpiTile
                    label="Bags Purchased"
                    value={monthlyOps.current.bagsPurchased.toLocaleString()}
                    icon={Boxes}
                    tone="default"
                    hint={`across ${monthlyOps.current.poCount} P.O${monthlyOps.current.poCount !== 1 ? "s" : ""}`}
                    delta={monthlyOps.deltas.bagsPurchased}
                  />
                </div>
              </div>

              {/* Row 2 — Financial Pulse */}
              <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50/80 to-white p-4 mb-3">
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-medium mb-3 flex items-center gap-1.5">
                  <DollarSign className="h-3 w-3" /> Financial Pulse
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  <KpiTile
                    label="Net Cash Flow"
                    value={currency(monthlyOps.current.cashCollected - monthlyOps.current.supplierSpend)}
                    icon={Coins}
                    tone={monthlyOps.current.cashCollected - monthlyOps.current.supplierSpend >= 0 ? "success" : "danger"}
                    delta={monthlyOps.deltas.netCashFlow}
                  />
                  <KpiTile
                    label="Revenue Billed"
                    value={currency(monthlyOps.current.revenueBilled)}
                    icon={DollarSign}
                    tone="default"
                    delta={monthlyOps.deltas.revenueBilled}
                  />
                  <KpiTile
                    label="Cash Collected"
                    value={currency(monthlyOps.current.cashCollected)}
                    icon={Wallet}
                    tone="success"
                    delta={monthlyOps.deltas.cashCollected}
                  />
                  <KpiTile
                    label="Supplier Spend"
                    value={currency(monthlyOps.current.supplierSpend)}
                    icon={CreditCard}
                    tone="danger"
                    delta={{ ...monthlyOps.deltas.supplierSpend, invertColor: true }} // Up is bad for spend
                  />
                  <KpiTile
                    label="New Customers"
                    value={monthlyOps.current.newCustomers}
                    icon={UserPlus}
                    tone="info"
                    delta={monthlyOps.deltas.newCustomers}
                  />
                </div>
              </div>


            </div>
          )}

          {/* ── 90-day Financial Headlines ────────────────────────────────── */}
          {headlines && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-1 w-1 rounded-full bg-slate-300" />
                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">Last 90 Days</span>
                <div className="flex-1 h-px bg-slate-100" />
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <Snapshot label="Revenue (90d)" value={currency(headlines.sales.billed)} hint={`${headlines.sales.invoiceCount} invoices`} />
                <Snapshot label="Collected (90d)" value={currency(headlines.sales.collected)} />
                <Snapshot label="Outstanding A/R" value={currency(headlines.ar)} tone="amber" />
                <Snapshot label="Outstanding A/P" value={currency(headlines.ap)} tone="red" />
              </div>
            </>
          )}

          {/* ── Report Link Cards ─────────────────────────────────────────── */}
          <div className="flex items-center gap-2 mb-3">
            <div className="h-1 w-1 rounded-full bg-slate-300" />
            <span className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">Detailed Reports</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {REPORTS.map((r) => {
              const Icon = r.icon;
              return (
                <Link key={r.href} href={r.href}>
                  <Card className="hover:border-brand-300 hover:shadow-md transition-all cursor-pointer h-full">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${r.tone}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <ArrowRight className="h-4 w-4 text-slate-300" />
                      </div>
                      <div className="font-semibold text-slate-900">{r.title}</div>
                      <div className="text-sm text-slate-500 mt-1">{r.description}</div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function Snapshot({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "amber" | "red" }) {
  const valueColor = tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-700" : "text-slate-900";
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
        <div className={`text-2xl font-semibold mt-1 tabular-nums ${valueColor}`}>{value}</div>
        {hint && <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function ReportsSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 rounded-lg bg-slate-200" />
          <div className="h-6 w-48 bg-slate-200 rounded" />
        </div>
        <div className="rounded-xl border border-slate-200 p-4 mb-3">
          <div className="h-3 w-32 bg-slate-200 rounded mb-4" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-slate-100" />
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 p-4 mb-3">
          <div className="h-3 w-32 bg-slate-200 rounded mb-4" />
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-slate-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
