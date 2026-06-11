"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { dataAdapter } from "@/services";
import { ReportShell } from "@/components/reports/ReportShell";
import { KpiTile } from "@/components/reports/KpiTile";
import { BarSeriesChart } from "@/components/reports/charts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { MapPin, Truck, CheckCircle2, Package } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { defaultRange, deliverySummary, deliveriesByDestination, deliveriesByMonth, type DateRange } from "@/lib/reports";
import { downloadCSV, toCSV } from "@/lib/csv";
import type { DeliveryOrder } from "@/types";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  issued: "Issued",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default function DeliveryPerformanceReportPage() {
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);

  useEffect(() => {
    dataAdapter.deliveryOrders.list().then(setDeliveryOrders);
  }, []);

  const summary = useMemo(() => deliverySummary(deliveryOrders, range), [deliveryOrders, range]);
  const destData = useMemo(() => deliveriesByDestination(deliveryOrders, range), [deliveryOrders, range]);
  const trendData = useMemo(() => deliveriesByMonth(deliveryOrders, range), [deliveryOrders, range]);
  
  const inRangeDOs = useMemo(() => 
    deliveryOrders.filter(d => d.status !== "cancelled" && d.orderDate >= range.from && d.orderDate <= range.to)
    .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()),
  [deliveryOrders, range]);

  function onExport() {
    const csv = toCSV(inRangeDOs.map((d) => ({
      doNumber: d.doNumber,
      orderDate: formatDate(d.orderDate),
      customer: d.customerSnapshot.name,
      status: STATUS_LABELS[d.status],
      bags: d.items.reduce((acc, it) => acc + it.quantity, 0).toString(),
      destination: d.loadingDetails?.destination || "Unknown",
      vehicleNo: d.loadingDetails?.truckPlate || "",
    })), [
      { key: "doNumber", label: "DO #" },
      { key: "orderDate", label: "Date" },
      { key: "customer", label: "Customer" },
      { key: "status", label: "Status" },
      { key: "bags", label: "Bags" },
      { key: "destination", label: "Destination" },
      { key: "vehicleNo", label: "Vehicle" },
    ]);
    downloadCSV(`delivery-performance-${range.from}-to-${range.to}`, csv);
  }

  return (
    <ReportShell
      title="Delivery Performance"
      description="Track delivery volumes, destination hotspots, and fulfillment status."
      range={range}
      onRangeChange={setRange}
      onExportCSV={onExport}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiTile 
          label="Total Deliveries" 
          value={summary.total} 
          icon={Truck} 
          tone="info"
        />
        <KpiTile 
          label="Delivered Rate" 
          value={`${summary.deliveredRate}%`} 
          icon={CheckCircle2} 
          tone={summary.deliveredRate >= 90 ? "success" : "warning"}
          hint={`${summary.delivered} fully delivered`}
        />
        <KpiTile 
          label="Bags Delivered" 
          value={summary.bagsDelivered.toLocaleString()} 
          icon={Package} 
          tone="success"
          hint={`out of ${summary.totalBags.toLocaleString()} ordered`}
        />
        <KpiTile 
          label="Destinations" 
          value={destData.length} 
          icon={MapPin} 
          tone="default" 
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <Card className="p-5 lg:col-span-1">
          <h2 className="font-semibold mb-3">Top Destinations (by bags)</h2>
          {destData.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">No deliveries in this period.</div>
          ) : (
            <BarSeriesChart
              data={destData}
              xKey="destination"
              horizontal
              series={[
                { key: "bags", name: "Bags Delivered", color: "#0f766e" },
              ]}
            />
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="font-semibold mb-3">Monthly Delivery Trend</h2>
          {trendData.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">No deliveries in this period.</div>
          ) : (
            <BarSeriesChart
              data={trendData}
              xKey="month"
              series={[
                { key: "deliveries", name: "Deliveries", color: "#3b82f6" },
                { key: "bags", name: "Bags", color: "#10b981" },
              ]}
            />
          )}
        </Card>
      </div>

      <Card>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold">Delivery Orders</h2>
          <span className="text-xs text-slate-500">{inRangeDOs.length} order(s)</span>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>DO #</TH>
              <TH>Date</TH>
              <TH>Customer</TH>
              <TH>Destination</TH>
              <TH>Vehicle</TH>
              <TH>Status</TH>
              <TH className="!text-right">Bags</TH>
            </TR>
          </THead>
          <TBody>
            {inRangeDOs.map((doOrder) => {
              const bags = doOrder.items.reduce((s, it) => s + it.quantity, 0);
              return (
                <TR key={doOrder.id}>
                  <TD className="font-mono">
                    <Link href={`/delivery-orders/${doOrder.id}`} className="text-brand-700 font-semibold hover:underline">
                      {doOrder.doNumber}
                    </Link>
                  </TD>
                  <TD className="text-slate-600">{formatDate(doOrder.orderDate)}</TD>
                  <TD className="font-medium text-slate-900">{doOrder.customerSnapshot.name}</TD>
                  <TD className="text-slate-600">{doOrder.loadingDetails?.destination || "—"}</TD>
                  <TD className="text-slate-600 font-mono text-xs">{doOrder.loadingDetails?.truckPlate || "—"}</TD>
                  <TD>
                    <Badge variant={doOrder.status === "delivered" ? "success" : doOrder.status === "draft" ? "default" : "info"}>
                      {STATUS_LABELS[doOrder.status]}
                    </Badge>
                  </TD>
                  <TD className="text-right tabular-nums font-medium text-slate-900">{bags.toLocaleString()}</TD>
                </TR>
              );
            })}
            {inRangeDOs.length === 0 && (
              <TR><TD colSpan={7} className="text-center py-10 text-slate-500">No deliveries in this period.</TD></TR>
            )}
          </TBody>
        </Table>
      </Card>
    </ReportShell>
  );
}
