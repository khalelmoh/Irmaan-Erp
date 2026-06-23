/**
 * Validates or restores a versioned or legacy ERP JSON backup.
 *
 * Dry run is fully offline:
 *   npm run restore -- ./backups/example.json --dry-run
 *
 * Live restore overwrites documents with matching IDs and requires Firebase
 * admin credentials. It never deletes documents not present in the backup.
 */
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { existsSync, readFileSync } from "fs";
import { normalizeBackupPayload } from "../src/lib/server/backup-format";

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
  if (existsSync(serviceAccountPath)) return require(serviceAccountPath);
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
  const file = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!file) {
    throw new Error("Usage: npm run restore -- <backup-file.json> [--dry-run]");
  }
  if (!existsSync(file)) throw new Error(`File not found: ${file}`);

  const payload = normalizeBackupPayload(JSON.parse(readFileSync(file, "utf8")));
  console.log(`Restoring from ${file}`);
  console.log(`Original export date: ${payload.exportedAt}`);
  console.log(`Mode: ${dryRun ? "DRY RUN (no writes)" : "LIVE WRITE"}\n`);

  let db: ReturnType<typeof getFirestore> | null = null;
  if (!dryRun) {
    const serviceAccount = getServiceAccount();
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId,
    });
    db = getFirestore();
    console.log("Continuing in 5 seconds. Press Ctrl+C to abort.");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  let totalDocs = 0;
  for (const [collection, documents] of Object.entries(payload.data)) {
    let batch = db?.batch();
    let batchCount = 0;
    for (const { id, ...data } of documents) {
      if (!dryRun) batch!.set(db!.collection(collection).doc(id), data);
      batchCount++;
      if (batchCount >= 400) {
        if (!dryRun) await batch!.commit();
        batch = db?.batch();
        batchCount = 0;
      }
    }
    if (batchCount > 0 && !dryRun) await batch!.commit();
    console.log(
      `${dryRun ? "would write" : "wrote      "} ${collection.padEnd(20)} ${documents.length
        .toString()
        .padStart(6)} docs`,
    );
    totalDocs += documents.length;
  }
  console.log(`\n${dryRun ? "Dry run complete" : "Restore complete"}: ${totalDocs} documents`);
}

main().catch((error) => {
  console.error("Restore failed:", error);
  process.exit(1);
});
