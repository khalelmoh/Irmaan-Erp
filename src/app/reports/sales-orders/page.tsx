"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { dataAdapter } from "@/services";
import { ReportShell } from "@/components/reports/ReportShell";
import { KpiTile } from "@/components/reports/KpiTile";
import { BarSeriesChart, DonutChart } from "@/components/reports/charts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Activity, Target, CheckCircle2, TrendingUp } from "lucide-react";
import { currency, formatDate } from "@/lib/utils";
import { defaultRange, soPipelineSummary, soStatusBreakdown, soByMonth, type DateRange } from "@/lib/reports";
import { downloadCSV, toCSV } from "@/lib/csv";
import type { SalesOrder } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  quotation: "#94a3b8",
  confirmed: "#3b82f6",
  partially_delivered: "#f59e0b",
  fully_delivered: "#10b981",
  invoiced: "#6366f1",
};

const STATUS_LABELS: Record<string, string> = {
  quotation: "Quotation",
  confirmed: "Confirmed",
  partially_delivered: "Partial Delivery",
  fully_delivered: "Fully Delivered",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

export default function SalesOrderPipelineReportPage() {
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);

  useEffect(() => {
    dataAdapter.salesOrders.list().then(setSalesOrders);
  }, []);

  const summary = useMemo(() => soPipelineSummary(salesOrders, range), [salesOrders, range]);
  const statusData = useMemo(() => soStatusBreakdown(salesOrders, range).map(d => ({ ...d, color: STATUS_COLORS[d.name] || "#cbd5e1" })), [salesOrders, range]);
  const trendData = useMemo(() => soByMonth(salesOrders, range), [salesOrders, range]);
  
  const inRangeSOs = useMemo(() => 
    salesOrders.filter(s => s.status !== "cancelled" && s.orderDate >= range.from && s.orderDate <= range.to)
    .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()),
  [salesOrders, range]);

  function onExport() {
    const csv = toCSV(inRangeSOs.map((s) => ({
      soNumber: s.soNumber,
      orderDate: formatDate(s.orderDate),
      customer: s.customerSnapshot.name,
      status: STATUS_LABELS[s.status],
      total: s.total,
      salesperson: s.salespersonName,
    })), [
      { key: "soNumber", label: "SO #" },
      { key: "orderDate", label: "Date" },
      { key: "customer", label: "Customer" },
      { key: "status", label: "Status" },
      { key: "total", label: "Value", format: (v) => Number(v).toFixed(2) },
      { key: "salesperson", label: "Salesperson" },
    ]);
    downloadCSV(`sales-order-pipeline-${range.from}-to-${range.to}`, csv);
  }

  return (
    <ReportShell
      title="Sales Order Pipeline"
      description="Track quotes, conversions, and fulfillment status across all active sales orders."
      range={range}
      onRangeChange={setRange}
      onExportCSV={onExport}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiTile 
          label="Pipeline Value" 
          value={currency(summary.pipelineValue)} 
          icon={Activity} 
          tone="info"
          hint={`${summary.total} total orders & quotes`} 
        />
        <KpiTile 
          label="Conversion Rate" 
          value={`${summary.conversionRate}%`} 
          icon={Target} 
          tone={summary.conversionRate >= 75 ? "success" : "warning"}
          hint={`${summary.confirmed} confirmed orders`}
        />
        <KpiTile 
          label="Fulfillment Rate" 
          value={`${summary.fulfillmentRate}%`} 
          icon={CheckCircle2} 
          tone={summary.fulfillmentRate >= 90 ? "success" : "warning"}
          hint={`${summary.fullyDelivered} fully delivered`}
        />
        <KpiTile 
          label="Avg Deal Size" 
          value={currency(summary.avgValue)} 
          icon={TrendingUp} 
          tone="default" 
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <Card className="p-5 lg:col-span-1">
          <h2 className="font-semibold mb-3">Pipeline by Status</h2>
          {statusData.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">No orders in this period.</div>
          ) : (
            <DonutChart data={statusData.map(d => ({ name: STATUS_LABELS[d.name] || d.name, value: d.value, color: d.color }))} />
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="font-semibold mb-3">Monthly Pipeline Value</h2>
          {trendData.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">No orders in this period.</div>
          ) : (
            <BarSeriesChart
              data={trendData}
              xKey="month"
              series={[{ key: "value", name: "Pipeline Value", color: "#3b82f6" }]}
            />
          )}
        </Card>
      </div>

      <Card>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold">Sales Orders</h2>
          <span className="text-xs text-slate-500">{inRangeSOs.length} order(s)</span>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>SO #</TH>
              <TH>Date</TH>
              <TH>Customer</TH>
              <TH>Salesperson</TH>
              <TH>Status</TH>
              <TH className="!text-right">Value</TH>
            </TR>
          </THead>
          <TBody>
            {inRangeSOs.map((so) => (
              <TR key={so.id}>
                <TD className="font-mono">
                  <Link href={`/sales-orders/${so.id}`} className="text-brand-700 font-semibold hover:underline">
                    {so.soNumber}
                  </Link>
                </TD>
                <TD className="text-slate-600">{formatDate(so.orderDate)}</TD>
                <TD className="font-medium text-slate-900">{so.customerSnapshot.name}</TD>
                <TD className="text-slate-600">{so.salespersonName}</TD>
                <TD>
                  <Badge variant={so.status === "fully_delivered" || so.status === "invoiced" ? "success" : so.status === "quotation" ? "default" : "info"}>
                    {STATUS_LABELS[so.status]}
                  </Badge>
                </TD>
                <TD className="text-right tabular-nums font-medium text-slate-900">{currency(so.total)}</TD>
              </TR>
            ))}
            {inRangeSOs.length === 0 && (
              <TR><TD colSpan={6} className="text-center py-10 text-slate-500">No orders in this period.</TD></TR>
            )}
          </TBody>
        </Table>
      </Card>
    </ReportShell>
  );
}
