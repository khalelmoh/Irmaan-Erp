"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import QRCode from "qrcode";
import { dataAdapter } from "@/services";
import { useAuth } from "@/contexts/AuthContext";
import { InvoicePrintView } from "@/components/documents/InvoicePrintView";
import { PaymentDialog } from "@/components/forms/PaymentDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Printer, ArrowLeft, Download, DollarSign, XCircle, Send, FileText,
} from "lucide-react";
import { currency, formatDateTime } from "@/lib/utils";
import { STATUS_VARIANT, outstanding, effectiveStatus, PAYMENT_METHOD_LABEL } from "@/lib/invoice";
import { logActivity } from "@/lib/audit";
import type { Invoice, Payment } from "@/types";
import { verificationUrl } from "@/lib/document-verification";

const PDFDownloadButton = dynamic(() => import("./PDFDownloadButton").then((m) => m.PDFDownloadButton), {
  ssr: false,
  loading: () => <Button variant="outline" disabled><Download className="h-4 w-4" /> Preparing PDF…</Button>,
});

export default function InvoiceViewPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const [doc, setDoc] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string | undefined>();
  const [verifyUrl, setVerifyUrl] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!params.id) return;
    const d = await dataAdapter.invoices.get(params.id);
    setDoc(d);
    if (d) {
      const ps = await dataAdapter.invoices.payments(d.id);
      setPayments(ps);
      const url = verificationUrl(d.id, window.location.origin);
      setVerifyUrl(url);
      const data = await QRCode.toDataURL(url, { margin: 2, width: 240, errorCorrectionLevel: "H", color: { dark: "#0b1e3f", light: "#ffffff" } });
      setQrDataUrl(data);
    }
  }, [params.id]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!doc) return <div className="text-sm text-slate-500">Loading invoice…</div>;

  const out = outstanding(doc);
  const status = effectiveStatus(doc);
  const canPay =
    doc.type === "invoice" &&
    status !== "draft" &&
    status !== "paid" &&
    status !== "cancelled";
  const canActivate =
    doc.type === "invoice" || user?.role === "admin" || user?.role === "manager";

  async function markCancelled() {
    if (!doc) return;
    if (!confirm("Cancel this invoice? This will remove it from the customer's balance.")) return;
    await dataAdapter.invoices.update(doc.id, { status: "cancelled" });
    await logActivity(user, {
      action: "invoice.cancel",
      entityType: "invoice",
      entityId: doc.id,
      entityLabel: doc.invoiceNumber,
      summary: `Cancelled ${doc.invoiceNumber} (${doc.customerSnapshot.name}, ${currency(doc.total)})`,
      diff: { status: { from: doc.status, to: "cancelled" } },
    });
    refresh();
  }

  async function markSent() {
    if (!doc) return;
    setErr(null);
    try {
      await dataAdapter.invoices.update(doc.id, { status: "sent" });
      await logActivity(user, {
        action: "invoice.send",
        entityType: "invoice",
        entityId: doc.id,
        entityLabel: doc.invoiceNumber,
        summary: `Marked ${doc.invoiceNumber} as sent`,
      });
      refresh();
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : "Failed to activate document");
    }
  }

  return (
    <div>
      {err && (
        <div className="no-print mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
          {err}
        </div>
      )}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/invoices"><ArrowLeft className="h-4 w-4" /> Back</Link>
          </Button>
          <div>
            <div className="text-sm text-slate-500">{doc.type === "credit_note" ? "Credit Note" : "Invoice"}</div>
            <div className="text-xl font-semibold tracking-tight">{doc.invoiceNumber}</div>
          </div>
          <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>
          {doc.type === "credit_note" && doc.status === "draft" && (
            <Badge variant="warning">Manager approval pending</Badge>
          )}
          {out > 0 && status !== "draft" && (
            <span className="text-xs text-slate-500">Outstanding: <span className="font-medium text-amber-700">{currency(out)}</span></span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {doc.type === "invoice" && doc.status !== "cancelled" && (
            <Button asChild variant="outline">
              <Link href={`/invoices/new?creditNoteFor=${doc.id}`}>
                <FileText className="h-4 w-4" /> Create Credit Note
              </Link>
            </Button>
          )}
          {doc.status === "draft" && (
            <>
              <Button asChild variant="outline">
                <Link href={`/invoices/${doc.id}/edit`}>Edit</Link>
              </Button>
              {canActivate && (
                <Button onClick={markSent} className="bg-blue-600 hover:bg-blue-700">
                  <Send className="h-4 w-4" />
                  {doc.type === "credit_note" ? "Approve credit note" : "Mark as sent"}
                </Button>
              )}
            </>
          )}
          {canPay && (
            <Button onClick={() => setPayOpen(true)}>
              <DollarSign className="h-4 w-4" /> Record payment
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <PDFDownloadButton doc={doc} qrDataUrl={qrDataUrl} />
          {status !== "cancelled" && status !== "paid" && (
            <Button variant="ghost" onClick={markCancelled} className="text-red-600">
              <XCircle className="h-4 w-4" /> Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Linked DOs */}
      {doc.doIds.length > 0 && (
        <Card className="no-print mb-4 p-3 flex items-center gap-3 flex-wrap">
          <FileText className="h-4 w-4 text-slate-400" />
          <span className="text-xs text-slate-500 uppercase">Generated from:</span>
          {doc.doIds.map((id) => (
            <Link key={id} href={`/delivery-orders/${id}`} className="text-xs font-mono text-brand-700 hover:underline">
              {/* We don't have the DO number cached; show ID */}
              D.O #{id.slice(0, 6)}…
            </Link>
          ))}
        </Card>
      )}

      <InvoicePrintView doc={doc} verifyUrl={verifyUrl} />

      {/* Payment history */}
      <div className="no-print mt-6">
        <Card>
          <div className="p-5 border-b border-slate-100">
            <h2 className="font-semibold">Payment history</h2>
            <p className="text-xs text-slate-500 mt-0.5">{payments.length} payment(s) recorded · {currency(doc.amountPaid)} collected</p>
          </div>
          {payments.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">No payments recorded yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="text-left px-5 py-2.5">Paid at</th>
                  <th className="text-left px-5 py-2.5">Method</th>
                  <th className="text-left px-5 py-2.5">Reference</th>
                  <th className="text-right px-5 py-2.5">Amount</th>
                  <th className="text-left px-5 py-2.5">Notes</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-5 py-3 text-slate-700">{formatDateTime(p.paidAt)}</td>
                    <td className="px-5 py-3"><Badge variant="info">{PAYMENT_METHOD_LABEL[p.method]}</Badge></td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{p.reference || "—"}</td>
                    <td className="px-5 py-3 text-right font-medium text-emerald-700 tabular-nums">{currency(p.amount)}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{p.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <PaymentDialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        invoiceNumber={doc.invoiceNumber}
        outstanding={out}
        onSubmit={async (data) => {
          await dataAdapter.invoices.recordPayment(doc.id, {
            ...data,
            paidAt: new Date(data.paidAt).toISOString(),
            recordedBy: user?.uid ?? "",
          });
          await logActivity(user, {
            action: "invoice.payment",
            entityType: "invoice",
            entityId: doc.id,
            entityLabel: doc.invoiceNumber,
            summary: `Recorded ${currency(data.amount)} payment on ${doc.invoiceNumber} (${data.method.replace("_", " ")})`,
            metadata: { amount: data.amount, method: data.method, reference: data.reference },
          });
          refresh();
        }}
      />
    </div>
  );
}
