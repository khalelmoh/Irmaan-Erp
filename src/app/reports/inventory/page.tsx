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
import { Boxes, DollarSign, AlertCircle, TrendingUp } from "lucide-react";
import { currency } from "@/lib/utils";
import { inventoryValuation, inventoryTotals } from "@/lib/reports";
import { downloadCSV, toCSV } from "@/lib/csv";
import type { Product } from "@/types";

export default function InventoryReportPage() {
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => { dataAdapter.products.list().then(setProducts); }, []);

  const rows = useMemo(() => inventoryValuation(products), [products]);
  const totals = useMemo(() => inventoryTotals(products), [products]);

  const topByValue = [...rows].sort((a, b) => b.costValue - a.costValue).slice(0, 8);

  function onExport() {
    const csv = toCSV(rows, [
      { key: "sku", label: "SKU" },
      { key: "name", label: "Name" },
      { key: "category", label: "Category" },
      { key: "unit", label: "Unit" },
      { key: "stock", label: "Stock" },
      { key: "cost", label: "Unit cost", format: (v) => (v == null ? "" : Number(v).toFixed(2)) },
      { key: "unitPrice", label: "Unit price", format: (v) => Number(v).toFixed(2) },
      { key: "costValue", label: "Stock value (cost)", format: (v) => Number(v).toFixed(2) },
      { key: "retailValue", label: "Stock value (retail)", format: (v) => Number(v).toFixed(2) },
      { key: "potentialMargin", label: "Potential margin", format: (v) => Number(v).toFixed(2) },
      { key: "reorderLevel", label: "Reorder level" },
    ]);
    downloadCSV("inventory-valuation", csv);
  }

  const lowStock = rows.filter((p) => p.reorderLevel != null && p.stock <= p.reorderLevel);

  return (
    <ReportShell
      title="Inventory Report"
      description="Stock-on-hand valued at cost (asset value) and retail (sales potential)."
      onExportCSV={onExport}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiTile label="Stock value (cost)" value={currency(totals.totalCost)} icon={DollarSign} tone="default"
          hint={`${totals.skuCount} SKUs · ${totals.totalUnits.toLocaleString()} units`} />
        <KpiTile label="Stock value (retail)" value={currency(totals.totalRetail)} icon={TrendingUp} tone="success" />
        <KpiTile label="Potential margin" value={currency(totals.potentialMargin)} icon={DollarSign} tone="info"
          hint={totals.totalRetail > 0 ? `${((totals.potentialMargin / totals.totalRetail) * 100).toFixed(1)}% gross` : ""} />
        <KpiTile label="Low stock items" value={totals.lowStock} icon={AlertCircle}
          tone={totals.lowStock > 0 ? "danger" : "success"} />
      </div>

      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Boxes className="h-4 w-4 text-slate-400" /> Top SKUs by stock value
          </h2>
        </div>
        {topByValue.length === 0 ? (
          <div className="text-sm text-slate-500 py-8 text-center">No products yet.</div>
        ) : (
          <BarSeriesChart
            data={topByValue.map((p) => ({ name: p.name, cost: p.costValue, retail: p.retailValue }))}
            xKey="name"
            horizontal
            series={[
              { key: "cost", name: "At cost", color: "#1d4ed8" },
              { key: "retail", name: "At retail", color: "#10b981" },
            ]}
          />
        )}
      </Card>

      {lowStock.length > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50/40">
          <div className="p-5 border-b border-amber-200">
            <h2 className="font-semibold text-amber-900 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> Low stock — reorder needed
            </h2>
            <p className="text-xs text-amber-800 mt-0.5">
              These items are at or below their reorder level. Consider creating a Purchase Order.
            </p>
          </div>
          <Table>
            <THead>
              <TR>
                <TH>SKU</TH>
                <TH>Product</TH>
                <TH className="!text-right">Stock</TH>
                <TH className="!text-right">Reorder level</TH>
                <TH className="!text-right">Suggested reorder</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {lowStock.map((p) => {
                const suggested = Math.max((p.reorderLevel ?? 0) * 2 - p.stock, p.reorderLevel ?? 0);
                return (
                  <TR key={p.id}>
                    <TD className="font-mono text-xs text-slate-500">{p.sku}</TD>
                    <TD className="font-medium">{p.name}</TD>
                    <TD className="text-right tabular-nums text-red-700 font-medium">{p.stock.toLocaleString()} {p.unit}</TD>
                    <TD className="text-right tabular-nums">{(p.reorderLevel ?? 0).toLocaleString()}</TD>
                    <TD className="text-right tabular-nums text-emerald-700 font-medium">{suggested.toLocaleString()} {p.unit}</TD>
                    <TD>
                      <Link href="/purchase-orders/new" className="text-xs text-brand-700 hover:underline">Create P.O →</Link>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}

      <Card>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold">All inventory</h2>
          <span className="text-xs text-slate-500">{rows.length} SKU(s)</span>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>SKU</TH>
              <TH>Name</TH>
              <TH>Category</TH>
              <TH className="!text-right">Stock</TH>
              <TH className="!text-right">Unit cost</TH>
              <TH className="!text-right">At cost</TH>
              <TH className="!text-right">At retail</TH>
              <TH className="!text-right">Margin</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((p) => {
              const low = p.reorderLevel != null && p.stock <= p.reorderLevel;
              return (
                <TR key={p.id}>
                  <TD className="font-mono text-xs text-slate-500">{p.sku}</TD>
                  <TD className="font-medium text-slate-900">
                    {p.name}
                    {low && <Badge variant="danger" className="ml-2">Low</Badge>}
                  </TD>
                  <TD className="text-slate-600">{p.category || "—"}</TD>
                  <TD className="text-right tabular-nums">{p.stock.toLocaleString()} {p.unit}</TD>
                  <TD className="text-right tabular-nums">{currency(p.cost ?? 0)}</TD>
                  <TD className="text-right tabular-nums font-medium">{currency(p.costValue)}</TD>
                  <TD className="text-right tabular-nums">{currency(p.retailValue)}</TD>
                  <TD className="text-right tabular-nums text-emerald-700 font-medium">{currency(p.potentialMargin)}</TD>
                </TR>
              );
            })}
            {rows.length === 0 && (
              <TR><TD colSpan={8} className="text-center py-10 text-slate-500">No products in inventory.</TD></TR>
            )}
          </TBody>
        </Table>
      </Card>
    </ReportShell>
  );
}
