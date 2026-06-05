"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { productSchema, type ProductInput } from "@/lib/validators";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { Product } from "@/types";

interface Props {
  initial?: Partial<Product>;
  onSubmit: (data: ProductInput) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
}

const units: ProductInput["unit"][] = ["Bag", "Box", "Pcs", "Ton", "Liter", "Kg", "Meter"];

export function ProductForm({ initial, onSubmit, onCancel, submitLabel = "Save product" }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      unit: initial?.unit ?? "Bag",
      unitPrice: initial?.unitPrice ?? 0,
      cost: initial?.cost ?? 0,
      stock: initial?.stock ?? 0,
      reorderLevel: initial?.reorderLevel ?? 0,
      category: initial?.category ?? "",
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <F label="Product name *" err={errors.name?.message} className="md:col-span-2">
        <Input {...register("name")} />
      </F>
      <F label="Description" err={errors.description?.message} className="md:col-span-2">
        <Textarea rows={2} {...register("description")} />
      </F>
      <F label="Unit *" err={errors.unit?.message}>
        <Select {...register("unit")}>
          {units.map((u) => <option key={u} value={u}>{u}</option>)}
        </Select>
      </F>
      <F label="Category" err={errors.category?.message}>
        <Input {...register("category")} />
      </F>
      <F label="Unit price *" err={errors.unitPrice?.message}>
        <Input type="number" step="0.01" {...register("unitPrice")} />
      </F>
      <F label="Cost" err={errors.cost?.message}>
        <Input type="number" step="0.01" {...register("cost")} />
      </F>
      <F label="Stock *" err={errors.stock?.message}>
        <Input type="number" {...register("stock")} />
      </F>
      <F label="Reorder level" err={errors.reorderLevel?.message}>
        <Input type="number" {...register("reorderLevel")} />
      </F>
      <div className="md:col-span-2 flex justify-end gap-2 pt-2 border-t border-slate-100">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={isSubmitting}>{submitLabel}</Button>
      </div>
    </form>
  );
}

function F({ label, err, className, children }: { label: string; err?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
      {err && <div className="text-xs text-red-600 mt-1">{err}</div>}
    </div>
  );
}
