"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Select } from "./select";

interface Props {
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  setPageSize: (n: number) => void;
  start: number;
  end: number;
  total?: number | null;
  hasMore?: boolean;
  onPrev: () => void;
  onNext: () => void;
  pageSizeOptions?: number[];
}

export function Pagination({
  pageIndex,
  pageCount,
  pageSize,
  setPageSize,
  start,
  end,
  total,
  hasMore = pageIndex < pageCount - 1,
  onPrev,
  onNext,
  pageSizeOptions = [10, 25, 50, 100],
}: Props) {
  if (total === 0 || start === 0) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm">
      <div className="text-slate-500 text-xs">
        Showing <span className="font-medium text-slate-700 tabular-nums">{start}-{end}</span>
        {typeof total === "number" ? (
          <>
            {" "}of <span className="font-medium text-slate-700 tabular-nums">{total.toLocaleString()}</span>
          </>
        ) : (
          <span className="text-slate-400"> {hasMore ? "with more available" : "end of results"}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <span>Per page</span>
          <Select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="h-7 w-[64px] text-xs py-0"
          >
            {pageSizeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrev}
            disabled={pageIndex === 0}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-xs text-slate-600 tabular-nums px-2 min-w-[60px] text-center">
            {typeof total === "number" ? `${pageIndex + 1} / ${pageCount}` : `Page ${pageIndex + 1}`}
          </div>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasMore}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
