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
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Transaction } from "firebase-admin/firestore";

if (getApps().length === 0) {
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

async function requireRole(uid: string, roles: string[]) {
  const snap = await db.doc(`users/${uid}`).get();
  const user = snap.data();
  if (!snap.exists || user?.active !== true) {
    throw new HttpsError("permission-denied", "Active user profile required");
  }
  if (!roles.includes(user.role)) {
    throw new HttpsError("permission-denied", "You do not have permission for this action");
  }
  return user;
}

async function claimSequence(
  tx: Transaction,
  name: string,
  prefix: string,
  width = 5,
): Promise<string> {
  const ref = db.doc(`counters/${name}`);
  const snap = await tx.get(ref);
  const next = (snap.exists ? (snap.data()!.value as number) : 0) + 1;
  tx.set(ref, { value: next }, { merge: true });
  return `${prefix}-${pad(next, width)}`;
}

type QuantityItem = {
  productId: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
};

type InvoiceLine = QuantityItem & {
  unitPrice: number;
  lineTotal: number;
};

function validateQuantityItems(value: unknown): QuantityItem[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpsError("invalid-argument", "At least one item is required");
  }
  const seen = new Set<string>();
  return value.map((raw) => {
    const item = raw as Partial<QuantityItem>;
    if (
      typeof item.productId !== "string" ||
      !item.productId ||
      typeof item.name !== "string" ||
      !item.name ||
      typeof item.unit !== "string" ||
      !item.unit ||
      typeof item.quantity !== "number" ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0
    ) {
      throw new HttpsError("invalid-argument", "Invalid delivery-order item");
    }
    if (seen.has(item.productId)) {
      throw new HttpsError("invalid-argument", `Duplicate product ${item.productId}`);
    }
    seen.add(item.productId);
    return item as QuantityItem;
  });
}

function validateInvoiceItems(value: unknown): InvoiceLine[] {
  return validateQuantityItems(value).map((item) => {
    if (
      typeof item.unitPrice !== "number" ||
      !Number.isFinite(item.unitPrice) ||
      item.unitPrice < 0
    ) {
      throw new HttpsError("invalid-argument", `Invalid unit price for ${item.name}`);
    }
    return {
      ...item,
      unitPrice: item.unitPrice,
      lineTotal: Math.round(item.quantity * item.unitPrice * 100) / 100,
    };
  });
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function validateTaxRate(value: unknown) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new HttpsError("invalid-argument", "Tax rate must be between 0 and 1");
  }
  return value;
}

function validateDate(value: unknown, field: string, required = true) {
  if (!value && !required) return undefined;
  if (typeof value !== "string" || !value || Number.isNaN(Date.parse(value))) {
    throw new HttpsError("invalid-argument", `${field} must be a valid date`);
  }
  return value;
}

function updateSalesOrderProgress(
  so: Record<string, any>,
  items: QuantityItem[],
  field: "deliveredQty" | "invoicedQty",
  direction: 1 | -1,
) {
  if (so.status === "cancelled") {
    throw new HttpsError("failed-precondition", "Sales order is cancelled");
  }
  const updatedItems = (so.items as Array<Record<string, any>>).map((item) => ({ ...item }));
  for (const deliveryItem of items) {
    const line = updatedItems.find((item) => item.productId === deliveryItem.productId);
    if (!line) {
      throw new HttpsError(
        "failed-precondition",
        `${deliveryItem.name} is not on ${so.soNumber ?? "the sales order"}`,
      );
    }
    const next = Math.round(((line[field] ?? 0) + direction * deliveryItem.quantity) * 100) / 100;
    if (next < -0.001 || next > line.quantity + 0.001) {
      throw new HttpsError(
        "failed-precondition",
        `${deliveryItem.name} exceeds the remaining sales-order quantity`,
      );
    }
    line[field] = Math.max(0, next);
  }
  const ordered = updatedItems.reduce((sum, item) => sum + item.quantity, 0);
  const invoiced = updatedItems.reduce((sum, item) => sum + (item.invoicedQty ?? 0), 0);
  const delivered = updatedItems.reduce((sum, item) => sum + (item.deliveredQty ?? 0), 0);
  const status =
    invoiced + 0.001 >= ordered
      ? "invoiced"
      : delivered + 0.001 >= ordered
        ? "fully_delivered"
        : "confirmed";
  return { items: updatedItems, status };
}

