import { NextRequest, NextResponse } from "next/server";
import {
  BACKUP_COLLECTIONS,
  encodeFirestoreValue,
  type BackupDocument,
  type BackupPayload,
} from "@/lib/server/backup-format";
import { getSupabaseAdmin, requireSupabaseAdminUser } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureAdminApp() {
  const { applicationDefault, cert, getApps, initializeApp } = await import("firebase-admin/app");
  if (getApps().length > 0) return;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  initializeApp({
    credential:
      projectId && clientEmail && privateKey
        ? cert({ projectId, clientEmail, privateKey })
        : applicationDefault(),
    projectId,
  });
}

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function backupFileName(exportedAt: string) {
  return `irmaan-erp-backup-${exportedAt.replace(/[:.]/g, "-").slice(0, 19)}.json`;
}

const SUPABASE_BACKUP_TABLES = [
  "users",
  "company_settings",
  "customers",
  "suppliers",
  "products",
  "sales_orders",
  "delivery_orders",
  "purchase_orders",
  "po_allocations",
  "invoices",
  "payments",
  "supplier_payments",
  "stock_movements",
  "activity_logs",
  "document_counters",
] as const;

function backupToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
}

function supabaseBackupDocument(row: Record<string, unknown>): BackupDocument {
  const rawId = row.id ?? row.uid ?? row.name;
  if (typeof rawId !== "string" || !rawId) {
    throw new Error("Supabase backup row is missing an ID");
  }
  return { id: rawId, ...row };
}

async function exportSupabaseBackup(request: NextRequest) {
  const token = backupToken(request);
  if (!token) return jsonError(401, "unauthenticated", "Sign in required");

  await requireSupabaseAdminUser(token);

  const supabase = getSupabaseAdmin();
  const exportedAt = new Date().toISOString();
  const data: Record<string, BackupDocument[]> = {};
  let documentCount = 0;

  for (const table of SUPABASE_BACKUP_TABLES) {
    const { data: rows, error } = await supabase.from(table).select("*");
    if (error) throw error;
    data[table] = ((rows ?? []) as Record<string, unknown>[]).map(supabaseBackupDocument);
    documentCount += data[table].length;
  }

  const payload: BackupPayload = {
    formatVersion: 2,
    exportedAt,
    projectId: process.env.NEXT_PUBLIC_SUPABASE_URL,
    collectionCount: SUPABASE_BACKUP_TABLES.length,
    documentCount,
    data,
  };
  const body = JSON.stringify(payload, null, 2);
  const fileName = backupFileName(exportedAt);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store, max-age=0",
      "X-Backup-Collection-Count": String(SUPABASE_BACKUP_TABLES.length),
      "X-Backup-Document-Count": String(documentCount),
      "X-Backup-Exported-At": exportedAt,
    },
  });
}

async function exportFirebaseBackup(request: NextRequest) {
  await ensureAdminApp();
  const [{ getAuth }, { getFirestore }] = await Promise.all([
    import("firebase-admin/auth"),
    import("firebase-admin/firestore"),
  ]);
  const token = backupToken(request);

  if (!token) {
    return jsonError(401, "unauthenticated", "Sign in required");
  }

  let decodedToken: Awaited<ReturnType<ReturnType<typeof getAuth>["verifyIdToken"]>>;
  try {
    decodedToken = await getAuth().verifyIdToken(token);
  } catch {
    return jsonError(401, "unauthenticated", "Sign in again to download a backup");
  }
  const db = getFirestore();
  const userSnap = await db.collection("users").doc(decodedToken.uid).get();
  const user = userSnap.data();

  if (!userSnap.exists || user?.role !== "admin" || user?.active === false) {
    return jsonError(403, "permission-denied", "Administrator access required");
  }

  const exportedAt = new Date().toISOString();
  const data: Record<string, BackupDocument[]> = {};
  let documentCount = 0;

  for (const collection of BACKUP_COLLECTIONS) {
    const snap = await db.collection(collection).get();
    data[collection] = snap.docs.map((document) =>
      encodeFirestoreValue({ id: document.id, ...document.data() }) as BackupDocument,
    );
    documentCount += snap.size;
  }

  const payload: BackupPayload = {
    formatVersion: 2,
    exportedAt,
    projectId: process.env.FIREBASE_PROJECT_ID,
    collectionCount: BACKUP_COLLECTIONS.length,
    documentCount,
    data,
  };
  const body = JSON.stringify(payload, null, 2);
  const fileName = backupFileName(exportedAt);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store, max-age=0",
      "X-Backup-Collection-Count": String(BACKUP_COLLECTIONS.length),
      "X-Backup-Document-Count": String(documentCount),
      "X-Backup-Exported-At": exportedAt,
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    if (process.env.NEXT_PUBLIC_USE_SUPABASE === "true") {
      return await exportSupabaseBackup(request);
    }
    return await exportFirebaseBackup(request);
  } catch (error) {
    console.error("Admin backup export failed", error);
    return jsonError(500, "internal", "Backup export failed. Please try again.");
  }
}
