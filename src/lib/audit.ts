import { dataAdapter } from "@/services";
import type { ActivityAction, EntityType, User, ActivityLog } from "@/types";

/**
 * Convenience wrapper used throughout the UI to record activity.
 * Errors here are swallowed and console-warned — we never want logging
 * to break a real business action.
 */
export async function logActivity(
  user: User | null,
  args: {
    action: ActivityAction;
    entityType: EntityType;
    entityId: string;
    entityLabel: string;
    summary: string;
    diff?: ActivityLog["diff"];
    metadata?: ActivityLog["metadata"];
  },
) {
  try {
    await dataAdapter.activityLog.log({
      actorUid: user?.uid ?? "system",
      actorName: user?.displayName ?? "System",
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      entityLabel: args.entityLabel,
      summary: args.summary,
      diff: args.diff,
      metadata: args.metadata,
    });
  } catch (err) {
    // Never break business actions due to logging failures
    if (typeof window !== "undefined") {
      console.warn("[audit] failed to log activity:", err);
    }
  }
}

export const ACTION_LABEL: Record<ActivityAction, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "auth.password_reset_requested": "Password reset requested",
  "settings.update": "Updated settings",
  "customer.create": "Created customer",
  "customer.update": "Updated customer",
  "supplier.create": "Created supplier",
  "supplier.update": "Updated supplier",
  "product.create": "Created product",
  "product.update": "Updated product",
  "do.create": "Created delivery order",
  "do.update": "Updated delivery order",
  "do.cancel": "Cancelled delivery order",
  "do.issue": "Issued delivery order",
  "do.mark_delivered": "Marked delivered",
  "po.create": "Created purchase order",
  "po.update": "Updated purchase order",
  "po.confirm": "Confirmed purchase order",
  "po.cancel": "Cancelled purchase order",
  "po.receive": "Received PO items",
  "po.payment": "Paid supplier",
  "po.approval_requested": "Requested PO approval",
  "po.approved": "Approved purchase order",
  "po.rejected": "Rejected purchase order",
  "invoice.create": "Created invoice",
  "invoice.update": "Updated invoice",
  "invoice.cancel": "Cancelled invoice",
  "invoice.send": "Marked invoice sent",
  "invoice.payment": "Recorded payment",
  "credit_note.create": "Created credit note",
  "stock.adjust": "Adjusted stock",
  "so.create": "Created sales order",
  "so.update": "Updated sales order",
  "so.confirm": "Confirmed sales order",
  "so.cancel": "Cancelled sales order",
};

export const ACTION_TONE: Record<ActivityAction, "info" | "success" | "warning" | "danger" | "muted"> = {
  "auth.login": "muted",
  "auth.logout": "muted",
  "auth.password_reset_requested": "warning",
  "settings.update": "info",
  "customer.create": "info",
  "customer.update": "muted",
  "supplier.create": "info",
  "supplier.update": "muted",
  "product.create": "info",
  "product.update": "muted",
  "do.create": "success",
  "do.update": "muted",
  "do.cancel": "danger",
  "do.issue": "info",
  "do.mark_delivered": "success",
  "po.create": "success",
  "po.update": "muted",
  "po.confirm": "info",
  "po.cancel": "danger",
  "po.receive": "success",
  "po.payment": "info",
  "po.approval_requested": "warning",
  "po.approved": "success",
  "po.rejected": "danger",
  "invoice.create": "success",
  "invoice.update": "muted",
  "invoice.cancel": "danger",
  "invoice.send": "info",
  "invoice.payment": "success",
  "credit_note.create": "warning",
  "stock.adjust": "warning",
  "so.create": "success",
  "so.update": "muted",
  "so.confirm": "info",
  "so.cancel": "danger",
};
