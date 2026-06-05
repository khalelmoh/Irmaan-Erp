"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { dataAdapter } from "@/services";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ArrowDown, ArrowUp, Download, History, Search } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { MOVEMENT_LABEL, MOVEMENT_VARIANT } from "@/lib/stock";
import { downloadCSV, toCSV } from "@/lib/csv";
import type { StockMovement, Product, StockMovementKind } from "@/types";

const KINDS: { value: "all" | StockMovementKind; label: string }[] = [
  { value: "all", label: "All movement types" },
  { value: "po_receipt", label: "PO Receipt (in)" },
  { value: "do_issue", label: "DO Issue (out)" },
  { value: "adjustment_in", label: "Adjustment + (in)" },
  { value: "adjustment_out", label: "Adjustment − (out)" },
  { value: "do_cancel", label: "DO Cancel (return)" },
  { value: "po_receipt_reverse", label: "PO Reversal" },
  { value: "opening_balance", label: "Opening balance" },
];

export default function StockMovementsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}>
      <StockMovementsInner />
    </Suspense>
  );
}

function StockMovementsInner() {
  const search = useSearchParams();
  const initialProduct = search.get("product") ?? "all";

  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productFilter, setProductFilter] = useState<string>(initialProduct);
  const [kindFilter, setKindFilter] = useState<"all" | StockMovementKind>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    Promise.all([
      dataAdapter.stockMovements.list(),
      dataAdapter.products.list(),
    ]).then(([m, p]) => { setMovements(m); setProducts(p); });
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return movements.filter((m) => {
      if (productFilter !== "all" && m.productId !== productFilter) return false;
      if (kindFilter !== "all" && m.kind !== kindFilter) return false;
      if (!t) return true;
      return [m.productName, m.sourceNumber, m.reason].filter(Boolean).join(" ").toLowerCase().includes(t);
    });
  }, [movements, productFilter, kindFilter, q]);

  // Summary numbers for the filtered slice
  const summary = useMemo(() => {
    const totalIn = filtered.filter((m) => m.qty > 0).reduce((s, m) => s + m.qty, 0);
    const totalOut = filtered.filter((m) => m.qty < 0).reduce((s, m) => s + Math.abs(m.qty), 0);
    return { totalIn, totalOut, count: filtered.length };
  }, [filtered]);

  function onExport() {
    const csv = toCSV(filtered as any[], [
      { key: "at", label: "Date", format: (v) => formatDateTime(String(v)) },
      { key: "productName", label: "Product" },
      { key: "unit", label: "Unit" },
      { key: "kind", label: "Type", format: (v) => MOVEMENT_LABEL[v as StockMovementKind] },
      { key: "qty", label: "Qty change", format: (v) => Number(v).toFixed(2) },
      { key: "balanceAfter", label: "Stock after", format: (v) => Number(v).toFixed(2) },
      { key: "sourceNumber", label: "Source #" },
      { key: "reason", label: "Reason / notes" },
      { key: "recordedBy", label: "Recorded by" },
    ]);
    downloadCSV(`stock-movements-${new Date().toISOString().slice(0, 10)}`, csv);
  }

  function sourceLink(m: StockMovement): { href?: string; label: string } {
    if (m.sourceType === "purchase_order" && m.sourceId)
      return { href: `/purchase-orders/${m.sourceId}`, label: m.sourceNumber ?? "PO" };
    if (m.sourceType === "delivery_order" && m.sourceId)
      return { href: `/delivery-orders/${m.sourceId}`, label: m.sourceNumber ?? "DO" };
    if (m.sourceType === "adjustment")
      return { label: "Manual" };
    return { label: "—" };
  }

  return (
    <>
      <PageHeader
        title="Stock Movements"
        description="Every change to your inventory, with source link. Use this to audit how stock numbers got where they are."
        actions={
          <Button variant="outline" onClick={onExport}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <ArrowUp className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Stock in</div>
              <div className="text-xl font-semibold tabular-nums text-emerald-700">
                +{summary.totalIn.toLocaleString()}
              </div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center">
              <ArrowDown className="h-5 w-5 text-red-700" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Stock out</div>
              <div className="text-xl font-semibold tabular-nums text-red-700">
                −{summary.totalOut.toLocaleString()}
              </div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
              <History className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Movements</div>
              <div className="text-xl font-semibold tabular-nums text-slate-900">{summary.count}</div>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-2 md:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product, source #, reason..." className="pl-9" />
          </div>
          <Select value={productFilter} onChange={(e) => setProductFilter(e.target.value)} className="max-w-[220px]">
            <option value="all">All products</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as never)} className="max-w-[220px]">
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </Select>
        </div>

        <Table>
          <THead>
            <TR>
              <TH>Date / time</TH>
              <TH>Product</TH>
              <TH>Type</TH>
              <TH className="!text-right">Qty</TH>
              <TH className="!text-right">Stock after</TH>
              <TH>Source</TH>
              <TH>Reason / notes</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((m) => {
              const src = sourceLink(m);
              const positive = m.qty > 0;
              return (
                <TR key={m.id}>
                  <TD className="text-slate-600 text-xs">{formatDateTime(m.at)}</TD>
                  <TD className="font-medium text-slate-900">
                    {m.productName}
                    <span className="text-xs text-slate-500 ml-1">({m.unit})</span>
                  </TD>
                  <TD><Badge variant={MOVEMENT_VARIANT[m.kind]}>{MOVEMENT_LABEL[m.kind]}</Badge></TD>
                  <TD className={`text-right tabular-nums font-semibold ${positive ? "text-emerald-700" : "text-red-700"}`}>
                    {positive ? "+" : ""}{m.qty.toLocaleString()}
                  </TD>
                  <TD className="text-right tabular-nums text-slate-700">{m.balanceAfter.toLocaleString()}</TD>
                  <TD>
                    {src.href ? (
                      <Link href={src.href} className="font-mono text-xs text-brand-700 hover:underline">
                        {src.label}
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-500">{src.label}</span>
                    )}
                  </TD>
                  <TD className="text-xs text-slate-600 max-w-[260px] truncate" title={m.reason}>
                    {m.reason || "—"}
                  </TD>
                </TR>
              );
            })}
            {filtered.length === 0 && (
              <TR><TD colSpan={7} className="text-center py-10 text-slate-500">No movements match your filters.</TD></TR>
            )}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
