"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { dataAdapter } from "@/services";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Search, Download, ShieldCheck, User as UserIcon } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { ACTION_LABEL, ACTION_TONE } from "@/lib/audit";
import { downloadCSV, toCSV } from "@/lib/csv";
import type { ActivityLog, EntityType } from "@/types";

const ENTITY_TYPES: { value: "all" | EntityType; label: string }[] = [
  { value: "all", label: "All entities" },
  { value: "user", label: "User / Auth" },
  { value: "customer", label: "Customer" },
  { value: "supplier", label: "Supplier" },
  { value: "product", label: "Product" },
  { value: "delivery_order", label: "Delivery Order" },
  { value: "purchase_order", label: "Purchase Order" },
  { value: "invoice", label: "Invoice" },
  { value: "stock_movement", label: "Stock movement" },
];

function entityHref(e: ActivityLog): string | null {
  switch (e.entityType) {
    case "delivery_order": return `/delivery-orders/${e.entityId}`;
    case "purchase_order": return `/purchase-orders/${e.entityId}`;
    case "invoice": return `/invoices/${e.entityId}`;
    case "customer": return `/customers`;
    case "supplier": return `/suppliers`;
    case "product": return `/products`;
    default: return null;
  }
}

export default function AuditPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [q, setQ] = useState("");
  const [entityFilter, setEntityFilter] = useState<"all" | EntityType>("all");

  useEffect(() => {
    dataAdapter.activityLog.list({ limit: 1000 }).then(setLogs);
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return logs.filter((e) => {
      if (entityFilter !== "all" && e.entityType !== entityFilter) return false;
      if (!t) return true;
      return [e.summary, e.actorName, e.entityLabel].filter(Boolean).join(" ").toLowerCase().includes(t);
    });
  }, [logs, q, entityFilter]);

  function onExport() {
    const csv = toCSV(filtered as any[], [
      { key: "at", label: "When", format: (v) => formatDateTime(String(v)) },
      { key: "actorName", label: "User" },
      { key: "action", label: "Action", format: (v) => ACTION_LABEL[v as never] ?? String(v) },
      { key: "entityType", label: "Type" },
      { key: "entityLabel", label: "Subject" },
      { key: "summary", label: "Description" },
    ]);
    downloadCSV(`audit-log-${new Date().toISOString().slice(0, 10)}`, csv);
  }

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Every important action taken in the system, by whom, and when. Append-only."
        actions={
          <Button variant="outline" onClick={onExport}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-brand-700" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Total events</div>
              <div className="text-xl font-semibold tabular-nums text-slate-900">{logs.length}</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <UserIcon className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Unique users</div>
              <div className="text-xl font-semibold tabular-nums text-slate-900">
                {new Set(logs.map((l) => l.actorUid)).size}
              </div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Filtered shown</div>
              <div className="text-xl font-semibold tabular-nums text-slate-900">{filtered.length}</div>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-2 md:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search action, user, subject..."
              className="pl-9"
            />
          </div>
          <Select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value as never)}
            className="max-w-[220px]"
          >
            {ENTITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </div>

        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>User</TH>
              <TH>Action</TH>
              <TH>Subject</TH>
              <TH>Description</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((e) => {
              const href = entityHref(e);
              return (
                <TR key={e.id}>
                  <TD className="text-xs text-slate-600 whitespace-nowrap">{formatDateTime(e.at)}</TD>
                  <TD className="font-medium text-slate-900">{e.actorName}</TD>
                  <TD><Badge variant={ACTION_TONE[e.action]}>{ACTION_LABEL[e.action] ?? e.action}</Badge></TD>
                  <TD>
                    {href ? (
                      <Link href={href} className="text-brand-700 hover:underline text-sm">
                        {e.entityLabel}
                      </Link>
                    ) : (
                      <span className="text-slate-700 text-sm">{e.entityLabel}</span>
                    )}
                  </TD>
                  <TD className="text-sm text-slate-600">{e.summary}</TD>
                </TR>
              );
            })}
            {filtered.length === 0 && (
              <TR>
                <TD colSpan={5} className="text-center py-10 text-slate-500">
                  {logs.length === 0
                    ? "No activity yet. Sign in, create a document, or adjust stock to populate the log."
                    : "No events match your filters."}
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
