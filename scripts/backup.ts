/**
 * Exports the ERP Firestore collections to a versioned JSON backup.
 *
 * Credentials may come from GOOGLE_APPLICATION_CREDENTIALS or from
 * FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.
 */
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { BACKUP_COLLECTIONS, encodeFirestoreValue } from "../src/lib/server/backup-format";

function loadLocalEnvironment() {
  try {
    process.loadEnvFile?.(".env.local");
  } catch {
    // CI and production hosts generally provide environment variables directly.
  }
}

function getServiceAccount() {
  loadLocalEnvironment();
  const serviceAccountPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS || "./service-account.json";
  if (existsSync(serviceAccountPath)) {
    const serviceAccount = require(resolve(serviceAccountPath));
    return {
      ...serviceAccount,
      projectId: serviceAccount.projectId ?? serviceAccount.project_id,
    };
  }
  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }
  throw new Error(
    "Configure GOOGLE_APPLICATION_CREDENTIALS or Firebase admin environment credentials",
  );
}

async function main() {
  const serviceAccount = getServiceAccount();
  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.projectId,
  });
  const db = getFirestore();

  console.log(`Starting backup of ${BACKUP_COLLECTIONS.length} collections...`);
  const backup: Record<string, unknown[]> = {};
  let totalDocs = 0;

  for (const name of BACKUP_COLLECTIONS) {
    const snap = await db.collection(name).get();
    backup[name] = snap.docs.map((document) =>
      encodeFirestoreValue({ id: document.id, ...document.data() }),
    );
    console.log(`   ${name.padEnd(20)} ${snap.size.toString().padStart(6)} docs`);
    totalDocs += snap.size;
  }

  if (!existsSync("./backups")) mkdirSync("./backups");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = join("./backups", `backup-${timestamp}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        formatVersion: 2,
        exportedAt: new Date().toISOString(),
        projectId: serviceAccount.projectId,
        data: backup,
      },
      null,
      2,
    ),
  );

  const size = require("fs").statSync(file).size / 1024;
  console.log(`\nBackup complete: ${totalDocs} documents -> ${file}`);
  console.log(`File size: ${size.toFixed(1)} KB`);
}

main().catch((error) => {
  console.error("Backup failed:", error);
  process.exit(1);
});
