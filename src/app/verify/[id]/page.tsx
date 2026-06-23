"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { dataAdapter } from "@/services";
import { Logo } from "@/components/layout/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  ClipboardCheck,
  FileText,
  RefreshCw,
  ShoppingCart,
  Truck,
  XCircle,
} from "lucide-react";
import type { DeliveryOrder, Invoice, PurchaseOrder, SalesOrder } from "@/types";
import type { VerificationResult } from "@/services/types";
import { COMPANY, currency, formatDateTime } from "@/lib/utils";
import { STATUS_VARIANT, outstanding } from "@/lib/invoice";
import {
  PO_STATUS_LABEL,
  PO_STATUS_VARIANT,
  poOutstanding,
  receiveProgress,
} from "@/lib/purchase-order";
import { SO_STATUS_LABEL, SO_STATUS_VARIANT } from "@/lib/sales-order";

type Result = VerificationResult | null | undefined;

export default function VerifyPage() {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<Result>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setResult(undefined);
      setError(null);
      try {
        const nextResult = await dataAdapter.verification.get(id);
        if (!cancelled) setResult(nextResult);
      } catch (verificationError) {
        if (!cancelled) {
          setError(
            verificationError instanceof Error
              ? verificationError.message
              : "Verification is temporarily unavailable",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="bg-gradient-to-br from-brand-800 to-brand-950 text-white p-6 flex items-center justify-between">
          <div className="bg-white p-2 rounded-xl shadow-sm w-fit">
            <Logo />
          </div>
          <div className="text-xs text-brand-200 uppercase tracking-wide">
            Document Verification
          </div>
        </div>

        <div className="p-6">
          {result === undefined && !error && (
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Verifying document…
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center text-center py-6">
              <XCircle className="h-12 w-12 text-amber-500 mb-3" />
              <div className="text-lg font-semibold text-slate-900">
                Verification temporarily unavailable
              </div>
              <div className="text-sm text-slate-500 mt-1 max-w-sm">{error}</div>
              <Button
                variant="outline"
                className="mt-5"
                onClick={() => setAttempt((value) => value + 1)}
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </Button>
            </div>
          )}

          {!error && result === null && (
            <div className="flex flex-col items-center text-center py-6">
              <XCircle className="h-12 w-12 text-red-500 mb-3" />
              <div className="text-lg font-semibold text-slate-900">Document not found</div>
              <div className="text-sm text-slate-500 mt-1 max-w-sm">
                This document ID could not be found in our records. The document may be
                invalid or may have been removed.
              </div>
              <div className="mt-3 text-[11px] font-mono text-slate-400 break-all max-w-xs">
                ID: {id}
              </div>
              <div className="mt-5 text-xs text-slate-500">
                If you believe this is an error, please contact{" "}
                <span className="font-medium text-slate-700">{COMPANY.phone}</span>.
              </div>
            </div>
          )}

          {result?.kind === "so" && <SOVerification doc={result.doc} />}
          {result?.kind === "do" && <DOVerification doc={result.doc} />}
          {result?.kind === "invoice" && <InvoiceVerification doc={result.doc} />}
          {result?.kind === "po" && <POVerification doc={result.doc} />}
        </div>
      </div>
    </div>
  );
}

function SOVerification({ doc }: { doc: SalesOrder }) {
  return (
    <>
      <VerificationHeader
        label={`Authentic ${doc.status === "quotation" ? "Quotation" : "Sales Order"}`}
        icon={<ClipboardCheck className="h-5 w-5 text-slate-300" />}
      />
      <div className="space-y-2 text-sm">
        <Row
          label="S.O Number"
          value={<span className="font-mono font-semibold">{doc.soNumber}</span>}
        />
        <Row
          label="Status"
          value={
            <Badge variant={SO_STATUS_VARIANT[doc.status]}>
              {SO_STATUS_LABEL[doc.status]}
            </Badge>
          }
        />
        <Row label="Customer" value={doc.customerSnapshot.name} />
        <Row label="Order date" value={formatDateTime(doc.orderDate)} />
        {doc.validUntil && <Row label="Valid until" value={formatDateTime(doc.validUntil)} />}
        <Row label="Salesperson" value={doc.salespersonName} />
        <Row label="Total" value={<span className="font-semibold">{currency(doc.total)}</span>} />
        <Row label="Items" value={`${doc.items.length} line(s)`} />
      </div>
      <Footer />
    </>
  );
}

function POVerification({ doc }: { doc: PurchaseOrder }) {
  const out = poOutstanding(doc);
  const progress = receiveProgress(doc);
  return (
    <>
      <VerificationHeader
        label="Authentic Purchase Order"
        icon={<ShoppingCart className="h-5 w-5 text-slate-300" />}
      />
      <div className="space-y-2 text-sm">
        <Row
          label="P.O Number"
          value={<span className="font-mono font-semibold">{doc.poNumber}</span>}
        />
        <Row
          label="Status"
          value={
            <Badge variant={PO_STATUS_VARIANT[doc.status]}>
              {PO_STATUS_LABEL[doc.status]}
            </Badge>
          }
        />
        <Row label="Supplier" value={doc.supplierSnapshot.name} />
        <Row label="Order date" value={formatDateTime(doc.orderDate)} />
        {doc.expectedDelivery && (
          <Row label="Expected delivery" value={formatDateTime(doc.expectedDelivery)} />
        )}
        <Row label="Total" value={<span className="font-semibold">{currency(doc.total)}</span>} />
        <Row label="Paid" value={<span className="text-emerald-700">{currency(doc.amountPaid)}</span>} />
        <Row
          label="Outstanding"
          value={
            <span className={out > 0 ? "text-red-700 font-semibold" : "text-emerald-700 font-semibold"}>
              {currency(out)}
            </span>
          }
        />
        <Row
          label="Receiving"
          value={`${progress.received.toLocaleString()} / ${progress.ordered.toLocaleString()} (${progress.pct}%)`}
        />
      </div>
      <Footer />
    </>
  );
}

function DOVerification({ doc }: { doc: DeliveryOrder }) {
  return (
    <>
      <VerificationHeader
        label="Authentic Delivery Order"
        icon={<Truck className="h-5 w-5 text-slate-300" />}
      />
      <div className="space-y-2 text-sm">
        <Row
          label="D.O Number"
          value={<span className="font-mono font-semibold">{doc.doNumber}</span>}
        />
        <Row
          label="Status"
          value={
            <Badge variant={doc.status === "delivered" ? "success" : "info"}>
              {doc.status}
            </Badge>
          }
        />
        <Row label="Customer" value={doc.customerSnapshot.name} />
        <Row label="Destination" value={doc.loadingDetails.destination.toUpperCase()} />
        <Row
          label="Truck plate"
          value={<span className="font-mono">{doc.loadingDetails.truckPlate}</span>}
        />
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
      <VerificationHeader
        label="Authentic Invoice"
        icon={<FileText className="h-5 w-5 text-slate-300" />}
      />
      <div className="space-y-2 text-sm">
        <Row
          label="Invoice #"
          value={<span className="font-mono font-semibold">{doc.invoiceNumber}</span>}
        />
        <Row
          label="Status"
          value={<Badge variant={STATUS_VARIANT[doc.status]}>{doc.status}</Badge>}
        />
        <Row label="Customer" value={doc.customerSnapshot.name} />
        <Row label="Issue date" value={formatDateTime(doc.issueDate)} />
        <Row label="Due date" value={formatDateTime(doc.dueDate)} />
        <Row label="Total" value={<span className="font-semibold">{currency(doc.total)}</span>} />
        <Row label="Paid" value={<span className="text-emerald-700">{currency(doc.amountPaid)}</span>} />
        <Row
          label="Outstanding"
          value={
            <span className={out > 0 ? "text-amber-700 font-semibold" : "text-emerald-700 font-semibold"}>
              {currency(out)}
            </span>
          }
        />
      </div>
      <Footer />
    </>
  );
}

function VerificationHeader({
  label,
  icon,
}: {
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2 text-emerald-700">
        <CheckCircle2 className="h-5 w-5" />
        <span className="font-medium">{label}</span>
      </div>
      {icon}
    </div>
  );
}

function Footer() {
  return (
    <div className="mt-6 pt-4 border-t border-slate-100 text-[11px] text-slate-500">
      Verified by {COMPANY.name}. If any details above do not match the physical document,
      please contact {COMPANY.phone}.
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
