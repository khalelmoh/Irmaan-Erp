"use client";

import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { salesOrderSchema, type SalesOrderInput } from "@/lib/validators";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { dataAdapter } from "@/services";
import type { Customer, Product } from "@/types";
import { Plus, Trash2 } from "lucide-react";
import { currency } from "@/lib/utils";
import { computeSOTotals } from "@/lib/sales-order";

interface Props {
  nextNumberPreview: string;
  defaultSalesperson?: string;
  defaults?: Partial<SalesOrderInput>;
  onSubmit: (data: SalesOrderInput, asQuotation: boolean) => Promise<void>;
}

export function SalesOrderForm({ nextNumberPreview, defaultSalesperson, defaults, onSubmit }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const today = new Date().toISOString().slice(0, 10);
  const validUntil = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const {
    register, handleSubmit, control, setValue, watch,
    formState: { errors, isSubmitting },
  } = useForm<SalesOrderInput>({
    resolver: zodResolver(salesOrderSchema),
    defaultValues: {
      customerId: defaults?.customerId ?? "",
      salespersonName: defaults?.salespersonName ?? defaultSalesperson ?? "",
      orderDate: defaults?.orderDate ?? today,
      validUntil: defaults?.validUntil ?? validUntil,
      items: defaults?.items?.length ? defaults.items : [{ productId: "", name: "", quantity: 1, unit: "Bag", unitPrice: 0 }],
      taxRate: defaults?.taxRate ?? 0.05,
      notes: defaults?.notes ?? "",
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  useEffect(() => {
    Promise.all([dataAdapter.customers.list(), dataAdapter.products.list()]).then(([c, p]) => {
      setCustomers(c); setProducts(p);
    });
  }, []);

  const items = watch("items");
  const taxRate = Number(watch("taxRate")) || 0;
  const totals = useMemo(
    () => computeSOTotals(items.map((i) => ({ quantity: Number(i.quantity) || 0, unitPrice: Number(i.unitPrice) || 0 })), taxRate),
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
          <Label>S.O Number (preview)</Label>
          <div className="h-9 px-3 flex items-center rounded-md border border-dashed border-slate-300 bg-slate-50 font-mono text-sm">
            {nextNumberPreview}
          </div>
        </div>
        <F label="Customer *" err={errors.customerId?.message}>
          <Select {...register("customerId")}>
            <option value="">— Select customer —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </F>
        <F label="Order date *" err={errors.orderDate?.message}>
          <Input type="date" {...register("orderDate")} />
        </F>
        <F label="Valid until (Quotation)" err={errors.validUntil?.message}>
          <Input type="date" {...register("validUntil")} />
        </F>
        <F label="Salesperson *" err={errors.salespersonName?.message}>
          <Input {...register("salespersonName")} />
        </F>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Items</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => append({ productId: "", name: "", quantity: 1, unit: "Bag", unitPrice: 0 })}>
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
                        <option value="">— Pick product —</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}
                      </Select>
                      {errors.items?.[idx]?.productId && <div className="text-xs text-red-600 mt-1">{errors.items[idx]?.productId?.message as string}</div>}
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
              <Textarea rows={3} {...register("notes")} placeholder="Special conditions, delivery terms..." />
            </F>
          </div>
          <div>
            <F label="Tax rate (e.g. 0.05 = 5%)" err={errors.taxRate?.message}>
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
        <Button type="button" variant="secondary" disabled={isSubmitting} onClick={handleSubmit((d) => onSubmit(d, true))}>
          Save as Quotation
        </Button>
        <Button type="button" disabled={isSubmitting} onClick={handleSubmit((d) => onSubmit(d, false))}>
          Confirm Sales Order
        </Button>
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
