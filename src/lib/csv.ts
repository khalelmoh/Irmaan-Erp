/**
 * Tiny zero-dep CSV writer. Handles quotes, commas, newlines.
 */
export function toCSV<T extends Record<string, unknown>>(
  rows: T[],
  columns: Array<{ key: keyof T; label: string; format?: (v: unknown) => string }>,
): string {
  const header = columns.map((c) => escape(c.label)).join(",");
  const body = rows
    .map((r) =>
      columns
        .map((c) => {
          const raw = r[c.key];
          const val = c.format ? c.format(raw) : raw == null ? "" : String(raw);
          return escape(val);
        })
        .join(","),
    )
    .join("\n");
  return `${header}\n${body}`;
}

function escape(v: string) {
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
