"use client";

import { COMPANY, formatDate } from "@/lib/utils";
import { QRBlock } from "./QRBlock";
import { Logo } from "@/components/layout/Logo";
import type { DeliveryOrder, POAllocation } from "@/types";

interface Props {
  doc: DeliveryOrder;
  /** Public URL the QR should encode. */
  verifyUrl: string;
  /** PO allocations to show on the document. */
  allocations?: POAllocation[];
}

export function DOPrintView({ doc, verifyUrl, allocations }: Props) {
  return (
    <div className="print-page text-slate-900">
      {/* Header */}
      <header className="flex items-start justify-between pb-4 border-b-2 border-brand-800">
        <div className="flex items-start gap-3">
          <Logo compact />
          <div>
            <div className="text-xl font-bold tracking-tight text-brand-900">{COMPANY.name}</div>
            <div className="text-[11px] text-slate-500">{COMPANY.tagline}</div>
            <div className="text-[11px] text-slate-600 mt-1">{COMPANY.address}</div>
            <div className="text-[11px] text-slate-600">
              {COMPANY.phone} · {COMPANY.email}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-slate-500">Delivery Order</div>
          <div className="text-2xl font-bold text-brand-900 mt-1">{doc.doNumber}</div>
          <div className="text-[11px] text-slate-600 mt-1">Date: {formatDate(doc.orderDate)}</div>
          <div className="text-[11px] text-slate-600">Status: <span className="uppercase font-semibold">{doc.status}</span></div>
        </div>
      </header>

      {/* Bill-to / meta */}
      <section className="grid grid-cols-2 gap-6 mt-5">
        <div className="rounded border border-slate-200 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Deliver To</div>
          <div className="font-semibold">{doc.customerSnapshot.name}</div>
          <div className="text-xs text-slate-600">{doc.customerSnapshot.address}</div>
          <div className="text-xs text-slate-600">{doc.customerSnapshot.phone}</div>
        </div>
        <div className="rounded border border-slate-200 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Order Details</div>
          <div className="grid grid-cols-2 gap-y-1 text-xs">
            <div className="text-slate-500">Salesperson</div><div>{doc.salespersonName}</div>
            <div className="text-slate-500">Order Date</div><div>{formatDate(doc.orderDate)}</div>
            <div className="text-slate-500">D.O Number</div><div className="font-mono">{doc.doNumber}</div>
            {doc.invoiceId && (<><div className="text-slate-500">Invoice</div><div>{doc.invoiceId}</div></>)}
          </div>
        </div>
      </section>

      {/* Items */}
      <section className="mt-5">
        <table className="doc-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Product</th>
              <th style={{ width: 100 }} className="!text-right">Quantity</th>
              <th style={{ width: 90 }}>Unit</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((it, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{it.name}</td>
                <td className="text-right tabular-nums">{it.quantity.toLocaleString()}</td>
                <td>{it.unit}</td>
              </tr>
            ))}
            {/* filler rows for nice print appearance */}
            {Array.from({ length: Math.max(0, 5 - doc.items.length) }).map((_, i) => (
              <tr key={`f-${i}`}>
                <td>&nbsp;</td><td></td><td></td><td></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Purchase Order References */}
      {allocations && allocations.length > 0 && (
        <section className="mt-5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 font-semibold">Purchase Order References</div>
          <table className="doc-table">
            <thead>
              <tr>
                <th style={{ width: 160 }}>PO Number</th>
                <th>Product</th>
                <th style={{ width: 120 }} className="!text-right">Qty Allocated</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a, i) => (
                <tr key={i}>
                  <td className="font-mono font-semibold text-brand-800">{a.poNumber}</td>
                  <td>{a.productName}</td>
                  <td className="text-right tabular-nums">{a.quantity.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Loading details */}
      <section className="mt-5">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 font-semibold">Loading Details</div>
        <table className="doc-table">
          <tbody>
            <tr>
              <th style={{ width: 140 }}>Driver Name</th>
              <td>{doc.loadingDetails.driverName}</td>
              <th style={{ width: 140 }}>Mobile</th>
              <td>{doc.loadingDetails.mobile}</td>
            </tr>
            <tr>
              <th>Truck Plate</th>
              <td className="font-mono">{doc.loadingDetails.truckPlate}</td>
              <th>Owner</th>
              <td>{doc.loadingDetails.owner}</td>
            </tr>
            <tr>
              <th>Destination</th>
              <td colSpan={3} className="uppercase font-semibold tracking-wide">{doc.loadingDetails.destination}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Notes (optional) */}
      {doc.notes && (
        <section className="mt-4 text-xs">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Notes</div>
          <div className="border border-slate-200 rounded p-2 mt-1 text-slate-700">{doc.notes}</div>
        </section>
      )}

      {/* Footer: signatures + QR */}
      <section className="mt-10 grid grid-cols-3 gap-6 items-end">
        <SignatureBlock label="Issued by" name={doc.salespersonName} />
        <SignatureBlock label="Received by" name={doc.loadingDetails.driverName} />
        <div className="text-center">
          <QRBlock value={verifyUrl} size={110} className="mx-auto" />
          <div className="text-[9px] text-slate-500 mt-1">Scan to verify · {doc.doNumber}</div>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-2 gap-6">
        <div></div>
        <SignatureBlock label="Authorized by" name={doc.authorizedBy ?? ""} />
      </section>

      <footer className="mt-10 pt-3 border-t border-slate-200 text-[10px] text-slate-500 flex justify-between">
        <div>This is a system-generated delivery order. {COMPANY.name} · {COMPANY.website}</div>
        <div>Tax ID: {COMPANY.taxId}</div>
      </footer>
    </div>
  );
}

function SignatureBlock({ label, name }: { label: string; name: string }) {
  return (
    <div>
      <div className="h-12 border-b border-slate-400"></div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">{label}</div>
      <div className="text-sm font-medium text-slate-800">{name || "\u00a0"}</div>
    </div>
  );
}
