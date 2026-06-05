"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { dataAdapter } from "@/services";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  TrendingUp, Wallet, ShoppingBag, CreditCard, Boxes, Coins, ArrowRight,
} from "lucide-react";
import { currency } from "@/lib/utils";
import {
  defaultRange, salesSummary, purchaseSummary, inventoryTotals, profitSummary, arAging, apAging,
} from "@/lib/reports";
import type { Invoice, Payment, PurchaseOrder, SupplierPayment, Product } from "@/types";

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
];

export default function ReportsHubPage() {
  const [data, setData] = useState<{
    invoices: Invoice[]; payments: Payment[]; pos: PurchaseOrder[];
    supplierPays: SupplierPayment[]; products: Product[];
  } | null>(null);

  useEffect(() => {
    Promise.all([
      dataAdapter.invoices.list(),
      dataAdapter.payments.list(),
      dataAdapter.purchaseOrders.list(),
      dataAdapter.supplierPayments.list(),
      dataAdapter.products.list(),
    ]).then(([invoices, payments, pos, supplierPays, products]) =>
      setData({ invoices, payments, pos, supplierPays, products }),
    );
  }, []);

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
      />

      {/* Headline snapshot (last 90 days) */}
      {headlines && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Snapshot label="Revenue (90d)" value={currency(headlines.sales.billed)} hint={`${headlines.sales.invoiceCount} invoices`} />
          <Snapshot label="Collected (90d)" value={currency(headlines.sales.collected)} />
          <Snapshot label="Outstanding A/R" value={currency(headlines.ar)} tone="amber" />
          <Snapshot label="Outstanding A/P" value={currency(headlines.ap)} tone="red" />
        </div>
      )}

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
