"use client";

import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { invoiceSchema, type InvoiceInput } from "@/lib/validators";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { dataAdapter } from "@/services";
import type { Customer, Product, DeliveryOrder } from "@/types";
import { Plus, Trash2 } from "lucide-react";
import { currency } from "@/lib/utils";
import { computeTotals } from "@/lib/invoice";

interface Props {
  nextNumberPreview: string;
  defaults?: Partial<InvoiceInput>;
  /** Optional: lock the customer + DO link (used when invoicing FROM a DO). */
  lockedCustomerId?: string;
  /** DO IDs the invoice is being created from. */
  fromDOIds?: string[];
  onSubmit: (data: InvoiceInput, asDraft: boolean) => Promise<void>;
}

export function InvoiceForm({ nextNumberPreview, defaults, lockedCustomerId, fromDOIds = [], onSubmit }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [linkedDOs, setLinkedDOs] = useState<DeliveryOrder[]>([]);

  const today = new Date().toISOString().slice(0, 10);
  const inThirtyDays = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const {
    register, handleSubmit, control, setValue, watch, reset,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceInput>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      customerId: lockedCustomerId ?? defaults?.customerId ?? "",
      salesOrderId: defaults?.salesOrderId ?? "",
      doIds: fromDOIds,
      type: defaults?.type ?? "invoice",
      originalInvoiceId: defaults?.originalInvoiceId ?? "",
      issueDate: defaults?.issueDate ?? today,
      dueDate: defaults?.dueDate ?? inThirtyDays,
      items: defaults?.items?.length ? defaults.items : [{ productId: "", name: "", quantity: 1, unit: "Pcs", unitPrice: 0 }],
      taxRate: defaults?.taxRate ?? 0.05,
      notes: defaults?.notes ?? "",
    },
  });

  const isCreditNote = watch("type") === "credit_note";

  useEffect(() => {
    if (defaults) {
      reset((prev) => ({ ...prev, ...defaults, items: defaults.items?.length ? defaults.items : prev.items }));
    }
  }, [defaults, reset]);

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  useEffect(() => {
    Promise.all([dataAdapter.customers.list(), dataAdapter.products.list()]).then(([c, p]) => {
      setCustomers(c); setProducts(p);
    });
  }, []);

  useEffect(() => {
    if (fromDOIds.length === 0) return setLinkedDOs([]);
    Promise.all(fromDOIds.map((id) => dataAdapter.deliveryOrders.get(id))).then((ds) =>
      setLinkedDOs(ds.filter(Boolean) as DeliveryOrder[]),
    );
  }, [fromDOIds]);

  const items = watch("items");
  const taxRate = Number(watch("taxRate")) || 0;
  const totals = useMemo(
    () => computeTotals(items.map((i) => ({ quantity: Number(i.quantity) || 0, unitPrice: Number(i.unitPrice) || 0 })), taxRate),
    [items, taxRate],
  );

  function pickProduct(idx: number, productId: string) {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setValue(`items.${idx}.productId`, p.id);
    setValue(`items.${idx}.name`, p.name);
    setValue(`items.${idx}.unit`, p.unit);
    setValue(`items.${idx}.unitPrice`, p.unitPrice);
  }

  return (
    <form className="space-y-6">
      <Card className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <Label>{isCreditNote ? "Credit Note #" : "Invoice #"} (preview)</Label>
          <div className="h-9 px-3 flex items-center rounded-md border border-dashed border-slate-300 bg-slate-50 font-mono text-sm">
            {nextNumberPreview}
          </div>
          <input type="hidden" {...register("salesOrderId")} />
          <input type="hidden" {...register("type")} />
          <input type="hidden" {...register("originalInvoiceId")} />
        </div>
        <F label="Customer *" err={errors.customerId?.message}>
          <Select {...register("customerId")} disabled={!!lockedCustomerId}>
            <option value="">— Select customer —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </F>
        <F label="Issue date *" err={errors.issueDate?.message}>
          <Input type="date" {...register("issueDate")} />
        </F>
        <F label="Due date *" err={errors.dueDate?.message}>
          <Input type="date" {...register("dueDate")} />
        </F>
      </Card>

      {linkedDOs.length > 0 && (
        <Card className="p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Linked Delivery Orders</div>
          <div className="flex flex-wrap gap-2">
            {linkedDOs.map((d) => (
              <span key={d.id} className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-brand-50 border border-brand-100 text-xs">
                <span className="font-mono font-semibold text-brand-800">{d.doNumber}</span>
                <span className="text-slate-500">{d.loadingDetails.destination}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Items</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => append({ productId: "", name: "", quantity: 1, unit: "Pcs", unitPrice: 0 })}>
            <Plus className="h-4 w-4" /> Add row
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-2 w-[34%]">Product</th>
                <th className="text-left px-3 py-2 w-[12%]">Qty</th>
                <th className="text-left px-3 py-2 w-[10%]">Unit</th>
                <th className="text-left px-3 py-2 w-[16%]">Unit price</th>
                <th className="text-right px-3 py-2 w-[18%]">Line total</th>
                <th className="w-[6%]"></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f, idx) => {
                const line = (Number(items[idx]?.quantity) || 0) * (Number(items[idx]?.unitPrice) || 0);
                return (
                  <tr key={f.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2">
                      <Select value={watch(`items.${idx}.productId`)} onChange={(e) => pickProduct(idx, e.target.value)}>
                        <option value="">— Custom / pick product —</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}
                      </Select>
                      <Input className="mt-1" placeholder="Description" {...register(`items.${idx}.name`)} />
                      {errors.items?.[idx]?.name && <div className="text-xs text-red-600 mt-1">{errors.items[idx]?.name?.message as string}</div>}
                    </td>
                    <td className="px-3 py-2"><Input type="number" step="0.01" {...register(`items.${idx}.quantity`)} /></td>
                    <td className="px-3 py-2"><Input {...register(`items.${idx}.unit`)} /></td>
                    <td className="px-3 py-2"><Input type="number" step="0.01" {...register(`items.${idx}.unitPrice`)} /></td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{currency(line)}</td>
                    <td className="px-3 py-2">
                      {fields.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {errors.items?.message && <div className="text-xs text-red-600 mt-2">{errors.items.message as string}</div>}
      </Card>

      <Card className="p-5">
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <F label="Notes">
              <Textarea rows={3} {...register("notes")} placeholder="Payment terms, references, special instructions..." />
            </F>
          </div>
          <div>
            <F label="Tax rate (e.g. 0.05 = 5%) *" err={errors.taxRate?.message}>
              <Input type="number" step="0.001" min="0" max="1" {...register("taxRate")} />
            </F>
            <div className="mt-4 space-y-1.5 text-sm">
              <Row label="Subtotal" value={currency(totals.subtotal)} />
              <Row label={`Tax (${(taxRate * 100).toFixed(2)}%)`} value={currency(totals.taxAmount)} />
              <div className="border-t-2 border-slate-200 pt-2 mt-2">
                <Row label="Total" value={currency(totals.total)} strong />
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => history.back()}>Cancel</Button>
        <Button type="button" variant="secondary" disabled={isSubmitting} onClick={handleSubmit((d) => onSubmit(d, true))}>Save as Draft</Button>
        <Button type="button" disabled={isSubmitting} onClick={handleSubmit((d) => onSubmit(d, false))}>{isCreditNote ? "Create Credit Note" : "Issue Invoice"}</Button>
      </div>
    </form>
  );
}

function F({ label, err, children }: { label: string; err?: string; children: React.ReactNode }) {
  return <div><Label>{label}</Label>{children}{err && <div className="text-xs text-red-600 mt-1">{err}</div>}</div>;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold text-base" : "text-slate-600"}`}>
      <span>{label}</span><span className="tabular-nums text-slate-900">{value}</span>
    </div>
  );
}
