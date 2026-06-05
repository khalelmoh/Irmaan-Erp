/**
 * Cloud Functions for Irmaan ERP
 *
 *  1. assignDONumber / assignPONumber / assignInvoiceNumber
 *     onDocumentCreated triggers that atomically stamp the next sequence number
 *     using a Firestore transaction on counters/{collection}. Clients write the
 *     document without a number; the function fills it in.
 *
 *  2. nextDocNumber (callable)
 *     Optional client-callable for previewing the NEXT number before creation.
 *
 *  3. logAudit (onDocumentWritten on key collections)
 *     Append-only audit entries from server-side mutations.
 *
 * Deploy with:
 *   cd functions && npm install && cd ..
 *   firebase deploy --only functions
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

function pad(n: number, w = 5) { return String(n).padStart(w, "0"); }

async function nextSequence(name: string, prefix: string): Promise<string> {
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`counters/${name}`);
    const snap = await tx.get(ref);
    const next = (snap.exists ? (snap.data()!.value as number) : 0) + 1;
    tx.set(ref, { value: next }, { merge: true });
    return `${prefix}-${pad(next)}`;
  });
}

// ── Callable: preview / claim next number from any client ─────────────────
export const nextDocNumber = onCall<{ sequence: string; prefix: string }>(
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
    const { sequence, prefix } = req.data;
    if (!sequence || !prefix) {
      throw new HttpsError("invalid-argument", "sequence + prefix required");
    }
    return nextSequence(sequence, prefix);
  },
);

// ── Auto-stamp DO/PO/Invoice numbers on creation ──────────────────────────
export const assignDONumber = onDocumentCreated(
  "delivery_orders/{id}",
  async (event) => {
    const snap = event.data;
    if (!snap || snap.data().doNumber) return;
    const num = await nextSequence("delivery_orders", "DO");
    await snap.ref.update({
      doNumber: num,
      qrPayload: `/verify/${event.params.id}`,
    });
  },
);

export const assignPONumber = onDocumentCreated(
  "purchase_orders/{id}",
  async (event) => {
    const snap = event.data;
    if (!snap || snap.data().poNumber) return;
    const num = await nextSequence("purchase_orders", "PO");
    await snap.ref.update({
      poNumber: num,
      qrPayload: `/verify/${event.params.id}`,
    });
  },
);

export const assignInvoiceNumber = onDocumentCreated(
  "invoices/{id}",
  async (event) => {
    const snap = event.data;
    if (!snap || snap.data().invoiceNumber) return;
    const num = await nextSequence("invoices", "INV");
    await snap.ref.update({ invoiceNumber: num });
  },
);

// ── Server-side audit log entries for DO/PO/Invoice creation ──────────────
async function writeAudit(args: {
  actorUid: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  await db.collection("activity_logs").add({
    ...args,
    at: FieldValue.serverTimestamp(),
  });
}

export const auditDOCreate = onDocumentCreated(
  "delivery_orders/{id}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const d = snap.data();
    await writeAudit({
      actorUid: d.createdBy ?? "system",
      actorName: d.salespersonName ?? "Unknown",
      action: "do.create",
      entityType: "delivery_order",
      entityId: event.params.id,
      entityLabel: d.doNumber ?? "DO-?????",
      summary: `Server: DO created for ${d.customerSnapshot?.name ?? "(unknown customer)"}`,
      metadata: { customerId: d.customerId },
    });
  },
);

export const auditInvoiceCreate = onDocumentCreated(
  "invoices/{id}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const d = snap.data();
    await writeAudit({
      actorUid: "system",
      actorName: "System",
      action: "invoice.create",
      entityType: "invoice",
      entityId: event.params.id,
      entityLabel: d.invoiceNumber ?? "INV-?????",
      summary: `Server: invoice for ${d.customerSnapshot?.name ?? "(unknown)"} total ${d.total}`,
      metadata: { customerId: d.customerId, total: d.total },
    });
  },
);

export const auditPOCreate = onDocumentCreated(
  "purchase_orders/{id}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const d = snap.data();
    await writeAudit({
      actorUid: d.createdBy ?? "system",
      actorName: "System",
      action: "po.create",
      entityType: "purchase_order",
      entityId: event.params.id,
      entityLabel: d.poNumber ?? "PO-?????",
      summary: `Server: PO created for ${d.supplierSnapshot?.name ?? "(unknown supplier)"}`,
      metadata: { supplierId: d.supplierId, total: d.total },
    });
  },
);
