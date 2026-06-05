import type { Invoice, InvoiceItem, InvoiceStatus } from "@/types";

/** Compute subtotal, tax, total from line items + tax rate. */
export function computeTotals(items: { quantity: number; unitPrice: number }[], taxRate: number) {
  const subtotal = round2(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0));
  const taxAmount = round2(subtotal * taxRate);
  const total = round2(subtotal + taxAmount);
  return { subtotal, taxAmount, total };
}

export function withLineTotals(items: { productId: string; name: string; quantity: number; unit: string; unitPrice: number }[]): InvoiceItem[] {
  return items.map((it) => ({ ...it, lineTotal: round2(it.quantity * it.unitPrice) }));
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function outstanding(inv: Invoice) {
  return round2(inv.total - inv.amountPaid);
}

export function effectiveStatus(inv: Invoice): InvoiceStatus {
  if (inv.status === "cancelled" || inv.status === "draft" || inv.status === "paid") return inv.status;
  if (inv.amountPaid > 0 && inv.amountPaid + 0.001 < inv.total) return "partial";
  if (new Date(inv.dueDate).getTime() < Date.now()) return "overdue";
  return "sent";
}

export const STATUS_VARIANT: Record<InvoiceStatus, "muted" | "info" | "success" | "warning" | "danger"> = {
  draft: "muted",
  sent: "info",
  partial: "warning",
  paid: "success",
  overdue: "danger",
  cancelled: "muted",
};

export const PAYMENT_METHOD_LABEL = {
  cash: "Cash",
  bank: "Bank transfer",
  mobile_money: "Mobile money",
  cheque: "Cheque",
} as const;
