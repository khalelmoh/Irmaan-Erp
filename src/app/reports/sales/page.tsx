"use client";

import { useEffect, useMemo, useState } from "react";
import { dataAdapter } from "@/services";
import { ReportShell } from "@/components/reports/ReportShell";
import { KpiTile } from "@/components/reports/KpiTile";
import { TrendChart, BarSeriesChart } from "@/components/reports/charts";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DollarSign, FileText, Users, TrendingUp } from "lucide-react";
import { currency } from "@/lib/utils";
import { defaultRange, salesSummary, salesByMonth, topCustomers, type DateRange } from "@/lib/reports";
import { downloadCSV, toCSV } from "@/lib/csv";
import type { Invoice, Payment, Customer } from "@/types";

export default function SalesReportPage() {
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    Promise.all([
      dataAdapter.invoices.list(),
      dataAdapter.payments.list(),
      dataAdapter.customers.list(),
    ]).then(([i, p, c]) => { setInvoices(i); setPayments(p); setCustomers(c); });
  }, []);

  const summary = useMemo(() => salesSummary(invoices, payments, range), [invoices, payments, range]);
  const trend = useMemo(() => salesByMonth(invoices, payments, range), [invoices, payments, range]);
  const customersTop = useMemo(() => topCustomers(invoices, customers, range, 10), [invoices, customers, range]);

  function onExport() {
    const csv = toCSV(customersTop, [
      { key: "name", label: "Customer" },
      { key: "count", label: "Invoices" },
      { key: "billed", label: "Billed", format: (v) => Number(v).toFixed(2) },
      { key: "outstanding", label: "Outstanding", format: (v) => Number(v).toFixed(2) },
    ]);
    downloadCSV(`sales-report-${range.from}-to-${range.to}`, csv);
  }

  return (
    <ReportShell
      title="Sales Report"
      description="Invoicing and collections performance over the selected period."
      range={range}
      onRangeChange={setRange}
      onExportCSV={onExport}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiTile label="Total billed" value={currency(summary.billed)} icon={FileText} tone="default" />
        <KpiTile label="Total collected" value={currency(summary.collected)} icon={DollarSign} tone="success" />
        <KpiTile label="Invoices issued" value={summary.invoiceCount} icon={TrendingUp} tone="info" />
        <KpiTile label="Avg invoice value" value={currency(summary.avgInvoice)} icon={DollarSign} tone="default" />
      </div>

      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Monthly billing vs collections</h2>
          <span className="text-xs text-slate-500">{trend.length} months</span>
        </div>
        {trend.length === 0 ? (
          <div className="text-sm text-slate-500 py-8 text-center">No data in the selected range.</div>
        ) : (
          <TrendChart
            data={trend}
            xKey="month"
            series={[
              { key: "billed", name: "Billed", color: "#1d4ed8" },
              { key: "collected", name: "Collected", color: "#10b981" },
            ]}
          />
        )}
      </Card>

      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-400" /> Top customers
          </h2>
          <span className="text-xs text-slate-500">{customersTop.length} customer(s)</span>
        </div>
        {customersTop.length === 0 ? (
          <div className="text-sm text-slate-500 py-8 text-center">No customer activity in this period.</div>
        ) : (
          <BarSeriesChart
            data={customersTop.slice(0, 8).map((c) => ({ name: c.name, billed: c.billed }))}
            xKey="name"
            horizontal
            series={[{ key: "billed", name: "Billed", color: "#1d4ed8" }]}
          />
        )}
      </Card>

      <Card>
        <div className="p-5 border-b border-slate-100">
          <h2 className="font-semibold">Customer breakdown</h2>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>#</TH>
              <TH>Customer</TH>
              <TH className="!text-right">Invoices</TH>
              <TH className="!text-right">Billed</TH>
              <TH className="!text-right">Outstanding</TH>
              <TH className="!text-right">Collected</TH>
            </TR>
          </THead>
          <TBody>
            {customersTop.map((c, i) => (
              <TR key={c.customerId}>
                <TD className="text-slate-500">{i + 1}</TD>
                <TD className="font-medium text-slate-900">{c.name}</TD>
                <TD className="text-right tabular-nums">{c.count}</TD>
                <TD className="text-right tabular-nums font-medium">{currency(c.billed)}</TD>
                <TD className={`text-right tabular-nums ${c.outstanding > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                  {currency(c.outstanding)}
                </TD>
                <TD className="text-right tabular-nums text-emerald-700">{currency(c.billed - c.outstanding)}</TD>
              </TR>
            ))}
            {customersTop.length === 0 && (
              <TR><TD colSpan={6} className="text-center py-10 text-slate-500">No data.</TD></TR>
            )}
          </TBody>
        </Table>
      </Card>
    </ReportShell>
  );
}
