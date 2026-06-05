/**
 * Firebase implementation of DataAdapter. Drop-in replacement for mockAdapter.
 *
 * Switch by editing src/services/index.ts:
 *   export const dataAdapter = firebaseAdapter;
 *
 * Requires .env.local to be filled with Firebase keys (see .env.example).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  runTransaction,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import {
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from "firebase/auth";
import { getFirebase } from "@/lib/firebase";
import type { DataAdapter, Listable } from "./types";
import type {
  Customer,
  Supplier,
  Product,
  DeliveryOrder,
  PurchaseOrder,
  Invoice,
  Payment,
  SupplierPayment,
  StockMovement,
  ActivityLog,
  User,
} from "@/types";
import { padNumber } from "@/lib/utils";

function crud<T extends { id: string }>(name: string): Listable<T> {
  return {
    async list() {
      const { db } = getFirebase();
      const q = query(collection(db, name), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as T[];
    },
    async get(id) {
      const { db } = getFirebase();
      const s = await getDoc(doc(db, name, id));
      return s.exists() ? ({ id: s.id, ...(s.data() as object) } as T) : null;
    },
    async create(input) {
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, name), {
        ...input,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const s = await getDoc(ref);
      return { id: s.id, ...(s.data() as object) } as T;
    },
    async update(id, patch) {
      const { db } = getFirebase();
      await updateDoc(doc(db, name, id), { ...patch, updatedAt: serverTimestamp() });
      const s = await getDoc(doc(db, name, id));
      return { id: s.id, ...(s.data() as object) } as T;
    },
    async remove(id) {
      const { db } = getFirebase();
      await deleteDoc(doc(db, name, id));
    },
  };
}

async function nextSequence(name: string, prefix: string, width = 5) {
  const { db } = getFirebase();
  return runTransaction(db, async (tx) => {
    const ref = doc(db, "counters", name);
    const snap = await tx.get(ref);
    const next = (snap.exists() ? (snap.data().value as number) : 0) + 1;
    tx.set(ref, { value: next }, { merge: true });
    return `${prefix}-${padNumber(next, width)}`;
  });
}

export const firebaseAdapter: DataAdapter = {
  async signIn(email, password) {
    const { auth, db } = getFirebase();
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const profile = await getDoc(doc(db, "users", cred.user.uid));
    if (!profile.exists()) throw new Error("User profile missing");
    return { uid: cred.user.uid, ...(profile.data() as object) } as User;
  },
  async signOut() {
    const { auth } = getFirebase();
    await fbSignOut(auth);
  },
  async currentUser() {
    const { auth, db } = getFirebase();
    return new Promise((resolve) => {
      onAuthStateChanged(auth, async (u) => {
        if (!u) return resolve(null);
        const p = await getDoc(doc(db, "users", u.uid));
        resolve(p.exists() ? ({ uid: u.uid, ...(p.data() as object) } as User) : null);
      });
    });
  },
  async requestPasswordReset(email) {
    const { auth } = getFirebase();
    await sendPasswordResetEmail(auth, email);
  },
  settings: {
    async get() {
      // Stub
      return {
        companyName: "Irmaan Trading & Logistics",
        address: "Hargeisa, Somaliland",
        phone: "+252 63 4 000 000",
        email: "info@irmaan.co",
        currency: "USD",
        currencySymbol: "$",
        defaultTaxRate: 0.05,
        defaultPaymentTerms: 30,
      };
    },
    async update(patch) {
      // Stub
      return {
        companyName: "Irmaan Trading & Logistics",
        address: "Hargeisa, Somaliland",
        phone: "+252 63 4 000 000",
        email: "info@irmaan.co",
        currency: "USD",
        currencySymbol: "$",
        defaultTaxRate: 0.05,
        defaultPaymentTerms: 30,
        ...patch,
      };
    },
  },
  customers: crud<Customer>("customers"),
  suppliers: crud<Supplier>("suppliers"),
  products: crud<Product>("products"),
  salesOrders: {
    ...crud<import("@/types").SalesOrder>("sales_orders"),
    nextNumber: () => nextSequence("sales_orders", "SO"),
    async confirm(soId) { throw new Error("Not implemented in firebase adapter"); },
    async updateDeliveredQty(soId, items) { throw new Error("Not implemented in firebase adapter"); },
    async updateInvoicedQty(soId, items) { throw new Error("Not implemented in firebase adapter"); },
  },
  // NOTE: when running against Firebase, DO creation should also write stock_movements
  // via a Cloud Function trigger. The thin client version of recordPayment is fine for v1;
  // stock_movements for DOs/POs created from the UI will fall back to mockAdapter behavior
  // in dev — add a Cloud Function `onDOCreate` for production.
  deliveryOrders: {
    ...crud<DeliveryOrder>("delivery_orders"),
    nextNumber: () => nextSequence("delivery_orders", "DO"),
  },
  purchaseOrders: {
    ...crud<PurchaseOrder>("purchase_orders"),
    nextNumber: () => nextSequence("purchase_orders", "PO"),
    async markFullyReceived(poId, _receivedBy) {
      // In production this should be a Cloud Function (atomic stock updates + audit).
      const { db } = getFirebase();
      const ref = doc(db, "purchase_orders", poId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("PO not found");
      const po = snap.data() as PurchaseOrder;
      await updateDoc(ref, {
        items: po.items.map((it) => ({ ...it, receivedQty: it.quantity })),
        status: "received",
        receivedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      // Bump stock on each product (best-effort; a CF would do this atomically)
      for (const it of po.items) {
        const pRef = doc(db, "products", it.productId);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
          const remaining = it.quantity - (it.receivedQty ?? 0);
          await updateDoc(pRef, {
            stock: (pSnap.data().stock as number) + remaining,
            updatedAt: serverTimestamp(),
          });
        }
      }
      const updated = await getDoc(ref);
      return { id: updated.id, ...(updated.data() as object) } as PurchaseOrder;
    },
    async receiveItems(poId, receipts, _receivedBy) {
      const { db } = getFirebase();
      const ref = doc(db, "purchase_orders", poId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("PO not found");
        const po = snap.data() as PurchaseOrder;
        const newItems = po.items.map((it) => {
          const r = receipts.find((x) => x.productId === it.productId);
          if (!r) return it;
          return { ...it, receivedQty: (it.receivedQty ?? 0) + r.quantity };
        });
        const totalOrdered = newItems.reduce((s, i) => s + i.quantity, 0);
        const totalRec = newItems.reduce((s, i) => s + (i.receivedQty ?? 0), 0);
        const status = totalRec <= 0 ? "sent" : totalRec + 0.001 >= totalOrdered ? "received" : "partial_received";
        tx.update(ref, { items: newItems, status, updatedAt: serverTimestamp() });
      });
      // Stock updates (separate, ideally a CF)
      for (const r of receipts) {
        const pRef = doc(db, "products", r.productId);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
          await updateDoc(pRef, {
            stock: (pSnap.data().stock as number) + r.quantity,
            updatedAt: serverTimestamp(),
          });
        }
      }
      const updated = await getDoc(ref);
      return { id: updated.id, ...(updated.data() as object) } as PurchaseOrder;
    },
    async recordPayment(poId, paymentInput) {
      const { db } = getFirebase();
      const poRef = doc(db, "purchase_orders", poId);
      const result = await runTransaction(db, async (tx) => {
        const snap = await tx.get(poRef);
        if (!snap.exists()) throw new Error("PO not found");
        const po = snap.data() as PurchaseOrder;
        const remaining = po.total - (po.amountPaid || 0);
        if (paymentInput.amount > remaining + 0.01) throw new Error("Payment exceeds outstanding balance");
        const newPaid = (po.amountPaid || 0) + paymentInput.amount;
        tx.update(poRef, { amountPaid: newPaid, updatedAt: serverTimestamp() });
        const payRef = doc(collection(db, "supplier_payments"));
        tx.set(payRef, {
          ...paymentInput,
          purchaseOrderId: poId,
          poNumber: po.poNumber,
          supplierId: po.supplierId,
          createdAt: serverTimestamp(),
        });
        return { po: { ...po, amountPaid: newPaid } as PurchaseOrder, paymentId: payRef.id };
      });
      const fullPayment: SupplierPayment = {
        id: result.paymentId,
        purchaseOrderId: poId,
        poNumber: result.po.poNumber,
        supplierId: result.po.supplierId,
        amount: paymentInput.amount,
        method: paymentInput.method,
        reference: paymentInput.reference,
        paidAt: paymentInput.paidAt,
        recordedBy: paymentInput.recordedBy,
        notes: paymentInput.notes,
        createdAt: new Date().toISOString(),
      };
      return { po: result.po, payment: fullPayment };
    },
    async payments(poId) {
      const { db } = getFirebase();
      const snap = await getDocs(query(collection(db, "supplier_payments"), where("purchaseOrderId", "==", poId)));
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as SupplierPayment[];
    },
    async availableStock(productId) {
      return []; // Stub for Firebase adapter, implement Cloud Function for production
    },
  },
  poAllocations: {
    async list() { return []; },
    async byDeliveryOrder(doId) { return []; },
    async byPurchaseOrder(poId) { return []; },
  },
  invoices: {
    ...crud<Invoice>("invoices"),
    nextNumber: () => nextSequence("invoices", "INV"),
    async recordPayment(invoiceId, paymentInput) {
      // In production this should be a Cloud Function (transactional + audit).
      // The thin client version below is fine for v1.
      const { db } = getFirebase();
      const invRef = doc(db, "invoices", invoiceId);
      const result = await runTransaction(db, async (tx) => {
        const snap = await tx.get(invRef);
        if (!snap.exists()) throw new Error("Invoice not found");
        const inv = snap.data() as Invoice;
        const remaining = inv.total - (inv.amountPaid || 0);
        if (paymentInput.amount > remaining + 0.01) {
          throw new Error("Payment exceeds outstanding balance");
        }
        const newPaid = (inv.amountPaid || 0) + paymentInput.amount;
        const newStatus =
          newPaid + 0.001 >= inv.total ? "paid" : "partial";
        tx.update(invRef, { amountPaid: newPaid, status: newStatus, updatedAt: serverTimestamp() });
        const payRef = doc(collection(db, "payments"));
        tx.set(payRef, {
          ...paymentInput,
          invoiceId,
          invoiceNumber: inv.invoiceNumber,
          customerId: inv.customerId,
          createdAt: serverTimestamp(),
        });
        return { invoice: { ...inv, amountPaid: newPaid, status: newStatus } as Invoice, paymentId: payRef.id };
      });
      const fullPayment: Payment = {
        id: result.paymentId,
        invoiceId,
        invoiceNumber: result.invoice.invoiceNumber,
        customerId: result.invoice.customerId,
        amount: paymentInput.amount,
        method: paymentInput.method,
        reference: paymentInput.reference,
        paidAt: paymentInput.paidAt,
        recordedBy: paymentInput.recordedBy,
        notes: paymentInput.notes,
        createdAt: new Date().toISOString(),
      };
      return { invoice: result.invoice, payment: fullPayment };
    },
    async payments(invoiceId) {
      const { db } = getFirebase();
      const snap = await getDocs(query(collection(db, "payments"), where("invoiceId", "==", invoiceId)));
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as Payment[];
    },
  },
  payments: {
    async list() {
      const { db } = getFirebase();
      const snap = await getDocs(query(collection(db, "payments"), orderBy("createdAt", "desc")));
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as Payment[];
    },
    async byCustomer(customerId) {
      const { db } = getFirebase();
      const snap = await getDocs(query(collection(db, "payments"), where("customerId", "==", customerId)));
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as Payment[];
    },
  },
  supplierPayments: {
    async list() {
      const { db } = getFirebase();
      const snap = await getDocs(query(collection(db, "supplier_payments"), orderBy("createdAt", "desc")));
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as SupplierPayment[];
    },
    async bySupplier(supplierId) {
      const { db } = getFirebase();
      const snap = await getDocs(query(collection(db, "supplier_payments"), where("supplierId", "==", supplierId)));
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as SupplierPayment[];
    },
  },
  activityLog: {
    async list(filter) {
      const { db } = getFirebase();
      const constraints: import("firebase/firestore").QueryConstraint[] = [orderBy("at", "desc")];
      if (filter?.actorUid) constraints.unshift(where("actorUid", "==", filter.actorUid));
      if (filter?.entityType) constraints.unshift(where("entityType", "==", filter.entityType));
      const snap = await getDocs(query(collection(db, "activity_logs"), ...constraints));
      const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as ActivityLog[];
      return filter?.limit ? all.slice(0, filter.limit) : all;
    },
    async byEntity(entityType, entityId) {
      const { db } = getFirebase();
      const snap = await getDocs(
        query(
          collection(db, "activity_logs"),
          where("entityType", "==", entityType),
          where("entityId", "==", entityId),
          orderBy("at", "desc"),
        ),
      );
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as ActivityLog[];
    },
    async log(entry) {
      // In production, this should be written by Cloud Functions — but client-side is fine
      // for now since rules prevent tampering with existing entries.
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "activity_logs"), {
        ...entry,
        at: serverTimestamp(),
      });
      return { id: ref.id, ...entry, at: new Date().toISOString() };
    },
  },
  users: {
    async list() {
      const { db } = getFirebase();
      const snap = await getDocs(query(collection(db, "users"), orderBy("displayName", "asc")));
      return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as object) })) as User[];
    },
    async get(uid) {
      const { db } = getFirebase();
      const s = await getDoc(doc(db, "users", uid));
      return s.exists() ? ({ uid: s.id, ...(s.data() as object) } as User) : null;
    },
    async invite(input) {
      // ⚠️ For production, this should call a Cloud Function with admin SDK
      // (createUser + setCustomClaims + send reset email). The client-side
      // version below creates only the Firestore profile — the admin must
      // then go to Firebase Console → Authentication and add the matching
      // Auth user, OR a CF will pick this up via onCreate trigger.
      const { db, auth } = getFirebase();
      // Generate a temporary UID — when the CF / admin later creates the real
      // Auth account, the trigger should reconcile.
      const tempUid = `pending-${Date.now()}`;
      await setDoc(doc(db, "users", tempUid), {
        email: input.email,
        displayName: input.displayName,
        role: input.role,
        active: true,
        pendingAuthSetup: true,
        createdAt: serverTimestamp(),
      });
      // Trigger the password-reset email so the user can set their initial password
      try { await sendPasswordResetEmail(auth, input.email); } catch { /* ignore */ }
      return {
        uid: tempUid,
        email: input.email,
        displayName: input.displayName,
        role: input.role,
        active: true,
        createdAt: new Date().toISOString(),
      };
    },
    async update(uid, patch) {
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", uid), patch);
      const s = await getDoc(doc(db, "users", uid));
      return { uid: s.id, ...(s.data() as object) } as User;
    },
  },
  stockMovements: {
    async list() {
      const { db } = getFirebase();
      const snap = await getDocs(query(collection(db, "stock_movements"), orderBy("at", "desc")));
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as StockMovement[];
    },
    async byProduct(productId) {
      const { db } = getFirebase();
      const snap = await getDocs(
        query(collection(db, "stock_movements"), where("productId", "==", productId), orderBy("at", "desc")),
      );
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as StockMovement[];
    },
    async adjust(productId, qty, reason, recordedBy) {
      // In production this should be a Cloud Function (atomic + audit-protected).
      const { db } = getFirebase();
      const pRef = doc(db, "products", productId);
      const result = await runTransaction(db, async (tx) => {
        const snap = await tx.get(pRef);
        if (!snap.exists()) throw new Error("Product not found");
        const product = snap.data() as Product;
        const newStock = Math.round((product.stock + qty) * 100) / 100;
        if (newStock < -0.001) throw new Error("Insufficient stock");
        tx.update(pRef, { stock: newStock, updatedAt: serverTimestamp() });
        const movRef = doc(collection(db, "stock_movements"));
        tx.set(movRef, {
          productId,
          productName: product.name,
          unit: product.unit,
          qty,
          kind: qty >= 0 ? "adjustment_in" : "adjustment_out",
          sourceType: "adjustment",
          reason,
          balanceAfter: newStock,
          recordedBy,
          at: serverTimestamp(),
        });
        return { product: { ...product, stock: newStock } as Product, movementId: movRef.id };
      });
      const movement: StockMovement = {
        id: result.movementId,
        productId,
        productName: result.product.name,
        unit: result.product.unit,
        qty,
        kind: qty >= 0 ? "adjustment_in" : "adjustment_out",
        sourceType: "adjustment",
        reason,
        balanceAfter: result.product.stock,
        recordedBy,
        at: new Date().toISOString(),
      };
      return { product: result.product, movement };
    },
  },
};
