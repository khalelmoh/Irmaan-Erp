import type { StockMovementKind } from "@/types";

export const MOVEMENT_LABEL: Record<StockMovementKind, string> = {
  po_receipt: "PO Receipt",
  po_receipt_reverse: "PO Reversal",
  do_issue: "DO Issue",
  do_cancel: "DO Cancel",
  adjustment_in: "Adjustment +",
  adjustment_out: "Adjustment −",
  opening_balance: "Opening balance",
};

export const MOVEMENT_VARIANT: Record<StockMovementKind, "success" | "info" | "warning" | "danger" | "muted"> = {
  po_receipt: "success",
  po_receipt_reverse: "warning",
  do_issue: "info",
  do_cancel: "warning",
  adjustment_in: "success",
  adjustment_out: "danger",
  opening_balance: "muted",
};
