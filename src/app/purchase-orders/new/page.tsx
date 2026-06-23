"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { PurchaseOrderForm } from "@/components/forms/PurchaseOrderForm";
import { dataAdapter } from "@/services";
import { useAuth } from "@/contexts/AuthContext";
import { withLineTotals, computePOTotals } from "@/lib/purchase-order";
import { logActivity } from "@/lib/audit";
import { currency } from "@/lib/utils";

export default function NewPOPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [preview, setPreview] = useState("PO-00001");
  const [defaultTaxRate, setDefaultTaxRate] = useState(0);

  useEffect(() => {
    dataAdapter.purchaseOrders.nextNumber().then(setPreview);
    dataAdapter.settings.get().then((settings) => setDefaultTaxRate(settings.defaultTaxRate));
  }, []);

  return (
    <>
      <PageHeader title="New Purchase Order" description="Order goods from a supplier." />
      <PurchaseOrderForm
        nextNumberPreview={preview}
        defaults={{ taxRate: defaultTaxRate }}
        onSubmit={async (data, asDraft) => {
          const supplier = await dataAdapter.suppliers.get(data.supplierId);
          if (!supplier) throw new Error("Supplier not found");
          const items = withLineTotals(data.items);
          const totals = computePOTotals(items, data.taxRate);
          const created = await dataAdapter.purchaseOrders.create({
            supplierId: data.supplierId,
            supplierSnapshot: { name: supplier.name, address: supplier.address, phone: supplier.phone },
            orderDate: new Date(data.orderDate).toISOString(),
            expectedDelivery: data.expectedDelivery ? new Date(data.expectedDelivery).toISOString() : undefined,
            items: items.map((it) => ({ ...it, receivedQty: 0 })),
            subtotal: totals.subtotal,
            taxRate: data.taxRate,
            taxAmount: totals.taxAmount,
            total: totals.total,
            amountPaid: 0,
            status: asDraft ? "draft" : "sent",
            qrPayload: "",
            notes: data.notes ?? "",
            createdBy: user?.uid ?? "",
          } as never);
          await logActivity(user, {
            action:
              created.approvalStatus === "pending"
                ? "po.approval_requested"
                : "po.create",
            entityType: "purchase_order",
            entityId: created.id,
            entityLabel: created.poNumber,
            summary:
              created.approvalStatus === "pending"
                ? `Created ${created.poNumber} and requested approval for ${supplier.name} (${currency(totals.total)})`
                : `Created ${created.status === "draft" ? "draft " : ""}${created.poNumber} for ${supplier.name} (${currency(totals.total)})`,
            metadata: { supplierId: data.supplierId, total: totals.total },
          });
          router.push(`/purchase-orders/${created.id}`);
        }}
      />
    </>
  );
}
