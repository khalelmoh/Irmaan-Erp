"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import { SupplierForm } from "@/components/forms/SupplierForm";
import { dataAdapter } from "@/services";
import type { Supplier } from "@/types";
import { Plus, Pencil, X, Search } from "lucide-react";
import { currency, formatDate } from "@/lib/utils";
import { logActivity } from "@/lib/audit";
import { useAuth } from "@/contexts/AuthContext";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { useToast } from "@/contexts/ToastContext";
import { withRetry, errorMessage } from "@/lib/retry";

export default function SuppliersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [list, setList] = useState<Supplier[]>([]);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      setList(await withRetry(() => dataAdapter.suppliers.list()));
    } catch (err) {
      toast.error("Couldn't load suppliers", errorMessage(err));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const {
    page, q, setQ, pageIndex, pageCount, pageSize, setPageSize,
    next, prev, start, end, total,
  } = usePaginatedList(list, {
    searchableFields: (c) => [c.name, c.code, c.phone, c.email ?? "", c.city ?? "", c.country ?? ""],
    pageSize: 25,
  });

  const totalAP = list.reduce((s, x) => s + x.balance, 0);

  return (
    <>
      <PageHeader
        title="Suppliers"
        description={`Vendors you buy from · Total A/P: ${currency(totalAP)}`}
        actions={
          <Button onClick={() => { setAdding(true); setEditing(null); }}>
            <Plus className="h-4 w-4" /> Add supplier
          </Button>
        }
      />

      {(adding || editing) && (
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">{editing ? `Edit ${editing.name}` : "New supplier"}</h2>
            <Button variant="ghost" size="icon" onClick={() => { setAdding(false); setEditing(null); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <SupplierForm
            initial={editing ?? undefined}
            submitLabel={editing ? "Update supplier" : "Create supplier"}
            onCancel={() => { setAdding(false); setEditing(null); }}
            onSubmit={async (data) => {
              if (editing) {
                await dataAdapter.suppliers.update(editing.id, data);
                await logActivity(user, {
                  action: "supplier.update",
                  entityType: "supplier",
                  entityId: editing.id,
                  entityLabel: data.name,
                  summary: `Updated supplier "${data.name}"`,
                });
              } else {
                const created = await dataAdapter.suppliers.create({ ...data, code: "", balance: 0, active: true } as never);
                await logActivity(user, {
                  action: "supplier.create",
                  entityType: "supplier",
                  entityId: created.id,
                  entityLabel: data.name,
                  summary: `Added supplier "${data.name}"`,
                });
              }
              await refresh();
              setAdding(false); setEditing(null);
            }}
          />
        </Card>
      )}

      <Card>
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, code, country..." className="pl-9" />
          </div>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Code</TH>
              <TH>Name</TH>
              <TH>Contact</TH>
              <TH>Country</TH>
              <TH className="!text-right">Outstanding (A/P)</TH>
              <TH>Status</TH>
              <TH>Created</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {page.map((c) => (
              <TR key={c.id}>
                <TD className="font-mono text-xs text-slate-500">{c.code}</TD>
                <TD className="font-medium text-slate-900">{c.name}</TD>
                <TD>
                  <div className="text-sm">{c.phone}</div>
                  {c.email && <div className="text-xs text-slate-500">{c.email}</div>}
                </TD>
                <TD className="text-slate-600">{c.country || "—"}</TD>
                <TD className={`text-right tabular-nums ${c.balance > 0 ? "text-red-700 font-medium" : "text-emerald-700"}`}>
                  {currency(c.balance)}
                </TD>
                <TD><Badge variant={c.active ? "success" : "muted"}>{c.active ? "Active" : "Inactive"}</Badge></TD>
                <TD className="text-slate-500 text-xs">{formatDate(c.createdAt)}</TD>
                <TD>
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(c); setAdding(false); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TD>
              </TR>
            ))}
            {page.length === 0 && (
              <TR><TD colSpan={8} className="text-center py-10 text-slate-500">
                {loading ? "Loading suppliers…" : "No suppliers match your search."}
              </TD></TR>
            )}
          </TBody>
        </Table>
        <Pagination
          pageIndex={pageIndex} pageCount={pageCount}
          pageSize={pageSize} setPageSize={setPageSize}
          start={start} end={end} total={total}
          onPrev={prev} onNext={next}
        />
      </Card>
    </>
  );
}
