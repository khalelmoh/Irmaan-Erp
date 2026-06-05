"use client";

import { useMemo, useState, useEffect } from "react";

interface Options<T> {
  /** Strings to search across each item (case-insensitive). */
  searchableFields: (item: T) => string[];
  /** Pre-filters applied before search (e.g. status === "issued"). */
  filterFn?: (item: T) => boolean;
  pageSize?: number;
}

interface Result<T> {
  /** All items after filter+search (used for "X of Y" displays). */
  filtered: T[];
  /** Items on the current page only. */
  page: T[];
  /** UI state */
  q: string;
  setQ: (v: string) => void;
  pageIndex: number;       // 0-based
  pageCount: number;
  pageSize: number;
  setPageSize: (n: number) => void;
  next: () => void;
  prev: () => void;
  goTo: (i: number) => void;
  start: number;           // 1-based for "showing X..." display
  end: number;
  total: number;
}

export function usePaginatedList<T>(items: T[], options: Options<T>): Result<T> {
  const { searchableFields, filterFn } = options;
  const [q, setQ] = useState("");
  const [pageSize, setPageSize] = useState(options.pageSize ?? 25);
  const [pageIndex, setPageIndex] = useState(0);

  // Reset to page 1 whenever the search / filter / page size changes
  useEffect(() => { setPageIndex(0); }, [q, pageSize]);

  const filtered = useMemo(() => {
    let result = items;
    if (filterFn) result = result.filter(filterFn);
    const t = q.trim().toLowerCase();
    if (t) {
      const tokens = t.split(/\s+/);
      result = result.filter((item) => {
        const haystack = searchableFields(item).filter(Boolean).join(" ").toLowerCase();
        return tokens.every((tok) => haystack.includes(tok));
      });
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q, filterFn]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safeIndex = Math.min(pageIndex, pageCount - 1);
  const start = filtered.length === 0 ? 0 : safeIndex * pageSize + 1;
  const end = Math.min(filtered.length, (safeIndex + 1) * pageSize);
  const page = filtered.slice(safeIndex * pageSize, safeIndex * pageSize + pageSize);

  return {
    filtered,
    page,
    q,
    setQ,
    pageIndex: safeIndex,
    pageCount,
    pageSize,
    setPageSize,
    next: () => setPageIndex((i) => Math.min(i + 1, pageCount - 1)),
    prev: () => setPageIndex((i) => Math.max(i - 1, 0)),
    goTo: (i) => setPageIndex(Math.max(0, Math.min(i, pageCount - 1))),
    start,
    end,
    total: filtered.length,
  };
}
