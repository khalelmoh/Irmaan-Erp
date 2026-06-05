"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { InvoiceForm } from "@/components/forms/InvoiceForm";
import { dataAdapter } from "@/services";
import type { DeliveryOrder } from "@/types";
import { withLineTotals, computeTotals } from "@/lib/invoice";
import { logActivity } from "@/lib/audit";
import { useAuth } from "@/contexts/AuthContext";
import { currency } from "@/lib/utils";
import type { SalesOrder, Invoice } from "@/types";

export default function NewInvoicePage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}>
      <NewInvoiceInner />
    </Suspense>
  );
}

function NewInvoiceInner() {
  const router = useRouter();
  const { user } = useAuth();
  const search = useSearchParams();
  const fromDOParam = search.get("fromDO"); // comma-separated DO ids
  const soId = search.get("soId");
  const creditNoteForId = search.get("creditNoteFor");
  const [preview, setPreview] = useState("INV-00001");
  const [sourceDOs, setSourceDOs] = useState<DeliveryOrder[]>([]);
  const [sourceSO, setSourceSO] = useState<SalesOrder | null>(null);
  const [sourceInvoice, setSourceInvoice] = useState<Invoice | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    dataAdapter.invoices.nextNumber().then(setPreview);
  }, []);

  useEffect(() => {
    if (!fromDOParam && !soId && !creditNoteForId) { setLoaded(true); return; }
    
    if (creditNoteForId) {
      dataAdapter.invoices.get(creditNoteForId).then((inv) => {
        setSourceInvoice(inv ?? null);
        setLoaded(true);
      });
      return;
    }

    if (soId) {
      dataAdapter.salesOrders.get(soId).then((so) => {
        setSourceSO(so ?? null);
        setLoaded(true);
      });
      return;
    }

    const ids = fromDOParam!.split(",").filter(Boolean);
    Promise.all(ids.map((id) => dataAdapter.deliveryOrders.get(id))).then((ds) => {
      setSourceDOs(ds.filter(Boolean) as DeliveryOrder[]);
      setLoaded(true);
    });
  }, [fromDOParam, soId]);

  if (!loaded) return <div className="text-sm text-slate-500">Loading source document…</div>;

  // Pre-fill the form if we're invoicing from one or more DOs, or a Sales Order
  let seed: any = undefined;
  if (sourceDOs.length > 0) {
    seed = {
      customerId: sourceDOs[0].customerId,
      items: sourceDOs.flatMap((d) =>
        d.items.map((it) => ({
          productId: it.productId,
          name: it.name,
          quantity: it.quantity,
          unit: it.unit,
          unitPrice: it.unitPrice ?? 0,
        })),
      ),
    };
  } else if (sourceSO) {
    let remainingToInvoice: any;
    try {
      remainingToInvoice = require("@/lib/sales-order").remainingToInvoice;
    } catch (e) {
      remainingToInvoice = () => sourceSO.items;
    }
    const itemsToInvoice = remainingToInvoice(sourceSO);
    seed = {
      customerId: sourceSO.customerId,
      salesOrderId: sourceSO.id,
      items: itemsToInvoice.map((it: any) => ({
        productId: it.productId,
        name: it.name,
        quantity: it.remaining,
        unit: it.unit,
        unitPrice: it.unitPrice,
      })),
    };
  } else if (sourceInvoice) {
    seed = {
      type: "credit_note",
      originalInvoiceId: sourceInvoice.id,
      customerId: sourceInvoice.customerId,
      items: sourceInvoice.items.map((it) => ({ ...it })),
    };
  }

  const sameCustomer = sourceDOs.every((d) => d.customerId === sourceDOs[0]?.customerId);

  return (
    <>
      <PageHeader
        title={sourceInvoice ? "New Credit Note" : sourceDOs.length ? `New invoice from ${sourceDOs.length} D.O` : sourceSO ? `New invoice from S.O` : "New invoice"}
        description={sourceInvoice ? `Refunding ${sourceInvoice.invoiceNumber}.` : sourceDOs.length ? "Items pre-filled from the delivery order(s). You can edit before issuing." : sourceSO ? "Items pre-filled from the sales order. You can edit before issuing." : "Bill a customer for goods or services."}
      />
      {sourceDOs.length > 0 && !sameCustomer && (
        <div className="mb-4 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
          ⚠ The selected delivery orders are for different customers. Please review before saving.
        </div>
      )}
      <InvoiceForm
        nextNumberPreview={preview}
        defaults={seed as never}
        lockedCustomerId={sourceDOs[0]?.customerId || sourceSO?.customerId || sourceInvoice?.customerId}
        fromDOIds={sourceDOs.map((d) => d.id)}
        onSubmit={async (data, asDraft) => {
          const customer = await dataAdapter.customers.get(data.customerId);
          if (!customer) throw new Error("Customer not found");
          const items = withLineTotals(data.items);
          const totals = computeTotals(items, data.taxRate);
          const created = await dataAdapter.invoices.create({
            customerId: data.customerId,
            customerSnapshot: { name: customer.name, address: customer.address, phone: customer.phone },
            doIds: data.doIds,
            issueDate: new Date(data.issueDate).toISOString(),
            dueDate: new Date(data.dueDate).toISOString(),
            items,
            subtotal: totals.subtotal,
            taxRate: data.taxRate,
            taxAmount: totals.taxAmount,
            total: totals.total,
            amountPaid: 0,
            status: asDraft ? "draft" : "sent",
            notes: data.notes ?? "",
            salesOrderId: data.salesOrderId,
            type: data.type ?? "invoice",
            originalInvoiceId: data.originalInvoiceId,
          } as never);
          
          if (data.salesOrderId) {
            await dataAdapter.salesOrders.updateInvoicedQty(data.salesOrderId, data.items.map(it => ({
              productId: it.productId,
              quantity: it.quantity,
            })));
          }

          await logActivity(user, {
            action: created.type === "credit_note" ? "credit_note.create" : "invoice.create",
            entityType: created.type === "credit_note" ? "credit_note" : "invoice",
            entityId: created.id,
            entityLabel: created.invoiceNumber,
            summary: `Created ${asDraft ? "draft " : ""}${created.type === "credit_note" ? "credit note" : "invoice"} ${created.invoiceNumber} for ${customer.name} (${currency(totals.total)})`,
            metadata: { customerId: data.customerId, total: totals.total, doIds: data.doIds, type: created.type },
          });
          router.push(`/invoices/${created.id}`);
        }}
      />
    </>
  );
}
