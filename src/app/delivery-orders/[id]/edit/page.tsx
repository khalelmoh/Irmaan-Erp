"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { DeliveryOrderForm } from "@/components/forms/DeliveryOrderForm";
import { dataAdapter } from "@/services";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/audit";
import { currency } from "@/lib/utils";
import type { DeliveryOrder } from "@/types";
import { useToast } from "@/contexts/ToastContext";
import { errorMessage } from "@/lib/retry";

export default function EditDOPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const [doc, setDoc] = useState<DeliveryOrder | null>(null);

  useEffect(() => {
    if (!params.id) return;
    dataAdapter.deliveryOrders.get(params.id).then((d) => setDoc(d ?? null));
  }, [params.id]);

  if (!doc) {
    return <div className="text-sm text-slate-500">Loading document…</div>;
  }

  if (doc.status !== "draft") {
    return <div className="text-sm text-red-600 p-4 bg-red-50 rounded-md">Only draft delivery orders can be edited.</div>;
  }

  return (
    <>
      <PageHeader title={`Edit ${doc.doNumber}`} description="Update the delivery order draft." />
      <DeliveryOrderForm
        nextNumberPreview={doc.doNumber}
        defaultSalesperson={doc.salespersonName}
        defaults={doc as never}
        onSubmit={async (data, asDraft) => {
          try {
            const customer = await dataAdapter.customers.get(data.customerId);
            if (!customer) throw new Error("Customer not found");

            await dataAdapter.deliveryOrders.update(doc.id, {
              customerId: data.customerId,
              customerSnapshot: {
                name: customer.name,
                address: customer.address,
                phone: customer.phone,
              },
              salespersonId: user?.uid ?? "",
              salespersonName: data.salespersonName,
              orderDate: new Date(data.orderDate).toISOString(),
              items: data.items.map((it) => ({
                productId: it.productId,
                name: it.name,
                quantity: it.quantity,
                unit: it.unit,
                unitPrice: it.unitPrice,
              })),
              loadingDetails: data.loadingDetails,
              status: asDraft ? "draft" : "issued",
              authorizedBy: data.authorizedBy ?? "",
              notes: data.notes ?? "",
            } as never);

            // If transitioning from draft to issued, handle stock/audit differently
            const isIssue = asDraft === false;

            const value = data.items.reduce((s, it) => s + (Number(it.unitPrice) || 0) * Number(it.quantity), 0);

            await logActivity(user, {
              action: isIssue ? "do.issue" : "do.update",
              entityType: "delivery_order",
              entityId: doc.id,
              entityLabel: doc.doNumber,
              summary: isIssue
                ? `Issued ${doc.doNumber} to ${customer.name} (${currency(value)})`
                : `Updated draft ${doc.doNumber}`,
              diff: isIssue ? { status: { from: "draft", to: "issued" } } : undefined,
            });

            toast.success(
              isIssue ? "Delivery order issued" : "Draft saved",
              isIssue ? `${doc.doNumber} is now ready for delivery.` : `${doc.doNumber} was updated.`,
            );
            router.push(`/delivery-orders/${doc.id}`);
          } catch (error) {
            toast.error(
              asDraft ? "Couldn't save delivery order" : "Couldn't issue delivery order",
              errorMessage(error),
            );
          }
        }}
      />
    </>
  );
}
