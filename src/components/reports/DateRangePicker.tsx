"use client";

import { Input } from "@/components/ui/input";
import { presetRanges, type DateRange } from "@/lib/reports";

interface Props {
  value: DateRange;
  onChange: (r: DateRange) => void;
}

export function DateRangePicker({ value, onChange }: Props) {
  const presets = presetRanges();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-medium text-slate-600">From</label>
        <Input
          type="date"
          value={value.from}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
          className="w-[150px]"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-medium text-slate-600">To</label>
        <Input
          type="date"
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          className="w-[150px]"
        />
      </div>
      <div className="flex flex-wrap gap-1 ml-1">
        {presets.map((p) => {
          const active = p.from === value.from && p.to === value.to;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange({ from: p.from, to: p.to })}
              className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                active
                  ? "bg-brand-700 text-white border-brand-700"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
