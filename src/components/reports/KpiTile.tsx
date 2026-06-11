import { Card, CardContent } from "@/components/ui/card";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface DeltaInfo {
  pct: number;
  direction: "up" | "down" | "flat";
  /** Whether "up" is good (green) or bad (red). Defaults to true. */
  invertColor?: boolean;
}

interface Props {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  hint?: string;
  delta?: DeltaInfo;
}

const tones: Record<NonNullable<Props["tone"]>, string> = {
  default: "text-brand-700 bg-brand-50",
  success: "text-emerald-700 bg-emerald-50",
  warning: "text-amber-700 bg-amber-50",
  danger: "text-red-700 bg-red-50",
  info: "text-sky-700 bg-sky-50",
};

export function KpiTile({ label, value, icon: Icon, tone = "default", hint, delta }: Props) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
          <div className="text-2xl font-semibold mt-1 text-slate-900 tabular-nums">{value}</div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {delta && delta.direction !== "flat" && (
              <DeltaBadge delta={delta} />
            )}
            {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
          </div>
        </div>
        <div className={`h-11 w-11 rounded-lg flex items-center justify-center shrink-0 ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function DeltaBadge({ delta }: { delta: DeltaInfo }) {
  const isUp = delta.direction === "up";
  // By default: up = good (green), down = bad (red). invertColor flips it.
  const isPositive = delta.invertColor ? !isUp : isUp;
  const color = isPositive ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50";
  const DirIcon = isUp ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-md ${color}`}>
      <DirIcon className="h-3 w-3" />
      {delta.pct.toFixed(1)}%
    </span>
  );
}
