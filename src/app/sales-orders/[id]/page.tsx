"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import QRCode from "qrcode";
import { dataAdapter } from "@/services";
import { useAuth } from "@/contexts/AuthContext";
import { SOPrintView } from "@/components/documents/SOPrintView";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Printer, ArrowLeft, Download, XCircle, PackageCheck, FileText, CheckCircle2, ShoppingCart
} from "lucide-react";
import { currency } from "@/lib/utils";
import { SO_STATUS_VARIANT, SO_STATUS_LABEL, deliveryProgress, invoiceProgress } from "@/lib/sales-order";
import { logActivity } from "@/lib/audit";
import type { SalesOrder } from "@/types";

const PDFDownloadButton = dynamic(() => import("./PDFDownloadButton").then((m) => m.PDFDownloadButton), {
  ssr: false,
  loading: () => <Button variant="outline" disabled><Download className="h-4 w-4" /> Preparing PDF…</Button>,
});

export default function SOViewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [doc, setDoc] = useState<SalesOrder | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | undefined>();
  const [verifyUrl, setVerifyUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    if (!params.id) return;
    const d = await dataAdapter.salesOrders.get(params.id);
    setDoc(d);
    if (d) {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const url = `${base}/verify/so/${d.id}`;
      setVerifyUrl(url);
      const data = await QRCode.toDataURL(url, { margin: 1, width: 200, color: { dark: "#0b1e3f", light: "#ffffff" } });
      setQrDataUrl(data);
    }
  }

  useEffect(() => { refresh(); }, [params.id]);

  if (!doc) return <div className="text-sm text-slate-500">Loading sales order…</div>;

  const delProg = deliveryProgress(doc);
  const invProg = invoiceProgress(doc);

  async function markCancelled() {
    if (!doc) return;
    if (!confirm("Cancel this document?")) return;
    await dataAdapter.salesOrders.update(doc.id, { status: "cancelled" });
    await logActivity(user, {
      action: "so.cancel",
      entityType: "sales_order",
      entityId: doc.id,
      entityLabel: doc.soNumber,
      summary: `Cancelled ${doc.soNumber} (${doc.customerSnapshot.name})`,
      diff: { status: { from: doc.status, to: "cancelled" } },
    });
    refresh();
  }

  async function confirmQuotation() {
    if (!doc || doc.status !== "quotation") return;
    try {
      await dataAdapter.salesOrders.confirm(doc.id);
      await logActivity(user, {
        action: "so.confirm",
        entityType: "sales_order",
        entityId: doc.id,
        entityLabel: doc.soNumber,
        summary: `Confirmed quotation ${doc.soNumber} for ${doc.customerSnapshot.name}`,
        diff: { status: { from: doc.status, to: "confirmed" } },
      });
      refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to confirm quotation");
    }
  }

  return (
    <div>
      {err && (
        <div className="no-print mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">{err}</div>
      )}

      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/sales-orders"><ArrowLeft className="h-4 w-4" /> Back</Link>
          </Button>
          <div>
            <div className="text-sm text-slate-500">{doc.status === "quotation" ? "Quotation" : "Sales Order"}</div>
            <div className="text-xl font-semibold tracking-tight">{doc.soNumber}</div>
          </div>
          <Badge variant={SO_STATUS_VARIANT[doc.status]}>{SO_STATUS_LABEL[doc.status]}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {doc.status === "quotation" && (
            <Button onClick={confirmQuotation}>
              <CheckCircle2 className="h-4 w-4" /> Confirm Sales Order
            </Button>
          )}
          {doc.status !== "quotation" && doc.status !== "cancelled" && (
            <>
              <Button onClick={() => router.push(`/delivery-orders/new?soId=${doc.id}`)}>
                <PackageCheck className="h-4 w-4" /> Create Delivery
              </Button>
              <Button variant="outline" onClick={() => router.push(`/invoices/new?soId=${doc.id}`)}>
                <FileText className="h-4 w-4" /> Create Invoice
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <PDFDownloadButton doc={doc} qrDataUrl={qrDataUrl} />
          {doc.status !== "cancelled" && doc.status !== "fully_delivered" && doc.status !== "invoiced" && (
            <Button variant="ghost" onClick={markCancelled} className="text-red-600">
              <XCircle className="h-4 w-4" /> Cancel
            </Button>
          )}
        </div>
      </div>

      {doc.status !== "quotation" && doc.status !== "cancelled" && (
        <div className="no-print grid grid-cols-2 gap-4 mb-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <PackageCheck className="h-5 w-5 text-emerald-600" />
                <div>
                  <div className="text-sm font-medium text-slate-900">Delivery progress</div>
                  <div className="text-xs text-slate-500">
                    {delProg.delivered.toLocaleString()} of {delProg.ordered.toLocaleString()} units delivered
                  </div>
                </div>
              </div>
              <div className="text-2xl font-semibold tabular-nums">{delProg.pct}%</div>
            </div>
            <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${delProg.pct}%` }} />
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-blue-600" />
                <div>
                  <div className="text-sm font-medium text-slate-900">Invoicing progress</div>
                  <div className="text-xs text-slate-500">
                    {invProg.invoiced.toLocaleString()} of {invProg.ordered.toLocaleString()} units invoiced
                  </div>
                </div>
              </div>
              <div className="text-2xl font-semibold tabular-nums">{invProg.pct}%</div>
            </div>
            <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${invProg.pct}%` }} />
            </div>
          </Card>
        </div>
      )}

      <SOPrintView doc={doc} verifyUrl={verifyUrl} />
    </div>
  );
}
