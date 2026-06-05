"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { InvoiceForm } from "@/components/forms/InvoiceForm";
import { dataAdapter } from "@/services";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/audit";
import { currency } from "@/lib/utils";
import { withLineTotals, computeTotals } from "@/lib/invoice";
import type { Invoice } from "@/types";

export default function EditInvoicePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const [doc, setDoc] = useState<Invoice | null>(null);

  useEffect(() => {
    if (!params.id) return;
    dataAdapter.invoices.get(params.id).then((d) => setDoc(d ?? null));
  }, [params.id]);

  if (!doc) {
    return <div className="text-sm text-slate-500">Loading document…</div>;
  }

  if (doc.status !== "draft") {
    return <div className="text-sm text-red-600 p-4 bg-red-50 rounded-md">Only drafts can be edited.</div>;
  }

  return (
    <>
      <PageHeader title={`Edit ${doc.invoiceNumber}`} description="Update the document draft." />
      <InvoiceForm
        nextNumberPreview={doc.invoiceNumber}
        defaults={doc as never}
        lockedCustomerId={doc.doIds.length > 0 ? doc.customerId : undefined}
        fromDOIds={doc.doIds}
        onSubmit={async (data, asDraft) => {
          const customer = await dataAdapter.customers.get(data.customerId);
          if (!customer) throw new Error("Customer not found");

          const items = withLineTotals(data.items);
          const totals = computeTotals(items, data.taxRate);

          const updated = await dataAdapter.invoices.update(doc.id, {
            customerId: data.customerId,
            customerSnapshot: { name: customer.name, address: customer.address, phone: customer.phone },
            issueDate: new Date(data.issueDate).toISOString(),
            dueDate: new Date(data.dueDate).toISOString(),
            items,
            subtotal: totals.subtotal,
            taxRate: data.taxRate,
            taxAmount: totals.taxAmount,
            total: totals.total,
            status: asDraft ? "draft" : "sent",
            notes: data.notes ?? "",
          } as never);

          const isIssue = asDraft === false;
          
          await logActivity(user, {
            action: isIssue ? "invoice.send" : "invoice.update",
            entityType: doc.type === "credit_note" ? "credit_note" : "invoice",
            entityId: doc.id,
            entityLabel: doc.invoiceNumber,
            summary: isIssue 
              ? `Issued ${doc.invoiceNumber} to ${customer.name} (${currency(totals.total)})`
              : `Updated draft ${doc.invoiceNumber}`,
            diff: isIssue ? { status: { from: "draft", to: "sent" } } : undefined,
          });

          router.push(`/invoices/${doc.id}`);
        }}
      />
    </>
  );
}
