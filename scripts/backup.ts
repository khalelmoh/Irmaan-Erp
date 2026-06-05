/**
 * Backup script — exports every Firestore collection to a single JSON file.
 *
 * Usage:
 *   1. Get a service-account JSON from Firebase Console → Project Settings →
 *      Service accounts → Generate new private key.
 *   2. Save it as ./service-account.json (it's in .gitignore — never commit!)
 *   3. Run:  npx tsx scripts/backup.ts
 *      → creates  ./backups/backup-2026-06-03T18-32-00.json
 *
 * Schedule it (cron / GitHub Actions / Cloud Scheduler) for daily backups.
 */
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const COLLECTIONS = [
  "users",
  "customers",
  "suppliers",
  "products",
  "delivery_orders",
  "purchase_orders",
  "invoices",
  "payments",
  "supplier_payments",
  "stock_movements",
  "activity_logs",
  "counters",
];

async function main() {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./service-account.json";
  if (!existsSync(serviceAccountPath)) {
    console.error(`❌ Service account file not found at ${serviceAccountPath}`);
    console.error("   Download one from Firebase Console → Project Settings → Service accounts.");
    process.exit(1);
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const serviceAccount = require(serviceAccountPath);

  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  console.log(`📦 Starting backup of ${COLLECTIONS.length} collections...`);
  const backup: Record<string, unknown[]> = {};
  let totalDocs = 0;

  for (const name of COLLECTIONS) {
    const snap = await db.collection(name).get();
    backup[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    console.log(`   ✓ ${name.padEnd(20)} ${snap.size.toString().padStart(6)} docs`);
    totalDocs += snap.size;
  }

  if (!existsSync("./backups")) mkdirSync("./backups");
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = join("./backups", `backup-${ts}.json`);
  writeFileSync(
    file,
    JSON.stringify({ exportedAt: new Date().toISOString(), data: backup }, null, 2),
  );

  console.log(`\n✅ Backup complete: ${totalDocs} documents → ${file}`);
  console.log(`   File size: ${(require("fs").statSync(file).size / 1024).toFixed(1)} KB`);
}

main().catch((err) => {
  console.error("❌ Backup failed:", err);
  process.exit(1);
});
