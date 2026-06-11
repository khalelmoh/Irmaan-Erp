"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { dataAdapter } from "@/services";
import { Logo } from "@/components/layout/Logo";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Truck, FileText, ShoppingCart } from "lucide-react";
import type { DeliveryOrder, Invoice, PurchaseOrder } from "@/types";
import { COMPANY, currency, formatDateTime } from "@/lib/utils";
import { STATUS_VARIANT, outstanding } from "@/lib/invoice";
import { PO_STATUS_VARIANT, PO_STATUS_LABEL, poOutstanding, receiveProgress } from "@/lib/purchase-order";

type Result =
  | { kind: "do"; doc: DeliveryOrder }
  | { kind: "invoice"; doc: Invoice }
  | { kind: "po"; doc: PurchaseOrder }
  | null
  | undefined;

export default function VerifyPage() {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<Result>(undefined);

  useEffect(() => {
    (async () => {
      const [inv, doDoc, po] = await Promise.all([
        dataAdapter.invoices.get(id),
        dataAdapter.deliveryOrders.get(id),
        dataAdapter.purchaseOrders.get(id),
      ]);
      if (inv) return setResult({ kind: "invoice", doc: inv });
      if (po) return setResult({ kind: "po", doc: po });
      if (doDoc) return setResult({ kind: "do", doc: doDoc });
      setResult(null);
    })();
  }, [id]);

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="bg-gradient-to-br from-brand-800 to-brand-950 text-white p-6 flex items-center justify-between">
          <div className="bg-white p-2 rounded-xl shadow-sm w-fit">
            <Logo />
          </div>
          <div className="text-xs text-brand-200 uppercase tracking-wide">Document Verification</div>
        </div>

        <div className="p-6">
          {result === undefined && <div className="text-slate-500 text-sm">Verifying…</div>}

          {result === null && (
            <div className="flex flex-col items-center text-center py-6">
              <XCircle className="h-12 w-12 text-red-500 mb-3" />
              <div className="text-lg font-semibold text-slate-900">Document not found</div>
              <div className="text-sm text-slate-500 mt-1 max-w-sm">
                This document ID could not be found in our records. The document may be invalid,
                or you may be using the demo build where data is stored per-device.
              </div>
              <div className="mt-3 text-[11px] font-mono text-slate-400 break-all max-w-xs">ID: {id}</div>
              <div className="mt-5 text-xs text-slate-500">
                If you believe this is an error, please contact <span className="font-medium text-slate-700">{COMPANY.phone}</span>.
              </div>
            </div>
          )}

          {result?.kind === "do" && <DOVerification doc={result.doc} />}
          {result?.kind === "invoice" && <InvoiceVerification doc={result.doc} />}
          {result?.kind === "po" && <POVerification doc={result.doc} />}
        </div>
      </div>
    </div>
  );
}

function POVerification({ doc }: { doc: PurchaseOrder }) {
  const out = poOutstanding(doc);
  const prog = receiveProgress(doc);
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-emerald-700">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-medium">Authentic Purchase Order</span>
        </div>
        <ShoppingCart className="h-5 w-5 text-slate-300" />
      </div>
      <div className="space-y-2 text-sm">
        <Row label="P.O Number" value={<span className="font-mono font-semibold">{doc.poNumber}</span>} />
        <Row label="Status" value={<Badge variant={PO_STATUS_VARIANT[doc.status]}>{PO_STATUS_LABEL[doc.status]}</Badge>} />
        <Row label="Supplier" value={doc.supplierSnapshot.name} />
        <Row label="Order date" value={formatDateTime(doc.orderDate)} />
        {doc.expectedDelivery && <Row label="Expected delivery" value={formatDateTime(doc.expectedDelivery)} />}
        <Row label="Total" value={<span className="font-semibold">{currency(doc.total)}</span>} />
        <Row label="Paid" value={<span className="text-emerald-700">{currency(doc.amountPaid)}</span>} />
        <Row
          label="Outstanding"
          value={<span className={out > 0 ? "text-red-700 font-semibold" : "text-emerald-700 font-semibold"}>{currency(out)}</span>}
        />
        <Row label="Receiving" value={`${prog.received.toLocaleString()} / ${prog.ordered.toLocaleString()} (${prog.pct}%)`} />
      </div>
      <Footer />
    </>
  );
}

function DOVerification({ doc }: { doc: DeliveryOrder }) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-emerald-700">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-medium">Authentic Delivery Order</span>
        </div>
        <Truck className="h-5 w-5 text-slate-300" />
      </div>
      <div className="space-y-2 text-sm">
        <Row label="DO Number" value={<span className="font-mono font-semibold">{doc.doNumber}</span>} />
        <Row label="Status" value={<Badge variant={doc.status === "delivered" ? "success" : "info"}>{doc.status}</Badge>} />
        <Row label="Customer" value={doc.customerSnapshot.name} />
        <Row label="Destination" value={doc.loadingDetails.destination.toUpperCase()} />
        <Row label="Truck plate" value={<span className="font-mono">{doc.loadingDetails.truckPlate}</span>} />
        <Row label="Driver" value={doc.loadingDetails.driverName} />
        <Row label="Issued by" value={doc.salespersonName} />
        <Row label="Issued at" value={formatDateTime(doc.createdAt)} />
        <Row label="Items" value={`${doc.items.length} line(s)`} />
      </div>
      <Footer />
    </>
  );
}

function InvoiceVerification({ doc }: { doc: Invoice }) {
  const out = outstanding(doc);
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-emerald-700">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-medium">Authentic Invoice</span>
        </div>
        <FileText className="h-5 w-5 text-slate-300" />
      </div>
      <div className="space-y-2 text-sm">
        <Row label="Invoice #" value={<span className="font-mono font-semibold">{doc.invoiceNumber}</span>} />
        <Row label="Status" value={<Badge variant={STATUS_VARIANT[doc.status]}>{doc.status}</Badge>} />
        <Row label="Customer" value={doc.customerSnapshot.name} />
        <Row label="Issue date" value={formatDateTime(doc.issueDate)} />
        <Row label="Due date" value={formatDateTime(doc.dueDate)} />
        <Row label="Total" value={<span className="font-semibold">{currency(doc.total)}</span>} />
        <Row label="Paid" value={<span className="text-emerald-700">{currency(doc.amountPaid)}</span>} />
        <Row
          label="Outstanding"
          value={<span className={out > 0 ? "text-amber-700 font-semibold" : "text-emerald-700 font-semibold"}>{currency(out)}</span>}
        />
      </div>
      <Footer />
    </>
  );
}

function Footer() {
  return (
    <div className="mt-6 pt-4 border-t border-slate-100 text-[11px] text-slate-500">
      Verified by {COMPANY.name}. If any details above do not match the physical document, please contact {COMPANY.phone}.
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-50 py-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900 text-right">{value}</span>
    </div>
  );
}
