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
import { Wallet, AlertCircle, Calendar } from "lucide-react";
import { currency, formatDate } from "@/lib/utils";
import { arAging } from "@/lib/reports";
import { outstanding, effectiveStatus, STATUS_VARIANT } from "@/lib/invoice";
import { downloadCSV, toCSV } from "@/lib/csv";
import type { Invoice } from "@/types";

const BUCKET_COLORS = ["#10b981", "#f59e0b", "#f97316", "#ef4444", "#7f1d1d"];

export default function ReceivablesReportPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  useEffect(() => { dataAdapter.invoices.list().then(setInvoices); }, []);

  const buckets = useMemo(() => arAging(invoices), [invoices]);
  const totalAR = buckets.reduce((s, b) => s + b.total, 0);
  const overdueTotal = buckets.slice(1).reduce((s, b) => s + b.total, 0);
  const allOpen = useMemo(() => buckets.flatMap((b) => b.invoices.map((i) => ({ inv: i, bucket: b.label }))), [buckets]);

  function onExport() {
    const csv = toCSV(
      allOpen.map(({ inv, bucket }) => ({
        invoice: inv.invoiceNumber,
        customer: inv.customerSnapshot.name,
        issueDate: formatDate(inv.issueDate),
        dueDate: formatDate(inv.dueDate),
        bucket,
        total: inv.total,
        paid: inv.amountPaid,
        outstanding: outstanding(inv),
      })),
      [
        { key: "invoice", label: "Invoice #" },
        { key: "customer", label: "Customer" },
        { key: "issueDate", label: "Issue date" },
        { key: "dueDate", label: "Due date" },
        { key: "bucket", label: "Aging bucket" },
        { key: "total", label: "Total", format: (v) => Number(v).toFixed(2) },
        { key: "paid", label: "Paid", format: (v) => Number(v).toFixed(2) },
        { key: "outstanding", label: "Outstanding", format: (v) => Number(v).toFixed(2) },
      ],
    );
    downloadCSV("ar-aging", csv);
  }

  const donut = buckets
    .filter((b) => b.total > 0)
    .map((b, i) => ({ name: b.label, value: b.total, color: BUCKET_COLORS[i] }));

  return (
    <ReportShell
      title="Accounts Receivable — Aging"
      description="Open invoices grouped by how overdue they are. Aim to keep the right side of the table empty."
      onExportCSV={onExport}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiTile label="Total outstanding" value={currency(totalAR)} icon={Wallet} tone="warning" />
        <KpiTile label="Overdue" value={currency(overdueTotal)} icon={AlertCircle} tone="danger"
          hint={`${buckets.slice(1).reduce((s, b) => s + b.invoices.length, 0)} invoice(s)`} />
        <KpiTile label="Not yet due" value={currency(buckets[0].total)} icon={Calendar} tone="success"
          hint={`${buckets[0].invoices.length} invoice(s)`} />
        <KpiTile label="90+ days" value={currency(buckets[4].total)} icon={AlertCircle} tone="danger"
          hint={`${buckets[4].invoices.length} invoice(s)`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <Card className="p-5 lg:col-span-1">
          <h2 className="font-semibold mb-3">Distribution</h2>
          {donut.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">No outstanding receivables 🎉</div>
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
                <TH className="!text-right">Invoices</TH>
                <TH className="!text-right">Total outstanding</TH>
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
                  <TD className="text-right tabular-nums">{b.invoices.length}</TD>
                  <TD className="text-right tabular-nums font-medium">{currency(b.total)}</TD>
                  <TD className="text-right tabular-nums text-slate-500">
                    {totalAR > 0 ? ((b.total / totalAR) * 100).toFixed(1) : "0"}%
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>

      <Card>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold">All open invoices</h2>
          <span className="text-xs text-slate-500">{allOpen.length} invoice(s)</span>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Invoice #</TH>
              <TH>Customer</TH>
              <TH>Due date</TH>
              <TH>Bucket</TH>
              <TH>Status</TH>
              <TH className="!text-right">Outstanding</TH>
            </TR>
          </THead>
          <TBody>
            {allOpen
              .sort((a, b) => outstanding(b.inv) - outstanding(a.inv))
              .map(({ inv, bucket }) => {
                const st = effectiveStatus(inv);
                return (
                  <TR key={inv.id}>
                    <TD className="font-mono">
                      <Link href={`/invoices/${inv.id}`} className="text-brand-700 font-semibold hover:underline">
                        {inv.invoiceNumber}
                      </Link>
                    </TD>
                    <TD className="font-medium text-slate-900">{inv.customerSnapshot.name}</TD>
                    <TD className="text-slate-600">{formatDate(inv.dueDate)}</TD>
                    <TD className="text-slate-600">{bucket}</TD>
                    <TD><Badge variant={STATUS_VARIANT[st]}>{st}</Badge></TD>
                    <TD className="text-right tabular-nums font-medium text-amber-700">{currency(outstanding(inv))}</TD>
                  </TR>
                );
              })}
            {allOpen.length === 0 && (
              <TR><TD colSpan={6} className="text-center py-10 text-slate-500">No outstanding invoices.</TD></TR>
            )}
          </TBody>
        </Table>
      </Card>
    </ReportShell>
  );
}
