"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { dataAdapter } from "@/services";
import { Search, X, Truck, FileText, ShoppingCart, Users, Building2, Package, ArrowRight } from "lucide-react";
import type { DeliveryOrder, PurchaseOrder, Invoice, Customer, Supplier, Product } from "@/types";
import { currency } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

type SearchResult = {
  id: string;
  label: string;
  sub: string;
  href: string;
  group: "Delivery Orders" | "Purchase Orders" | "Invoices" | "Customers" | "Suppliers" | "Products";
  icon: typeof Truck;
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const canPurchase = user?.role === "admin" || user?.role === "manager" || user?.role === "warehouse";
  const canInvoice = user?.role === "admin" || user?.role === "manager" || user?.role === "sales";
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [data, setData] = useState<{
    dos: DeliveryOrder[]; pos: PurchaseOrder[]; invoices: Invoice[];
    customers: Customer[]; suppliers: Supplier[]; products: Product[];
  } | null>(null);

  // Lazy-load search data the first time the palette opens
  useEffect(() => {
    if (!open || data) return;
    Promise.all([
      dataAdapter.deliveryOrders.list(),
      canPurchase ? dataAdapter.purchaseOrders.list() : Promise.resolve([]),
      canInvoice ? dataAdapter.invoices.list() : Promise.resolve([]),
      dataAdapter.customers.list(),
      canPurchase ? dataAdapter.suppliers.list() : Promise.resolve([]),
      dataAdapter.products.list(),
    ]).then(([dos, pos, invoices, customers, suppliers, products]) =>
      setData({ dos, pos, invoices, customers, suppliers, products }),
    );
  }, [canInvoice, canPurchase, open, data]);

  // Reset + focus on open
  useEffect(() => {
    if (!open) return;
    setQ("");
    setActiveIndex(0);
    setTimeout(() => inputRef.current?.focus(), 10);
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Keyboard shortcuts inside the palette
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
      if (e.key === "Enter") {
        e.preventDefault();
        const r = results[activeIndex];
        if (r) { router.push(r.href); onClose(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex, q]);

  const results = useMemo((): SearchResult[] => {
    if (!data) return [];
    const t = q.trim().toLowerCase();
    if (!t) {
      // Show a few recents from each
      return [
        ...data.dos.slice(0, 3).map(
          (d): SearchResult => ({
            id: `do-${d.id}`, label: d.doNumber, sub: `→ ${d.customerSnapshot.name}`,
            href: `/delivery-orders/${d.id}`, group: "Delivery Orders", icon: Truck,
          }),
        ),
        ...data.invoices.slice(0, 3).map(
          (i): SearchResult => ({
            id: `inv-${i.id}`, label: i.invoiceNumber, sub: `${i.customerSnapshot.name} · ${currency(i.total)}`,
            href: `/invoices/${i.id}`, group: "Invoices", icon: FileText,
          }),
        ),
        ...data.pos.slice(0, 3).map(
          (p): SearchResult => ({
            id: `po-${p.id}`, label: p.poNumber, sub: `← ${p.supplierSnapshot.name}`,
            href: `/purchase-orders/${p.id}`, group: "Purchase Orders", icon: ShoppingCart,
          }),
        ),
      ];
    }

    const tokens = t.split(/\s+/);
    const match = (text: string) => tokens.every((tok) => text.toLowerCase().includes(tok));
    const out: SearchResult[] = [];

    data.dos.forEach((d) => {
      const hay = `${d.doNumber} ${d.customerSnapshot.name} ${d.loadingDetails.truckPlate} ${d.loadingDetails.destination} ${d.loadingDetails.driverName}`;
      if (match(hay)) out.push({
        id: `do-${d.id}`, label: d.doNumber,
        sub: `→ ${d.customerSnapshot.name} · ${d.loadingDetails.destination}`,
        href: `/delivery-orders/${d.id}`, group: "Delivery Orders", icon: Truck,
      });
    });
    data.invoices.forEach((i) => {
      const hay = `${i.invoiceNumber} ${i.customerSnapshot.name}`;
      if (match(hay)) out.push({
        id: `inv-${i.id}`, label: i.invoiceNumber,
        sub: `${i.customerSnapshot.name} · ${currency(i.total)} · ${i.status}`,
        href: `/invoices/${i.id}`, group: "Invoices", icon: FileText,
      });
    });
    data.pos.forEach((p) => {
      const hay = `${p.poNumber} ${p.supplierSnapshot.name}`;
      if (match(hay)) out.push({
        id: `po-${p.id}`, label: p.poNumber,
        sub: `← ${p.supplierSnapshot.name} · ${currency(p.total)}`,
        href: `/purchase-orders/${p.id}`, group: "Purchase Orders", icon: ShoppingCart,
      });
    });
    data.customers.forEach((c) => {
      const hay = `${c.name} ${c.code} ${c.phone} ${c.email ?? ""} ${c.city ?? ""}`;
      if (match(hay)) out.push({
        id: `c-${c.id}`, label: c.name,
        sub: `${c.code} · ${c.phone}${c.city ? ` · ${c.city}` : ""}`,
        href: `/customers`, group: "Customers", icon: Users,
      });
    });
    data.suppliers.forEach((s) => {
      const hay = `${s.name} ${s.code} ${s.phone} ${s.email ?? ""} ${s.country ?? ""}`;
      if (match(hay)) out.push({
        id: `s-${s.id}`, label: s.name,
        sub: `${s.code} · ${s.phone}${s.country ? ` · ${s.country}` : ""}`,
        href: `/suppliers`, group: "Suppliers", icon: Building2,
      });
    });
    data.products.forEach((p) => {
      const hay = `${p.name} ${p.sku} ${p.category ?? ""}`;
      if (match(hay)) out.push({
        id: `p-${p.id}`, label: p.name,
        sub: `${p.sku} · ${p.stock.toLocaleString()} ${p.unit} · ${currency(p.unitPrice)}`,
        href: `/products`, group: "Products", icon: Package,
      });
    });

    return out.slice(0, 50);
  }, [data, q]);

  // Group results
  const grouped = useMemo(() => {
    const g: Record<string, SearchResult[]> = {};
    results.forEach((r) => { (g[r.group] = g[r.group] || []).push(r); });
    return g;
  }, [results]);

  // Flat index map for keyboard navigation
  const flat = useMemo(() => Object.values(grouped).flat(), [grouped]);
  useEffect(() => { setActiveIndex(0); }, [q]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh] cmdk-overlay">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2 px-4 h-12 border-b border-slate-100">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search delivery orders, invoices, customers, products..."
            className="flex-1 outline-none text-sm bg-transparent"
          />
          <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">ESC</kbd>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {!data && (
            <div className="px-4 py-8 text-center text-sm text-slate-500">Loading search index…</div>
          )}
          {data && flat.length === 0 && q && (
            <div className="px-4 py-10 text-center text-sm text-slate-500">
              No results for <span className="font-medium text-slate-700">&ldquo;{q}&rdquo;</span>
            </div>
          )}
          {data && flat.length === 0 && !q && (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              Start typing to search across all your data…
            </div>
          )}
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="py-2">
              <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {group}
              </div>
              {items.map((r) => {
                const Icon = r.icon;
                const flatIdx = flat.indexOf(r);
                const active = flatIdx === activeIndex;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onMouseEnter={() => setActiveIndex(flatIdx)}
                    onClick={() => { router.push(r.href); onClose(); }}
                    className={`w-full text-left px-4 py-2 flex items-center gap-3 ${active ? "bg-brand-50" : "hover:bg-slate-50"}`}
                  >
                    <Icon className={`h-4 w-4 ${active ? "text-brand-700" : "text-slate-400"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{r.label}</div>
                      <div className="text-xs text-slate-500 truncate">{r.sub}</div>
                    </div>
                    {active && <ArrowRight className="h-4 w-4 text-brand-700" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <span><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono">⏎</kbd> open</span>
            <span><kbd className="font-mono">ESC</kbd> close</span>
          </div>
          {data && q && <span>{flat.length} result{flat.length === 1 ? "" : "s"}</span>}
        </div>
      </div>
    </div>
  );
}
