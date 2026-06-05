import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  hint?: string;
}

const tones: Record<NonNullable<Props["tone"]>, string> = {
  default: "text-brand-700 bg-brand-50",
  success: "text-emerald-700 bg-emerald-50",
  warning: "text-amber-700 bg-amber-50",
  danger: "text-red-700 bg-red-50",
  info: "text-sky-700 bg-sky-50",
};

export function KpiTile({ label, value, icon: Icon, tone = "default", hint }: Props) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
          <div className="text-2xl font-semibold mt-1 text-slate-900 tabular-nums">{value}</div>
          {hint && <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>}
        </div>
        <div className={`h-11 w-11 rounded-lg flex items-center justify-center ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
