"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { stockAdjustmentSchema, type StockAdjustmentInput } from "@/lib/validators";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Minus } from "lucide-react";
import type { Product } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  product: Product;
  onSubmit: (data: StockAdjustmentInput) => Promise<void>;
}

export function StockAdjustDialog({ open, onClose, product, onSubmit }: Props) {
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [err, setErr] = useState<string | null>(null);

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } =
    useForm<StockAdjustmentInput>({
      resolver: zodResolver(stockAdjustmentSchema),
      defaultValues: { qty: 0, reason: "" },
    });

  useEffect(() => {
    if (open) { reset({ qty: 0, reason: "" }); setDirection("in"); setErr(null); }
  }, [open, reset]);

  const qtyInput = Number(watch("qty")) || 0;
  const signedQty = direction === "in" ? Math.abs(qtyInput) : -Math.abs(qtyInput);
  const newStock = Math.round((product.stock + signedQty) * 100) / 100;
  const negative = newStock < 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Adjust stock · ${product.name}`}
      description={`Current stock: ${product.stock.toLocaleString()} ${product.unit}`}
    >
      <form
        onSubmit={handleSubmit(async (d) => {
          setErr(null);
          if (negative) {
            setErr(`Adjustment would result in negative stock (${newStock} ${product.unit}).`);
            return;
          }
          try {
            await onSubmit({ qty: signedQty, reason: d.reason });
            reset();
            onClose();
          } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Adjustment failed");
          }
        })}
        className="space-y-4"
      >
        <div>
          <Label>Direction</Label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              type="button"
              onClick={() => setDirection("in")}
              className={`flex items-center justify-center gap-2 h-10 rounded-md border text-sm font-medium transition-colors ${
                direction === "in"
                  ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Plus className="h-4 w-4" /> Add stock
            </button>
            <button
              type="button"
              onClick={() => setDirection("out")}
              className={`flex items-center justify-center gap-2 h-10 rounded-md border text-sm font-medium transition-colors ${
                direction === "out"
                  ? "bg-red-50 border-red-300 text-red-800"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Minus className="h-4 w-4" /> Remove stock
            </button>
          </div>
        </div>

        <div>
          <Label>Quantity ({product.unit})</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
            {...register("qty")}
            autoFocus
          />
          {errors.qty && <div className="text-xs text-red-600 mt-1">{errors.qty.message}</div>}
        </div>

        <div>
          <Label>Reason *</Label>
          <Textarea
            rows={2}
            placeholder="e.g. Damaged goods · Stock count correction · Returned by customer"
            {...register("reason")}
          />
          {errors.reason && <div className="text-xs text-red-600 mt-1">{errors.reason.message}</div>}
        </div>

        {qtyInput > 0 && (
          <div className={`rounded-md p-3 text-sm border ${
            negative ? "bg-red-50 border-red-200 text-red-800" : "bg-slate-50 border-slate-200 text-slate-700"
          }`}>
            <div className="flex justify-between">
              <span>New stock will be:</span>
              <span className="font-semibold tabular-nums">
                {newStock.toLocaleString()} {product.unit}
                <span className={`ml-2 text-xs ${direction === "in" ? "text-emerald-700" : "text-red-700"}`}>
                  ({direction === "in" ? "+" : ""}{signedQty.toLocaleString()})
                </span>
              </span>
            </div>
          </div>
        )}

        {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">{err}</div>}

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting || qtyInput === 0 || negative}>
            {direction === "in" ? "Add to stock" : "Remove from stock"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
