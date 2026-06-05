"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import { ProductForm } from "@/components/forms/ProductForm";
import { StockAdjustDialog } from "@/components/forms/StockAdjustDialog";
import { dataAdapter } from "@/services";
import { useAuth } from "@/contexts/AuthContext";
import type { Product, DeliveryOrder } from "@/types";
import { Plus, Pencil, X, Search, SlidersHorizontal, History } from "lucide-react";
import { currency } from "@/lib/utils";
import { logActivity } from "@/lib/audit";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { useToast } from "@/contexts/ToastContext";
import { withRetry, errorMessage } from "@/lib/retry";

export default function ProductsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [list, setList] = useState<Product[]>([]);
  const [openDOs, setOpenDOs] = useState<DeliveryOrder[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const [products, dos] = await Promise.all([
        withRetry(() => dataAdapter.products.list()),
        withRetry(() => dataAdapter.deliveryOrders.list()),
      ]);
      setList(products);
      setOpenDOs(dos.filter((d) => d.status === "issued"));
    } catch (err) {
      toast.error("Couldn't load products", errorMessage(err));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  /** Map of productId → quantity reserved on open DOs (issued but not delivered yet). */
  const reservedMap = useMemo(() => {
    const m: Record<string, number> = {};
    openDOs.forEach((d) => d.items.forEach((it) => {
      m[it.productId] = (m[it.productId] ?? 0) + it.quantity;
    }));
    return m;
  }, [openDOs]);

  const {
    page, q, setQ, pageIndex, pageCount, pageSize, setPageSize,
    next, prev, start, end, total,
  } = usePaginatedList(list, {
    searchableFields: (p) => [p.name, p.sku, p.category ?? "", p.description ?? ""],
    pageSize: 25,
  });

  return (
    <>
      <PageHeader
        title="Products"
        description="Inventory items, pricing and stock levels."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/inventory/movements"><History className="h-4 w-4" /> Stock movements</Link>
            </Button>
            <Button onClick={() => { setAdding(true); setEditing(null); }}>
              <Plus className="h-4 w-4" /> Add product
            </Button>
          </div>
        }
      />

      {(adding || editing) && (
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">{editing ? `Edit ${editing.name}` : "New product"}</h2>
            <Button variant="ghost" size="icon" onClick={() => { setAdding(false); setEditing(null); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ProductForm
            initial={editing ?? undefined}
            submitLabel={editing ? "Update product" : "Create product"}
            onCancel={() => { setAdding(false); setEditing(null); }}
            onSubmit={async (data) => {
              if (editing) {
                await dataAdapter.products.update(editing.id, data);
                await logActivity(user, {
                  action: "product.update",
                  entityType: "product",
                  entityId: editing.id,
                  entityLabel: data.name,
                  summary: `Updated product "${data.name}"`,
                });
              } else {
                const created = await dataAdapter.products.create({ ...data, sku: "", active: true } as never);
                await logActivity(user, {
                  action: "product.create",
                  entityType: "product",
                  entityId: created.id,
                  entityLabel: data.name,
                  summary: `Added product "${data.name}" (${data.unit}, ${currency(data.unitPrice)})`,
                });
              }
              await refresh();
              setAdding(false);
              setEditing(null);
            }}
          />
        </Card>
      )}

      <Card>
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, SKU, category..." className="pl-9" />
          </div>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>SKU</TH>
              <TH>Name</TH>
              <TH>Category</TH>
              <TH>Unit</TH>
              <TH>Price</TH>
              <TH className="!text-right">On hand</TH>
              <TH className="!text-right">Reserved</TH>
              <TH className="!text-right">Available</TH>
              <TH>Status</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {page.map((p) => {
              const reserved = reservedMap[p.id] ?? 0;
              const available = p.stock - reserved;
              const low = p.reorderLevel != null && p.stock <= p.reorderLevel;
              return (
                <TR key={p.id}>
                  <TD className="font-mono text-xs text-slate-500">{p.sku}</TD>
                  <TD className="font-medium text-slate-900">{p.name}</TD>
                  <TD>{p.category}</TD>
                  <TD>{p.unit}</TD>
                  <TD>{currency(p.unitPrice)}</TD>
                  <TD className={`text-right tabular-nums ${low ? "text-red-600 font-medium" : ""}`}>
                    {p.stock.toLocaleString()}
                    {low && <Badge variant="danger" className="ml-2">Low</Badge>}
                  </TD>
                  <TD className={`text-right tabular-nums ${reserved > 0 ? "text-amber-700" : "text-slate-400"}`}>
                    {reserved > 0 ? reserved.toLocaleString() : "—"}
                  </TD>
                  <TD className={`text-right tabular-nums font-medium ${available < 0 ? "text-red-700" : "text-emerald-700"}`}>
                    {available.toLocaleString()}
                  </TD>
                  <TD><Badge variant={p.active ? "success" : "muted"}>{p.active ? "Active" : "Inactive"}</Badge></TD>
                  <TD>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" title="Adjust stock" onClick={() => setAdjusting(p)}>
                        <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                      </Button>
                      <Button asChild variant="ghost" size="icon" title="Stock history">
                        <Link href={`/inventory/movements?product=${p.id}`}>
                          <History className="h-4 w-4 text-slate-500" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="icon" title="Edit product" onClick={() => { setEditing(p); setAdding(false); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              );
            })}
            {page.length === 0 && (
              <TR><TD colSpan={10} className="text-center py-10 text-slate-500">
                {loading ? "Loading products…" : "No products match your search."}
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

      {adjusting && (
        <StockAdjustDialog
          open={!!adjusting}
          onClose={() => setAdjusting(null)}
          product={adjusting}
          onSubmit={async (data) => {
            await dataAdapter.stockMovements.adjust(
              adjusting.id,
              data.qty,
              data.reason,
              user?.uid ?? "system",
            );
            await logActivity(user, {
              action: "stock.adjust",
              entityType: "product",
              entityId: adjusting.id,
              entityLabel: adjusting.name,
              summary: `${data.qty > 0 ? "Added" : "Removed"} ${Math.abs(data.qty).toLocaleString()} ${adjusting.unit} ${data.qty > 0 ? "to" : "from"} "${adjusting.name}" — reason: ${data.reason}`,
              metadata: { qty: data.qty, reason: data.reason },
            });
            await refresh();
          }}
        />
      )}
    </>
  );
}
