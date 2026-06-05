import type { POStatus, PurchaseOrder } from "@/types";
import { round2 } from "./invoice";

export function computePOTotals(
  items: { quantity: number; unitPrice: number }[],
  taxRate: number,
) {
  const subtotal = round2(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0));
  const taxAmount = round2(subtotal * taxRate);
  const total = round2(subtotal + taxAmount);
  return { subtotal, taxAmount, total };
}

export function withLineTotals(items: { productId: string; name: string; quantity: number; unit: string; unitPrice: number }[]) {
  return items.map((it) => ({ ...it, lineTotal: round2(it.quantity * it.unitPrice) }));
}

export function poOutstanding(po: PurchaseOrder) {
  return round2(po.total - po.amountPaid);
}

export function receiveProgress(po: PurchaseOrder) {
  const ordered = po.items.reduce((s, i) => s + i.quantity, 0);
  const received = po.items.reduce((s, i) => s + (i.receivedQty ?? 0), 0);
  return {
    ordered,
    received,
    pct: ordered === 0 ? 0 : Math.min(100, Math.round((received / ordered) * 100)),
    isFullyReceived: received + 0.001 >= ordered && ordered > 0,
  };
}

export const PO_STATUS_VARIANT: Record<POStatus, "muted" | "info" | "success" | "warning" | "danger"> = {
  draft: "muted",
  sent: "info",
  partial_received: "warning",
  received: "success",
  cancelled: "danger",
};

export const PO_STATUS_LABEL: Record<POStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partial_received: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
};
