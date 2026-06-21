"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Pagination } from "@/components/ui/Pagination";
import { Plus, Pencil, Search, ShieldOff, ShieldCheck, KeyRound } from "lucide-react";
import { dataAdapter } from "@/services";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { withRetry, errorMessage } from "@/lib/retry";
import { logActivity } from "@/lib/audit";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { formatDate } from "@/lib/utils";
import type { User, Role } from "@/types";

const ROLE_VARIANT: Record<Role, "default" | "info" | "success" | "warning" | "muted"> = {
  admin: "default",
  manager: "info",
  sales: "success",
  warehouse: "warning",
};

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Full access including user management",
  manager: "Manage POs, payments, reports",
  sales: "Create DOs and invoices",
  warehouse: "Manage stock, receive POs",
};

export default function UsersPage() {
  const { user: me } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  // Lock the page to admins (also enforced in the sidebar visibility, but defense in depth)
  useEffect(() => {
    if (me && me.role !== "admin") router.replace("/dashboard");
  }, [me, router]);

  const refresh = useCallback(async () => {
    try {
      setList(await withRetry(() => dataAdapter.users.list()));
    } catch (err) {
      toast.error("Couldn't load users", errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => { refresh(); }, [refresh]);

  const {
    page, q, setQ, pageIndex, pageCount, pageSize, setPageSize,
    next, prev, start, end, total,
  } = usePaginatedList(list, {
    searchableFields: (u) => [u.displayName, u.email, u.role],
    pageSize: 25,
  });

  return (
    <>
      <PageHeader
        title="Users"
        description="Invite teammates and manage their access."
        actions={
          <Button onClick={() => { setAdding(true); setEditing(null); }}>
            <Plus className="h-4 w-4" /> Invite user
          </Button>
        }
      />

      <Card>
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, email, role..."
              className="pl-9"
            />
          </div>
        </div>

        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH>Status</TH>
              <TH>Created</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {page.map((u) => {
              const isMe = u.uid === me?.uid;
              return (
                <TR key={u.uid}>
                  <TD className="font-medium text-slate-900">
                    {u.displayName}
                    {isMe && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                  </TD>
                  <TD className="text-slate-600">{u.email}</TD>
                  <TD>
                    <Badge variant={ROLE_VARIANT[u.role]} className="capitalize">{u.role}</Badge>
                  </TD>
                  <TD>
                    <Badge variant={u.active ? "success" : "muted"}>
                      {u.active ? "Active" : "Deactivated"}
                    </Badge>
                  </TD>
                  <TD className="text-xs text-slate-500">{formatDate(u.createdAt)}</TD>
                  <TD>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setEditing(u); setAdding(false); }}
                      disabled={isMe}
                      title={isMe ? "You can't edit your own account here" : "Edit user"}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TD>
                </TR>
              );
            })}
            {page.length === 0 && (
              <TR><TD colSpan={6} className="text-center py-10 text-slate-500">
                {loading ? "Loading users…" : "No users match your search."}
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

      {adding && (
        <InviteDialog
          open={adding}
          onClose={() => setAdding(false)}
          onInvited={refresh}
        />
      )}

      {editing && (
        <EditDialog
          user={editing}
          open={!!editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </>
  );
}

// ─── Invite dialog ────────────────────────────────────────────────────────
function InviteDialog({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: () => void }) {
  const { user: me } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("sales");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const created = await dataAdapter.users.invite({ email, displayName, role });
      await logActivity(me, {
        action: "auth.password_reset_requested",
        entityType: "user",
        entityId: created.uid,
        entityLabel: created.email,
        summary: `Invited ${created.displayName} (${created.email}) as ${role}`,
        metadata: { role },
      });
      toast.success("User invited", `${displayName} has been added. A password-setup email has been sent.`);
      onInvited();
      onClose();
    } catch (err) {
      toast.error("Couldn't invite user", errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Invite a teammate" description="They'll receive an email to set their password.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label>Full name *</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required autoFocus placeholder="e.g. Hassan Omar" />
        </div>
        <div>
          <Label>Email *</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="hassan@irmaan-trading.co" />
        </div>
        <div>
          <Label>Role *</Label>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="sales">Sales</option>
            <option value="warehouse">Warehouse</option>
          </Select>
          <div className="text-xs text-slate-500 mt-1">{ROLE_DESCRIPTIONS[role]}</div>
        </div>
        <div className="rounded-md bg-sky-50 border border-sky-200 text-xs text-sky-800 p-2.5 flex items-start gap-2">
          <KeyRound className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div>
            The user will receive a password-setup email. In the demo build, no email is sent —
            ask them to use the &ldquo;Forgot password?&rdquo; flow.
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitting}>Send invite</Button>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Edit dialog ──────────────────────────────────────────────────────────
function EditDialog({ user, open, onClose, onSaved }: { user: User; open: boolean; onClose: () => void; onSaved: () => void }) {
  const { user: me } = useAuth();
  const toast = useToast();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [role, setRole] = useState<Role>(user.role);
  const [active, setActive] = useState(user.active);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const before = { displayName: user.displayName, role: user.role, active: user.active };
      await dataAdapter.users.update(user.uid, { displayName, role, active });
      const diff: Record<string, { from: unknown; to: unknown }> = {};
      if (before.displayName !== displayName) diff.displayName = { from: before.displayName, to: displayName };
      if (before.role !== role) diff.role = { from: before.role, to: role };
      if (before.active !== active) diff.active = { from: before.active, to: active };
      if (Object.keys(diff).length > 0) {
        await logActivity(me, {
          action: active === before.active ? "auth.password_reset_requested" : (active ? "auth.login" : "auth.logout"),
          entityType: "user",
          entityId: user.uid,
          entityLabel: user.email,
          summary: !active && before.active
            ? `Deactivated ${user.displayName}`
            : `Updated ${user.displayName} (${Object.keys(diff).join(", ")})`,
          diff,
        });
      }
      toast.success("User updated");
      onSaved();
      onClose();
    } catch (err) {
      toast.error("Couldn't save changes", errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Edit ${user.displayName}`} description={user.email}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label>Display name</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </div>
        <div>
          <Label>Role</Label>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="sales">Sales</option>
            <option value="warehouse">Warehouse</option>
          </Select>
          <div className="text-xs text-slate-500 mt-1">{ROLE_DESCRIPTIONS[role]}</div>
        </div>
        <div>
          <Label>Status</Label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              type="button"
              onClick={() => setActive(true)}
              className={`flex items-center justify-center gap-2 h-10 rounded-md border text-sm font-medium ${
                active ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <ShieldCheck className="h-4 w-4" /> Active
            </button>
            <button
              type="button"
              onClick={() => setActive(false)}
              className={`flex items-center justify-center gap-2 h-10 rounded-md border text-sm font-medium ${
                !active ? "bg-red-50 border-red-300 text-red-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <ShieldOff className="h-4 w-4" /> Deactivated
            </button>
          </div>
          {!active && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 mt-2">
              Deactivated users can&apos;t sign in. Their existing data and audit trail are preserved.
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitting}>Save changes</Button>
        </div>
      </form>
    </Dialog>
  );
}
