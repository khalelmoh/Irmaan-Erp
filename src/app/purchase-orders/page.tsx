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
import { Plus, Search, Eye, ShoppingCart, CheckCircle, Truck, AlertCircle, type LucideIcon } from "lucide-react";
import { currency, formatDate } from "@/lib/utils";
import { PO_STATUS_VARIANT, PO_STATUS_LABEL, poOutstanding, receiveProgress } from "@/lib/purchase-order";
import { useCursorPaginatedList } from "@/hooks/useCursorPaginatedList";
import { useToast } from "@/contexts/ToastContext";
import { errorMessage } from "@/lib/retry";
import type { PurchaseOrder, POStatus } from "@/types";

export default function POListPage() {
  const toast = useToast();
  const [status, setStatus] = useState<"all" | POStatus | "pending_receipt">("all");

  const loadPage = useCallback(
    (options: Parameters<typeof dataAdapter.purchaseOrders.listPage>[0]) =>
      dataAdapter.purchaseOrders.listPage({ ...options, status }),
    [status],
  );

  const {
    page, q, setQ, pageIndex, pageCount, pageSize, setPageSize,
    next, prev, start, end, total, hasMore, loading, error,
  } = useCursorPaginatedList<PurchaseOrder>({
    loadPage,
    resetKeys: [status],
    pageSize: 25,
  });

  useEffect(() => {
    if (error) toast.error("Couldn't load purchase orders", errorMessage(error));
  }, [error, toast]);

  const stats = useMemo(() => {
    const totalOrdered = page.reduce((s, p) => s + (p.status === "cancelled" ? 0 : p.total), 0);
    const receivedOrders = page.filter((p) => p.status === "received").length;
    const pendingReceipts = page.filter((p) => p.status === "sent" || p.status === "partial_received").length;
    const draft = page.filter((p) => p.status === "draft").length;
    return { totalOrdered, receivedOrders, pendingReceipts, draft };
  }, [page]);

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        description="Order goods from your suppliers and track receiving."
        actions={
          <Button asChild>
            <Link href="/purchase-orders/new"><Plus className="h-4 w-4" /> New P.O</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi label="Total Ordered" value={currency(stats.totalOrdered)} icon={ShoppingCart} color="text-brand-700 bg-brand-50" />
        <Kpi label="Received Orders" value={stats.receivedOrders} icon={CheckCircle} color="text-emerald-700 bg-emerald-50" />
        <Kpi label="Pending Delivery" value={stats.pendingReceipts} icon={Truck} color="text-amber-700 bg-amber-50" active={status === "pending_receipt"} onClick={() => setStatus(status === "pending_receipt" ? "all" : "pending_receipt" as never)} />
        <Kpi label="Draft POs" value={stats.draft} icon={AlertCircle} color="text-slate-700 bg-slate-100" active={status === "draft"} onClick={() => setStatus(status === "draft" ? "all" : "draft")} />
      </div>

      <Card>
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exact P.O#..." className="pl-9" />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value as never)} className="max-w-[180px]">
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="partial_received">Partially received</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>

        <Table>
          <THead>
            <TR>
              <TH>P.O #</TH>
              <TH>Order date</TH>
              <TH>Expected</TH>
              <TH>Supplier</TH>
              <TH>Receiving</TH>
              <TH className="!text-right">Total</TH>
              <TH className="!text-right">Outstanding</TH>
              <TH>Status</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {page.map((p) => {
              const prog = receiveProgress(p);
              return (
                <TR key={p.id}>
                  <TD className="font-mono">
                    <Link href={`/purchase-orders/${p.id}`} className="text-brand-700 font-semibold hover:underline">{p.poNumber}</Link>
                  </TD>
                  <TD className="text-slate-600">{formatDate(p.orderDate)}</TD>
                  <TD className="text-slate-600">{p.expectedDelivery ? formatDate(p.expectedDelivery) : "—"}</TD>
                  <TD className="font-medium text-slate-900">{p.supplierSnapshot.name}</TD>
                  <TD>
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${prog.pct}%` }} />
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium tabular-nums">{prog.pct}%</span>
                    </div>
                  </TD>
                  <TD className="text-right tabular-nums font-medium">{currency(p.total)}</TD>
                  <TD className={`text-right tabular-nums ${poOutstanding(p) > 0 ? "text-red-700 font-medium" : "text-emerald-700"}`}>
                    {currency(poOutstanding(p))}
                  </TD>
                  <TD><Badge variant={PO_STATUS_VARIANT[p.status]}>{PO_STATUS_LABEL[p.status]}</Badge></TD>
                  <TD>
                    <Button asChild variant="ghost" size="icon"><Link href={`/purchase-orders/${p.id}`}><Eye className="h-4 w-4" /></Link></Button>
                  </TD>
                </TR>
              );
            })}
            {page.length === 0 && (
              <TR><TD colSpan={9} className="text-center py-10 text-slate-500">
                {loading ? "Loading purchase orders…" : "No purchase orders match your filters."}
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

function Kpi({ label, value, icon: Icon, color, active, onClick }: { label: string; value: string | number; icon: LucideIcon; color: string; active?: boolean; onClick?: () => void }) {
  return (
    <Card
      className={[
        onClick ? "cursor-pointer select-none transition-shadow hover:shadow-md" : "",
        active ? "ring-2 ring-brand-500 ring-offset-2" : "",
      ].join(" ")}
      onClick={onClick}
    >
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
