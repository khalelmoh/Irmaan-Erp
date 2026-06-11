"use client";

import { COMPANY, currency, formatDate } from "@/lib/utils";
import { Logo } from "@/components/layout/Logo";
import { QRBlock } from "./QRBlock";
import type { PurchaseOrder } from "@/types";
import { poOutstanding, PO_STATUS_LABEL } from "@/lib/purchase-order";

interface Props {
  doc: PurchaseOrder;
  verifyUrl?: string;
}

export function POPrintView({ doc, verifyUrl }: Props) {
  const out = poOutstanding(doc);
  return (
    <div className="print-page text-slate-900">
      <header className="flex items-start justify-between pb-4 border-b-2 border-brand-800">
        <div className="flex items-start gap-3">
          <Logo compact size={120} />
          <div>
            <div className="text-xl font-bold tracking-tight text-brand-900">{COMPANY.name}</div>
            <div className="text-[11px] text-slate-500">{COMPANY.tagline}</div>
            <div className="text-[11px] text-slate-600 mt-1">{COMPANY.address}</div>
            <div className="text-[11px] text-slate-600">{COMPANY.phone} · {COMPANY.email}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-slate-500">Purchase Order</div>
          <div className="text-2xl font-bold text-brand-900 mt-1">{doc.poNumber}</div>
          <div className="text-[11px] text-slate-600 mt-1">Order date: {formatDate(doc.orderDate)}</div>
          {doc.expectedDelivery && (
            <div className="text-[11px] text-slate-600">Expected: {formatDate(doc.expectedDelivery)}</div>
          )}
          <div className="text-[11px] text-slate-600">Status: <span className="uppercase font-semibold">{PO_STATUS_LABEL[doc.status]}</span></div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-6 mt-5">
        <div className="rounded border border-slate-200 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Supplier</div>
          <div className="font-semibold">{doc.supplierSnapshot.name}</div>
          <div className="text-xs text-slate-600">{doc.supplierSnapshot.address}</div>
          <div className="text-xs text-slate-600">{doc.supplierSnapshot.phone}</div>
        </div>
        <div className="rounded border border-slate-200 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Deliver To</div>
          <div className="font-semibold">{COMPANY.name}</div>
          <div className="text-xs text-slate-600">{COMPANY.address}</div>
          <div className="text-xs text-slate-600">{COMPANY.phone}</div>
        </div>
      </section>

      <section className="mt-5">
        <table className="doc-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Product</th>
              <th style={{ width: 80 }} className="!text-right">Qty</th>
              <th style={{ width: 70 }}>Unit</th>
              <th style={{ width: 100 }} className="!text-right">Unit cost</th>
              <th style={{ width: 110 }} className="!text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((it, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{it.name}</td>
                <td className="text-right tabular-nums">{it.quantity.toLocaleString()}</td>
                <td>{it.unit}</td>
                <td className="text-right tabular-nums">{currency(it.unitPrice)}</td>
                <td className="text-right tabular-nums font-medium">{currency(it.lineTotal)}</td>
              </tr>
            ))}
            {Array.from({ length: Math.max(0, 4 - doc.items.length) }).map((_, i) => (
              <tr key={`f-${i}`}><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex justify-end mt-4">
        <div className="w-72 text-sm">
          <Row label="Subtotal" value={currency(doc.subtotal)} />
          <Row label={`Tax (${(doc.taxRate * 100).toFixed(2)}%)`} value={currency(doc.taxAmount)} />
          <Row label="Total" value={currency(doc.total)} strong />
          {doc.amountPaid > 0 && (
            <>
              <Row label="Amount paid" value={`- ${currency(doc.amountPaid)}`} className="text-emerald-700" />
              <Row label="Balance owed" value={currency(out)} strong className={out > 0 ? "text-red-700" : "text-emerald-700"} />
            </>
          )}
        </div>
      </section>

      {doc.notes && (
        <section className="mt-5 text-xs">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Notes</div>
          <div className="border border-slate-200 rounded p-2 text-slate-700">{doc.notes}</div>
        </section>
      )}

      <section className="mt-8 grid grid-cols-3 gap-6 items-end">
        <SignatureBlock label="Prepared by" />
        <SignatureBlock label="Approved by" />
        {verifyUrl && (
          <div className="text-center">
            <QRBlock value={verifyUrl} size={100} className="mx-auto" />
            <div className="text-[9px] text-slate-500 mt-1">Scan to verify · {doc.poNumber}</div>
          </div>
        )}
      </section>

      <footer className="mt-8 pt-3 border-t border-slate-200 text-[10px] text-slate-500 flex justify-between">
        <div>{COMPANY.name} · {COMPANY.website}</div>
        <div>Tax ID: {COMPANY.taxId}</div>
      </footer>
    </div>
  );
}

function Row({ label, value, strong, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className={`flex justify-between py-1.5 border-b border-slate-100 ${strong ? "font-semibold text-base border-b-2 border-slate-300" : ""} ${className ?? ""}`}>
      <span className={strong ? "" : "text-slate-600"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function SignatureBlock({ label }: { label: string }) {
  return (
    <div>
      <div className="h-12 border-b border-slate-400"></div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">{label}</div>
      <div className="text-sm font-medium text-slate-800">&nbsp;</div>
    </div>
  );
}
