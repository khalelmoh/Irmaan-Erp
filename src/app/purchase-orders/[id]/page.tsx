"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import QRCode from "qrcode";
import { dataAdapter } from "@/services";
import { useAuth } from "@/contexts/AuthContext";
import { POPrintView } from "@/components/documents/POPrintView";
import { ReceiveItemsDialog } from "@/components/forms/ReceiveItemsDialog";
import { PaymentDialog } from "@/components/forms/PaymentDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Printer, ArrowLeft, Download, DollarSign, XCircle, Truck, PackageCheck,
} from "lucide-react";
import { currency, formatDateTime } from "@/lib/utils";
import { PO_STATUS_VARIANT, PO_STATUS_LABEL, poOutstanding, receiveProgress } from "@/lib/purchase-order";
import { logActivity } from "@/lib/audit";
import { PAYMENT_METHOD_LABEL } from "@/lib/invoice";
import type { PurchaseOrder, SupplierPayment, POAllocation } from "@/types";

const PDFDownloadButton = dynamic(() => import("./PDFDownloadButton").then((m) => m.PDFDownloadButton), {
  ssr: false,
  loading: () => <Button variant="outline" disabled><Download className="h-4 w-4" /> Preparing PDF…</Button>,
});

export default function POViewPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const [doc, setDoc] = useState<PurchaseOrder | null>(null);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [allocations, setAllocations] = useState<POAllocation[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string | undefined>();
  const [verifyUrl, setVerifyUrl] = useState("");
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    if (!params.id) return;
    const d = await dataAdapter.purchaseOrders.get(params.id);
    setDoc(d);
    if (d) {
      const ps = await dataAdapter.purchaseOrders.payments(d.id);
      setPayments(ps);
      const allocs = await dataAdapter.poAllocations.byPurchaseOrder(d.id);
      setAllocations(allocs);
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const url = `${base}/verify/${d.id}`;
      setVerifyUrl(url);
      const data = await QRCode.toDataURL(url, { margin: 1, width: 200, color: { dark: "#0b1e3f", light: "#ffffff" } });
      setQrDataUrl(data);
    }
  }

  useEffect(() => { refresh(); }, [params.id]);

  if (!doc) return <div className="text-sm text-slate-500">Loading purchase order…</div>;

  const out = poOutstanding(doc);
  const prog = receiveProgress(doc);
  const canReceive = doc.status !== "cancelled" && doc.status !== "received" && doc.status !== "draft";
  const canPay = doc.status !== "cancelled" && out > 0 && doc.status !== "draft";

  async function markCancelled() {
    if (!doc) return;
    if (!confirm("Cancel this purchase order? This will remove it from your A/P balance.")) return;
    await dataAdapter.purchaseOrders.update(doc.id, { status: "cancelled" });
    await logActivity(user, {
      action: "po.cancel",
      entityType: "purchase_order",
      entityId: doc.id,
      entityLabel: doc.poNumber,
      summary: `Cancelled ${doc.poNumber} (${doc.supplierSnapshot.name})`,
      diff: { status: { from: doc.status, to: "cancelled" } },
    });
    refresh();
  }

  async function confirmOrder() {
    if (!doc || doc.status !== "draft") return;
    try {
      await dataAdapter.purchaseOrders.update(doc.id, { status: "sent" });
      await logActivity(user, {
        action: "po.confirm",
        entityType: "purchase_order",
        entityId: doc.id,
        entityLabel: doc.poNumber,
        summary: `Confirmed purchase order ${doc.poNumber} for ${doc.supplierSnapshot.name}`,
        diff: { status: { from: doc.status, to: "sent" } },
      });
      refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to confirm purchase order");
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
            <Link href="/purchase-orders"><ArrowLeft className="h-4 w-4" /> Back</Link>
          </Button>
          <div>
            <div className="text-sm text-slate-500">Purchase Order</div>
            <div className="text-xl font-semibold tracking-tight">{doc.poNumber}</div>
          </div>
          <Badge variant={PO_STATUS_VARIANT[doc.status]}>{PO_STATUS_LABEL[doc.status]}</Badge>
          {out > 0 && doc.status !== "draft" && (
            <span className="text-xs text-slate-500">Owed: <span className="font-medium text-red-700">{currency(out)}</span></span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {doc.status === "draft" && (
            <Button onClick={confirmOrder} className="bg-blue-600 hover:bg-blue-700">
              <PackageCheck className="h-4 w-4" /> Confirm Order
            </Button>
          )}
          {canReceive && (
            <Button onClick={() => setReceiveOpen(true)}>
              <PackageCheck className="h-4 w-4" /> Receive items
            </Button>
          )}
          {canPay && (
            <Button variant="outline" onClick={() => setPayOpen(true)}>
              <DollarSign className="h-4 w-4" /> Pay supplier
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <PDFDownloadButton doc={doc} qrDataUrl={qrDataUrl} />
          {doc.status !== "cancelled" && doc.status !== "received" && (
            <Button variant="ghost" onClick={markCancelled} className="text-red-600">
              <XCircle className="h-4 w-4" /> Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Receiving progress card */}
      <Card className="no-print mb-4 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Truck className="h-5 w-5 text-slate-400" />
            <div>
              <div className="text-sm font-medium text-slate-900">Receiving progress</div>
              <div className="text-xs text-slate-500">
                {prog.received.toLocaleString()} of {prog.ordered.toLocaleString()} units received
              </div>
            </div>
          </div>
          <div className="text-2xl font-semibold tabular-nums">{prog.pct}%</div>
        </div>
        <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${prog.pct}%` }} />
        </div>
      </Card>

      <POPrintView doc={doc} verifyUrl={verifyUrl} />

      {/* Internal items table (showing allocation details) */}
      <div className="no-print mt-6">
        <Card>
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Internal Item Tracking</h2>
              <p className="text-xs text-slate-500 mt-0.5">Physical receipt vs allocated stock (FIFO)</p>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-5 py-2.5 w-[30%]">Product</th>
                <th className="text-right px-5 py-2.5">Ordered</th>
                <th className="text-right px-5 py-2.5 text-blue-700">Received</th>
                <th className="text-right px-5 py-2.5 text-amber-700">Allocated (DO)</th>
                <th className="text-right px-5 py-2.5 text-emerald-700">Available</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {doc.items.map(it => {
                const ordered = it.quantity;
                const received = it.receivedQty ?? 0;
                const allocated = it.allocatedQty ?? 0;
                const available = Math.max(0, received - allocated);
                return (
                  <tr key={it.productId}>
                    <td className="px-5 py-3 text-slate-700">{it.name}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-500">{ordered.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium text-blue-700">{received.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium text-amber-700">{allocated.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-emerald-700">{available.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Allocation history */}
      {allocations.length > 0 && (
        <div className="no-print mt-6">
          <Card>
            <div className="p-5 border-b border-slate-100">
              <h2 className="font-semibold">Allocation History (Delivery Orders)</h2>
              <p className="text-xs text-slate-500 mt-0.5">{allocations.length} DO(s) have consumed stock from this Purchase Order</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="text-left px-5 py-2.5">Allocated At</th>
                  <th className="text-left px-5 py-2.5">Delivery Order</th>
                  <th className="text-left px-5 py-2.5">Product</th>
                  <th className="text-right px-5 py-2.5">Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allocations.map(a => (
                  <tr key={a.id}>
                    <td className="px-5 py-3 text-slate-700">{formatDateTime(a.allocatedAt)}</td>
                    <td className="px-5 py-3 font-medium">
                      <Link href={`/delivery-orders/${a.deliveryOrderId}`} className="hover:underline text-brand-700">
                        {a.doNumber}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{a.productName}</td>
                    <td className="px-5 py-3 text-right font-medium text-amber-700 tabular-nums">{a.quantity.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* Payment history */}
      <div className="no-print mt-6">
        <Card>
          <div className="p-5 border-b border-slate-100">
            <h2 className="font-semibold">Supplier payment history</h2>
            <p className="text-xs text-slate-500 mt-0.5">{payments.length} payment(s) · {currency(doc.amountPaid)} paid to supplier</p>
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
                    <td className="px-5 py-3 text-right font-medium text-red-700 tabular-nums">-{currency(p.amount)}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{p.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <ReceiveItemsDialog
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        po={doc}
        onSubmit={async (receipts) => {
          setErr(null);
          try {
            await dataAdapter.purchaseOrders.receiveItems(doc.id, receipts, user?.uid ?? "");
            const totalReceived = receipts.reduce((s, r) => s + r.quantity, 0);
            await logActivity(user, {
              action: "po.receive",
              entityType: "purchase_order",
              entityId: doc.id,
              entityLabel: doc.poNumber,
              summary: `Received ${totalReceived.toLocaleString()} unit(s) on ${doc.poNumber} from ${doc.supplierSnapshot.name}`,
              metadata: { receipts },
            });
            await refresh();
          } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Failed to receive items");
            throw e;
          }
        }}
      />

      <PaymentDialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        invoiceNumber={doc.poNumber}
        outstanding={out}
        onSubmit={async (data) => {
          try {
            await dataAdapter.purchaseOrders.recordPayment(doc.id, {
              ...data,
              paidAt: new Date(data.paidAt).toISOString(),
              recordedBy: user?.uid ?? "",
            });
            await logActivity(user, {
              action: "po.payment",
              entityType: "purchase_order",
              entityId: doc.id,
              entityLabel: doc.poNumber,
              summary: `Paid ${currency(data.amount)} to ${doc.supplierSnapshot.name} for ${doc.poNumber} (${data.method.replace("_", " ")})`,
              metadata: { amount: data.amount, method: data.method, reference: data.reference },
            });
            await refresh();
          } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Failed to record payment");
            throw e;
          }
        }}
      />
    </div>
  );
}
