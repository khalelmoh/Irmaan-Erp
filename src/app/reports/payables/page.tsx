"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { dataAdapter } from "@/services";
import { ReportShell } from "@/components/reports/ReportShell";
import { KpiTile } from "@/components/reports/KpiTile";
import { DonutChart } from "@/components/reports/charts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CreditCard, AlertCircle, Calendar } from "lucide-react";
import { currency, formatDate } from "@/lib/utils";
import { apAging } from "@/lib/reports";
import { PO_STATUS_VARIANT, PO_STATUS_LABEL, poOutstanding } from "@/lib/purchase-order";
import { downloadCSV, toCSV } from "@/lib/csv";
import type { PurchaseOrder } from "@/types";

const BUCKET_COLORS = ["#10b981", "#f59e0b", "#f97316", "#dc2626"];

export default function PayablesReportPage() {
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  useEffect(() => { dataAdapter.purchaseOrders.list().then(setPos); }, []);

  const buckets = useMemo(() => apAging(pos), [pos]);
  const totalAP = buckets.reduce((s, b) => s + b.total, 0);
  const overdueTotal = buckets.slice(1).reduce((s, b) => s + b.total, 0);
  const allOpen = useMemo(() => buckets.flatMap((b) => b.pos.map((p) => ({ po: p, bucket: b.label }))), [buckets]);

  function onExport() {
    const csv = toCSV(
      allOpen.map(({ po, bucket }) => ({
        po: po.poNumber,
        supplier: po.supplierSnapshot.name,
        orderDate: formatDate(po.orderDate),
        expectedDelivery: po.expectedDelivery ? formatDate(po.expectedDelivery) : "—",
        bucket,
        total: po.total,
        paid: po.amountPaid,
        outstanding: poOutstanding(po),
      })),
      [
        { key: "po", label: "P.O #" },
        { key: "supplier", label: "Supplier" },
        { key: "orderDate", label: "Order date" },
        { key: "expectedDelivery", label: "Expected delivery" },
        { key: "bucket", label: "Aging bucket" },
        { key: "total", label: "Total", format: (v) => Number(v).toFixed(2) },
        { key: "paid", label: "Paid", format: (v) => Number(v).toFixed(2) },
        { key: "outstanding", label: "Outstanding", format: (v) => Number(v).toFixed(2) },
      ],
    );
    downloadCSV("ap-aging", csv);
  }

  const donut = buckets
    .filter((b) => b.total > 0)
    .map((b, i) => ({ name: b.label, value: b.total, color: BUCKET_COLORS[i] }));

  return (
    <ReportShell
      title="Accounts Payable — Aging"
      description="Open purchase orders grouped by how long the balance has been owed."
      onExportCSV={onExport}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiTile label="Total owed" value={currency(totalAP)} icon={CreditCard} tone="danger" />
        <KpiTile label="Overdue" value={currency(overdueTotal)} icon={AlertCircle} tone="danger"
          hint={`${buckets.slice(1).reduce((s, b) => s + b.pos.length, 0)} PO(s)`} />
        <KpiTile label="Current (<30d)" value={currency(buckets[0].total)} icon={Calendar} tone="success"
          hint={`${buckets[0].pos.length} PO(s)`} />
        <KpiTile label="90+ days" value={currency(buckets[3].total)} icon={AlertCircle} tone="danger"
          hint={`${buckets[3].pos.length} PO(s)`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <Card className="p-5 lg:col-span-1">
          <h2 className="font-semibold mb-3">Distribution</h2>
          {donut.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">No outstanding payables 🎉</div>
          ) : (
            <DonutChart data={donut} />
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="p-5 border-b border-slate-100">
            <h2 className="font-semibold">Aging buckets</h2>
          </div>
          <Table>
            <THead>
              <TR>
                <TH>Bucket</TH>
                <TH className="!text-right">POs</TH>
                <TH className="!text-right">Total owed</TH>
                <TH className="!text-right">% of total</TH>
              </TR>
            </THead>
            <TBody>
              {buckets.map((b, i) => (
                <TR key={b.label}>
                  <TD className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: BUCKET_COLORS[i] }} />
                      {b.label}
                    </span>
                  </TD>
                  <TD className="text-right tabular-nums">{b.pos.length}</TD>
                  <TD className="text-right tabular-nums font-medium">{currency(b.total)}</TD>
                  <TD className="text-right tabular-nums text-slate-500">
                    {totalAP > 0 ? ((b.total / totalAP) * 100).toFixed(1) : "0"}%
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>

      <Card>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold">All open purchase orders</h2>
          <span className="text-xs text-slate-500">{allOpen.length} PO(s)</span>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>P.O #</TH>
              <TH>Supplier</TH>
              <TH>Expected delivery</TH>
              <TH>Bucket</TH>
              <TH>Status</TH>
              <TH className="!text-right">Outstanding</TH>
            </TR>
          </THead>
          <TBody>
            {allOpen
              .sort((a, b) => poOutstanding(b.po) - poOutstanding(a.po))
              .map(({ po, bucket }) => (
                <TR key={po.id}>
                  <TD className="font-mono">
                    <Link href={`/purchase-orders/${po.id}`} className="text-brand-700 font-semibold hover:underline">
                      {po.poNumber}
                    </Link>
                  </TD>
                  <TD className="font-medium text-slate-900">{po.supplierSnapshot.name}</TD>
                  <TD className="text-slate-600">{po.expectedDelivery ? formatDate(po.expectedDelivery) : "—"}</TD>
                  <TD className="text-slate-600">{bucket}</TD>
                  <TD><Badge variant={PO_STATUS_VARIANT[po.status]}>{PO_STATUS_LABEL[po.status]}</Badge></TD>
                  <TD className="text-right tabular-nums font-medium text-red-700">{currency(poOutstanding(po))}</TD>
                </TR>
              ))}
            {allOpen.length === 0 && (
              <TR><TD colSpan={6} className="text-center py-10 text-slate-500">No outstanding payables.</TD></TR>
            )}
          </TBody>
        </Table>
      </Card>
    </ReportShell>
  );
}
