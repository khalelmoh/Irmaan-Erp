"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { dataAdapter } from "@/services";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import { Plus, Search, Eye, Printer } from "lucide-react";
import { currency, formatDate } from "@/lib/utils";
import { useCursorPaginatedList } from "@/hooks/useCursorPaginatedList";
import { useToast } from "@/contexts/ToastContext";
import { errorMessage } from "@/lib/retry";
import type { DeliveryOrder, DOStatus } from "@/types";

const statusVariant: Record<DOStatus, "muted" | "info" | "success" | "danger"> = {
  draft: "muted", issued: "info", delivered: "success", cancelled: "danger",
};

export default function DOListPage() {
  const toast = useToast();
  const [status, setStatus] = useState<"all" | DOStatus>("all");

  const loadPage = useCallback(
    (options: Parameters<typeof dataAdapter.deliveryOrders.listPage>[0]) =>
      dataAdapter.deliveryOrders.listPage({ ...options, status }),
    [status],
  );

  const {
    page, q, setQ, pageIndex, pageCount, pageSize, setPageSize,
    next, prev, start, end, total, hasMore, loading, error,
  } = useCursorPaginatedList<DeliveryOrder>({
    loadPage,
    resetKeys: [status],
    pageSize: 25,
  });

  useEffect(() => {
    if (error) toast.error("Couldn't load delivery orders", errorMessage(error));
  }, [error, toast]);

  return (
    <>
      <PageHeader
        title="Delivery Orders"
        description="All D.O documents issued by your sales team."
        actions={
          <Button asChild>
            <Link href="/delivery-orders/new"><Plus className="h-4 w-4" /> New D.O</Link>
          </Button>
        }
      />

      <Card>
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search exact DO#..."
              className="pl-9"
            />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value as never)} className="max-w-[160px]">
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>

        <Table>
          <THead>
            <TR>
              <TH>DO #</TH>
              <TH>Date</TH>
              <TH>Customer</TH>
              <TH>Items</TH>
              <TH>Value</TH>
              <TH>Truck</TH>
              <TH>Destination</TH>
              <TH>Status</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {page.map((d) => {
              const value = d.items.reduce((s, it) => s + (it.unitPrice ?? 0) * it.quantity, 0);
              return (
                <TR key={d.id}>
                  <TD className="font-mono text-sm">
                    <Link href={`/delivery-orders/${d.id}`} className="text-brand-700 font-semibold hover:underline">
                      {d.doNumber}
                    </Link>
                  </TD>
                  <TD className="text-slate-600">{formatDate(d.orderDate)}</TD>
                  <TD className="font-medium text-slate-900">{d.customerSnapshot.name}</TD>
                  <TD className="text-slate-600">{d.items.length} item(s)</TD>
                  <TD className="font-medium">{currency(value)}</TD>
                  <TD className="font-mono text-xs">{d.loadingDetails.truckPlate}</TD>
                  <TD className="uppercase text-xs">{d.loadingDetails.destination}</TD>
                  <TD><Badge variant={statusVariant[d.status]}>{d.status}</Badge></TD>
                  <TD>
                    <div className="flex items-center gap-1">
                      <Button asChild variant="ghost" size="icon"><Link href={`/delivery-orders/${d.id}`}><Eye className="h-4 w-4" /></Link></Button>
                      <Button asChild variant="ghost" size="icon"><Link href={`/delivery-orders/${d.id}?print=1`}><Printer className="h-4 w-4" /></Link></Button>
                    </div>
                  </TD>
                </TR>
              );
            })}
            {page.length === 0 && (
              <TR>
                <TD colSpan={9} className="text-center py-10 text-slate-500">
                  {loading ? "Loading delivery orders…" : "No delivery orders match your filters."}
                </TD>
              </TR>
            )}
          </TBody>
        </Table>

        <Pagination
          pageIndex={pageIndex}
          pageCount={pageCount}
          pageSize={pageSize}
          setPageSize={setPageSize}
          start={start}
          end={end}
          total={total}
          hasMore={hasMore}
          onPrev={prev}
          onNext={next}
        />
      </Card>
    </>
  );
}
