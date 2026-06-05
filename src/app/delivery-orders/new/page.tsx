"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { DeliveryOrderForm } from "@/components/forms/DeliveryOrderForm";
import { dataAdapter } from "@/services";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/audit";
import { currency } from "@/lib/utils";

export default function NewDOPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const soId = searchParams.get("soId");
  const { user } = useAuth();
  const [preview, setPreview] = useState("DO-00001");
  const [defaults, setDefaults] = useState<any>(undefined);

  useEffect(() => {
    dataAdapter.deliveryOrders.nextNumber().then(setPreview);
    if (soId) {
      dataAdapter.salesOrders.get(soId).then((so) => {
        if (so) {
          import("@/lib/sales-order").then(({ remainingToDeliver }) => {
            const itemsToDeliver = remainingToDeliver(so);
            setDefaults({
              customerId: so.customerId,
              salespersonName: so.salespersonName,
              salesOrderId: so.id,
              items: itemsToDeliver.map((it) => ({
                productId: it.productId,
                name: it.name,
                quantity: it.remaining,
                unit: it.unit,
                unitPrice: it.unitPrice,
              })),
            });
          });
        }
      });
    }
  }, [soId]);

  return (
    <>
      <PageHeader title="New Delivery Order" description="Create and issue a D.O document." />
      <DeliveryOrderForm
        nextNumberPreview={preview}
        defaultSalesperson={user?.displayName}
        defaults={defaults}
        onSubmit={async (data, asDraft) => {
          const customer = await dataAdapter.customers.get(data.customerId);
          if (!customer) throw new Error("Customer not found");
          const created = await dataAdapter.deliveryOrders.create({
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
            qrPayload: "",
            notes: data.notes ?? "",
            createdBy: user?.uid ?? "",
            salesOrderId: data.salesOrderId,
          } as never);
          
          if (data.salesOrderId) {
            await dataAdapter.salesOrders.updateDeliveredQty(data.salesOrderId, data.items.map(it => ({
              productId: it.productId,
              quantity: it.quantity,
            })));
          }

          const value = data.items.reduce(
            (s, it) => s + (Number(it.unitPrice) || 0) * Number(it.quantity), 0,
          );
          await logActivity(user, {
            action: "do.create",
            entityType: "delivery_order",
            entityId: created.id,
            entityLabel: created.doNumber,
            summary: `Created ${asDraft ? "draft " : ""}${created.doNumber} for ${customer.name} (${currency(value)}, ${data.items.length} line${data.items.length === 1 ? "" : "s"})`,
            metadata: { customerId: data.customerId, lineCount: data.items.length, value },
          });
          router.push(`/delivery-orders/${created.id}`);
        }}
      />
    </>
  );
}
