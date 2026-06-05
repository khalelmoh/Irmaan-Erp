"use client";

import { useEffect, useMemo, useState } from "react";
import { dataAdapter } from "@/services";
import { ReportShell } from "@/components/reports/ReportShell";
import { KpiTile } from "@/components/reports/KpiTile";
import { TrendChart, BarSeriesChart } from "@/components/reports/charts";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ShoppingBag, DollarSign, Building2 } from "lucide-react";
import { currency } from "@/lib/utils";
import { defaultRange, purchaseSummary, purchasesByMonth, topSuppliers, type DateRange } from "@/lib/reports";
import { downloadCSV, toCSV } from "@/lib/csv";
import type { PurchaseOrder, SupplierPayment, Supplier } from "@/types";

export default function PurchasesReportPage() {
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  useEffect(() => {
    Promise.all([
      dataAdapter.purchaseOrders.list(),
      dataAdapter.supplierPayments.list(),
      dataAdapter.suppliers.list(),
    ]).then(([p, pay, s]) => { setPos(p); setPayments(pay); setSuppliers(s); });
  }, []);

  const summary = useMemo(() => purchaseSummary(pos, payments, range), [pos, payments, range]);
  const trend = useMemo(() => purchasesByMonth(pos, payments, range), [pos, payments, range]);
  const supplierRanking = useMemo(() => topSuppliers(pos, suppliers, range, 10), [pos, suppliers, range]);

  function onExport() {
    const csv = toCSV(supplierRanking, [
      { key: "name", label: "Supplier" },
      { key: "count", label: "POs" },
      { key: "ordered", label: "Ordered", format: (v) => Number(v).toFixed(2) },
      { key: "outstanding", label: "Outstanding", format: (v) => Number(v).toFixed(2) },
    ]);
    downloadCSV(`purchases-report-${range.from}-to-${range.to}`, csv);
  }

  return (
    <ReportShell
      title="Purchases Report"
      description="Procurement activity, supplier spend, and payment outflows over the selected period."
      range={range}
      onRangeChange={setRange}
      onExportCSV={onExport}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiTile label="Total ordered" value={currency(summary.ordered)} icon={ShoppingBag} tone="default" />
        <KpiTile label="Total paid out" value={currency(summary.paid)} icon={DollarSign} tone="danger" />
        <KpiTile label="POs issued" value={summary.poCount} icon={ShoppingBag} tone="info" />
        <KpiTile label="Avg PO value" value={currency(summary.avgPO)} icon={DollarSign} tone="default" />
      </div>

      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Monthly orders vs payments</h2>
          <span className="text-xs text-slate-500">{trend.length} months</span>
        </div>
        {trend.length === 0 ? (
          <div className="text-sm text-slate-500 py-8 text-center">No data in the selected range.</div>
        ) : (
          <TrendChart
            data={trend}
            xKey="month"
            series={[
              { key: "ordered", name: "Ordered", color: "#a855f7" },
              { key: "paid", name: "Paid", color: "#dc2626" },
            ]}
          />
        )}
      </Card>

      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-400" /> Top suppliers
          </h2>
          <span className="text-xs text-slate-500">{supplierRanking.length} supplier(s)</span>
        </div>
        {supplierRanking.length === 0 ? (
          <div className="text-sm text-slate-500 py-8 text-center">No supplier activity in this period.</div>
        ) : (
          <BarSeriesChart
            data={supplierRanking.slice(0, 8).map((s) => ({ name: s.name, ordered: s.ordered }))}
            xKey="name"
            horizontal
            series={[{ key: "ordered", name: "Ordered", color: "#a855f7" }]}
          />
        )}
      </Card>

      <Card>
        <div className="p-5 border-b border-slate-100">
          <h2 className="font-semibold">Supplier breakdown</h2>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>#</TH>
              <TH>Supplier</TH>
              <TH className="!text-right">POs</TH>
              <TH className="!text-right">Ordered</TH>
              <TH className="!text-right">Outstanding</TH>
              <TH className="!text-right">Paid</TH>
            </TR>
          </THead>
          <TBody>
            {supplierRanking.map((s, i) => (
              <TR key={s.supplierId}>
                <TD className="text-slate-500">{i + 1}</TD>
                <TD className="font-medium text-slate-900">{s.name}</TD>
                <TD className="text-right tabular-nums">{s.count}</TD>
                <TD className="text-right tabular-nums font-medium">{currency(s.ordered)}</TD>
                <TD className={`text-right tabular-nums ${s.outstanding > 0 ? "text-red-700" : "text-emerald-700"}`}>
                  {currency(s.outstanding)}
                </TD>
                <TD className="text-right tabular-nums text-emerald-700">{currency(s.ordered - s.outstanding)}</TD>
              </TR>
            ))}
            {supplierRanking.length === 0 && (
              <TR><TD colSpan={6} className="text-center py-10 text-slate-500">No data.</TD></TR>
            )}
          </TBody>
        </Table>
      </Card>
    </ReportShell>
  );
}
