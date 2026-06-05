"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { SalesOrderForm } from "@/components/forms/SalesOrderForm";
import { dataAdapter } from "@/services";
import { useAuth } from "@/contexts/AuthContext";
import { withSOLineTotals, computeSOTotals } from "@/lib/sales-order";
import { logActivity } from "@/lib/audit";
import { currency } from "@/lib/utils";

export default function NewSOPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [preview, setPreview] = useState("SO-00001");
  const [defaultTaxRate, setDefaultTaxRate] = useState(0.05);

  useEffect(() => {
    dataAdapter.salesOrders.nextNumber().then(setPreview);
    dataAdapter.settings?.get().then((s) => {
      if (s) setDefaultTaxRate(s.defaultTaxRate);
    });
  }, []);

  return (
    <>
      <PageHeader title="New Sales Order / Quotation" description="Create a quotation or confirm a sales order for a customer." />
      <SalesOrderForm
        nextNumberPreview={preview}
        defaultSalesperson={user?.displayName}
        defaults={{ taxRate: defaultTaxRate }}
        onSubmit={async (data, asQuotation) => {
          const customer = await dataAdapter.customers.get(data.customerId);
          if (!customer) throw new Error("Customer not found");
          const items = withSOLineTotals(data.items as any);
          const totals = computeSOTotals(items, data.taxRate);
          const created = await dataAdapter.salesOrders.create({
            customerId: data.customerId,
            customerSnapshot: { name: customer.name, address: customer.address, phone: customer.phone },
            salespersonName: data.salespersonName,
            orderDate: new Date(data.orderDate).toISOString(),
            validUntil: data.validUntil ? new Date(data.validUntil).toISOString() : undefined,
            items: items.map((it: any) => ({ ...it, deliveredQty: 0, invoicedQty: 0 })),
            subtotal: totals.subtotal,
            taxRate: data.taxRate,
            taxAmount: totals.taxAmount,
            total: totals.total,
            status: asQuotation ? "quotation" : "confirmed",
            notes: data.notes ?? "",
            createdBy: user?.uid ?? "",
          } as never);
          await logActivity(user, {
            action: "so.create",
            entityType: "sales_order",
            entityId: created.id,
            entityLabel: created.soNumber,
            summary: `Created ${asQuotation ? 'quotation' : 'sales order'} ${created.soNumber} for ${customer.name} (${currency(totals.total)})`,
            metadata: { customerId: data.customerId, total: totals.total },
          });
          router.push(`/sales-orders/${created.id}`);
        }}
      />
    </>
  );
}
