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
import { Plus, Search, Eye, DollarSign, Target, FileText, CheckCircle2 } from "lucide-react";
import { currency, formatDate } from "@/lib/utils";
import { SO_STATUS_VARIANT, SO_STATUS_LABEL, deliveryProgress, invoiceProgress } from "@/lib/sales-order";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { useToast } from "@/contexts/ToastContext";
import { withRetry, errorMessage } from "@/lib/retry";
import type { SalesOrder, SOStatus } from "@/types";

export default function SOListPage() {
  const toast = useToast();
  const [list, setList] = useState<SalesOrder[]>([]);
  const [status, setStatus] = useState<"all" | SOStatus>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    withRetry(() => dataAdapter.salesOrders.list())
      .then((d) => { setList(d); setLoading(false); })
      .catch((err) => { toast.error("Couldn't load sales orders", errorMessage(err)); setLoading(false); });
  }, [toast]);

  const filterFn = useCallback(
    (s: SalesOrder) => status === "all" || s.status === status,
    [status],
  );

  const {
    page, q, setQ, pageIndex, pageCount, pageSize, setPageSize,
    next, prev, start, end, total,
  } = usePaginatedList(list, {
    searchableFields: (s) => [s.soNumber, s.customerSnapshot.name, s.salespersonName, s.notes ?? ""],
    filterFn,
    pageSize: 25,
  });

  const stats = useMemo(() => {
    const totalSales = list.reduce((s, p) => s + (p.status === "cancelled" || p.status === "quotation" ? 0 : p.total), 0);
    const quotations = list.filter((p) => p.status === "quotation").length;
    const pendingDelivery = list.filter((p) => p.status === "confirmed").length;
    const fullyDelivered = list.filter((p) => p.status === "fully_delivered").length;
    return { totalSales, quotations, pendingDelivery, fullyDelivered };
  }, [list]);

  return (
    <>
      <PageHeader
        title="Sales Orders"
        description="Manage customer quotations, sales orders, and track fulfillment."
        actions={
          <Button asChild>
            <Link href="/sales-orders/new"><Plus className="h-4 w-4" /> New S.O</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi label="Total Confirmed Sales" value={currency(stats.totalSales)} icon={DollarSign} color="text-brand-700 bg-brand-50" />
        <Kpi label="Quotations" value={stats.quotations} icon={FileText} color="text-slate-700 bg-slate-100" />
        <Kpi label="Pending Delivery" value={stats.pendingDelivery} icon={Target} color="text-amber-700 bg-amber-50" />
        <Kpi label="Fully Delivered" value={stats.fullyDelivered} icon={CheckCircle2} color="text-emerald-700 bg-emerald-50" />
      </div>

      <Card>
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search S.O#, customer, salesperson..." className="pl-9" />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value as never)} className="max-w-[180px]">
            <option value="all">All statuses</option>
            <option value="quotation">Quotation</option>
            <option value="confirmed">Confirmed</option>
            <option value="fully_delivered">Fully Delivered</option>
            <option value="invoiced">Invoiced</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>

        <Table>
          <THead>
            <TR>
              <TH>S.O #</TH>
              <TH>Date</TH>
              <TH>Customer</TH>
              <TH>Salesperson</TH>
              <TH>Delivery</TH>
              <TH>Invoice</TH>
              <TH className="!text-right">Total</TH>
              <TH>Status</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {page.map((p) => {
              const delProg = deliveryProgress(p);
              const invProg = invoiceProgress(p);
              return (
                <TR key={p.id}>
                  <TD className="font-mono">
                    <Link href={`/sales-orders/${p.id}`} className="text-brand-700 font-semibold hover:underline">{p.soNumber}</Link>
                  </TD>
                  <TD className="text-slate-600">{formatDate(p.orderDate)}</TD>
                  <TD className="font-medium text-slate-900">{p.customerSnapshot.name}</TD>
                  <TD className="text-slate-600">{p.salespersonName}</TD>
                  <TD>
                    <div className="flex items-center gap-2 min-w-[80px]">
                      <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${delProg.pct}%` }} />
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium tabular-nums">{delProg.pct}%</span>
                    </div>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2 min-w-[80px]">
                      <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500" style={{ width: `${invProg.pct}%` }} />
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium tabular-nums">{invProg.pct}%</span>
                    </div>
                  </TD>
                  <TD className="text-right tabular-nums font-medium">{currency(p.total)}</TD>
                  <TD><Badge variant={SO_STATUS_VARIANT[p.status]}>{SO_STATUS_LABEL[p.status]}</Badge></TD>
                  <TD>
                    <Button asChild variant="ghost" size="icon"><Link href={`/sales-orders/${p.id}`}><Eye className="h-4 w-4" /></Link></Button>
                  </TD>
                </TR>
              );
            })}
            {page.length === 0 && (
              <TR><TD colSpan={9} className="text-center py-10 text-slate-500">
                {loading ? "Loading sales orders…" : "No sales orders match your filters."}
              </TD></TR>
            )}
          </TBody>
        </Table>

        <Pagination
          pageIndex={pageIndex} pageCount={pageCount}
          pageSize={pageSize} setPageSize={setPageSize}
          start={start} end={end} total={total}
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
