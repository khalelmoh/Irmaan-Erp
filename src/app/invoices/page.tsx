"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { dataAdapter } from "@/services";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import { Plus, Search, Eye, FileText, DollarSign, AlertCircle } from "lucide-react";
import { currency, formatDate } from "@/lib/utils";
import type { Invoice, InvoiceStatus } from "@/types";
import { STATUS_VARIANT, outstanding, effectiveStatus } from "@/lib/invoice";
import { useCursorPaginatedList } from "@/hooks/useCursorPaginatedList";
import { useToast } from "@/contexts/ToastContext";
import { errorMessage } from "@/lib/retry";

export default function InvoiceListPage() {
  const toast = useToast();
  const [status, setStatus] = useState<"all" | InvoiceStatus>("all");

  const loadPage = useCallback(
    (options: Parameters<typeof dataAdapter.invoices.listPage>[0]) =>
      dataAdapter.invoices.listPage({ ...options, status }),
    [status],
  );

  const {
    page, q, setQ, pageIndex, pageCount, pageSize, setPageSize,
    next, prev, start, end, total, hasMore, loading, error,
  } = useCursorPaginatedList<Invoice>({
    loadPage,
    resetKeys: [status],
    pageSize: 25,
  });

  useEffect(() => {
    if (error) toast.error("Couldn't load invoices", errorMessage(error));
  }, [error, toast]);

  const displayPage = useMemo(
    () => page.map((i) => ({ ...i, status: effectiveStatus(i) })),
    [page],
  );

  const totals = useMemo(() => {
    const totalBilled = page.reduce((s, i) => s + (i.status === "cancelled" ? 0 : i.total), 0);
    const totalPaid = page.reduce((s, i) => s + i.amountPaid, 0);
    const totalOutstanding = page.reduce(
      (s, i) => s + (i.status === "cancelled" || i.status === "draft" ? 0 : outstanding(i)), 0,
    );
    const overdue = page.filter((i) => effectiveStatus(i) === "overdue").length;
    return { totalBilled, totalPaid, totalOutstanding, overdue };
  }, [page]);

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Bill customers and track payments."
        actions={
          <Button asChild>
            <Link href="/invoices/new"><Plus className="h-4 w-4" /> New invoice</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi label="Total Billed" value={currency(totals.totalBilled)} icon={FileText} color="text-brand-700 bg-brand-50" />
        <Kpi label="Total Collected" value={currency(totals.totalPaid)} icon={DollarSign} color="text-emerald-700 bg-emerald-50" />
        <Kpi label="Outstanding Balance" value={currency(totals.totalOutstanding)} icon={DollarSign} color="text-amber-700 bg-amber-50" />
        <Kpi label="Overdue Invoices" value={totals.overdue} icon={AlertCircle} color="text-red-700 bg-red-50" />
      </div>

      <Card>
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exact invoice #..." className="pl-9" />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value as never)} className="max-w-[160px]">
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>

        <Table>
          <THead>
            <TR>
              <TH>Invoice #</TH>
              <TH>Issue date</TH>
              <TH>Due date</TH>
              <TH>Customer</TH>
              <TH className="!text-right">Total</TH>
              <TH className="!text-right">Outstanding</TH>
              <TH>Status</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {displayPage.map((i) => {
              const out = outstanding(i);
              const overdueSoon = i.status !== "paid" && i.status !== "cancelled" && new Date(i.dueDate).getTime() - Date.now() < 7 * 86400000;
              return (
                <TR key={i.id}>
                  <TD className="font-mono">
                    <Link href={`/invoices/${i.id}`} className="text-brand-700 font-semibold hover:underline">{i.invoiceNumber}</Link>
                  </TD>
                  <TD className="text-slate-600">{formatDate(i.issueDate)}</TD>
                  <TD className={overdueSoon ? "text-red-600 font-medium" : "text-slate-600"}>{formatDate(i.dueDate)}</TD>
                  <TD className="font-medium text-slate-900">{i.customerSnapshot.name}</TD>
                  <TD className="text-right tabular-nums font-medium">{currency(i.total)}</TD>
                  <TD className={`text-right tabular-nums ${out > 0 ? "text-amber-700 font-medium" : "text-emerald-700"}`}>
                    {currency(out)}
                  </TD>
                  <TD><Badge variant={STATUS_VARIANT[i.status]}>{i.status}</Badge></TD>
                  <TD>
                    <Button asChild variant="ghost" size="icon"><Link href={`/invoices/${i.id}`}><Eye className="h-4 w-4" /></Link></Button>
                  </TD>
                </TR>
              );
            })}
            {page.length === 0 && (
              <TR><TD colSpan={8} className="text-center py-10 text-slate-500">
                {loading ? "Loading invoices…" : "No invoices match your filters."}
              </TD></TR>
            )}
          </TBody>
        </Table>

        <Pagination
          pageIndex={pageIndex} pageCount={pageCount}
          pageSize={pageSize} setPageSize={setPageSize}
          start={start} end={end} total={total}
          hasMore={hasMore}
          onPrev={prev} onNext={next}
        />
      </Card>
    </>
  );
}

function Kpi({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: typeof DollarSign; color: string }) {
  return (
    <Card>
      <div className="p-5 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
          <div className="text-2xl font-semibold mt-1 text-slate-900">{value}</div>
        </div>
        <div className={`h-11 w-11 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}
