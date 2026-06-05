import { cn } from "@/lib/utils";
import * as React from "react";

type Variant = "default" | "success" | "warning" | "danger" | "muted" | "info";
const map: Record<Variant, string> = {
  default: "bg-brand-100 text-brand-800",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  danger:  "bg-red-100 text-red-700",
  muted:   "bg-slate-100 text-slate-700",
  info:    "bg-sky-100 text-sky-800",
};

export function Badge({ className, variant = "default", ...p }: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        map[variant],
        className,
      )}
      {...p}
    />
  );
}
