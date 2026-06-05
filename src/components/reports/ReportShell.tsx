"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { DateRangePicker } from "./DateRangePicker";
import type { DateRange } from "@/lib/reports";

interface Props {
  title: string;
  description?: string;
  range?: DateRange;
  onRangeChange?: (r: DateRange) => void;
  onExportCSV?: () => void;
  children: ReactNode;
}

export function ReportShell({ title, description, range, onRangeChange, onExportCSV, children }: Props) {
  return (
    <div>
      <div className="no-print flex flex-col gap-4 mb-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <Link href="/reports" className="hover:text-brand-700 inline-flex items-center gap-1">
                <ArrowLeft className="h-3.5 w-3.5" /> Reports
              </Link>
            </div>
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">{title}</h1>
            {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
          </div>
          <div className="flex items-center gap-2">
            {onExportCSV && (
              <Button variant="outline" onClick={onExportCSV}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            )}
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          </div>
        </div>
        {range && onRangeChange && <DateRangePicker value={range} onChange={onRangeChange} />}
      </div>
      <div className="report-content">{children}</div>
    </div>
  );
}
