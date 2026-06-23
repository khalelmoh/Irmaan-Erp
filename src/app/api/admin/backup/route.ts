import { NextRequest, NextResponse } from "next/server";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import {
  BACKUP_COLLECTIONS,
  encodeFirestoreValue,
  type BackupDocument,
  type BackupPayload,
} from "@/lib/server/backup-format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ensureAdminApp() {
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

export async function GET(request: NextRequest) {
  try {
    ensureAdminApp();
    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : null;

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
  } catch (error) {
    console.error("Admin backup export failed", error);
    return jsonError(500, "internal", "Backup export failed. Please try again.");
  }
}
