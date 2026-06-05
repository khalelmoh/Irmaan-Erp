"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { paymentSchema, type PaymentInput } from "@/lib/validators";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { currency } from "@/lib/utils";
import { PAYMENT_METHOD_LABEL } from "@/lib/invoice";

interface Props {
  open: boolean;
  onClose: () => void;
  invoiceNumber: string;
  outstanding: number;
  onSubmit: (data: PaymentInput) => Promise<void>;
}

export function PaymentDialog({ open, onClose, invoiceNumber, outstanding, onSubmit }: Props) {
  const {
    register, handleSubmit, reset, setValue, formState: { errors, isSubmitting },
  } = useForm<PaymentInput>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: outstanding,
      method: "cash",
      reference: "",
      paidAt: new Date().toISOString().slice(0, 10),
      notes: "",
    },
  });

  // Re-sync default amount whenever the dialog re-opens with a new outstanding
  return (
    <Dialog
      open={open}
      onClose={() => { reset(); onClose(); }}
      title={`Record payment · ${invoiceNumber}`}
      description={`Outstanding balance: ${currency(outstanding)}`}
    >
      <form
        onSubmit={handleSubmit(async (d) => {
          await onSubmit(d);
          reset();
          onClose();
        })}
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <F label="Amount *" err={errors.amount?.message}>
            <Input type="number" step="0.01" min="0.01" max={outstanding} {...register("amount")} autoFocus />
            <button
              type="button"
              className="text-[11px] text-brand-700 hover:underline mt-1"
              onClick={() => setValue("amount", outstanding)}
            >
              Pay full balance ({currency(outstanding)})
            </button>
          </F>
          <F label="Payment method *" err={errors.method?.message}>
            <Select {...register("method")}>
              {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </F>
        </div>
        <F label="Payment date *" err={errors.paidAt?.message}>
          <Input type="date" {...register("paidAt")} />
        </F>
        <F label="Reference / transaction ID" err={errors.reference?.message}>
          <Input placeholder="e.g. TXN-998877, cheque #..." {...register("reference")} />
        </F>
        <F label="Notes">
          <Textarea rows={2} {...register("notes")} placeholder="Optional notes for this payment..." />
        </F>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting}>Record payment</Button>
        </div>
      </form>
    </Dialog>
  );
}

function F({ label, err, children }: { label: string; err?: string; children: React.ReactNode }) {
  return <div><Label>{label}</Label>{children}{err && <div className="text-xs text-red-600 mt-1">{err}</div>}</div>;
}
