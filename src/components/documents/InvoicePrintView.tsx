"use client";

import { COMPANY, currency, formatDate } from "@/lib/utils";
import { Logo } from "@/components/layout/Logo";
import { QRBlock } from "./QRBlock";
import type { Invoice } from "@/types";
import { outstanding } from "@/lib/invoice";

interface Props {
  doc: Invoice;
  verifyUrl?: string;
}

export function InvoicePrintView({ doc, verifyUrl }: Props) {
  const out = outstanding(doc);
  return (
    <div className="print-page text-slate-900">
      {/* Header */}
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
          <div className="text-[10px] uppercase tracking-widest text-slate-500">Tax Invoice</div>
          <div className="text-2xl font-bold text-brand-900 mt-1">{doc.invoiceNumber}</div>
          <div className="text-[11px] text-slate-600 mt-1">Issue date: {formatDate(doc.issueDate)}</div>
          <div className="text-[11px] text-slate-600">Due date: {formatDate(doc.dueDate)}</div>
          <div className="text-[11px] text-slate-600">Status: <span className="uppercase font-semibold">{doc.status}</span></div>
        </div>
      </header>

      {/* Bill-to */}
      <section className="grid grid-cols-2 gap-6 mt-5">
        <div className="rounded border border-slate-200 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Bill To</div>
          <div className="font-semibold">{doc.customerSnapshot.name}</div>
          <div className="text-xs text-slate-600">{doc.customerSnapshot.address}</div>
          <div className="text-xs text-slate-600">{doc.customerSnapshot.phone}</div>
        </div>
        <div className="rounded border border-slate-200 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Invoice Details</div>
          <div className="grid grid-cols-2 gap-y-1 text-xs">
            <div className="text-slate-500">Invoice #</div><div className="font-mono">{doc.invoiceNumber}</div>
            <div className="text-slate-500">Issue date</div><div>{formatDate(doc.issueDate)}</div>
            <div className="text-slate-500">Due date</div><div>{formatDate(doc.dueDate)}</div>
            {doc.doIds.length > 0 && (
              <>
                <div className="text-slate-500">Related D.O</div>
                <div>{doc.doIds.length} order(s)</div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Items */}
      <section className="mt-5">
        <table className="doc-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Description</th>
              <th style={{ width: 80 }} className="!text-right">Qty</th>
              <th style={{ width: 70 }}>Unit</th>
              <th style={{ width: 100 }} className="!text-right">Unit Price</th>
              <th style={{ width: 110 }} className="!text-right">Line Total</th>
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
              <tr key={`f-${i}`}>
                <td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Totals */}
      <section className="flex justify-end mt-4">
        <div className="w-72 text-sm">
          <Row label="Subtotal" value={currency(doc.subtotal)} />
          <Row label={`Tax (${(doc.taxRate * 100).toFixed(2)}%)`} value={currency(doc.taxAmount)} />
          <Row label="Total" value={currency(doc.total)} strong />
          {doc.amountPaid > 0 && (
            <>
              <Row label="Amount paid" value={`- ${currency(doc.amountPaid)}`} className="text-emerald-700" />
              <Row label="Balance due" value={currency(out)} strong className={out > 0 ? "text-red-700" : "text-emerald-700"} />
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

      {/* Bank / payment instructions */}
      <section className="mt-6 grid grid-cols-3 gap-6">
        <div className="col-span-2 text-xs">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Payment Instructions</div>
          <div className="border border-slate-200 rounded p-3 space-y-1">
            <div><span className="text-slate-500">Bank:</span> Dahabshiil Bank International</div>
            <div><span className="text-slate-500">Account:</span> Irmaan Trading Company</div>
            <div><span className="text-slate-500">A/C No:</span> 0123-4567-8910</div>
            <div className="text-slate-500 pt-1 border-t border-slate-100">Please use {doc.invoiceNumber} as the payment reference.</div>
          </div>
        </div>
        {verifyUrl && (
          <div className="text-center">
            <QRBlock value={verifyUrl} size={100} className="mx-auto" />
            <div className="text-[9px] text-slate-500 mt-1">Scan to verify · {doc.invoiceNumber}</div>
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
