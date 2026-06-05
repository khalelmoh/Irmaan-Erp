"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import type { PurchaseOrder } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  po: PurchaseOrder;
  onSubmit: (receipts: Array<{ productId: string; quantity: number }>) => Promise<void>;
}

export function ReceiveItemsDialog({ open, onClose, po, onSubmit }: Props) {
  // Map productId -> qty input value
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Pre-fill with each line's remaining quantity (so "receive all" is one click)
    const next: Record<string, number> = {};
    po.items.forEach((it) => {
      const remaining = it.quantity - (it.receivedQty ?? 0);
      next[it.productId] = remaining;
    });
    setQtys(next);
    setErr(null);
  }, [open, po]);

  async function handleSubmit() {
    setErr(null);
    const receipts = po.items
      .map((it) => ({ productId: it.productId, quantity: Number(qtys[it.productId] ?? 0) }))
      .filter((r) => r.quantity > 0);
    if (receipts.length === 0) {
      setErr("Enter a quantity for at least one item.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(receipts);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to receive items");
    } finally {
      setSubmitting(false);
    }
  }

  function setAllToRemaining() {
    const next: Record<string, number> = {};
    po.items.forEach((it) => {
      next[it.productId] = it.quantity - (it.receivedQty ?? 0);
    });
    setQtys(next);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Receive items · ${po.poNumber}`}
      description="Enter the quantity received for each item. Stock will be updated automatically."
      className="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <button type="button" onClick={setAllToRemaining} className="text-xs text-brand-700 hover:underline">
            Fill all with remaining quantity
          </button>
        </div>
        <div className="border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-right px-3 py-2">Ordered</th>
                <th className="text-right px-3 py-2">Already received</th>
                <th className="text-right px-3 py-2">Remaining</th>
                <th className="text-right px-3 py-2 w-32">Receiving now</th>
              </tr>
            </thead>
            <tbody>
              {po.items.map((it) => {
                const already = it.receivedQty ?? 0;
                const remaining = it.quantity - already;
                const fullyDone = remaining <= 0;
                return (
                  <tr key={it.productId} className="border-t border-slate-100">
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-900">{it.name}</div>
                      <div className="text-xs text-slate-500">{it.unit}</div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{it.quantity.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-700">{already.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {fullyDone ? <CheckCircle2 className="h-4 w-4 text-emerald-600 inline" /> : remaining.toLocaleString()}
                    </td>
                    <td className="px-3 py-3">
                      <Input
                        type="number"
                        min="0"
                        max={remaining}
                        step="0.01"
                        disabled={fullyDone}
                        value={qtys[it.productId] ?? 0}
                        onChange={(e) => setQtys({ ...qtys, [it.productId]: Number(e.target.value) })}
                        className="text-right"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">{err}</div>}

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Receiving…" : "Confirm receipt"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// Helpful note: also requires a Label import only if shown; left untouched.
void Label;
