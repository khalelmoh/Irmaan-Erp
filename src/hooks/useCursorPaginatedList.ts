"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ListPageOptions, ListPageResult } from "@/services/types";

interface Options<T> {
  loadPage(options: ListPageOptions): Promise<ListPageResult<T>>;
  resetKeys?: readonly unknown[];
  pageSize?: number;
}

export function useCursorPaginatedList<T>({
  loadPage,
  resetKeys = [],
  pageSize: initialPageSize = 25,
}: Options<T>) {
  const [page, setPage] = useState<T[]>([]);
  const [q, setQ] = useState("");
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [pageIndex, setPageIndex] = useState(0);
  const [cursors, setCursors] = useState<unknown[]>([null]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const resetKey = useMemo(() => JSON.stringify(resetKeys), [resetKeys]);

  useEffect(() => {
    setPageIndex(0);
    setCursors([null]);
  }, [q, pageSize, resetKey]);

  const cursor = cursors[pageIndex] ?? null;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    loadPage({ pageSize, cursor, search: q })
      .then((result) => {
        if (!active) return;
        setPage(result.items);
        setHasMore(result.hasMore);
        setCursors((current) => {
          const next = current.slice(0, pageIndex + 1);
          next[pageIndex + 1] = result.nextCursor;
          return next;
        });
      })
      .catch((err) => {
        if (!active) return;
        setPage([]);
        setHasMore(false);
        setError(err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [cursor, loadPage, pageIndex, pageSize, q]);

  const next = useCallback(() => {
    if (hasMore) setPageIndex((index) => index + 1);
  }, [hasMore]);

  const prev = useCallback(() => {
    setPageIndex((index) => Math.max(0, index - 1));
  }, []);

  const start = page.length === 0 ? 0 : pageIndex * pageSize + 1;
  const end = pageIndex * pageSize + page.length;

  return {
    page,
    q,
    setQ,
    pageIndex,
    pageCount: hasMore ? pageIndex + 2 : pageIndex + 1,
    pageSize,
    setPageSize,
    next,
    prev,
    start,
    end,
    total: null,
    hasMore,
    loading,
    error,
  };
}
