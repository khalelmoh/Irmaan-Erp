"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { dataAdapter } from "@/services";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Truck, DollarSign, Package, Users, ArrowUpRight, FileText, AlertCircle, ShoppingCart, Building2,
} from "lucide-react";
import { currency, formatDate } from "@/lib/utils";
import { STATUS_VARIANT, outstanding, effectiveStatus } from "@/lib/invoice";
import { poOutstanding } from "@/lib/purchase-order";
import type { DeliveryOrder, Customer, Product, Invoice, Payment, PurchaseOrder, Supplier, SupplierPayment } from "@/types";

const doStatusVariant = {
  draft: "muted", issued: "info", delivered: "success", cancelled: "danger",
} as const;

export default function DashboardPage() {
  const [dos, setDos] = useState<DeliveryOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [supplierPays, setSupplierPays] = useState<SupplierPayment[]>([]);

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
    ]).then(([d, c, s, p, i, pay, po, sp]) => {
      setDos(d); setCustomers(c); setSuppliers(s); setProducts(p);
      setInvoices(i); setPayments(pay); setPos(po); setSupplierPays(sp);
    });
  }, []);

  const stats = useMemo(() => {
    const totalAR = invoices.reduce((s, i) => s + (i.status === "cancelled" || i.status === "draft" ? 0 : outstanding(i)), 0);
    const totalAP = pos.reduce((s, p) => s + (p.status === "cancelled" || p.status === "draft" ? 0 : poOutstanding(p)), 0);
    const overdue = invoices.filter((i) => effectiveStatus(i) === "overdue").length;
    const pendingDeliveries = dos.filter((d) => d.status === "issued").length;
    const pendingReceipts = pos.filter((p) => p.status === "sent" || p.status === "partial_received").length;
    const lowStock = products.filter((p) => p.reorderLevel && p.stock <= p.reorderLevel).length;

    const startMonth = new Date(); startMonth.setDate(1); startMonth.setHours(0,0,0,0);
    const collectedThisMonth = payments.filter((p) => new Date(p.paidAt) >= startMonth).reduce((s, p) => s + p.amount, 0);
    const paidOutThisMonth = supplierPays.filter((p) => new Date(p.paidAt) >= startMonth).reduce((s, p) => s + p.amount, 0);

    return {
      totalAR, totalAP, overdue, pendingDeliveries, pendingReceipts,
      lowStock, collectedThisMonth, paidOutThisMonth,
      netCashThisMonth: collectedThisMonth - paidOutThisMonth,
    };
  }, [invoices, payments, dos, products, pos, supplierPays]);

  const kpis = [
    { label: "Outstanding (A/R)", value: currency(stats.totalAR), icon: DollarSign, color: "text-amber-700 bg-amber-50" },
    { label: "Outstanding (A/P)", value: currency(stats.totalAP), icon: DollarSign, color: "text-red-700 bg-red-50" },
    { label: "Net cash this month", value: currency(stats.netCashThisMonth), icon: DollarSign,
      color: stats.netCashThisMonth >= 0 ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50" },
    { label: "Overdue invoices", value: stats.overdue, icon: AlertCircle, color: "text-red-700 bg-red-50" },
  ];

  const recentDOs = dos.slice(0, 5);
  const recentInvoices = invoices.slice(0, 5);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Operational overview of your trading business."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/purchase-orders/new"><ShoppingCart className="h-4 w-4" /> New P.O</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/invoices/new"><FileText className="h-4 w-4" /> New Invoice</Link>
            </Button>
            <Button asChild>
              <Link href="/delivery-orders/new"><Truck className="h-4 w-4" /> New D.O</Link>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label}>
              <CardContent className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">{k.label}</div>
                  <div className="text-2xl font-semibold mt-1 text-slate-900">{k.value}</div>
                </div>
                <div className={`h-11 w-11 rounded-lg flex items-center justify-center ${k.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <SmallStat label="Customers" value={customers.length} icon={Users} />
        <SmallStat label="Suppliers" value={suppliers.length} icon={Building2} />
        <SmallStat label="Products" value={products.length} icon={Package} />
        <SmallStat label="Pending deliveries" value={stats.pendingDeliveries} icon={Truck} highlight={stats.pendingDeliveries > 0} />
        <SmallStat label="Awaiting receipt" value={stats.pendingReceipts} icon={ShoppingCart} highlight={stats.pendingReceipts > 0} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Recent invoices */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Invoices</CardTitle>
            <Link href="/invoices" className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1">
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500">No invoices yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Recent DOs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Delivery Orders</CardTitle>
            <Link href="/delivery-orders" className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1">
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="text-left px-5 py-2.5">DO #</th>
                  <th className="text-left px-5 py-2.5">Customer</th>
                  <th className="text-left px-5 py-2.5">Date</th>
                  <th className="text-left px-5 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentDOs.map((d) => (
                  <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-mono">
                      <Link href={`/delivery-orders/${d.id}`} className="text-brand-700 hover:underline">{d.doNumber}</Link>
                    </td>
                    <td className="px-5 py-3">{d.customerSnapshot.name}</td>
                    <td className="px-5 py-3 text-slate-600">{formatDate(d.orderDate)}</td>
                    <td className="px-5 py-3"><Badge variant={doStatusVariant[d.status]}>{d.status}</Badge></td>
                  </tr>
                ))}
                {recentDOs.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500">No delivery orders yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

function SmallStat({ label, value, icon: Icon, highlight }: { label: string; value: number; icon: typeof Users; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
          <div className={`text-xl font-semibold mt-0.5 ${highlight ? "text-amber-700" : "text-slate-900"}`}>{value}</div>
        </div>
        <Icon className={`h-5 w-5 ${highlight ? "text-amber-500" : "text-slate-300"}`} />
      </CardContent>
    </Card>
  );
}
