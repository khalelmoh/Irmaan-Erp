"use client";

import { useEffect, useMemo, useState } from "react";
import { dataAdapter } from "@/services";
import { ReportShell } from "@/components/reports/ReportShell";
import { KpiTile } from "@/components/reports/KpiTile";
import { BarSeriesChart } from "@/components/reports/charts";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Users, DollarSign, Package, ShoppingCart } from "lucide-react";
import { currency } from "@/lib/utils";
import { defaultRange, salespersonPerformance, type DateRange } from "@/lib/reports";
import { downloadCSV, toCSV } from "@/lib/csv";
import type { SalesOrder, DeliveryOrder, Invoice } from "@/types";

export default function SalespersonPerformanceReportPage() {
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    Promise.all([
      dataAdapter.salesOrders.list(),
      dataAdapter.deliveryOrders.list(),
      dataAdapter.invoices.list(),
    ]).then(([so, doList, inv]) => {
      setSalesOrders(so);
      setDeliveryOrders(doList);
      setInvoices(inv);
    });
  }, []);

  const rows = useMemo(() => salespersonPerformance(salesOrders, deliveryOrders, invoices, range), [salesOrders, deliveryOrders, invoices, range]);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        revenue: acc.revenue + r.revenue,
        bagsSold: acc.bagsSold + r.bagsSold,
        soCount: acc.soCount + r.soCount,
        doCount: acc.doCount + r.doCount,
      }),
      { revenue: 0, bagsSold: 0, soCount: 0, doCount: 0 }
    );
  }, [rows]);

  function onExport() {
    const csv = toCSV(rows.map(r => ({ ...r })), [
      { key: "name", label: "Salesperson" },
      { key: "revenue", label: "Revenue Generated", format: (v) => Number(v).toFixed(2) },
      { key: "bagsSold", label: "Bags Sold", format: (v) => Number(v).toFixed(2) },
      { key: "soCount", label: "Sales Orders" },
      { key: "doCount", label: "Delivery Orders" },
      { key: "avgDeal", label: "Avg Deal Size", format: (v) => Number(v).toFixed(2) },
    ]);
    downloadCSV(`salesperson-performance-${range.from}-to-${range.to}`, csv);
  }

  const topSalespersons = [...rows].slice(0, 8);

  return (
    <ReportShell
      title="Salesperson Performance"
      description="Track revenue, volume, and order activity attributed to each salesperson."
      range={range}
      onRangeChange={setRange}
      onExportCSV={onExport}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiTile 
          label="Total Revenue" 
          value={currency(summary.revenue)} 
          icon={DollarSign} 
          tone="success"
        />
        <KpiTile 
          label="Total Bags Sold" 
          value={summary.bagsSold.toLocaleString()} 
          icon={Package} 
          tone="info"
        />
        <KpiTile 
          label="Sales Orders" 
          value={summary.soCount} 
          icon={ShoppingCart} 
          tone="warning"
        />
        <KpiTile 
          label="Active Staff" 
          value={rows.length} 
          icon={Users} 
          tone="default" 
        />
      </div>

      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Top Salespersons by Revenue</h2>
        </div>
        {topSalespersons.length === 0 ? (
          <div className="text-sm text-slate-500 py-8 text-center">No sales activity in this period.</div>
        ) : (
          <BarSeriesChart
            data={topSalespersons.map(r => ({ ...r }))}
            xKey="name"
            horizontal
            series={[
              { key: "revenue", name: "Revenue", color: "#8b5cf6" },
            ]}
          />
        )}
      </Card>

      <Card>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold">Performance Leaderboard</h2>
          <span className="text-xs text-slate-500">{rows.length} salesperson(s)</span>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Salesperson</TH>
              <TH className="!text-right">Revenue</TH>
              <TH className="!text-right">Bags Sold</TH>
              <TH className="!text-right">Sales Orders</TH>
              <TH className="!text-right">Delivery Orders</TH>
              <TH className="!text-right">Avg Deal Size</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD className="font-medium text-slate-900">{row.name}</TD>
                <TD className="text-right tabular-nums font-semibold text-emerald-700">{currency(row.revenue)}</TD>
                <TD className="text-right tabular-nums">{row.bagsSold.toLocaleString()}</TD>
                <TD className="text-right tabular-nums">{row.soCount}</TD>
                <TD className="text-right tabular-nums">{row.doCount}</TD>
                <TD className="text-right tabular-nums text-slate-600">{currency(row.avgDeal)}</TD>
              </TR>
            ))}
            {rows.length === 0 && (
              <TR><TD colSpan={6} className="text-center py-10 text-slate-500">No activity in this period.</TD></TR>
            )}
          </TBody>
        </Table>
        {rows.length > 0 && (
          <div className="border-t-2 border-slate-200 px-4 py-3 bg-slate-50/50 flex justify-end gap-8 text-sm">
            <span className="text-slate-600">Totals:</span>
            <span className="tabular-nums font-semibold text-emerald-700">{currency(summary.revenue)}</span>
            <span className="tabular-nums">{summary.bagsSold.toLocaleString()}</span>
            <span className="tabular-nums">{summary.soCount}</span>
            <span className="tabular-nums">{summary.doCount}</span>
            <span className="tabular-nums">—</span>
          </div>
        )}
      </Card>
    </ReportShell>
  );
}
