/**
 * Restore script — counterpart to backup.ts.
 * ⚠️  DESTRUCTIVE: overwrites existing documents with the same ID. Use with care.
 *
 * Usage:
 *   npx tsx scripts/restore.ts ./backups/backup-2026-06-03T18-32-00.json
 *
 * Add --dry-run to preview without writing.
 */
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync, existsSync } from "fs";

async function main() {
  const file = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");

  if (!file) {
    console.error("Usage: npx tsx scripts/restore.ts <backup-file.json> [--dry-run]");
    process.exit(1);
  }
  if (!existsSync(file)) {
    console.error(`❌ File not found: ${file}`);
    process.exit(1);
  }

  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./service-account.json";
  if (!existsSync(serviceAccountPath)) {
    console.error(`❌ Service account file not found at ${serviceAccountPath}`);
    process.exit(1);
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const serviceAccount = require(serviceAccountPath);
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  const payload = JSON.parse(readFileSync(file, "utf8")) as {
    exportedAt: string;
    data: Record<string, Array<{ id: string } & Record<string, unknown>>>;
  };

  console.log(`📂 Restoring from ${file}`);
  console.log(`   Original export date: ${payload.exportedAt}`);
  console.log(`   Mode: ${dryRun ? "DRY RUN (no writes)" : "⚠️  LIVE WRITE"}\n`);

  if (!dryRun) {
    console.log("Continuing in 5 seconds... press Ctrl+C to abort.");
    await new Promise((r) => setTimeout(r, 5000));
  }

  let totalDocs = 0;
  for (const [collection, docs] of Object.entries(payload.data)) {
    const batch = db.batch();
    let batchCount = 0;
    for (const { id, ...data } of docs) {
      if (!dryRun) batch.set(db.collection(collection).doc(id), data);
      batchCount++;
      if (batchCount >= 400) {
        if (!dryRun) await batch.commit();
        batchCount = 0;
      }
    }
    if (batchCount > 0 && !dryRun) await batch.commit();
    console.log(`   ${dryRun ? "would write" : "wrote     "} ${collection.padEnd(20)} ${docs.length.toString().padStart(6)} docs`);
    totalDocs += docs.length;
  }
  console.log(`\n✅ ${dryRun ? "Dry run complete" : "Restore complete"}: ${totalDocs} documents`);
}

main().catch((err) => {
  console.error("❌ Restore failed:", err);
  process.exit(1);
});
