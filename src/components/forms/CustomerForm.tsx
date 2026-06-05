"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { customerSchema, type CustomerInput } from "@/lib/validators";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { Customer } from "@/types";

interface Props {
  initial?: Partial<Customer>;
  onSubmit: (data: CustomerInput) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
}

export function CustomerForm({ initial, onSubmit, onCancel, submitLabel = "Save customer" }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
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
      <Field label="Company name *" error={errors.name?.message}>
        <Input {...register("name")} />
      </Field>
      <Field label="Contact person" error={errors.contactPerson?.message}>
        <Input {...register("contactPerson")} />
      </Field>
      <Field label="Phone *" error={errors.phone?.message}>
        <Input {...register("phone")} />
      </Field>
      <Field label="Email" error={errors.email?.message}>
        <Input type="email" {...register("email")} />
      </Field>
      <Field label="Address *" error={errors.address?.message} className="md:col-span-2">
        <Input {...register("address")} />
      </Field>
      <Field label="City" error={errors.city?.message}>
        <Input {...register("city")} />
      </Field>
      <Field label="Country" error={errors.country?.message}>
        <Input {...register("country")} />
      </Field>
      <Field label="Tax ID" error={errors.taxId?.message}>
        <Input {...register("taxId")} />
      </Field>
      <Field label="Notes" error={errors.notes?.message} className="md:col-span-2">
        <Textarea rows={3} {...register("notes")} />
      </Field>

      <div className="md:col-span-2 flex justify-end gap-2 pt-2 border-t border-slate-100">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>{submitLabel}</Button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  error,
  className,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
      {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
    </div>
  );
}
