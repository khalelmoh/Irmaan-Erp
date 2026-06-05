"use client";

import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { deliveryOrderSchema, type DeliveryOrderInput } from "@/lib/validators";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { dataAdapter } from "@/services";
import type { Customer, Product } from "@/types";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { currency } from "@/lib/utils";

interface Props {
  nextNumberPreview: string;
  defaultSalesperson?: string;
  defaults?: Partial<DeliveryOrderInput>;
  onSubmit: (data: DeliveryOrderInput, asDraft: boolean) => Promise<void>;
}

export function DeliveryOrderForm({ nextNumberPreview, defaultSalesperson, defaults, onSubmit }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [poAvailable, setPoAvailable] = useState<Record<string, number>>({});
  const [poBreakdowns, setPoBreakdowns] = useState<Record<string, Array<{ poNumber: string; remaining: number }>>>({});

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DeliveryOrderInput>({
    resolver: zodResolver(deliveryOrderSchema),
    defaultValues: {
      customerId: defaults?.customerId ?? "",
      salesOrderId: defaults?.salesOrderId ?? "",
      salespersonName: defaults?.salespersonName ?? defaultSalesperson ?? "",
      orderDate: defaults?.orderDate ?? new Date().toISOString().slice(0, 10),
      items: defaults?.items?.length ? defaults.items : [{ productId: "", name: "", quantity: 1, unit: "Bag", unitPrice: 0 }],
      loadingDetails: defaults?.loadingDetails ?? { driverName: "", mobile: "", truckPlate: "", owner: "", destination: "" },
      authorizedBy: defaults?.authorizedBy ?? "",
      notes: defaults?.notes ?? "",
    },
  });

  useEffect(() => {
    if (defaults) {
      reset((prev) => ({ ...prev, ...defaults, items: defaults.items?.length ? defaults.items : prev.items }));
    }
  }, [defaults, reset]);

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  useEffect(() => {
    Promise.all([dataAdapter.customers.list(), dataAdapter.products.list()]).then(([c, p]) => {
      setCustomers(c);
      setProducts(p);
      
      Promise.all(p.map(prod => dataAdapter.purchaseOrders.availableStock(prod.id))).then(results => {
        const stocks: Record<string, number> = {};
        const allocs: Record<string, any[]> = {};
        p.forEach((prod, i) => {
           stocks[prod.id] = results[i].reduce((sum, r) => sum + r.remaining, 0);
           allocs[prod.id] = results[i];
        });
        setPoAvailable(stocks);
        setPoBreakdowns(allocs);
      });
    });
  }, []);

  const customerId = watch("customerId");
  useEffect(() => {
    const c = customers.find((x) => x.id === customerId);
    if (c) setValue("loadingDetails.owner", c.name);
  }, [customerId, customers, setValue]);

  const items = watch("items");
  const total = items.reduce((s, i) => s + (Number(i.unitPrice) || 0) * (Number(i.quantity) || 0), 0);

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
      {/* Top bar */}
      <Card className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <Label>D.O Number (preview)</Label>
          <div className="h-9 px-3 flex items-center rounded-md border border-dashed border-slate-300 bg-slate-50 font-mono text-sm text-slate-700">
            {nextNumberPreview}
          </div>
          <input type="hidden" {...register("salesOrderId")} />
        </div>
        <F label="Customer *" err={errors.customerId?.message}>
          <Select {...register("customerId")}>
            <option value="">— Select customer —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </F>
        <F label="Salesperson *" err={errors.salespersonName?.message}>
          <Input {...register("salespersonName")} />
        </F>
        <F label="Order date *" err={errors.orderDate?.message}>
          <Input type="date" {...register("orderDate")} />
        </F>
      </Card>

      {/* Items */}
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
                <th className="text-left px-3 py-2 w-[30%]">Product</th>
                <th className="text-right px-3 py-2 w-[10%]">PO Available</th>
                <th className="text-left px-3 py-2 w-[12%]">Quantity</th>
                <th className="text-left px-3 py-2 w-[10%]">Unit</th>
                <th className="text-left px-3 py-2 w-[14%]">Unit price</th>
                <th className="text-right px-3 py-2 w-[18%]">Line total</th>
                <th className="w-[6%]"></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f, idx) => {
                const line = (Number(items[idx]?.quantity) || 0) * (Number(items[idx]?.unitPrice) || 0);
                const productId = watch(`items.${idx}.productId`);
                const product = products.find((p) => p.id === productId);
                const avail = poAvailable[productId] ?? 0;
                const qty = Number(items[idx]?.quantity) || 0;
                const insufficient = product && qty > avail;
                return (
                  <tr key={f.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2">
                      <Select value={productId} onChange={(e) => pickProduct(idx, e.target.value)}>
                        <option value="">— Pick product —</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}
                      </Select>
                      {errors.items?.[idx]?.productId && <div className="text-xs text-red-600 mt-1">{errors.items[idx]?.productId?.message as string}</div>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs pt-3">
                      {product ? (
                        <span className={insufficient ? "text-red-600 font-semibold" : "text-slate-600"} title={`Total physical stock is ${product.stock}`}>
                          {avail.toLocaleString()}
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <Input type="number" step="0.01" {...register(`items.${idx}.quantity`)} className={insufficient ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""} />
                      {insufficient && (
                        <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Exceeds PO stock by {(qty - avail).toLocaleString()}
                        </div>
                      )}
                      {errors.items?.[idx]?.quantity && <div className="text-xs text-red-600 mt-1">{errors.items[idx]?.quantity?.message as string}</div>}
                    </td>
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
            <tfoot>
              <tr className="border-t-2 border-slate-200">
                <td colSpan={5} className="px-3 py-3 text-right text-sm text-slate-500 uppercase">Total value</td>
                <td className="px-3 py-3 text-right font-semibold">{currency(total)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        {errors.items?.message && <div className="text-xs text-red-600 mt-2">{errors.items.message as string}</div>}

        {/* Allocation preview */}
        {items.some(it => it.productId && Number(it.quantity) > 0) && (
          <div className="mt-6 pt-4 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Allocation Preview</h3>
            <div className="text-xs text-slate-500 mb-3">Stock will be consumed from the following Purchase Orders (FIFO):</div>
            <div className="bg-slate-50 rounded-md border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-600 text-xs">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Product</th>
                    <th className="text-left px-3 py-2 font-medium">From PO</th>
                    <th className="text-right px-3 py-2 font-medium">Allocated Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((it, idx) => {
                    const productId = it.productId;
                    if (!productId) return null;
                    const qty = Number(it.quantity) || 0;
                    if (qty <= 0) return null;
                    const breakdown = poBreakdowns[productId] || [];
                    
                    let remainingToAllocate = qty;
                    const rows = [];
                    for (const b of breakdown) {
                      if (remainingToAllocate <= 0) break;
                      const allocQty = Math.min(remainingToAllocate, b.remaining);
                      rows.push(
                        <tr key={`${idx}-${b.poNumber}`}>
                          <td className="px-3 py-2 text-slate-700">{it.name}</td>
                          <td className="px-3 py-2 text-slate-700 font-mono text-xs">{b.poNumber}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-medium">{allocQty.toLocaleString()}</td>
                        </tr>
                      );
                      remainingToAllocate -= allocQty;
                    }
                    if (remainingToAllocate > 0) {
                      rows.push(
                        <tr key={`${idx}-unfulfilled`} className="bg-red-50">
                          <td className="px-3 py-2 text-red-700">{it.name}</td>
                          <td className="px-3 py-2 text-red-700 text-xs italic">Unfulfilled</td>
                          <td className="px-3 py-2 text-right tabular-nums text-red-700 font-medium">{remainingToAllocate.toLocaleString()}</td>
                        </tr>
                      );
                    }
                    return rows;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {/* Loading details */}
      <Card className="p-5">
        <h2 className="font-semibold mb-3">Loading details</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <F label="Driver name *" err={errors.loadingDetails?.driverName?.message}>
            <Input {...register("loadingDetails.driverName")} placeholder="JIBRIL" />
          </F>
          <F label="Mobile *" err={errors.loadingDetails?.mobile?.message}>
            <Input {...register("loadingDetails.mobile")} placeholder="634443061" />
          </F>
          <F label="Truck plate *" err={errors.loadingDetails?.truckPlate?.message}>
            <Input {...register("loadingDetails.truckPlate")} placeholder="Z8997" className="font-mono uppercase" />
          </F>
          <F label="Owner *" err={errors.loadingDetails?.owner?.message}>
            <Input {...register("loadingDetails.owner")} />
          </F>
          <F label="Destination *" err={errors.loadingDetails?.destination?.message}>
            <Input {...register("loadingDetails.destination")} placeholder="ARABSIYO" className="uppercase" />
          </F>
          <F label="Authorized by">
            <Input {...register("authorizedBy")} placeholder="Manager name" />
          </F>
        </div>
        <div className="mt-4">
          <F label="Notes">
            <Textarea rows={2} {...register("notes")} placeholder="Special instructions..." />
          </F>
        </div>
      </Card>

      {/* Stock impact preview */}
      <div className="rounded-md bg-sky-50 border border-sky-200 px-3 py-2 text-xs text-sky-800">
        ℹ️ Issuing this D.O will <strong>decrement product stock</strong> by the quantities above.
        Cancelling later will return the stock to inventory.
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => history.back()}>Cancel</Button>
        <Button type="button" variant="secondary" disabled={isSubmitting} onClick={handleSubmit((d) => onSubmit(d, true))}>Save as Draft</Button>
        <Button type="button" disabled={isSubmitting} onClick={handleSubmit((d) => onSubmit(d, false))}>Issue Delivery Order</Button>
      </div>
    </form>
  );
}

function F({ label, err, children }: { label: string; err?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {err && <div className="text-xs text-red-600 mt-1">{err}</div>}
    </div>
  );
}
