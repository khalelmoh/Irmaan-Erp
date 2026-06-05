import type { SOStatus, SalesOrder, SOItem } from "@/types";
import { round2 } from "./invoice";

export function computeSOTotals(
  items: { quantity: number; unitPrice: number }[],
  taxRate: number,
) {
  const subtotal = round2(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0));
  const taxAmount = round2(subtotal * taxRate);
  const total = round2(subtotal + taxAmount);
  return { subtotal, taxAmount, total };
}

export function withSOLineTotals(
  items: { productId: string; name: string; quantity: number; unit: string; unitPrice: number }[],
): SOItem[] {
  return items.map((it) => ({
    ...it,
    deliveredQty: 0,
    invoicedQty: 0,
    lineTotal: round2(it.quantity * it.unitPrice),
  }));
}

/** Compute the delivery progress for a Sales Order. */
export function deliveryProgress(so: SalesOrder) {
  const ordered = so.items.reduce((s, i) => s + i.quantity, 0);
  const delivered = so.items.reduce((s, i) => s + (i.deliveredQty ?? 0), 0);
  return {
    ordered,
    delivered,
    pct: ordered === 0 ? 0 : Math.min(100, Math.round((delivered / ordered) * 100)),
    isFullyDelivered: delivered + 0.001 >= ordered && ordered > 0,
  };
}

/** Compute the invoicing progress for a Sales Order. */
export function invoiceProgress(so: SalesOrder) {
  const ordered = so.items.reduce((s, i) => s + i.quantity, 0);
  const invoiced = so.items.reduce((s, i) => s + (i.invoicedQty ?? 0), 0);
  return {
    ordered,
    invoiced,
    pct: ordered === 0 ? 0 : Math.min(100, Math.round((invoiced / ordered) * 100)),
    isFullyInvoiced: invoiced + 0.001 >= ordered && ordered > 0,
  };
}

/** What quantities remain un-delivered per item. */
export function remainingToDeliver(so: SalesOrder) {
  return so.items
    .map((it) => ({
      productId: it.productId,
      name: it.name,
      unit: it.unit,
      unitPrice: it.unitPrice,
      total: it.quantity,
      delivered: it.deliveredQty ?? 0,
      remaining: round2(it.quantity - (it.deliveredQty ?? 0)),
    }))
    .filter((r) => r.remaining > 0);
}

/** What quantities remain un-invoiced per item. */
export function remainingToInvoice(so: SalesOrder) {
  return so.items
    .map((it) => ({
      productId: it.productId,
      name: it.name,
      unit: it.unit,
      unitPrice: it.unitPrice,
      total: it.quantity,
      invoiced: it.invoicedQty ?? 0,
      remaining: round2(it.quantity - (it.invoicedQty ?? 0)),
    }))
    .filter((r) => r.remaining > 0);
}

/** Determine the auto-computed SO status. */
export function computeSOStatus(so: SalesOrder): SOStatus {
  if (so.status === "cancelled" || so.status === "quotation") return so.status;
  const inv = invoiceProgress(so);
  if (inv.isFullyInvoiced) return "invoiced";
  const del = deliveryProgress(so);
  if (del.isFullyDelivered) return "fully_delivered";
  return "confirmed";
}

export const SO_STATUS_VARIANT: Record<SOStatus, "muted" | "info" | "success" | "warning" | "danger"> = {
  quotation: "muted",
  confirmed: "info",
  fully_delivered: "warning",
  invoiced: "success",
  cancelled: "danger",
};

export const SO_STATUS_LABEL: Record<SOStatus, string> = {
  quotation: "Quotation",
  confirmed: "Sales Order",
  fully_delivered: "Delivered",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};