function validateCreditQuantities(
  original: Record<string, any>,
  priorCreditDocs: any[],
  items: InvoiceLine[],
  excludeId?: string,
) {
  const credited = new Map<string, number>();
  priorCreditDocs
    .filter((snap) => snap.id !== excludeId)
    .map((snap) => snap.data())
    .filter((credit) => credit.status !== "cancelled")
    .forEach((credit) => {
      (credit.items as Array<Record<string, any>> ?? []).forEach((item) => {
        credited.set(
          item.productId,
          (credited.get(item.productId) ?? 0) + (item.quantity ?? 0),
        );
      });
    });
  for (const item of items) {
    const originalLine = (original.items as Array<Record<string, any>>).find(
      (line) => line.productId === item.productId,
    );
    if (!originalLine) {
      throw new HttpsError(
        "failed-precondition",
        `${item.name} is not on the original invoice`,
      );
    }
    if ((credited.get(item.productId) ?? 0) + item.quantity > originalLine.quantity + 0.001) {
      throw new HttpsError(
        "failed-precondition",
        `Credit quantity exceeds the original invoice for ${item.name}`,
      );
    }
  }
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
export const createDeliveryOrder = onCall<{ document: Record<string, any> }>(
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
    const actorUid = req.auth.uid;
    const user = await requireRole(actorUid, ["admin", "manager", "sales", "warehouse"]);
    const input = req.data.document ?? {};
    let items = validateQuantityItems(input.items);
    const status = input.status;
    if (status !== "draft" && status !== "issued") {
      throw new HttpsError("invalid-argument", "Delivery order must be draft or issued");
    }
    if (typeof input.customerId !== "string" || !input.customerId) {
      throw new HttpsError("invalid-argument", "Customer is required");
    }

    const doRef = db.collection("delivery_orders").doc();
    await db.runTransaction(async (tx) => {
      const customerRef = db.doc(`customers/${input.customerId}`);
      const productRefs = items.map((item) => db.doc(`products/${item.productId}`));
      const [customerSnap, ...productSnaps] = await Promise.all([
        tx.get(customerRef),
        ...productRefs.map((ref) => tx.get(ref)),
      ]);
      if (!customerSnap.exists) throw new HttpsError("not-found", "Customer not found");
      productSnaps.forEach((snap, index) => {
        if (!snap.exists) {
          throw new HttpsError("failed-precondition", `Product ${items[index].productId} not found`);
        }
      });
      items = items.map((item, index) => ({
        ...item,
        name: productSnaps[index].data()!.name,
        unit: productSnaps[index].data()!.unit,
      }));
      const poQuerySnap =
        status === "issued"
          ? await tx.get(db.collection("purchase_orders").orderBy("orderDate", "asc"))
          : null;
      const soRef =
        typeof input.salesOrderId === "string" && input.salesOrderId
          ? db.doc(`sales_orders/${input.salesOrderId}`)
          : null;
      const soSnap = status === "issued" && soRef ? await tx.get(soRef) : null;
      if (
        soSnap?.exists &&
        soSnap.data()!.customerId !== input.customerId
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Delivery order customer does not match the sales order",
        );
      }
      const doNumber = await claimSequence(tx, "delivery_orders", "DO");
      const allocations: Array<Record<string, any>> = [];
      const changedPOs = new Map<
        string,
        { ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }
      >();

      if (status === "issued") {
        productSnaps.forEach((snap, index) => {
          const product = snap.data()!;
          if ((product.stock ?? 0) + 0.001 < items[index].quantity) {
            throw new HttpsError("failed-precondition", `Insufficient stock for ${items[index].name}`);
          }
        });

        const poDocs = poQuerySnap!.docs
          .map((snap) => ({ ref: snap.ref, id: snap.id, data: snap.data() }))
          .filter(({ data }) => data.status !== "draft" && data.status !== "cancelled");

        for (const item of items) {
          let remaining = item.quantity;
          for (const poDoc of poDocs) {
            const current = changedPOs.get(poDoc.id)?.data ?? {
              ...poDoc.data,
              items: (poDoc.data.items as Array<Record<string, any>>).map((line) => ({ ...line })),
            };
            const line = current.items.find(
              (candidate: Record<string, any>) => candidate.productId === item.productId,
            );
            if (!line) continue;
            const available = (line.receivedQty ?? 0) - (line.allocatedQty ?? 0);
            if (available <= 0) continue;
            const quantity = Math.min(available, remaining);
            line.allocatedQty = (line.allocatedQty ?? 0) + quantity;
            changedPOs.set(poDoc.id, { ref: poDoc.ref, data: current });
            allocations.push({
              deliveryOrderId: doRef.id,
              doNumber,
              purchaseOrderId: poDoc.id,
              poNumber: current.poNumber,
              productId: item.productId,
              productName: item.name,
              quantity,
              allocatedAt: FieldValue.serverTimestamp(),
              allocatedBy: actorUid,
            });
            remaining -= quantity;
            if (remaining <= 0.001) break;
          }
          if (remaining > 0.001) {
            throw new HttpsError(
              "failed-precondition",
              `Insufficient received PO stock for ${item.name}`,
            );
          }
        }
      }

      const {
        id: _id,
        doNumber: _doNumber,
        qrPayload: _qrPayload,
        allocations: _allocations,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...safeInput
      } = input;
      tx.set(doRef, {
        ...safeInput,
        customerSnapshot: {
          name: customerSnap.data()!.name,
          address: customerSnap.data()!.address ?? "",
          phone: customerSnap.data()!.phone ?? "",
        },
        items,
        status,
        doNumber,
        qrPayload: `/verify/${doRef.id}`,
        allocations,
        createdBy: actorUid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (status === "issued") {
        items.forEach((item, index) => {
          const product = productSnaps[index].data()!;
          const balanceAfter = Math.round(((product.stock ?? 0) - item.quantity) * 100) / 100;
          tx.update(productRefs[index], {
            stock: balanceAfter,
            updatedAt: FieldValue.serverTimestamp(),
          });
          tx.set(db.collection("stock_movements").doc(), {
            productId: item.productId,
            productName: product.name,
            unit: product.unit,
            qty: -item.quantity,
            kind: "do_issue",
            sourceType: "delivery_order",
            sourceId: doRef.id,
            sourceNumber: doNumber,
            balanceAfter,
            recordedBy: actorUid,
            at: FieldValue.serverTimestamp(),
          });
        });
        changedPOs.forEach(({ ref, data }) => {
          tx.update(ref, { items: data.items, updatedAt: FieldValue.serverTimestamp() });
        });
        allocations.forEach((allocation) => {
          tx.set(db.collection("po_allocations").doc(), allocation);
        });
        if (soRef) {
          if (!soSnap?.exists) {
            throw new HttpsError("failed-precondition", "Sales order not found");
          }
          const progress = updateSalesOrderProgress(soSnap.data()!, items, "deliveredQty", 1);
          tx.update(soRef, {
            items: progress.items,
            status: progress.status,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
    });

    return { id: doRef.id, actorName: user.displayName ?? "Unknown" };
  },
);

export const transitionDeliveryOrder = onCall<{ id: string; status: string }>(
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
    const actorUid = req.auth.uid;
    const user = await requireRole(actorUid, ["admin", "manager", "sales", "warehouse"]);
    const { id, status: targetStatus } = req.data;
    if (!id || !["issued", "delivered", "cancelled"].includes(targetStatus)) {
      throw new HttpsError("invalid-argument", "Invalid delivery-order transition");
    }

    const doRef = db.doc(`delivery_orders/${id}`);
    let doNumber = id;
    await db.runTransaction(async (tx) => {
      const doSnap = await tx.get(doRef);
      if (!doSnap.exists) throw new HttpsError("not-found", "Delivery order not found");
      const deliveryOrder = doSnap.data()!;
      doNumber = deliveryOrder.doNumber ?? id;
      const currentStatus = deliveryOrder.status;

      if (currentStatus === "issued" && targetStatus === "delivered") {
        tx.update(doRef, {
          status: "delivered",
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }
      if (currentStatus === "draft" && targetStatus === "cancelled") {
        tx.update(doRef, {
          status: "cancelled",
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }
      if (
        (currentStatus === "issued" || currentStatus === "delivered") &&
        targetStatus === "cancelled"
      ) {
        if (deliveryOrder.invoiceId) {
          throw new HttpsError(
            "failed-precondition",
            "Cancel the linked invoice before cancelling this delivery order",
          );
        }
        const items = validateQuantityItems(deliveryOrder.items);
        const productRefs = items.map((item) => db.doc(`products/${item.productId}`));
        const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));
        const allocationSnap = await tx.get(
          db.collection("po_allocations").where("deliveryOrderId", "==", id),
        );
        const poIds = [...new Set(allocationSnap.docs.map((snap) => snap.data().purchaseOrderId as string))];
        const poRefs = poIds.map((poId) => db.doc(`purchase_orders/${poId}`));
        const poSnaps = await Promise.all(poRefs.map((ref) => tx.get(ref)));
        const soRef =
          typeof deliveryOrder.salesOrderId === "string" && deliveryOrder.salesOrderId
            ? db.doc(`sales_orders/${deliveryOrder.salesOrderId}`)
            : null;
        const soSnap = soRef ? await tx.get(soRef) : null;

        productSnaps.forEach((snap, index) => {
          if (!snap.exists) {
            throw new HttpsError("failed-precondition", `Product ${items[index].name} not found`);
          }
          const product = snap.data()!;
          const balanceAfter = Math.round(((product.stock ?? 0) + items[index].quantity) * 100) / 100;
          tx.update(productRefs[index], {
            stock: balanceAfter,
            updatedAt: FieldValue.serverTimestamp(),
          });
          tx.set(db.collection("stock_movements").doc(), {
            productId: items[index].productId,
            productName: product.name,
            unit: product.unit,
            qty: items[index].quantity,
            kind: "do_cancel",
            sourceType: "delivery_order",
            sourceId: id,
            sourceNumber: deliveryOrder.doNumber,
            reason: `Cancellation of ${deliveryOrder.doNumber}`,
            balanceAfter,
            recordedBy: actorUid,
            at: FieldValue.serverTimestamp(),
          });
        });

        poSnaps.forEach((snap, index) => {
          if (!snap.exists) {
            throw new HttpsError("failed-precondition", `Purchase order ${poIds[index]} not found`);
          }
          const poItems = (snap.data()!.items as Array<Record<string, any>>).map((item) => ({ ...item }));
          allocationSnap.docs
            .filter((allocation) => allocation.data().purchaseOrderId === poIds[index])
            .forEach((allocation) => {
              const data = allocation.data();
              const line = poItems.find((item) => item.productId === data.productId);
              if (line) {
                line.allocatedQty = Math.max(0, (line.allocatedQty ?? 0) - data.quantity);
              }
            });
          tx.update(poRefs[index], {
            items: poItems,
            updatedAt: FieldValue.serverTimestamp(),
          });
        });
        allocationSnap.docs.forEach((allocation) => tx.delete(allocation.ref));
        if (soRef) {
          if (!soSnap?.exists) throw new HttpsError("failed-precondition", "Sales order not found");
          const progress = updateSalesOrderProgress(soSnap.data()!, items, "deliveredQty", -1);
          tx.update(soRef, {
            items: progress.items,
            status: progress.status,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        tx.update(doRef, {
          status: "cancelled",
          allocations: [],
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }
      if (currentStatus !== "draft" || targetStatus !== "issued") {
        throw new HttpsError(
          "failed-precondition",
          `Unsupported transition from ${currentStatus} to ${targetStatus}`,
        );
      }

      let items = validateQuantityItems(deliveryOrder.items);
      const customerRef = db.doc(`customers/${deliveryOrder.customerId}`);
      const productRefs = items.map((item) => db.doc(`products/${item.productId}`));
      const [customerSnap, ...productSnaps] = await Promise.all([
        tx.get(customerRef),
        ...productRefs.map((ref) => tx.get(ref)),
      ]);
      if (!customerSnap.exists) throw new HttpsError("not-found", "Customer not found");
      const poQuerySnap = await tx.get(
        db.collection("purchase_orders").orderBy("orderDate", "asc"),
      );
      const soRef =
        typeof deliveryOrder.salesOrderId === "string" && deliveryOrder.salesOrderId
          ? db.doc(`sales_orders/${deliveryOrder.salesOrderId}`)
          : null;
      const soSnap = soRef ? await tx.get(soRef) : null;
      if (
        soSnap?.exists &&
        soSnap.data()!.customerId !== deliveryOrder.customerId
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Delivery order customer does not match the sales order",
        );
      }
      const allocations: Array<Record<string, any>> = [];
      const changedPOs = new Map<
        string,
        { ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }
      >();

      productSnaps.forEach((snap, index) => {
        if (!snap.exists) {
          throw new HttpsError("failed-precondition", `Product ${items[index].name} not found`);
        }
        if ((snap.data()!.stock ?? 0) + 0.001 < items[index].quantity) {
          throw new HttpsError("failed-precondition", `Insufficient stock for ${items[index].name}`);
        }
      });
      items = items.map((item, index) => ({
        ...item,
        name: productSnaps[index].data()!.name,
        unit: productSnaps[index].data()!.unit,
      }));

      const poDocs = poQuerySnap.docs
        .map((snap) => ({ ref: snap.ref, id: snap.id, data: snap.data() }))
        .filter(({ data }) => data.status !== "draft" && data.status !== "cancelled");
      for (const item of items) {
        let remaining = item.quantity;
        for (const poDoc of poDocs) {
          const current = changedPOs.get(poDoc.id)?.data ?? {
            ...poDoc.data,
            items: (poDoc.data.items as Array<Record<string, any>>).map((line) => ({ ...line })),
          };
          const line = current.items.find(
            (candidate: Record<string, any>) => candidate.productId === item.productId,
          );
          if (!line) continue;
          const available = (line.receivedQty ?? 0) - (line.allocatedQty ?? 0);
          if (available <= 0) continue;
          const quantity = Math.min(available, remaining);
          line.allocatedQty = (line.allocatedQty ?? 0) + quantity;
          changedPOs.set(poDoc.id, { ref: poDoc.ref, data: current });
          allocations.push({
            deliveryOrderId: id,
            doNumber: deliveryOrder.doNumber,
            purchaseOrderId: poDoc.id,
            poNumber: current.poNumber,
            productId: item.productId,
            productName: item.name,
            quantity,
            allocatedAt: FieldValue.serverTimestamp(),
            allocatedBy: actorUid,
          });
          remaining -= quantity;
          if (remaining <= 0.001) break;
        }
        if (remaining > 0.001) {
          throw new HttpsError(
            "failed-precondition",
            `Insufficient received PO stock for ${item.name}`,
          );
        }
      }

      items.forEach((item, index) => {
        const product = productSnaps[index].data()!;
        const balanceAfter = Math.round(((product.stock ?? 0) - item.quantity) * 100) / 100;
        tx.update(productRefs[index], {
          stock: balanceAfter,
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.set(db.collection("stock_movements").doc(), {
          productId: item.productId,
          productName: product.name,
          unit: product.unit,
          qty: -item.quantity,
          kind: "do_issue",
          sourceType: "delivery_order",
          sourceId: id,
          sourceNumber: deliveryOrder.doNumber,
          balanceAfter,
          recordedBy: actorUid,
          at: FieldValue.serverTimestamp(),
        });
      });
      changedPOs.forEach(({ ref, data }) => {
        tx.update(ref, { items: data.items, updatedAt: FieldValue.serverTimestamp() });
      });
      allocations.forEach((allocation) => {
        tx.set(db.collection("po_allocations").doc(), allocation);
      });
      if (soRef) {
        if (!soSnap?.exists) throw new HttpsError("failed-precondition", "Sales order not found");
        const progress = updateSalesOrderProgress(soSnap.data()!, items, "deliveredQty", 1);
        tx.update(soRef, {
          items: progress.items,
          status: progress.status,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      tx.update(doRef, {
        status: "issued",
        items,
        allocations,
        customerSnapshot: {
          name: customerSnap.data()!.name,
          address: customerSnap.data()!.address ?? "",
          phone: customerSnap.data()!.phone ?? "",
        },
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    const action =
      targetStatus === "issued"
        ? "do.issue"
        : targetStatus === "delivered"
          ? "do.mark_delivered"
          : "do.cancel";
    await writeAudit({
      actorUid,
      actorName: user.displayName ?? user.email ?? "User",
      action,
      entityType: "delivery_order",
      entityId: id,
      entityLabel: doNumber,
      summary: `${targetStatus === "cancelled" ? "Cancelled" : targetStatus === "issued" ? "Issued" : "Marked delivered"} delivery order ${doNumber}`,
    });
    return { id };
  },
);

export const createInvoice = onCall<{ document: Record<string, any> }>(
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
    const actorUid = req.auth.uid;
    const user = await requireRole(actorUid, ["admin", "manager", "sales"]);
    const input = req.data.document ?? {};
    const items = validateInvoiceItems(input.items);
    const type = input.type === "credit_note" ? "credit_note" : "invoice";
    const requestedStatus = input.status;
    if (requestedStatus !== "draft" && requestedStatus !== "sent") {
      throw new HttpsError("invalid-argument", "Invoice must be draft or sent");
    }
    const requiresCreditApproval = type === "credit_note" && user.role === "sales";
    const status =
      requiresCreditApproval && requestedStatus === "sent" ? "draft" : requestedStatus;
    if (typeof input.customerId !== "string" || !input.customerId) {
      throw new HttpsError("invalid-argument", "Customer is required");
    }
    const taxRate = Number(input.taxRate);
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) {
      throw new HttpsError("invalid-argument", "Tax rate must be between 0 and 1");
    }
    const subtotal = Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
    const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;
    const doIds = Array.isArray(input.doIds)
      ? [...new Set(input.doIds.filter((id: unknown): id is string => typeof id === "string" && !!id))]
      : [];
    const active = status !== "draft";
    const invoiceRef = db.collection("invoices").doc();

    await db.runTransaction(async (tx) => {
      const customerRef = db.doc(`customers/${input.customerId}`);
      const customerSnap = await tx.get(customerRef);
      if (!customerSnap.exists) throw new HttpsError("failed-precondition", "Customer not found");
      const doRefs = doIds.map((id) => db.doc(`delivery_orders/${id}`));
      const doSnaps = active ? await Promise.all(doRefs.map((ref) => tx.get(ref))) : [];
      const soRef =
        typeof input.salesOrderId === "string" && input.salesOrderId
          ? db.doc(`sales_orders/${input.salesOrderId}`)
          : null;
      const soSnap = active && type === "invoice" && soRef ? await tx.get(soRef) : null;
      const originalRef =
        type === "credit_note" && typeof input.originalInvoiceId === "string"
          ? db.doc(`invoices/${input.originalInvoiceId}`)
          : null;
      const originalSnap = originalRef ? await tx.get(originalRef) : null;
      const priorCredits =
        active && originalRef
          ? await tx.get(
              db.collection("invoices").where("originalInvoiceId", "==", originalRef.id),
            )
          : null;
      const productRefs =
        active && type === "credit_note"
          ? items.map((item) => db.doc(`products/${item.productId}`))
          : [];
      const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));
      const invoiceNumber = await claimSequence(tx, "invoices", "INV");

      if (active && type === "invoice") {
        doSnaps.forEach((snap, index) => {
          if (!snap.exists) {
            throw new HttpsError("failed-precondition", `Delivery order ${doIds[index]} not found`);
          }
          const deliveryOrder = snap.data()!;
          if (!["issued", "delivered"].includes(deliveryOrder.status)) {
            throw new HttpsError(
              "failed-precondition",
              `${deliveryOrder.doNumber} must be issued before invoicing`,
            );
          }
          if (deliveryOrder.customerId !== input.customerId) {
            throw new HttpsError(
              "failed-precondition",
              `${deliveryOrder.doNumber} belongs to another customer`,
            );
          }
          if (deliveryOrder.invoiceId) {
            throw new HttpsError(
              "already-exists",
              `${deliveryOrder.doNumber} is already linked to an invoice`,
            );
          }
          if (
            soRef &&
            deliveryOrder.salesOrderId &&
            deliveryOrder.salesOrderId !== soRef.id
          ) {
            throw new HttpsError(
              "failed-precondition",
              `${deliveryOrder.doNumber} belongs to another sales order`,
            );
          }
        });
        if (soRef) {
          if (!soSnap?.exists) {
            throw new HttpsError("failed-precondition", "Sales order not found");
          }
          if (soSnap.data()!.customerId !== input.customerId) {
            throw new HttpsError(
              "failed-precondition",
              "Invoice customer does not match the sales order",
            );
          }
        }
      }

      if (type === "credit_note") {
        if (!originalSnap?.exists) {
          throw new HttpsError("failed-precondition", "Original invoice not found");
        }
        const original = originalSnap.data()!;
        if (original.type === "credit_note" || original.status === "cancelled") {
          throw new HttpsError("failed-precondition", "Original invoice is not creditable");
        }
        if (original.customerId !== input.customerId) {
          throw new HttpsError("failed-precondition", "Credit note customer does not match");
        }
        validateCreditQuantities(original, priorCredits?.docs ?? [], items);
        if (total > original.total + 0.01) {
          throw new HttpsError("failed-precondition", "Credit note exceeds original invoice total");
        }
        if (active && priorCredits) {
          const credited = priorCredits.docs
            .map((snap) => snap.data())
            .filter((credit) => credit.status !== "cancelled")
            .reduce((sum, credit) => sum + (credit.total ?? 0), 0);
          if (credited + total > original.total + 0.01) {
            throw new HttpsError(
              "failed-precondition",
              "Credit notes exceed the original invoice balance",
            );
          }
        }
        productSnaps.forEach((snap, index) => {
          if (!snap.exists) {
            throw new HttpsError("failed-precondition", `Product ${items[index].name} not found`);
          }
        });
      }

      const {
        id: _id,
        invoiceNumber: _invoiceNumber,
        subtotal: _subtotal,
        taxAmount: _taxAmount,
        total: _total,
        amountPaid: _amountPaid,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...safeInput
      } = input;
      tx.set(invoiceRef, {
        ...safeInput,
        type,
        status,
        items,
        doIds,
        subtotal,
        taxRate,
        taxAmount,
        total,
        amountPaid: 0,
        invoiceNumber,
        ...(type === "credit_note"
          ? {
              approvalStatus: status === "sent" ? "approved" : "pending",
              ...(status === "sent"
                ? {
                    approvedBy: actorUid,
                    approvedAt: FieldValue.serverTimestamp(),
                  }
                : {}),
            }
          : {}),
        createdBy: actorUid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (active) {
        const balanceDelta = type === "credit_note" ? -total : total;
        tx.update(customerRef, {
          balance:
            Math.round(
              ((((customerSnap.data()!.balance as number) || 0) + balanceDelta) * 100),
            ) / 100,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      if (active && type === "invoice") {
        doSnaps.forEach((_, index) => {
          tx.update(doRefs[index], {
            invoiceId: invoiceRef.id,
            updatedAt: FieldValue.serverTimestamp(),
          });
        });
        if (soRef) {
          if (!soSnap?.exists) throw new HttpsError("failed-precondition", "Sales order not found");
          const progress = updateSalesOrderProgress(soSnap.data()!, items, "invoicedQty", 1);
          tx.update(soRef, {
            items: progress.items,
            status: progress.status,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
      if (active && type === "credit_note") {
        items.forEach((item, index) => {
          const product = productSnaps[index].data()!;
          const balanceAfter = Math.round(((product.stock ?? 0) + item.quantity) * 100) / 100;
          tx.update(productRefs[index], {
            stock: balanceAfter,
            updatedAt: FieldValue.serverTimestamp(),
          });
          tx.set(db.collection("stock_movements").doc(), {
            productId: item.productId,
            productName: product.name,
            unit: product.unit,
            qty: item.quantity,
            kind: "adjustment_in",
            sourceType: "adjustment",
            sourceId: invoiceRef.id,
            sourceNumber: invoiceNumber,
            reason: `Return on Credit Note ${invoiceNumber}`,
            balanceAfter,
            recordedBy: actorUid,
            at: FieldValue.serverTimestamp(),
          });
        });
      }
    });

    return { id: invoiceRef.id };
  },
);

export const transitionInvoice = onCall<{ id: string; status: string }>(
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
    const actorUid = req.auth.uid;
    const user = await requireRole(actorUid, ["admin", "manager", "sales"]);
    const { id, status: targetStatus } = req.data;
    if (!id || !["sent", "cancelled"].includes(targetStatus)) {
      throw new HttpsError("invalid-argument", "Invalid invoice transition");
    }

    const invoiceRef = db.doc(`invoices/${id}`);
    let invoiceNumber = id;
    await db.runTransaction(async (tx) => {
      const invoiceSnap = await tx.get(invoiceRef);
      if (!invoiceSnap.exists) throw new HttpsError("not-found", "Invoice not found");
      const invoice = invoiceSnap.data()!;
      invoiceNumber = invoice.invoiceNumber ?? id;
      const currentStatus = invoice.status;
      const type = invoice.type === "credit_note" ? "credit_note" : "invoice";
      if (type === "credit_note" && targetStatus === "sent" && user.role === "sales") {
        throw new HttpsError(
          "permission-denied",
          "Manager approval is required to activate a credit note",
        );
      }
      const items = validateInvoiceItems(invoice.items);
      const taxRate = Number(invoice.taxRate);
      if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) {
        throw new HttpsError("failed-precondition", "Invalid invoice tax rate");
      }
      const subtotal =
        Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
      const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
      const total = Math.round((subtotal + taxAmount) * 100) / 100;
      const customerRef = db.doc(`customers/${invoice.customerId}`);
      const customerSnap = await tx.get(customerRef);
      if (!customerSnap.exists) throw new HttpsError("failed-precondition", "Customer not found");
      const doIds = Array.isArray(invoice.doIds) ? invoice.doIds as string[] : [];
      const doRefs = doIds.map((doId) => db.doc(`delivery_orders/${doId}`));
      const doSnaps = await Promise.all(doRefs.map((ref) => tx.get(ref)));
      const soRef =
        typeof invoice.salesOrderId === "string" && invoice.salesOrderId
          ? db.doc(`sales_orders/${invoice.salesOrderId}`)
          : null;
      const soSnap = soRef ? await tx.get(soRef) : null;
      const productRefs =
        type === "credit_note"
          ? items.map((item) => db.doc(`products/${item.productId}`))
          : [];
      const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));
      const originalRef =
        type === "credit_note" && typeof invoice.originalInvoiceId === "string"
          ? db.doc(`invoices/${invoice.originalInvoiceId}`)
          : null;
      const originalSnap = originalRef ? await tx.get(originalRef) : null;
      const priorCredits =
        originalRef
          ? await tx.get(
              db.collection("invoices").where("originalInvoiceId", "==", originalRef.id),
            )
          : null;

      if (currentStatus === "draft" && targetStatus === "sent") {
        if (type === "invoice") {
          doSnaps.forEach((snap, index) => {
            if (!snap.exists) {
              throw new HttpsError("failed-precondition", `Delivery order ${doIds[index]} not found`);
            }
            const deliveryOrder = snap.data()!;
            if (!["issued", "delivered"].includes(deliveryOrder.status)) {
              throw new HttpsError(
                "failed-precondition",
                `${deliveryOrder.doNumber} must be issued before invoicing`,
              );
            }
            if (deliveryOrder.customerId !== invoice.customerId) {
              throw new HttpsError(
                "failed-precondition",
                `${deliveryOrder.doNumber} belongs to another customer`,
              );
            }
            if (deliveryOrder.invoiceId && deliveryOrder.invoiceId !== id) {
              throw new HttpsError(
                "already-exists",
                `${deliveryOrder.doNumber} is already linked to an invoice`,
              );
            }
            if (
              soRef &&
              deliveryOrder.salesOrderId &&
              deliveryOrder.salesOrderId !== soRef.id
            ) {
              throw new HttpsError(
                "failed-precondition",
                `${deliveryOrder.doNumber} belongs to another sales order`,
              );
            }
          });
          if (soRef) {
            if (!soSnap?.exists) {
              throw new HttpsError("failed-precondition", "Sales order not found");
            }
            if (soSnap.data()!.customerId !== invoice.customerId) {
              throw new HttpsError(
                "failed-precondition",
                "Invoice customer does not match the sales order",
              );
            }
          }
        } else {
          if (!originalSnap?.exists) {
            throw new HttpsError("failed-precondition", "Original invoice not found");
          }
          const original = originalSnap.data()!;
          if (
            original.type === "credit_note" ||
            original.status === "cancelled" ||
            original.customerId !== invoice.customerId
          ) {
            throw new HttpsError("failed-precondition", "Original invoice is not creditable");
          }
          validateCreditQuantities(original, priorCredits?.docs ?? [], items, id);
          const previouslyCredited = (priorCredits?.docs ?? [])
            .filter((snap) => snap.id !== id)
            .map((snap) => snap.data())
            .filter((credit) => credit.status !== "cancelled")
            .reduce((sum, credit) => sum + (credit.total ?? 0), 0);
          if (previouslyCredited + total > original.total + 0.01) {
            throw new HttpsError(
              "failed-precondition",
              "Credit notes exceed the original invoice balance",
            );
          }
          productSnaps.forEach((snap, index) => {
            if (!snap.exists) {
              throw new HttpsError("failed-precondition", `Product ${items[index].name} not found`);
            }
          });
        }

        tx.update(customerRef, {
          balance:
            Math.round(
                ((((customerSnap.data()!.balance as number) || 0) +
                (type === "credit_note" ? -total : total)) *
                100),
            ) / 100,
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (type === "invoice") {
          doSnaps.forEach((_, index) => {
            tx.update(doRefs[index], {
              invoiceId: id,
              updatedAt: FieldValue.serverTimestamp(),
            });
          });
          if (soRef) {
            if (!soSnap?.exists) throw new HttpsError("failed-precondition", "Sales order not found");
            const progress = updateSalesOrderProgress(soSnap.data()!, items, "invoicedQty", 1);
            tx.update(soRef, {
              items: progress.items,
              status: progress.status,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        } else {
          items.forEach((item, index) => {
            const product = productSnaps[index].data()!;
            const balanceAfter = Math.round(((product.stock ?? 0) + item.quantity) * 100) / 100;
            tx.update(productRefs[index], {
              stock: balanceAfter,
              updatedAt: FieldValue.serverTimestamp(),
            });
            tx.set(db.collection("stock_movements").doc(), {
              productId: item.productId,
              productName: product.name,
              unit: product.unit,
              qty: item.quantity,
              kind: "adjustment_in",
              sourceType: "adjustment",
              sourceId: id,
              sourceNumber: invoice.invoiceNumber,
              reason: `Return on Credit Note ${invoice.invoiceNumber}`,
              balanceAfter,
              recordedBy: actorUid,
              at: FieldValue.serverTimestamp(),
            });
          });
        }
        tx.update(invoiceRef, {
          status: "sent",
          items,
          subtotal,
          taxAmount,
          total,
          ...(type === "credit_note"
            ? {
                approvalStatus: "approved",
                approvedBy: actorUid,
                approvedAt: FieldValue.serverTimestamp(),
              }
            : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }

      if (currentStatus !== "draft" && currentStatus !== "cancelled" && targetStatus === "cancelled") {
        if ((invoice.amountPaid ?? 0) > 0.001) {
          throw new HttpsError(
            "failed-precondition",
            "Reverse recorded payments before cancelling this invoice",
          );
        }
        if (type === "credit_note") {
          productSnaps.forEach((snap, index) => {
            if (!snap.exists || (snap.data()!.stock ?? 0) + 0.001 < items[index].quantity) {
              throw new HttpsError(
                "failed-precondition",
                `Insufficient stock to reverse credit note for ${items[index].name}`,
              );
            }
          });
        }
        tx.update(customerRef, {
          balance:
            Math.round(
                ((((customerSnap.data()!.balance as number) || 0) +
                (type === "credit_note" ? total : -total)) *
                100),
            ) / 100,
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (type === "invoice") {
          doSnaps.forEach((snap, index) => {
            if (snap.exists && snap.data()!.invoiceId === id) {
              tx.update(doRefs[index], {
                invoiceId: FieldValue.delete(),
                updatedAt: FieldValue.serverTimestamp(),
              });
            }
          });
          if (soRef) {
            if (!soSnap?.exists) throw new HttpsError("failed-precondition", "Sales order not found");
            const progress = updateSalesOrderProgress(soSnap.data()!, items, "invoicedQty", -1);
            tx.update(soRef, {
              items: progress.items,
              status: progress.status,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        } else {
          items.forEach((item, index) => {
            const product = productSnaps[index].data()!;
            const balanceAfter = Math.round(((product.stock ?? 0) - item.quantity) * 100) / 100;
            tx.update(productRefs[index], {
              stock: balanceAfter,
              updatedAt: FieldValue.serverTimestamp(),
            });
            tx.set(db.collection("stock_movements").doc(), {
              productId: item.productId,
              productName: product.name,
              unit: product.unit,
              qty: -item.quantity,
              kind: "adjustment_out",
              sourceType: "adjustment",
              sourceId: id,
              sourceNumber: invoice.invoiceNumber,
              reason: `Cancellation of Credit Note ${invoice.invoiceNumber}`,
              balanceAfter,
              recordedBy: actorUid,
              at: FieldValue.serverTimestamp(),
            });
          });
        }
        tx.update(invoiceRef, {
          status: "cancelled",
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }

      throw new HttpsError(
        "failed-precondition",
        `Unsupported transition from ${currentStatus} to ${targetStatus}`,
      );
    });

    await writeAudit({
      actorUid,
      actorName: user.displayName ?? user.email ?? "User",
      action: targetStatus === "sent" ? "invoice.send" : "invoice.cancel",
      entityType: "invoice",
      entityId: id,
      entityLabel: invoiceNumber,
      summary:
        targetStatus === "sent"
          ? `Sent invoice ${invoiceNumber}`
          : `Cancelled invoice ${invoiceNumber}`,
    });
    return { id };
  },
);

export const recordInvoicePayment = onCall<{
  invoiceId: string;
  payment: Record<string, any>;
}>(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const actorUid = req.auth.uid;
  await requireRole(actorUid, ["admin", "manager"]);
  const { invoiceId, payment } = req.data;
  const amount = Number(payment?.amount);
  if (!invoiceId || !Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError("invalid-argument", "A positive payment amount is required");
  }
  if (!["cash", "bank", "mobile_money", "cheque"].includes(payment.method)) {
    throw new HttpsError("invalid-argument", "Invalid payment method");
  }

  const invoiceRef = db.doc(`invoices/${invoiceId}`);
  const paymentRef = db.collection("payments").doc();
  await db.runTransaction(async (tx) => {
    const invoiceSnap = await tx.get(invoiceRef);
    if (!invoiceSnap.exists) throw new HttpsError("not-found", "Invoice not found");
    const invoice = invoiceSnap.data()!;
    if (invoice.status === "draft" || invoice.status === "cancelled") {
      throw new HttpsError("failed-precondition", "Invoice is not payable");
    }
    if (invoice.type === "credit_note") {
      throw new HttpsError("failed-precondition", "Credit notes cannot receive payments");
    }
    const customerRef = db.doc(`customers/${invoice.customerId}`);
    const customerSnap = await tx.get(customerRef);
    if (!customerSnap.exists) throw new HttpsError("failed-precondition", "Customer not found");
    const remaining = invoice.total - (invoice.amountPaid ?? 0);
    if (amount > remaining + 0.01) {
      throw new HttpsError("failed-precondition", "Payment exceeds outstanding balance");
    }
    const amountPaid = Math.round(((invoice.amountPaid ?? 0) + amount) * 100) / 100;
    const status = amountPaid + 0.001 >= invoice.total ? "paid" : "partial";
    tx.update(invoiceRef, {
      amountPaid,
      status,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(customerRef, {
      balance:
        Math.round(
          ((((customerSnap.data()!.balance as number) || 0) - amount) * 100),
        ) / 100,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(paymentRef, {
      amount,
      method: payment.method,
      reference: payment.reference ?? "",
      paidAt: payment.paidAt,
      notes: payment.notes ?? "",
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      recordedBy: actorUid,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { invoiceId, paymentId: paymentRef.id };
});

export const recordSupplierPayment = onCall<{
  purchaseOrderId: string;
  payment: Record<string, any>;
}>(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const actorUid = req.auth.uid;
  await requireRole(actorUid, ["admin", "manager"]);
  const { purchaseOrderId, payment } = req.data;
  const amount = Number(payment?.amount);
  if (!purchaseOrderId || !Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError("invalid-argument", "A positive payment amount is required");
  }
  if (!["cash", "bank", "mobile_money", "cheque"].includes(payment.method)) {
    throw new HttpsError("invalid-argument", "Invalid payment method");
  }

  const poRef = db.doc(`purchase_orders/${purchaseOrderId}`);
  const paymentRef = db.collection("supplier_payments").doc();
  await db.runTransaction(async (tx) => {
    const poSnap = await tx.get(poRef);
    if (!poSnap.exists) throw new HttpsError("not-found", "Purchase order not found");
    const po = poSnap.data()!;
    if (po.status === "draft" || po.status === "cancelled") {
      throw new HttpsError("failed-precondition", "Purchase order is not payable");
    }
    const supplierRef = db.doc(`suppliers/${po.supplierId}`);
    const supplierSnap = await tx.get(supplierRef);
    if (!supplierSnap.exists) throw new HttpsError("failed-precondition", "Supplier not found");
    const remaining = po.total - (po.amountPaid ?? 0);
    if (amount > remaining + 0.01) {
      throw new HttpsError("failed-precondition", "Payment exceeds outstanding balance");
    }
    const amountPaid = Math.round(((po.amountPaid ?? 0) + amount) * 100) / 100;
    tx.update(poRef, {
      amountPaid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(supplierRef, {
      balance:
        Math.round(
          ((((supplierSnap.data()!.balance as number) || 0) - amount) * 100),
        ) / 100,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(paymentRef, {
      amount,
      method: payment.method,
      reference: payment.reference ?? "",
      paidAt: payment.paidAt,
      notes: payment.notes ?? "",
      purchaseOrderId,
      poNumber: po.poNumber,
      supplierId: po.supplierId,
      recordedBy: actorUid,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { purchaseOrderId, paymentId: paymentRef.id };
});

function asISOString(value: any): string {
  if (typeof value === "string") return value;
  if (value?.toDate instanceof Function) return value.toDate().toISOString();
  return new Date(value ?? Date.now()).toISOString();
}

export const verifyDocument = onCall<{ id: string }>(async (req) => {
  const id = req.data.id;
  if (typeof id !== "string" || !id || id.length > 200) {
    throw new HttpsError("invalid-argument", "Document ID is required");
  }
  const [salesOrderSnap, invoiceSnap, poSnap, doSnap] = await Promise.all([
    db.doc(`sales_orders/${id}`).get(),
    db.doc(`invoices/${id}`).get(),
    db.doc(`purchase_orders/${id}`).get(),
    db.doc(`delivery_orders/${id}`).get(),
  ]);

  if (salesOrderSnap.exists) {
    const salesOrder = salesOrderSnap.data()!;
    return {
      kind: "so",
      doc: {
        id,
        soNumber: salesOrder.soNumber,
        customerSnapshot: { name: salesOrder.customerSnapshot?.name ?? "Unknown" },
        salespersonName: salesOrder.salespersonName ?? "",
        orderDate: asISOString(salesOrder.orderDate),
        validUntil: salesOrder.validUntil ? asISOString(salesOrder.validUntil) : undefined,
        items: (salesOrder.items ?? []).map((item: Record<string, any>) => ({
          quantity: item.quantity,
        })),
        total: salesOrder.total,
        status: salesOrder.status,
      },
    };
  }

  if (invoiceSnap.exists) {
    const invoice = invoiceSnap.data()!;
    return {
      kind: "invoice",
      doc: {
        id,
        invoiceNumber: invoice.invoiceNumber,
        type: invoice.type,
        customerSnapshot: { name: invoice.customerSnapshot?.name ?? "Unknown" },
        issueDate: asISOString(invoice.issueDate),
        dueDate: asISOString(invoice.dueDate),
        total: invoice.total,
        amountPaid: invoice.amountPaid ?? 0,
        status: invoice.status,
      },
    };
  }
  if (poSnap.exists) {
    const po = poSnap.data()!;
    return {
      kind: "po",
      doc: {
        id,
        poNumber: po.poNumber,
        supplierSnapshot: { name: po.supplierSnapshot?.name ?? "Unknown" },
        orderDate: asISOString(po.orderDate),
        expectedDelivery: po.expectedDelivery ? asISOString(po.expectedDelivery) : undefined,
        items: (po.items ?? []).map((item: Record<string, any>) => ({
          quantity: item.quantity,
          receivedQty: item.receivedQty ?? 0,
        })),
        total: po.total,
        amountPaid: po.amountPaid ?? 0,
        status: po.status,
      },
    };
  }
  if (doSnap.exists) {
    const deliveryOrder = doSnap.data()!;
    return {
      kind: "do",
      doc: {
        id,
        doNumber: deliveryOrder.doNumber,
        customerSnapshot: { name: deliveryOrder.customerSnapshot?.name ?? "Unknown" },
        loadingDetails: {
          destination: deliveryOrder.loadingDetails?.destination ?? "",
          truckPlate: deliveryOrder.loadingDetails?.truckPlate ?? "",
          driverName: deliveryOrder.loadingDetails?.driverName ?? "",
        },
        salespersonName: deliveryOrder.salespersonName ?? "",
        createdAt: asISOString(deliveryOrder.createdAt),
        items: (deliveryOrder.items ?? []).map((item: Record<string, any>) => ({
          quantity: item.quantity,
        })),
        status: deliveryOrder.status,
      },
    };
  }
  return null;
});

export const createSalesOrder = onCall<{ document: Record<string, any> }>(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const actorUid = req.auth.uid;
  const user = await requireRole(actorUid, ["admin", "manager", "sales"]);
  const input = req.data.document ?? {};
  const requestedItems = validateInvoiceItems(input.items);
  const taxRate = validateTaxRate(input.taxRate);
  const orderDate = validateDate(input.orderDate, "Order date");
  const validUntil = validateDate(input.validUntil, "Valid until", false);
  const status = input.status;
  if (status !== "quotation" && status !== "confirmed") {
    throw new HttpsError("invalid-argument", "Sales order must start as a quotation or confirmed");
  }
  if (typeof input.customerId !== "string" || !input.customerId) {
    throw new HttpsError("invalid-argument", "Customer is required");
  }

  const salesOrderRef = db.collection("sales_orders").doc();
  await db.runTransaction(async (tx) => {
    const customerRef = db.doc(`customers/${input.customerId}`);
    const productRefs = requestedItems.map((item) => db.doc(`products/${item.productId}`));
    const [customerSnap, ...productSnaps] = await Promise.all([
      tx.get(customerRef),
      ...productRefs.map((ref) => tx.get(ref)),
    ]);
    if (!customerSnap.exists) throw new HttpsError("not-found", "Customer not found");
    productSnaps.forEach((snap, index) => {
      if (!snap.exists) {
        throw new HttpsError("failed-precondition", `Product ${requestedItems[index].productId} not found`);
      }
    });
    const soNumber = await claimSequence(tx, "sales_orders", "SO");
    const items = requestedItems.map((item, index) => {
      const product = productSnaps[index].data()!;
      return {
        productId: item.productId,
        name: product.name,
        quantity: item.quantity,
        deliveredQty: 0,
        invoicedQty: 0,
        unit: product.unit,
        unitPrice: item.unitPrice,
        lineTotal: roundMoney(item.quantity * item.unitPrice),
      };
    });
    const subtotal = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));
    const taxAmount = roundMoney(subtotal * taxRate);
    const customer = customerSnap.data()!;
    tx.set(salesOrderRef, {
      soNumber,
      customerId: input.customerId,
      customerSnapshot: {
        name: customer.name,
        address: customer.address ?? "",
        phone: customer.phone ?? "",
      },
      salespersonId: actorUid,
      salespersonName: user.displayName ?? user.email ?? "User",
      orderDate,
      ...(validUntil ? { validUntil } : {}),
      items,
      subtotal,
      taxRate,
      taxAmount,
      total: roundMoney(subtotal + taxAmount),
      status,
      notes: typeof input.notes === "string" ? input.notes.trim() : "",
      createdBy: actorUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { id: salesOrderRef.id };
});

export const transitionSalesOrder = onCall<{ id: string; status: string }>(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const actorUid = req.auth.uid;
  const user = await requireRole(actorUid, ["admin", "manager", "sales"]);
  const { id, status } = req.data;
  if (typeof id !== "string" || !id || !["confirmed", "cancelled"].includes(status)) {
    throw new HttpsError("invalid-argument", "Sales order and target status are required");
  }
  const ref = db.doc(`sales_orders/${id}`);
  let soNumber = id;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Sales order not found");
    const salesOrder = snap.data()!;
    soNumber = salesOrder.soNumber ?? id;
    const allowed =
      (salesOrder.status === "quotation" && status === "confirmed") ||
      (["quotation", "confirmed"].includes(salesOrder.status) && status === "cancelled");
    if (!allowed) {
      throw new HttpsError(
        "failed-precondition",
        `Cannot change sales order from ${salesOrder.status} to ${status}`,
      );
    }
    if (
      status === "cancelled" &&
      (salesOrder.items as Array<Record<string, any>>).some(
        (item) => (item.deliveredQty ?? 0) > 0 || (item.invoicedQty ?? 0) > 0,
      )
    ) {
      throw new HttpsError(
        "failed-precondition",
        "A sales order with delivery or invoice progress cannot be cancelled",
      );
    }
    tx.update(ref, { status, updatedAt: FieldValue.serverTimestamp() });
  });
  await writeAudit({
    actorUid,
    actorName: user.displayName ?? user.email ?? "User",
    action: status === "confirmed" ? "so.confirm" : "so.cancel",
    entityType: "sales_order",
    entityId: id,
    entityLabel: soNumber,
    summary:
      status === "confirmed"
        ? `Confirmed sales order ${soNumber}`
        : `Cancelled sales order ${soNumber}`,
  });
  return { id };
});

export const createPurchaseOrder = onCall<{ document: Record<string, any> }>(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const actorUid = req.auth.uid;
  const user = await requireRole(actorUid, ["admin", "manager"]);
  const input = req.data.document ?? {};
  const requestedItems = validateInvoiceItems(input.items);
  const taxRate = validateTaxRate(input.taxRate);
  const orderDate = validateDate(input.orderDate, "Order date");
  const expectedDelivery = validateDate(input.expectedDelivery, "Expected delivery", false);
  const requestedStatus = input.status;
  if (requestedStatus !== "draft" && requestedStatus !== "sent") {
    throw new HttpsError("invalid-argument", "Purchase order must start as draft or sent");
  }
  const requiresApproval = user.role === "manager" && requestedStatus === "sent";
  const status = requiresApproval ? "draft" : requestedStatus;
  if (typeof input.supplierId !== "string" || !input.supplierId) {
    throw new HttpsError("invalid-argument", "Supplier is required");
  }

  const purchaseOrderRef = db.collection("purchase_orders").doc();
  await db.runTransaction(async (tx) => {
    const supplierRef = db.doc(`suppliers/${input.supplierId}`);
    const productRefs = requestedItems.map((item) => db.doc(`products/${item.productId}`));
    const [supplierSnap, ...productSnaps] = await Promise.all([
      tx.get(supplierRef),
      ...productRefs.map((ref) => tx.get(ref)),
    ]);
    if (!supplierSnap.exists) throw new HttpsError("not-found", "Supplier not found");
    productSnaps.forEach((snap, index) => {
      if (!snap.exists) {
        throw new HttpsError("failed-precondition", `Product ${requestedItems[index].productId} not found`);
      }
    });
    const poNumber = await claimSequence(tx, "purchase_orders", "PO");
    const items = requestedItems.map((item, index) => {
      const product = productSnaps[index].data()!;
      return {
        productId: item.productId,
        name: product.name,
        quantity: item.quantity,
        receivedQty: 0,
        allocatedQty: 0,
        unit: product.unit,
        unitPrice: item.unitPrice,
        lineTotal: roundMoney(item.quantity * item.unitPrice),
      };
    });
    const subtotal = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));
    const taxAmount = roundMoney(subtotal * taxRate);
    const total = roundMoney(subtotal + taxAmount);
    const supplier = supplierSnap.data()!;
    tx.set(purchaseOrderRef, {
      poNumber,
      supplierId: input.supplierId,
      supplierSnapshot: {
        name: supplier.name,
        address: supplier.address ?? "",
        phone: supplier.phone ?? "",
      },
      orderDate,
      ...(expectedDelivery ? { expectedDelivery } : {}),
      items,
      subtotal,
      taxRate,
      taxAmount,
      total,
      amountPaid: 0,
      status,
      approvalStatus:
        status === "sent" ? "approved" : requiresApproval ? "pending" : "not_requested",
      ...(requiresApproval
        ? {
            approvalRequestedBy: actorUid,
            approvalRequestedAt: FieldValue.serverTimestamp(),
          }
        : {}),
      ...(status === "sent"
        ? {
            approvedBy: actorUid,
            approvedAt: FieldValue.serverTimestamp(),
          }
        : {}),
      qrPayload: `/verify/${purchaseOrderRef.id}`,
      notes: typeof input.notes === "string" ? input.notes.trim() : "",
      createdBy: actorUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (status === "sent") {
      tx.update(supplierRef, {
        balance: roundMoney((supplier.balance ?? 0) + total),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });
  return { id: purchaseOrderRef.id };
});

export const updatePurchaseOrder = onCall<{
  id: string;
  document: Record<string, any>;
}>(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const user = await requireRole(req.auth.uid, ["admin", "manager"]);
  const { id, document: input = {} } = req.data;
  if (typeof id !== "string" || !id) {
    throw new HttpsError("invalid-argument", "Purchase order is required");
  }
  const requestedItems = validateInvoiceItems(input.items);
  const taxRate = validateTaxRate(input.taxRate);
  const orderDate = validateDate(input.orderDate, "Order date");
  const expectedDelivery = validateDate(input.expectedDelivery, "Expected delivery", false);
  if (input.status !== "draft" && input.status !== "sent") {
    throw new HttpsError("invalid-argument", "Draft purchase orders may only be saved or sent");
  }
  if (typeof input.supplierId !== "string" || !input.supplierId) {
    throw new HttpsError("invalid-argument", "Supplier is required");
  }
  const poRef = db.doc(`purchase_orders/${id}`);
  await db.runTransaction(async (tx) => {
    const supplierRef = db.doc(`suppliers/${input.supplierId}`);
    const productRefs = requestedItems.map((item) => db.doc(`products/${item.productId}`));
    const [poSnap, supplierSnap, ...productSnaps] = await Promise.all([
      tx.get(poRef),
      tx.get(supplierRef),
      ...productRefs.map((ref) => tx.get(ref)),
    ]);
    if (!poSnap.exists) throw new HttpsError("not-found", "Purchase order not found");
    const current = poSnap.data()!;
    if (current.status !== "draft" || (current.amountPaid ?? 0) > 0) {
      throw new HttpsError("failed-precondition", "Only unpaid draft purchase orders can be edited");
    }
    if (!supplierSnap.exists) throw new HttpsError("not-found", "Supplier not found");
    productSnaps.forEach((snap, index) => {
      if (!snap.exists) {
        throw new HttpsError("failed-precondition", `Product ${requestedItems[index].productId} not found`);
      }
    });
    const items = requestedItems.map((item, index) => {
      const product = productSnaps[index].data()!;
      return {
        productId: item.productId,
        name: product.name,
        quantity: item.quantity,
        receivedQty: 0,
        allocatedQty: 0,
        unit: product.unit,
        unitPrice: item.unitPrice,
        lineTotal: roundMoney(item.quantity * item.unitPrice),
      };
    });
    const subtotal = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));
    const taxAmount = roundMoney(subtotal * taxRate);
    const total = roundMoney(subtotal + taxAmount);
    const supplier = supplierSnap.data()!;
    const requiresApproval = user.role === "manager" && input.status === "sent";
    const status = requiresApproval ? "draft" : input.status;
    tx.update(poRef, {
      supplierId: input.supplierId,
      supplierSnapshot: {
        name: supplier.name,
        address: supplier.address ?? "",
        phone: supplier.phone ?? "",
      },
      orderDate,
      ...(expectedDelivery
        ? { expectedDelivery }
        : { expectedDelivery: FieldValue.delete() }),
      items,
      subtotal,
      taxRate,
      taxAmount,
      total,
      status,
      approvalStatus:
        status === "sent" ? "approved" : requiresApproval ? "pending" : "not_requested",
      ...(requiresApproval
        ? {
            approvalRequestedBy: req.auth!.uid,
            approvalRequestedAt: FieldValue.serverTimestamp(),
            approvedBy: FieldValue.delete(),
            approvedAt: FieldValue.delete(),
          }
        : {}),
      rejectionReason: FieldValue.delete(),
      rejectedBy: FieldValue.delete(),
      rejectedAt: FieldValue.delete(),
      notes: typeof input.notes === "string" ? input.notes.trim() : "",
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (status === "sent") {
      tx.update(supplierRef, {
        balance: roundMoney((supplier.balance ?? 0) + total),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });
  return { id };
});

export const transitionPurchaseOrder = onCall<{ id: string; status: string }>(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const actorUid = req.auth.uid;
  const user = await requireRole(actorUid, ["admin", "manager"]);
  const { id, status } = req.data;
  if (typeof id !== "string" || !id || !["sent", "cancelled"].includes(status)) {
    throw new HttpsError("invalid-argument", "Purchase order and target status are required");
  }
  const poRef = db.doc(`purchase_orders/${id}`);
  let poNumber = id;
  await db.runTransaction(async (tx) => {
    const poSnap = await tx.get(poRef);
    if (!poSnap.exists) throw new HttpsError("not-found", "Purchase order not found");
    const po = poSnap.data()!;
    poNumber = po.poNumber ?? id;
    if (status === "sent" && po.status !== "draft") {
      throw new HttpsError("failed-precondition", "Only a draft purchase order can be sent");
    }
    if (
      status === "sent" &&
      user.role === "manager" &&
      po.approvalStatus !== "approved"
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Administrator approval is required before sending this purchase order",
      );
    }
    if (status === "cancelled" && !["draft", "sent"].includes(po.status)) {
      throw new HttpsError("failed-precondition", "This purchase order cannot be cancelled");
    }
    const hasStockActivity = (po.items as Array<Record<string, any>>).some(
      (item) => (item.receivedQty ?? 0) > 0 || (item.allocatedQty ?? 0) > 0,
    );
    if (status === "cancelled" && (hasStockActivity || (po.amountPaid ?? 0) > 0)) {
      throw new HttpsError(
        "failed-precondition",
        "A purchase order with receipts, allocations, or payments cannot be cancelled",
      );
    }
    if (po.status === "sent" || status === "sent") {
      const supplierRef = db.doc(`suppliers/${po.supplierId}`);
      const supplierSnap = await tx.get(supplierRef);
      if (!supplierSnap.exists) throw new HttpsError("not-found", "Supplier not found");
      const direction = status === "sent" ? 1 : -1;
      tx.update(supplierRef, {
        balance: roundMoney((supplierSnap.data()!.balance ?? 0) + direction * po.total),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    tx.update(poRef, {
      status,
      ...(status === "sent" && user.role === "admin" && po.approvalStatus !== "approved"
        ? {
            approvalStatus: "approved",
            approvedBy: actorUid,
            approvedAt: FieldValue.serverTimestamp(),
          }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  await writeAudit({
    actorUid,
    actorName: user.displayName ?? user.email ?? "User",
    action: status === "sent" ? "po.confirm" : "po.cancel",
    entityType: "purchase_order",
    entityId: id,
    entityLabel: poNumber,
    summary:
      status === "sent"
        ? `Confirmed purchase order ${poNumber}`
        : `Cancelled purchase order ${poNumber}`,
  });
  return { id };
});

export const requestPurchaseOrderApproval = onCall<{ id: string }>(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const actorUid = req.auth.uid;
  const user = await requireRole(actorUid, ["admin", "manager"]);
  const id = req.data.id;
  if (typeof id !== "string" || !id) {
    throw new HttpsError("invalid-argument", "Purchase order is required");
  }
  const ref = db.doc(`purchase_orders/${id}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Purchase order not found");
    const po = snap.data()!;
    if (po.status !== "draft") {
      throw new HttpsError("failed-precondition", "Only draft purchase orders need approval");
    }
    if (po.approvalStatus === "pending") {
      throw new HttpsError("already-exists", "Approval has already been requested");
    }
    tx.update(ref, {
      approvalStatus: "pending",
      approvalRequestedBy: actorUid,
      approvalRequestedAt: FieldValue.serverTimestamp(),
      approvedBy: FieldValue.delete(),
      approvedAt: FieldValue.delete(),
      rejectedBy: FieldValue.delete(),
      rejectedAt: FieldValue.delete(),
      rejectionReason: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  await writeAudit({
    actorUid,
    actorName: user.displayName ?? user.email ?? "User",
    action: "po.approval_requested",
    entityType: "purchase_order",
    entityId: id,
    entityLabel: id,
    summary: "Purchase-order approval requested",
  });
  return { id };
});

export const decidePurchaseOrderApproval = onCall<{
  id: string;
  decision: "approved" | "rejected";
  reason?: string;
}>(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const actorUid = req.auth.uid;
  const user = await requireRole(actorUid, ["admin"]);
  const { id, decision } = req.data;
  const reason = typeof req.data.reason === "string" ? req.data.reason.trim() : "";
  if (
    typeof id !== "string" ||
    !id ||
    (decision !== "approved" && decision !== "rejected") ||
    (decision === "rejected" && reason.length < 3)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Purchase order, decision, and rejection reason are required",
    );
  }
  const ref = db.doc(`purchase_orders/${id}`);
  let poNumber = id;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Purchase order not found");
    const po = snap.data()!;
    poNumber = po.poNumber ?? id;
    if (po.status !== "draft" || po.approvalStatus !== "pending") {
      throw new HttpsError("failed-precondition", "No pending approval exists");
    }
    tx.update(ref, {
      approvalStatus: decision,
      ...(decision === "approved"
        ? {
            approvedBy: actorUid,
            approvedAt: FieldValue.serverTimestamp(),
            rejectedBy: FieldValue.delete(),
            rejectedAt: FieldValue.delete(),
            rejectionReason: FieldValue.delete(),
          }
        : {
            rejectedBy: actorUid,
            rejectedAt: FieldValue.serverTimestamp(),
            rejectionReason: reason,
            approvedBy: FieldValue.delete(),
            approvedAt: FieldValue.delete(),
          }),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  await writeAudit({
    actorUid,
    actorName: user.displayName ?? user.email ?? "Administrator",
    action: decision === "approved" ? "po.approved" : "po.rejected",
    entityType: "purchase_order",
    entityId: id,
    entityLabel: poNumber,
    summary:
      decision === "approved"
        ? `Approved purchase order ${poNumber}`
        : `Rejected purchase order ${poNumber}: ${reason}`,
  });
  return { id };
});

export const getAvailablePOStock = onCall<{ productId: string }>(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  await requireRole(req.auth.uid, ["admin", "manager", "sales", "warehouse"]);
  const productId = req.data.productId;
  if (typeof productId !== "string" || !productId) {
    throw new HttpsError("invalid-argument", "Product ID is required");
  }
  const snap = await db.collection("purchase_orders").orderBy("orderDate", "asc").get();
  return snap.docs.flatMap((docSnap) => {
    const po = docSnap.data();
    if (po.status === "draft" || po.status === "cancelled") return [];
    const line = (po.items as Array<Record<string, any>>).find(
      (item) => item.productId === productId,
    );
    if (!line) return [];
    const remaining = (line.receivedQty ?? 0) - (line.allocatedQty ?? 0);
    if (remaining <= 0.001) return [];
    return [{
      poId: docSnap.id,
      poNumber: po.poNumber,
      orderDate: asISOString(po.orderDate),
      remaining,
    }];
  });
});

export const receivePurchaseOrder = onCall<{
  purchaseOrderId: string;
  receipts: Array<{ productId: string; quantity: number }>;
}>(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const actorUid = req.auth.uid;
  await requireRole(actorUid, ["admin", "manager", "warehouse"]);
  const { purchaseOrderId, receipts } = req.data;
  if (!purchaseOrderId || !Array.isArray(receipts) || receipts.length === 0) {
    throw new HttpsError("invalid-argument", "Receipt lines are required");
  }
  const poRef = db.doc(`purchase_orders/${purchaseOrderId}`);
  await db.runTransaction(async (tx) => {
    const poSnap = await tx.get(poRef);
    if (!poSnap.exists) throw new HttpsError("not-found", "Purchase order not found");
    const po = poSnap.data()!;
    if (po.status === "draft" || po.status === "cancelled") {
      throw new HttpsError("failed-precondition", "Purchase order cannot receive stock");
    }
    const seen = new Set<string>();
    const normalized = receipts.map((receipt) => {
      if (
        typeof receipt.productId !== "string" ||
        !receipt.productId ||
        !Number.isFinite(receipt.quantity) ||
        receipt.quantity <= 0 ||
        seen.has(receipt.productId)
      ) {
        throw new HttpsError("invalid-argument", "Invalid or duplicate receipt line");
      }
      seen.add(receipt.productId);
      const line = (po.items as Array<Record<string, any>>).find(
        (item) => item.productId === receipt.productId,
      );
      if (!line) {
        throw new HttpsError("failed-precondition", `Product ${receipt.productId} is not on this PO`);
      }
      const remaining = line.quantity - (line.receivedQty ?? 0);
      if (receipt.quantity > remaining + 0.001) {
        throw new HttpsError(
          "failed-precondition",
          `Receipt for ${line.name} exceeds remaining quantity`,
        );
      }
      return receipt;
    });
    const productRefs = normalized.map((receipt) => db.doc(`products/${receipt.productId}`));
    const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));
    productSnaps.forEach((snap, index) => {
      if (!snap.exists) {
        throw new HttpsError("failed-precondition", `Product ${normalized[index].productId} not found`);
      }
    });

    const receiptMap = new Map(normalized.map((receipt) => [receipt.productId, receipt.quantity]));
    const items: Array<Record<string, any>> = (
      po.items as Array<Record<string, any>>
    ).map((item) => ({
      ...item,
      receivedQty:
        receiptMap.has(item.productId)
          ? Math.round(((item.receivedQty ?? 0) + receiptMap.get(item.productId)!) * 100) / 100
          : item.receivedQty ?? 0,
    }));
    const totalOrdered = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalReceived = items.reduce((sum, item) => sum + (item.receivedQty ?? 0), 0);
    const status =
      totalReceived + 0.001 >= totalOrdered ? "received" : "partial_received";

    normalized.forEach((receipt, index) => {
      const product = productSnaps[index].data()!;
      const balanceAfter = Math.round(((product.stock ?? 0) + receipt.quantity) * 100) / 100;
      tx.update(productRefs[index], {
        stock: balanceAfter,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(db.collection("stock_movements").doc(), {
        productId: receipt.productId,
        productName: product.name,
        unit: product.unit,
        qty: receipt.quantity,
        kind: "po_receipt",
        sourceType: "purchase_order",
        sourceId: purchaseOrderId,
        sourceNumber: po.poNumber,
        balanceAfter,
        recordedBy: actorUid,
        at: FieldValue.serverTimestamp(),
      });
    });
    tx.update(poRef, {
      items,
      status,
      ...(status === "received" ? { receivedAt: FieldValue.serverTimestamp() } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { id: purchaseOrderId };
});

export const adjustStock = onCall<{
  productId: string;
  quantity: number;
  reason: string;
}>(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const actorUid = req.auth.uid;
  await requireRole(actorUid, ["admin", "manager"]);
  const { productId, quantity, reason } = req.data;
  if (
    typeof productId !== "string" ||
    !productId ||
    !Number.isFinite(quantity) ||
    quantity === 0 ||
    typeof reason !== "string" ||
    reason.trim().length < 2
  ) {
    throw new HttpsError("invalid-argument", "Product, quantity, and reason are required");
  }
  const productRef = db.doc(`products/${productId}`);
  const movementRef = db.collection("stock_movements").doc();
  await db.runTransaction(async (tx) => {
    const productSnap = await tx.get(productRef);
    if (!productSnap.exists) throw new HttpsError("not-found", "Product not found");
    const product = productSnap.data()!;
    const balanceAfter = Math.round(((product.stock ?? 0) + quantity) * 100) / 100;
    if (balanceAfter < -0.001) {
      throw new HttpsError("failed-precondition", "Insufficient stock");
    }
    tx.update(productRef, {
      stock: Math.max(0, balanceAfter),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(movementRef, {
      productId,
      productName: product.name,
      unit: product.unit,
      qty: quantity,
      kind: quantity > 0 ? "adjustment_in" : "adjustment_out",
      sourceType: "adjustment",
      reason: reason.trim(),
      balanceAfter: Math.max(0, balanceAfter),
      recordedBy: actorUid,
      at: FieldValue.serverTimestamp(),
    });
  });
  return { productId, movementId: movementRef.id };
});

export const createCustomer = onCall<{ document: Record<string, any> }>(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  await requireRole(req.auth.uid, ["admin", "manager", "sales"]);
  const input = req.data.document ?? {};
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    typeof input.phone !== "string" ||
    !input.phone.trim() ||
    typeof input.address !== "string" ||
    !input.address.trim()
  ) {
    throw new HttpsError("invalid-argument", "Customer name, phone, and address are required");
  }
  const ref = db.collection("customers").doc();
  await db.runTransaction(async (tx) => {
    const code = await claimSequence(tx, "customers", "CUST", 4);
    const {
      id: _id,
      code: _code,
      balance: _balance,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...safeInput
    } = input;
    tx.set(ref, {
      ...safeInput,
      code,
      balance: 0,
      active: input.active !== false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { id: ref.id };
});

export const createSupplier = onCall<{ document: Record<string, any> }>(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  await requireRole(req.auth.uid, ["admin", "manager"]);
  const input = req.data.document ?? {};
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    typeof input.phone !== "string" ||
    !input.phone.trim() ||
    typeof input.address !== "string" ||
    !input.address.trim()
  ) {
    throw new HttpsError("invalid-argument", "Supplier name, phone, and address are required");
  }
  const ref = db.collection("suppliers").doc();
  await db.runTransaction(async (tx) => {
    const code = await claimSequence(tx, "suppliers", "SUP", 4);
    const {
      id: _id,
      code: _code,
      balance: _balance,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...safeInput
    } = input;
    tx.set(ref, {
      ...safeInput,
      code,
      balance: 0,
      active: input.active !== false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { id: ref.id };
});

export const createProduct = onCall<{ document: Record<string, any> }>(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const actorUid = req.auth.uid;
  await requireRole(actorUid, ["admin", "manager", "warehouse"]);
  const input = req.data.document ?? {};
  const stock = Number(input.stock ?? 0);
  const unitPrice = Number(input.unitPrice);
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    typeof input.unit !== "string" ||
    !input.unit ||
    !Number.isFinite(stock) ||
    stock < 0 ||
    !Number.isFinite(unitPrice) ||
    unitPrice < 0
  ) {
    throw new HttpsError("invalid-argument", "Invalid product details");
  }
  const ref = db.collection("products").doc();
  await db.runTransaction(async (tx) => {
    const sku = await claimSequence(tx, "products", "PRD", 4);
    const {
      id: _id,
      sku: _sku,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...safeInput
    } = input;
    tx.set(ref, {
      ...safeInput,
      sku,
      stock,
      unitPrice,
      active: input.active !== false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (stock > 0) {
      tx.set(db.collection("stock_movements").doc(), {
        productId: ref.id,
        productName: input.name,
        unit: input.unit,
        qty: stock,
        kind: "opening_balance",
        sourceType: "adjustment",
        reason: "Opening balance",
        balanceAfter: stock,
        recordedBy: actorUid,
        at: FieldValue.serverTimestamp(),
      });
    }
  });
  return { id: ref.id };
});

export const inviteUser = onCall<{
  email: string;
  displayName: string;
  role: string;
}>(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  await requireRole(req.auth.uid, ["admin"]);
  const email = req.data.email?.trim().toLowerCase();
  const displayName = req.data.displayName?.trim();
  const role = req.data.role;
  if (
    !email ||
    !email.includes("@") ||
    !displayName ||
    !["admin", "manager", "sales", "warehouse"].includes(role)
  ) {
    throw new HttpsError("invalid-argument", "Valid email, name, and role are required");
  }
  try {
    const authUser = await getAdminAuth().createUser({
      email,
      displayName,
      emailVerified: false,
      disabled: false,
    });
    await db.doc(`users/${authUser.uid}`).set({
      email,
      displayName,
      role,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { uid: authUser.uid };
  } catch (error: any) {
    if (error?.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "A user with this email already exists");
    }
    throw new HttpsError("internal", "Unable to create user");
  }
});

export const writeActivityLog = onCall<{
  entry: Record<string, any>;
}>(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const user = await requireRole(req.auth.uid, ["admin", "manager", "sales", "warehouse"]);
  const entry = req.data.entry ?? {};
  if (
    typeof entry.action !== "string" ||
    !entry.action ||
    typeof entry.entityType !== "string" ||
    !entry.entityType ||
    typeof entry.entityId !== "string" ||
    !entry.entityId ||
    typeof entry.entityLabel !== "string" ||
    !entry.entityLabel ||
    typeof entry.summary !== "string" ||
    !entry.summary
  ) {
    throw new HttpsError("invalid-argument", "Invalid activity log entry");
  }

  const ref = db.collection("activity_logs").doc();
  await ref.set({
    ...entry,
    actorUid: req.auth.uid,
    actorName: user.displayName ?? user.email ?? "Unknown",
    at: FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
});

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

export const assignSONumber = onDocumentCreated(
  "sales_orders/{id}",
  async (event) => {
    const snap = event.data;
    if (!snap || snap.data().soNumber) return;
    const num = await nextSequence("sales_orders", "SO");
    await snap.ref.update({ soNumber: num });
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

async function actorName(actorUid: string) {
  if (!actorUid || actorUid === "system") return "System";
  const snap = await db.doc(`users/${actorUid}`).get();
  return snap.data()?.displayName ?? snap.data()?.email ?? "Unknown";
}

export const auditSOCreate = onDocumentCreated(
  "sales_orders/{id}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const document = snap.data();
    await writeAudit({
      actorUid: document.createdBy ?? "system",
      actorName: document.salespersonName ?? "Unknown",
      action: "so.create",
      entityType: "sales_order",
      entityId: event.params.id,
      entityLabel: document.soNumber ?? "SO-?????",
      summary: `Server: sales order created for ${document.customerSnapshot?.name ?? "(unknown customer)"}`,
      metadata: { customerId: document.customerId, total: document.total },
    });
  },
);

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
    const uid = d.createdBy ?? "system";
    await writeAudit({
      actorUid: uid,
      actorName: await actorName(uid),
      action: d.type === "credit_note" ? "credit_note.create" : "invoice.create",
      entityType: d.type === "credit_note" ? "credit_note" : "invoice",
      entityId: event.params.id,
      entityLabel: d.invoiceNumber ?? "INV-?????",
      summary: `Server: invoice for ${d.customerSnapshot?.name ?? "(unknown)"} total ${d.total}`,
      metadata: { customerId: d.customerId, total: d.total },
    });
  },
);

export const auditCustomerPaymentCreate = onDocumentCreated(
  "payments/{id}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const payment = snap.data();
    const uid = payment.recordedBy ?? "system";
    await writeAudit({
      actorUid: uid,
      actorName: await actorName(uid),
      action: "invoice.payment",
      entityType: "invoice",
      entityId: payment.invoiceId,
      entityLabel: payment.invoiceNumber ?? payment.invoiceId,
      summary: `Server: payment of ${payment.amount} recorded for ${payment.invoiceNumber ?? payment.invoiceId}`,
      metadata: { paymentId: event.params.id, amount: payment.amount, method: payment.method },
    });
  },
);

export const auditSupplierPaymentCreate = onDocumentCreated(
  "supplier_payments/{id}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const payment = snap.data();
    const uid = payment.recordedBy ?? "system";
    await writeAudit({
      actorUid: uid,
      actorName: await actorName(uid),
      action: "po.payment",
      entityType: "purchase_order",
      entityId: payment.purchaseOrderId,
      entityLabel: payment.poNumber ?? payment.purchaseOrderId,
      summary: `Server: supplier payment of ${payment.amount} recorded for ${payment.poNumber ?? payment.purchaseOrderId}`,
      metadata: { paymentId: event.params.id, amount: payment.amount, method: payment.method },
    });
  },
);

export const auditPOCreate = onDocumentCreated(
  "purchase_orders/{id}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const d = snap.data();
    const uid = d.createdBy ?? "system";
    await writeAudit({
      actorUid: uid,
      actorName: await actorName(uid),
      action: "po.create",
      entityType: "purchase_order",
      entityId: event.params.id,
      entityLabel: d.poNumber ?? "PO-?????",
      summary: `Server: PO created for ${d.supplierSnapshot?.name ?? "(unknown supplier)"}`,
      metadata: { supplierId: d.supplierId, total: d.total },
    });
  },
);
