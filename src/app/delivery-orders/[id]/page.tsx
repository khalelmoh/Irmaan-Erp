"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { dataAdapter } from "@/services";
import { useAuth } from "@/contexts/AuthContext";
import { DOPrintView } from "@/components/documents/DOPrintView";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Printer, ArrowLeft, Download, CheckCircle2, QrCode, FileText, ExternalLink } from "lucide-react";
import type { DeliveryOrder, DOStatus, POAllocation } from "@/types";
import QRCode from "qrcode";
import { logActivity } from "@/lib/audit";
import { currency } from "@/lib/utils";
import { verificationUrl } from "@/lib/document-verification";
import { useToast } from "@/contexts/ToastContext";
import { errorMessage } from "@/lib/retry";

const PDFDownloadButton = dynamic(() => import("./PDFDownloadButton").then((m) => m.PDFDownloadButton), {
  ssr: false,
  loading: () => <Button variant="outline" disabled><Download className="h-4 w-4" /> Preparing PDF…</Button>,
});

const statusVariant: Record<DOStatus, "muted" | "info" | "success" | "danger"> = {
  draft: "muted", issued: "info", delivered: "success", cancelled: "danger",
};

export default function DOViewPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const search = useSearchParams();
  const [doc, setDoc] = useState<DeliveryOrder | null>(null);
  const [allocations, setAllocations] = useState<POAllocation[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string | undefined>();
  const [verifyUrl, setVerifyUrl] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [delivering, setDelivering] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    dataAdapter.deliveryOrders.get(params.id).then(async (d) => {
      setDoc(d);
      if (d) {
        const allocs = await dataAdapter.poAllocations.byDeliveryOrder(d.id);
        setAllocations(allocs);
        const url = verificationUrl(d.id, window.location.origin);
        setVerifyUrl(url);
        const dataUrl = await QRCode.toDataURL(url, { margin: 2, width: 240, errorCorrectionLevel: "H", color: { dark: "#0b1e3f", light: "#ffffff" } });
        setQrDataUrl(dataUrl);
      }
    });
  }, [params.id]);

  useEffect(() => {
    if (search.get("print") && doc) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [search, doc]);

  if (!doc) {
    return <div className="text-sm text-slate-500">Loading document…</div>;
  }

  async function markDelivered() {
    if (!doc) return;
    setDelivering(true);
    try {
      const updated = await dataAdapter.deliveryOrders.update(doc.id, { status: "delivered" });
      setDoc(updated);
      await logActivity(user, {
        action: "do.mark_delivered",
        entityType: "delivery_order",
        entityId: doc.id,
        entityLabel: doc.doNumber,
        summary: `Marked ${doc.doNumber} as delivered (${doc.customerSnapshot.name})`,
        diff: { status: { from: "issued", to: "delivered" } },
      });
      toast.success("Delivery marked delivered", `${doc.doNumber} is now delivered.`);
    } catch (error) {
      toast.error("Couldn't mark delivered", errorMessage(error));
    } finally {
      setDelivering(false);
    }
  }

  async function issueOrder() {
    if (!doc || doc.status !== "draft" || issuing) return;
    setIssuing(true);
    try {
      const updated = await dataAdapter.deliveryOrders.update(doc.id, { status: "issued" });
      const allocs = await dataAdapter.poAllocations.byDeliveryOrder(doc.id);
      setDoc(updated);
      setAllocations(allocs);
      const value = updated.items.reduce((s, it) => s + (Number(it.unitPrice) || 0) * Number(it.quantity), 0);
      await logActivity(user, {
        action: "do.issue",
        entityType: "delivery_order",
        entityId: doc.id,
        entityLabel: doc.doNumber,
        summary: `Issued ${doc.doNumber} to ${doc.customerSnapshot.name} (${currency(value)}, ${doc.items.length} line${doc.items.length === 1 ? "" : "s"})`,
        diff: { status: { from: "draft", to: "issued" } },
      });
      toast.success("Delivery order issued", `${doc.doNumber} is now ready for delivery.`);
    } catch (error) {
      toast.error("Couldn't issue delivery order", errorMessage(error));
    } finally {
      setIssuing(false);
    }
  }

  function downloadQR() {
    if (!qrDataUrl || !doc) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `${doc.doNumber}-QR.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function copyVerifyLink() {
    if (!verifyUrl) return;
    try {
      await navigator.clipboard.writeText(verifyUrl);
    } catch {
      // silent fallback
    }
  }

  return (
    <div>
      {/* Action bar (hidden in print) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm"><Link href="/delivery-orders"><ArrowLeft className="h-4 w-4" /> Back</Link></Button>
          <div>
            <div className="text-sm text-slate-500">Delivery Order</div>
            <div className="text-xl font-semibold tracking-tight">{doc.doNumber}</div>
          </div>
          <Badge variant={statusVariant[doc.status]}>{doc.status}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {doc.status === "draft" && (
            <>
              <Button asChild variant="outline">
                <Link href={`/delivery-orders/${doc.id}/edit`}>Edit</Link>
              </Button>
              <Button onClick={issueOrder} disabled={issuing} className="bg-blue-600 hover:bg-blue-700">
                <CheckCircle2 className="h-4 w-4" /> {issuing ? "Issuing..." : "Issue Delivery"}
              </Button>
            </>
          )}
          {doc.status === "issued" && (
            <Button variant="outline" onClick={markDelivered} disabled={delivering}>
              <CheckCircle2 className="h-4 w-4" /> {delivering ? "Marking..." : "Mark delivered"}
            </Button>
          )}
          {!doc.invoiceId && doc.status !== "cancelled" && doc.status !== "draft" && (
            <Button asChild>
              <Link href={`/invoices/new?fromDO=${doc.id}`}>
                <FileText className="h-4 w-4" /> Create Invoice
              </Link>
            </Button>
          )}
          {doc.invoiceId && (
            <Button asChild variant="outline">
              <Link href={`/invoices/${doc.invoiceId}`}>
                <ExternalLink className="h-4 w-4" /> View Invoice
              </Link>
            </Button>
          )}
          <Button variant="outline" onClick={downloadQR} disabled={!qrDataUrl} title="Download QR as PNG">
            <QrCode className="h-4 w-4" /> QR
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <PDFDownloadButton doc={doc} qrDataUrl={qrDataUrl} allocations={allocations} />
        </div>
      </div>

      {/* Verification URL hint (hidden in print) */}
      {verifyUrl && (
        <div className="no-print mb-4 text-xs bg-slate-50 border border-slate-200 rounded-md px-3 py-2 flex items-center gap-2 text-slate-600">
          <QrCode className="h-3.5 w-3.5 text-slate-400" />
          <span>QR encodes:</span>
          <code className="font-mono text-slate-800 break-all">{verifyUrl}</code>
          <button onClick={copyVerifyLink} className="ml-auto text-brand-700 hover:underline">Copy link</button>
        </div>
      )}

      <DOPrintView doc={doc} verifyUrl={verifyUrl} allocations={allocations} />

      {/* PO Allocation Detail */}
      {allocations.length > 0 && (
        <div className="no-print mt-6">
          <Card>
            <div className="p-5 border-b border-slate-100">
              <h2 className="font-semibold">PO Allocation Breakdown</h2>
              <p className="text-xs text-slate-500 mt-0.5">Stock consumed from these Purchase Orders (FIFO)</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="text-left px-5 py-2.5">PO Number</th>
                  <th className="text-left px-5 py-2.5">Product</th>
                  <th className="text-right px-5 py-2.5">Qty Allocated</th>
                  <th className="text-right px-5 py-2.5">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allocations.map(a => (
                  <tr key={a.id}>
                    <td className="px-5 py-3 font-medium text-slate-700">
                      <Link href={`/purchase-orders/${a.purchaseOrderId}`} className="hover:underline text-brand-700">
                        {a.poNumber}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{a.productName}</td>
                    <td className="px-5 py-3 text-right font-medium text-emerald-700 tabular-nums">
                      {a.quantity.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-slate-500">
                      {new Date(a.allocatedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
