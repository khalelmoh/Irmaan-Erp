"use client";

import { useEffect, useMemo, useState } from "react";
import { dataAdapter } from "@/services";
import { ReportShell } from "@/components/reports/ReportShell";
import { KpiTile } from "@/components/reports/KpiTile";
import { BarSeriesChart } from "@/components/reports/charts";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Coins, DollarSign, TrendingUp, Percent } from "lucide-react";
import { currency } from "@/lib/utils";
import { defaultRange, profitByProduct, profitSummary, type DateRange } from "@/lib/reports";
import { downloadCSV, toCSV } from "@/lib/csv";
import type { Invoice, Product } from "@/types";

export default function ProfitReportPage() {
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    Promise.all([dataAdapter.invoices.list(), dataAdapter.products.list()])
      .then(([i, p]) => { setInvoices(i); setProducts(p); });
  }, []);

  const summary = useMemo(() => profitSummary(invoices, products, range), [invoices, products, range]);
  const rows = useMemo(() => profitByProduct(invoices, products, range), [invoices, products, range]);

  function onExport() {
    const csv = toCSV(rows, [
      { key: "name", label: "Product" },
      { key: "qty", label: "Qty sold", format: (v) => Number(v).toFixed(2) },
      { key: "revenue", label: "Revenue", format: (v) => Number(v).toFixed(2) },
      { key: "totalCost", label: "Cost", format: (v) => Number(v).toFixed(2) },
      { key: "profit", label: "Gross profit", format: (v) => Number(v).toFixed(2) },
      { key: "marginPct", label: "Margin %", format: (v) => `${Number(v).toFixed(2)}%` },
    ]);
    downloadCSV(`profit-report-${range.from}-to-${range.to}`, csv);
  }

  const topProducts = [...rows].sort((a, b) => b.profit - a.profit).slice(0, 8);

  return (
    <ReportShell
      title="Profitability Report"
      description="Revenue, cost of goods sold (COGS), and gross margin per product over the selected period."
      range={range}
      onRangeChange={setRange}
      onExportCSV={onExport}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiTile label="Revenue" value={currency(summary.revenue)} icon={DollarSign} tone="default" />
        <KpiTile label="Cost of goods sold" value={currency(summary.cogs)} icon={Coins} tone="warning" />
        <KpiTile label="Gross profit" value={currency(summary.profit)}
          icon={TrendingUp} tone={summary.profit >= 0 ? "success" : "danger"} />
        <KpiTile label="Gross margin" value={`${summary.marginPct.toFixed(1)}%`} icon={Percent} tone="info" />
      </div>

      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Most profitable products</h2>
        </div>
        {topProducts.length === 0 ? (
          <div className="text-sm text-slate-500 py-8 text-center">No sales in the selected range.</div>
        ) : (
          <BarSeriesChart
            data={topProducts.map((p) => ({ name: p.name, revenue: p.revenue, profit: p.profit }))}
            xKey="name"
            horizontal
            series={[
              { key: "revenue", name: "Revenue", color: "#0ea5e9" },
              { key: "profit", name: "Gross profit", color: "#10b981" },
            ]}
          />
        )}
      </Card>

      <Card>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold">Product breakdown</h2>
          <span className="text-xs text-slate-500">{rows.length} product(s) sold</span>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Product</TH>
              <TH className="!text-right">Qty sold</TH>
              <TH className="!text-right">Revenue</TH>
              <TH className="!text-right">Cost</TH>
              <TH className="!text-right">Gross profit</TH>
              <TH className="!text-right">Margin %</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((p) => (
              <TR key={p.productId}>
                <TD className="font-medium text-slate-900">{p.name}</TD>
                <TD className="text-right tabular-nums">{p.qty.toLocaleString()}</TD>
                <TD className="text-right tabular-nums font-medium">{currency(p.revenue)}</TD>
                <TD className="text-right tabular-nums text-amber-700">{currency(p.totalCost)}</TD>
                <TD className={`text-right tabular-nums font-semibold ${p.profit >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {currency(p.profit)}
                </TD>
                <TD className={`text-right tabular-nums ${p.marginPct >= 20 ? "text-emerald-700" : p.marginPct >= 0 ? "text-amber-700" : "text-red-700"}`}>
                  {p.marginPct.toFixed(1)}%
                </TD>
              </TR>
            ))}
            {rows.length === 0 && (
              <TR><TD colSpan={6} className="text-center py-10 text-slate-500">No sales in this period.</TD></TR>
            )}
          </TBody>
        </Table>
        {rows.length > 0 && (
          <div className="border-t-2 border-slate-200 px-4 py-3 bg-slate-50/50 flex justify-end gap-8 text-sm">
            <span className="text-slate-600">Totals:</span>
            <span className="tabular-nums">{currency(summary.revenue)}</span>
            <span className="tabular-nums text-amber-700">{currency(summary.cogs)}</span>
            <span className={`tabular-nums font-semibold ${summary.profit >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              {currency(summary.profit)}
            </span>
            <span className="tabular-nums text-sky-700">{summary.marginPct.toFixed(1)}%</span>
          </div>
        )}
      </Card>
    </ReportShell>
  );
}
