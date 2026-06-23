"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, FileJson, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { getFirebase } from "@/lib/firebase";

type BackupSummary = {
  fileName: string;
  exportedAt: string;
  documentCount: string;
  collectionCount: string;
};

function readFileName(response: Response) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  return match?.[1] ?? `irmaan-erp-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

function formatExportTime(value: string) {
  if (!value) return "Just now";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function BackupsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);
  const [lastBackup, setLastBackup] = useState<BackupSummary | null>(null);

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/dashboard");
  }, [user, router]);

  async function downloadBackup() {
    setDownloading(true);
    try {
      const { auth } = getFirebase();
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error("Sign in required");

      const response = await fetch("/api/admin/backup", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Backup download failed");
      }

      const blob = await response.blob();
      const fileName = readFileName(response);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      const exportedAt = response.headers.get("x-backup-exported-at") ?? new Date().toISOString();
      const documentCount = response.headers.get("x-backup-document-count") ?? "0";
      const collectionCount = response.headers.get("x-backup-collection-count") ?? "0";
      setLastBackup({ fileName, exportedAt, documentCount, collectionCount });
      toast.success("Backup downloaded", `${documentCount} documents were saved to ${fileName}.`);
    } catch (error) {
      toast.error(
        "Couldn't download backup",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Backups"
        description="Download a secure JSON copy of the ERP database. Admins only."
        actions={
          <Button onClick={downloadBackup} disabled={downloading || user?.role !== "admin"}>
            <Download className="h-4 w-4" />
            {downloading ? "Preparing backup..." : "Download backup"}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5 text-brand-700" />
              One-click database backup
            </CardTitle>
            <CardDescription>
              This creates a JSON backup containing customers, suppliers, products, orders,
              invoices, payments, users, counters, settings, stock movements, and audit logs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-slate-900">Protected by admin login</div>
                  <p className="text-sm text-slate-600 mt-1">
                    The download API verifies the signed-in Firebase user and only allows active
                    admin accounts to export data.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-amber-950">Store the file safely</div>
                  <p className="text-sm text-amber-800 mt-1">
                    A backup contains business data. Save it somewhere private, such as a secure
                    company drive, and do not send it in public chats.
                  </p>
                </div>
              </div>
            </div>

            <div className="text-sm text-slate-600">
              Recommended rhythm: download one backup at the end of each working day, and keep at
              least one copy outside the laptop used for daily work.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest download</CardTitle>
            <CardDescription>This browser session only.</CardDescription>
          </CardHeader>
          <CardContent>
            {lastBackup ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">Backup completed</span>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">File</div>
                  <div className="text-sm font-medium text-slate-900 break-all">
                    {lastBackup.fileName}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="info">{lastBackup.collectionCount} collections</Badge>
                  <Badge variant="success">{lastBackup.documentCount} documents</Badge>
                </div>
                <div className="text-sm text-slate-500">
                  {formatExportTime(lastBackup.exportedAt)}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">
                No backup has been downloaded from this page yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
