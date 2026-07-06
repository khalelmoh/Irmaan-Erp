/**
 * Clears ERP test/business data while preserving login users and company settings.
 *
 * Credentials may come from GOOGLE_APPLICATION_CREDENTIALS or from
 * FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.
 */
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { existsSync } from "fs";
import { resolve } from "path";
import { BACKUP_COLLECTIONS } from "../src/lib/server/backup-format";

const PRESERVED_COLLECTIONS = new Set(["users", "settings"]);
const CLEAR_COLLECTIONS = BACKUP_COLLECTIONS.filter((name) => !PRESERVED_COLLECTIONS.has(name));

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

async function deleteCollection(db: ReturnType<typeof getFirestore>, collectionName: string) {
  let deleted = 0;

  while (true) {
    const snap = await db.collection(collectionName).limit(400).get();
    if (snap.empty) return deleted;

    const batch = db.batch();
    snap.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
    deleted += snap.size;
  }
}

async function main() {
  const confirmed = process.argv.includes("--yes");
  if (!confirmed) {
    throw new Error("Refusing to clear data without --yes");
  }

  const serviceAccount = getServiceAccount();
  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.projectId,
  });
  const db = getFirestore();

  console.log(`Project: ${serviceAccount.projectId}`);
  console.log(`Preserving: ${[...PRESERVED_COLLECTIONS].join(", ")}`);
  console.log(`Clearing: ${CLEAR_COLLECTIONS.join(", ")}`);
  console.log("Starting in 5 seconds. Press Ctrl+C to abort.");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  let total = 0;
  for (const collection of CLEAR_COLLECTIONS) {
    const count = await deleteCollection(db, collection);
    total += count;
    console.log(`${collection.padEnd(20)} deleted ${count.toString().padStart(6)} docs`);
  }

  console.log(`\nClear complete: ${total} documents deleted`);
}

main().catch((error) => {
  console.error("Clear failed:", error);
  process.exit(1);
});
