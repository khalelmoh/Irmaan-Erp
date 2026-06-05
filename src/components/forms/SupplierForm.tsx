"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supplierSchema, type SupplierInput } from "@/lib/validators";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { Supplier } from "@/types";

interface Props {
  initial?: Partial<Supplier>;
  onSubmit: (data: SupplierInput) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
}

export function SupplierForm({ initial, onSubmit, onCancel, submitLabel = "Save supplier" }: Props) {
  const {
    register, handleSubmit, formState: { errors, isSubmitting },
  } = useForm<SupplierInput>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: initial?.name ?? "",
      contactPerson: initial?.contactPerson ?? "",
      phone: initial?.phone ?? "",
      email: initial?.email ?? "",
      address: initial?.address ?? "",
      city: initial?.city ?? "",
      country: initial?.country ?? "",
      taxId: initial?.taxId ?? "",
      notes: initial?.notes ?? "",
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <F label="Company name *" err={errors.name?.message}><Input {...register("name")} /></F>
      <F label="Contact person" err={errors.contactPerson?.message}><Input {...register("contactPerson")} /></F>
      <F label="Phone *" err={errors.phone?.message}><Input {...register("phone")} /></F>
      <F label="Email" err={errors.email?.message}><Input type="email" {...register("email")} /></F>
      <F label="Address *" err={errors.address?.message} className="md:col-span-2"><Input {...register("address")} /></F>
      <F label="City" err={errors.city?.message}><Input {...register("city")} /></F>
      <F label="Country" err={errors.country?.message}><Input {...register("country")} /></F>
      <F label="Tax ID" err={errors.taxId?.message}><Input {...register("taxId")} /></F>
      <F label="Notes" err={errors.notes?.message} className="md:col-span-2"><Textarea rows={3} {...register("notes")} /></F>

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
