"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { PurchaseOrderForm } from "@/components/forms/PurchaseOrderForm";
import { dataAdapter } from "@/services";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/audit";
import { currency } from "@/lib/utils";
import { withLineTotals, computePOTotals } from "@/lib/purchase-order";
import type { PurchaseOrder } from "@/types";

export default function EditPOPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const [doc, setDoc] = useState<PurchaseOrder | null>(null);

  useEffect(() => {
    if (!params.id) return;
    dataAdapter.purchaseOrders.get(params.id).then((d) => setDoc(d ?? null));
  }, [params.id]);

  if (!doc) {
    return <div className="text-sm text-slate-500">Loading document…</div>;
  }

  if (doc.status !== "draft") {
    return <div className="text-sm text-red-600 p-4 bg-red-50 rounded-md">Only draft purchase orders can be edited.</div>;
  }

  return (
    <>
      <PageHeader title={`Edit ${doc.poNumber}`} description="Update the purchase order draft." />
      <PurchaseOrderForm
        nextNumberPreview={doc.poNumber}
        defaults={doc as never}
        onSubmit={async (data, asDraft) => {
          const supplier = await dataAdapter.suppliers.get(data.supplierId);
          if (!supplier) throw new Error("Supplier not found");

          const items = withLineTotals(data.items);
          const totals = computePOTotals(items, data.taxRate);

          const updated = await dataAdapter.purchaseOrders.update(doc.id, {
            supplierId: data.supplierId,
            supplierSnapshot: {
              name: supplier.name,
              address: supplier.address,
              phone: supplier.phone,
            },
            orderDate: new Date(data.orderDate).toISOString(),
            expectedDelivery: data.expectedDelivery ? new Date(data.expectedDelivery).toISOString() : undefined,
            items: items.map((it) => ({ ...it, receivedQty: 0 })),
            subtotal: totals.subtotal,
            taxRate: data.taxRate,
            taxAmount: totals.taxAmount,
            total: totals.total,
            status: asDraft ? "draft" : "sent",
            notes: data.notes ?? "",
          } as never);

          const isIssue = updated.status === "sent";
          const requestedApproval =
            updated.status === "draft" && updated.approvalStatus === "pending";
          
          await logActivity(user, {
            action: isIssue ? "po.confirm" : requestedApproval ? "po.approval_requested" : "po.update",
            entityType: "purchase_order",
            entityId: doc.id,
            entityLabel: doc.poNumber,
            summary: isIssue
              ? `Confirmed ${doc.poNumber} for ${supplier.name} (${currency(totals.total)})`
              : requestedApproval
                ? `Updated ${doc.poNumber} and requested approval`
              : `Updated draft ${doc.poNumber}`,
            diff: isIssue ? { status: { from: "draft", to: "sent" } } : undefined,
          });

          router.push(`/purchase-orders/${doc.id}`);
        }}
      />
    </>
  );
}
