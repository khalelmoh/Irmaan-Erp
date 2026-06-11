"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { dataAdapter } from "@/services";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KpiTile } from "@/components/reports/KpiTile";
import {
  Truck, DollarSign, Package, Users, ArrowUpRight, FileText, AlertCircle, ShoppingCart, Activity
} from "lucide-react";
import { currency, formatDate } from "@/lib/utils";
import { STATUS_VARIANT, outstanding, effectiveStatus } from "@/lib/invoice";
import { poOutstanding } from "@/lib/purchase-order";
import { computeDelta, prevMonthRange, monthlyOperations, thisMonthRange } from "@/lib/reports";
import type { DeliveryOrder, Customer, Product, Invoice, Payment, PurchaseOrder, Supplier, SupplierPayment, SalesOrder } from "@/types";

const doStatusVariant = {
  draft: "default", issued: "info", delivered: "success", cancelled: "danger",
} as const;

export default function DashboardPage() {
  const [data, setData] = useState<{
    dos: DeliveryOrder[];
    customers: Customer[];
    suppliers: Supplier[];
    products: Product[];
    invoices: Invoice[];
    payments: Payment[];
    pos: PurchaseOrder[];
    supplierPays: SupplierPayment[];
    salesOrders: SalesOrder[];
  } | null>(null);

  useEffect(() => {
    Promise.all([
      dataAdapter.deliveryOrders.list(),
      dataAdapter.customers.list(),
      dataAdapter.suppliers.list(),
      dataAdapter.products.list(),
      dataAdapter.invoices.list(),
      dataAdapter.payments.list(),
      dataAdapter.purchaseOrders.list(),
      dataAdapter.supplierPayments.list(),
      dataAdapter.salesOrders.list(),
    ]).then(([dos, customers, suppliers, products, invoices, payments, pos, supplierPays, salesOrders]) => {
      setData({ dos, customers, suppliers, products, invoices, payments, pos, supplierPays, salesOrders });
    });
  }, []);

  const stats = useMemo(() => {
    if (!data) return null;
    const { invoices, pos, dos, products, payments, supplierPays, salesOrders } = data;

    // Current Balances
    const totalAR = invoices.reduce((s, i) => s + (i.status === "cancelled" || i.status === "draft" ? 0 : outstanding(i)), 0);
    const totalAP = pos.reduce((s, p) => s + (p.status === "cancelled" || p.status === "draft" ? 0 : poOutstanding(p)), 0);
    const overdue = invoices.filter((i) => effectiveStatus(i) === "overdue").length;

    // Operational Counters
    const pendingDeliveries = dos.filter((d) => d.status === "issued").length;
    const pendingReceipts = pos.filter((p) => p.status === "sent" || p.status === "partial_received").length;
    const pendingSalesOrders = salesOrders.filter((s) => s.status === "quotation" || s.status === "confirmed").length;

    // This Month vs Last Month
    const currentMonthRange = thisMonthRange();
    const currentMonthLabel = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const previousMonthRange = prevMonthRange(currentMonthLabel);

    const currentOps = monthlyOperations(dos, pos, invoices, payments, supplierPays, data.customers, currentMonthRange);
    const prevOps = monthlyOperations(dos, pos, invoices, payments, supplierPays, data.customers, previousMonthRange);

    const netCashCurrent = currentOps.cashCollected - currentOps.supplierSpend;
    const netCashPrev = prevOps.cashCollected - prevOps.supplierSpend;
    const netCashDelta = computeDelta(netCashCurrent, netCashPrev);

    return {
      totalAR, totalAP, overdue, 
      pendingDeliveries, pendingReceipts, pendingSalesOrders,
      netCashCurrent, netCashDelta
    };
  }, [data]);

  const recentDOs = useMemo(() => {
    if (!data) return [];
    return [...data.dos].sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()).slice(0, 5);
  }, [data]);

  const recentInvoices = useMemo(() => {
    if (!data) return [];
    return [...data.invoices].sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime()).slice(0, 5);
  }, [data]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Operational overview of your trading business."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/purchase-orders/new"><ShoppingCart className="h-4 w-4 mr-2" /> New P.O</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/invoices/new"><FileText className="h-4 w-4 mr-2" /> New Invoice</Link>
            </Button>
            <Button asChild>
              <Link href="/delivery-orders/new"><Truck className="h-4 w-4 mr-2" /> New D.O</Link>
            </Button>
          </div>
        }
      />

      {!data || !stats ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* ── Top KPIs ──────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            
            {/* Left Block: Current Balances */}
            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50/80 to-white p-4">
              <div className="text-[10px] uppercase tracking-widest text-slate-400 font-medium mb-3 flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3" /> Current Balances
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <KpiTile 
                  label="Outstanding A/R" 
                  value={currency(stats.totalAR)} 
                  icon={DollarSign} 
                  tone="warning" 
                />
                <KpiTile 
                  label="Outstanding A/P" 
                  value={currency(stats.totalAP)} 
                  icon={DollarSign} 
                  tone="danger" 
                />
                <KpiTile 
                  label="Overdue Invoices" 
                  value={stats.overdue} 
                  icon={AlertCircle} 
                  tone="danger" 
                />
              </div>
            </div>

            {/* Right Block: This Month */}
            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-brand-50/50 to-white p-4">
              <div className="text-[10px] uppercase tracking-widest text-brand-600/70 font-medium mb-3 flex items-center gap-1.5">
                <Activity className="h-3 w-3" /> This Month
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 h-[116px]">
                <KpiTile 
                  label="Net Cash Flow" 
                  value={currency(stats.netCashCurrent)} 
                  icon={DollarSign} 
                  tone={stats.netCashCurrent >= 0 ? "success" : "danger"} 
                  delta={stats.netCashDelta}
                />
                <div className="h-full rounded-xl border border-dashed border-slate-200 flex items-center justify-center p-4 text-center">
                  <div>
                    <div className="text-sm font-medium text-slate-700">Need more insights?</div>
                    <Link href="/reports" className="text-xs text-brand-600 hover:underline mt-1 block">
                      View full operations snapshot
                    </Link>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* ── Operational Queue ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <SmallStat label="Customers" value={data.customers.length} icon={Users} href="/customers" />
            <SmallStat label="Pending Sales" value={stats.pendingSalesOrders} icon={Activity} highlight={stats.pendingSalesOrders > 0} href="/sales-orders" />
            <SmallStat label="Pending Deliveries" value={stats.pendingDeliveries} icon={Truck} highlight={stats.pendingDeliveries > 0} href="/delivery-orders" />
            <SmallStat label="Awaiting Receipt" value={stats.pendingReceipts} icon={ShoppingCart} highlight={stats.pendingReceipts > 0} href="/purchase-orders" />
          </div>

          {/* ── Recent Activity Tables ─────────────────────────────────────────── */}
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Recent invoices */}
            <Card className="flex flex-col h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle>Recent Invoices</CardTitle>
                <Link href="/invoices" className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1">
                  View all <ArrowUpRight className="h-3 w-3" />
                </Link>
              </CardHeader>
              <div className="overflow-x-auto flex-1 flex flex-col">
                <table className="w-full text-sm flex-1">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="text-left px-5 py-2.5">Invoice #</th>
                      <th className="text-left px-5 py-2.5">Customer</th>
                      <th className="text-right px-5 py-2.5">Outstanding</th>
                      <th className="text-left px-5 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentInvoices.map((i) => {
                      const st = effectiveStatus(i);
                      return (
                        <tr key={i.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                          <td className="px-5 py-3 font-mono">
                            <Link href={`/invoices/${i.id}`} className="text-brand-700 hover:underline">{i.invoiceNumber}</Link>
                          </td>
                          <td className="px-5 py-3">{i.customerSnapshot.name}</td>
                          <td className="px-5 py-3 text-right tabular-nums">{currency(outstanding(i))}</td>
                          <td className="px-5 py-3"><Badge variant={STATUS_VARIANT[st]}>{st}</Badge></td>
                        </tr>
                      );
                    })}
                    {recentInvoices.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-5 py-12 text-center">
                          <div className="text-slate-500 mb-3">No invoices created yet.</div>
                          <Button asChild variant="outline" size="sm">
                            <Link href="/invoices/new">Create First Invoice</Link>
                          </Button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Recent DOs */}
            <Card className="flex flex-col h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle>Recent Delivery Orders</CardTitle>
                <Link href="/delivery-orders" className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1">
                  View all <ArrowUpRight className="h-3 w-3" />
                </Link>
              </CardHeader>
              <div className="overflow-x-auto flex-1 flex flex-col">
                <table className="w-full text-sm flex-1">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="text-left px-5 py-2.5">DO #</th>
                      <th className="text-left px-5 py-2.5">Customer</th>
                      <th className="text-left px-5 py-2.5">Destination</th>
                      <th className="text-right px-5 py-2.5">Bags</th>
                      <th className="text-left px-5 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDOs.map((d) => {
                      const bags = d.items.reduce((acc, it) => acc + it.quantity, 0);
                      return (
                        <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                          <td className="px-5 py-3 font-mono">
                            <Link href={`/delivery-orders/${d.id}`} className="text-brand-700 hover:underline">{d.doNumber}</Link>
                          </td>
                          <td className="px-5 py-3">{d.customerSnapshot.name}</td>
                          <td className="px-5 py-3 text-slate-600">{d.loadingDetails?.destination || "—"}</td>
                          <td className="px-5 py-3 text-right tabular-nums">{bags}</td>
                          <td className="px-5 py-3"><Badge variant={doStatusVariant[d.status as keyof typeof doStatusVariant] || "default"}>{d.status}</Badge></td>
                        </tr>
                      )
                    })}
                    {recentDOs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center">
                          <div className="text-slate-500 mb-3">No delivery orders created yet.</div>
                          <Button asChild variant="outline" size="sm">
                            <Link href="/delivery-orders/new">Create First D.O</Link>
                          </Button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function SmallStat({ label, value, icon: Icon, highlight, href }: { label: string; value: number; icon: any; highlight?: boolean; href?: string }) {
  const card = (
    <Card className={`h-full ${href ? "cursor-pointer select-none transition-shadow hover:shadow-md hover:border-brand-300" : ""}`}>
      <CardContent className="flex items-center justify-between py-4">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
          <div className={`text-xl font-semibold mt-0.5 ${highlight ? "text-amber-700" : "text-slate-900"}`}>{value}</div>
        </div>
        <Icon className={`h-5 w-5 ${highlight ? "text-amber-500" : "text-slate-300"}`} />
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="h-3 w-32 bg-slate-200 rounded mb-4" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-xl bg-slate-100" />)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="h-3 w-32 bg-slate-200 rounded mb-4" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 h-[116px]">
            <div className="h-full rounded-xl bg-slate-100" />
            <div className="h-full rounded-xl border border-dashed border-slate-200" />
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-[76px] rounded-xl bg-slate-100" />)}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="h-64 rounded-xl bg-slate-100" />
        <div className="h-64 rounded-xl bg-slate-100" />
      </div>
    </div>
  );
}
