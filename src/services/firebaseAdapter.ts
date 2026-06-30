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
  query,
  where,
  orderBy,
  startAfter,
  limit as queryLimit,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore";
import {
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from "firebase/auth";
import { getFirebase } from "@/lib/firebase";
import { callServerOperation } from "@/lib/server-operation";
import type {
  CompanySettings,
  DataAdapter,
  Listable,
  ListPageOptions,
  ListPageResult,
  VerificationResult,
} from "./types";
import type {
  Customer,
  Supplier,
  Product,
  DeliveryOrder,
  PurchaseOrder,
  POAllocation,
  SalesOrder,
  Invoice,
  Payment,
  SupplierPayment,
  StockMovement,
  ActivityLog,
  User,
} from "@/types";
import { padNumber } from "@/lib/utils";

const DEFAULT_FIREBASE_SETTINGS: CompanySettings = {
  companyName: "Irmaan Trading & Logistics",
  address: "Hargeisa, Somaliland",
  phone: "+252 63 4 000 000",
  email: "info@irmaan.co",
  taxId: "",
  currency: "USD",
  currencySymbol: "$",
  defaultTaxRate: 0.05,
  defaultPaymentTerms: 30,
  invoiceFooter: "",
};

const MAX_QUERY_DOCUMENTS = 2000;

function assertQueryBound(size: number, label: string) {
  if (size > MAX_QUERY_DOCUMENTS) {
    throw new Error(
      `${label} exceeds ${MAX_QUERY_DOCUMENTS.toLocaleString()} records. Use a filtered report or add cursor pagination.`,
    );
  }
}

function crud<T extends { id: string }>(name: string): Listable<T> {
  return {
    async list() {
      const { db } = getFirebase();
      const q = query(
        collection(db, name),
        orderBy("createdAt", "desc"),
        queryLimit(MAX_QUERY_DOCUMENTS + 1),
      );
      const snap = await getDocs(q);
      assertQueryBound(snap.size, name);
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
  const snap = await getDoc(doc(db, "counters", name));
  const next = (snap.exists() ? (snap.data().value as number) : 0) + 1;
  return `${prefix}-${padNumber(next, width)}`;
}

function boundedPageSize(size: number) {
  return Math.min(Math.max(Math.trunc(size) || 25, 1), 100);
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeFirestoreValue);
  if (value && typeof value === "object") {
    if (
      "toDate" in value &&
      typeof (value as { toDate?: unknown }).toDate === "function"
    ) {
      return (value as { toDate: () => Date }).toDate().toISOString();
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeFirestoreValue(child)]),
    );
  }
  return value;
}

function docData<T>(snapshot: { id: string; data: () => unknown }): T {
  return {
    id: snapshot.id,
    ...(normalizeFirestoreValue(snapshot.data()) as object),
  } as T;
}

type StatusFilter = string | string[] | undefined;

function addStatusFilter(constraints: QueryConstraint[], status: StatusFilter) {
  if (!status) return;
  if (Array.isArray(status)) {
    constraints.push(where("status", "in", status));
  } else if (status !== "all") {
    constraints.push(where("status", "==", status));
  }
}

async function listDocumentPage<T extends { id: string }>(
  collectionName: string,
  numberField: string,
  options: ListPageOptions,
  status: StatusFilter = options.status,
): Promise<ListPageResult<T>> {
  const { db } = getFirebase();
  const pageSize = boundedPageSize(options.pageSize);
  const search = options.search?.trim().toUpperCase() ?? "";
  const constraints: QueryConstraint[] = [];

  addStatusFilter(constraints, status);

  if (search) {
    constraints.push(where(numberField, "==", search), queryLimit(pageSize));
    const snap = await getDocs(query(collection(db, collectionName), ...constraints));
    return {
      items: snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as T[],
      nextCursor: null,
      hasMore: false,
    };
  }

  constraints.push(orderBy("createdAt", "desc"));
  if (options.cursor) {
    constraints.push(startAfter(options.cursor as QueryDocumentSnapshot<DocumentData>));
  }
  constraints.push(queryLimit(pageSize + 1));

  const snap = await getDocs(query(collection(db, collectionName), ...constraints));
  const visibleDocs = snap.docs.slice(0, pageSize);

  return {
    items: visibleDocs.map((d) => ({ id: d.id, ...(d.data() as object) })) as T[],
    nextCursor: snap.docs.length > pageSize ? visibleDocs[visibleDocs.length - 1] : null,
    hasMore: snap.docs.length > pageSize,
  };
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function effectiveInvoiceStatusForList(invoice: Invoice) {
  if (invoice.status === "cancelled" || invoice.status === "draft" || invoice.status === "paid") {
    return invoice.status;
  }
  if (invoice.amountPaid > 0 && invoice.amountPaid + 0.001 < invoice.total) return "partial";
  if (new Date(invoice.dueDate).getTime() < Date.now()) return "overdue";
  return "sent";
}

async function listInvoicePage(options: ListPageOptions<Invoice["status"]>): Promise<ListPageResult<Invoice>> {
  const status = options.status;
  const search = options.search?.trim();

  if (search) {
    const result = await listDocumentPage<Invoice>("invoices", "invoiceNumber", options, undefined);
    if (!status || status === "all") return result;
    return {
      ...result,
      items: result.items.filter((invoice) => effectiveInvoiceStatusForList(invoice) === status),
    };
  }

  if (status === "overdue" || status === "sent") {
    const { db } = getFirebase();
    const pageSize = boundedPageSize(options.pageSize);
    const constraints: QueryConstraint[] = [
      where("status", "==", "sent"),
      where("dueDate", status === "overdue" ? "<" : ">=", todayIsoDate()),
      orderBy("dueDate", status === "overdue" ? "desc" : "asc"),
    ];
    if (options.cursor) {
      constraints.push(startAfter(options.cursor as QueryDocumentSnapshot<DocumentData>));
    }
    constraints.push(queryLimit(pageSize + 1));

    const snap = await getDocs(query(collection(db, "invoices"), ...constraints));
    const visibleDocs = snap.docs.slice(0, pageSize);

    return {
      items: visibleDocs.map((d) => ({ id: d.id, ...(d.data() as object) })) as Invoice[],
      nextCursor: snap.docs.length > pageSize ? visibleDocs[visibleDocs.length - 1] : null,
      hasMore: snap.docs.length > pageSize,
    };
  }

  return listDocumentPage<Invoice>("invoices", "invoiceNumber", options);
}

export const firebaseAdapter: DataAdapter = {
  async signIn(email, password) {
    const { auth, db } = getFirebase();
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const profile = await getDoc(doc(db, "users", cred.user.uid));
    if (!profile.exists()) {
      await fbSignOut(auth);
      throw new Error("User profile missing");
    }
    const user = { uid: cred.user.uid, ...(profile.data() as object) } as User;
    if (!user.active) {
      await fbSignOut(auth);
      throw new Error("This account has been deactivated");
    }
    return user;
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
        if (!p.exists()) {
          await fbSignOut(auth);
          return resolve(null);
        }
        const user = { uid: u.uid, ...(p.data() as object) } as User;
        if (!user.active) {
          await fbSignOut(auth);
          return resolve(null);
        }
        resolve(user);
      });
    });
  },
  async requestPasswordReset(email) {
    const { auth } = getFirebase();
    await sendPasswordResetEmail(auth, email);
  },
  verification: {
    async get(id) {
      return callServerOperation<
        { id: string },
        VerificationResult | null
      >("verifyDocument", { id }, { public: true });
    },
  },
  settings: {
    async get() {
      const { db } = getFirebase();
      const snap = await getDoc(doc(db, "settings", "company"));
      return snap.exists()
        ? { ...DEFAULT_FIREBASE_SETTINGS, ...(snap.data() as object) }
        : DEFAULT_FIREBASE_SETTINGS;
    },
    async update(patch) {
      const { db } = getFirebase();
      const ref = doc(db, "settings", "company");
      await setDoc(ref, { ...patch, updatedAt: serverTimestamp() }, { merge: true });
      const snap = await getDoc(ref);
      return { ...DEFAULT_FIREBASE_SETTINGS, ...(snap.data() as object) };
    },
  },
  customers: {
    ...crud<Customer>("customers"),
    async create(input) {
      const { db } = getFirebase();
      const result = await callServerOperation<
        { document: Record<string, unknown> },
        { id: string }
      >("createCustomer", { document: input as Record<string, unknown> });
      const snap = await getDoc(doc(db, "customers", result.id));
      if (!snap.exists()) throw new Error("Customer was not created");
      return { id: snap.id, ...(snap.data() as object) } as Customer;
    },
  },
  suppliers: {
    ...crud<Supplier>("suppliers"),
    async create(input) {
      const { db } = getFirebase();
      const result = await callServerOperation<
        { document: Record<string, unknown> },
        { id: string }
      >("createSupplier", { document: input as Record<string, unknown> });
      const snap = await getDoc(doc(db, "suppliers", result.id));
      if (!snap.exists()) throw new Error("Supplier was not created");
      return { id: snap.id, ...(snap.data() as object) } as Supplier;
    },
  },
  products: {
    ...crud<Product>("products"),
    async create(input) {
      const { db } = getFirebase();
      const result = await callServerOperation<
        { document: Record<string, unknown> },
        { id: string }
      >("createProduct", { document: input as Record<string, unknown> });
      const snap = await getDoc(doc(db, "products", result.id));
      if (!snap.exists()) throw new Error("Product was not created");
      return { id: snap.id, ...(snap.data() as object) } as Product;
    },
  },
  salesOrders: {
    ...crud<SalesOrder>("sales_orders"),
    nextNumber: () => nextSequence("sales_orders", "SO"),
    async create(input) {
      const { db } = getFirebase();
      const result = await callServerOperation<
        { document: Record<string, unknown> },
        { id: string }
      >("createSalesOrder", { document: input as Record<string, unknown> });
      const snap = await getDoc(doc(db, "sales_orders", result.id));
      if (!snap.exists()) throw new Error("Sales order was not created");
      return { id: snap.id, ...(snap.data() as object) } as SalesOrder;
    },
    async update(id, patch) {
      const keys = Object.keys(patch).filter((key) => key !== "id");
      if (keys.length !== 1 || keys[0] !== "status") {
        throw new Error("Sales order terms cannot be edited after creation");
      }
      const status = patch.status;
      if (status !== "confirmed" && status !== "cancelled") {
        throw new Error("Unsupported sales-order transition");
      }
      const { db } = getFirebase();
      await callServerOperation<
        { id: string; status: string },
        { id: string }
      >("transitionSalesOrder", { id, status });
      const updated = await getDoc(doc(db, "sales_orders", id));
      if (!updated.exists()) throw new Error("Sales order not found");
      return { id: updated.id, ...(updated.data() as object) } as SalesOrder;
    },
    async confirm(soId) {
      return firebaseAdapter.salesOrders.update(soId, { status: "confirmed" });
    },
    async updateDeliveredQty(soId, items) {
      void soId;
      void items;
      throw new Error("Sales-order delivery progress is managed by delivery-order transactions");
    },
    async updateInvoicedQty(soId, items) {
      void soId;
      void items;
      throw new Error("Sales-order invoice progress is managed by invoice transactions");
    },
  },
  deliveryOrders: {
    ...crud<DeliveryOrder>("delivery_orders"),
    nextNumber: () => nextSequence("delivery_orders", "DO"),
    listPage: (options) => listDocumentPage<DeliveryOrder>("delivery_orders", "doNumber", options),
    async create(input) {
      const { db } = getFirebase();
      const result = await callServerOperation<
        { document: Record<string, unknown> },
        { id: string }
      >("createDeliveryOrder", { document: input as Record<string, unknown> });
      const snap = await getDoc(doc(db, "delivery_orders", result.id));
      if (!snap.exists()) throw new Error("Delivery order was not created");
      return { id: snap.id, ...(snap.data() as object) } as DeliveryOrder;
    },
    async update(id, patch) {
      const { db } = getFirebase();
      const ref = doc(db, "delivery_orders", id);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("Delivery order not found");
      const current = { id: snap.id, ...(snap.data() as object) } as DeliveryOrder;
      const targetStatus = patch.status ?? current.status;
      const isTransition = targetStatus !== current.status;

      if (!isTransition) {
        if (current.status !== "draft") {
          throw new Error("Issued delivery orders cannot be edited");
        }
        const { id: _id, doNumber: _doNumber, ...safePatch } = patch;
        await updateDoc(ref, {
          ...safePatch,
          status: "draft",
          updatedAt: serverTimestamp(),
        });
      } else {
        if (current.status === "draft" && targetStatus === "issued") {
          const { id: _id, doNumber: _doNumber, status: _status, ...draftPatch } = patch;
          if (Object.keys(draftPatch).length > 0) {
            await updateDoc(ref, {
              ...draftPatch,
              status: "draft",
              updatedAt: serverTimestamp(),
            });
          }
        } else if (
          !(
            (current.status === "issued" && targetStatus === "delivered") ||
            (current.status === "draft" && targetStatus === "cancelled") ||
            ((current.status === "issued" || current.status === "delivered") &&
              targetStatus === "cancelled")
          )
        ) {
          throw new Error(`Unsupported delivery-order transition from ${current.status} to ${targetStatus}`);
        }
        await callServerOperation<
          { id: string; status: string },
          { id: string }
        >("transitionDeliveryOrder", { id, status: targetStatus });
      }

      const updated = await getDoc(ref);
      return { id: updated.id, ...(updated.data() as object) } as DeliveryOrder;
    },
  },
  purchaseOrders: {
    ...crud<PurchaseOrder>("purchase_orders"),
    nextNumber: () => nextSequence("purchase_orders", "PO"),
    listPage: (options) => listDocumentPage<PurchaseOrder>(
      "purchase_orders",
      "poNumber",
      options,
      options.status === "pending_receipt" ? ["sent", "partial_received"] : options.status,
    ),
    async requestApproval(poId) {
      const { db } = getFirebase();
      await callServerOperation<{ id: string }, { id: string }>(
        "requestPurchaseOrderApproval",
        { id: poId },
      );
      const updated = await getDoc(doc(db, "purchase_orders", poId));
      if (!updated.exists()) throw new Error("Purchase order not found");
      return { id: updated.id, ...(updated.data() as object) } as PurchaseOrder;
    },
    async decideApproval(poId, decision, reason) {
      const { db } = getFirebase();
      await callServerOperation<
        { id: string; decision: "approved" | "rejected"; reason?: string },
        { id: string }
      >("decidePurchaseOrderApproval", { id: poId, decision, reason });
      const updated = await getDoc(doc(db, "purchase_orders", poId));
      if (!updated.exists()) throw new Error("Purchase order not found");
      return { id: updated.id, ...(updated.data() as object) } as PurchaseOrder;
    },
    async create(input) {
      const { db } = getFirebase();
      const result = await callServerOperation<
        { document: Record<string, unknown> },
        { id: string }
      >("createPurchaseOrder", { document: input as Record<string, unknown> });
      const created = await getDoc(doc(db, "purchase_orders", result.id));
      if (!created.exists()) throw new Error("Purchase order was not created");
      return { id: created.id, ...(created.data() as object) } as PurchaseOrder;
    },
    async update(id, patch) {
      const { db } = getFirebase();
      const keys = Object.keys(patch).filter((key) => key !== "id");
      const statusOnly = keys.length === 1 && keys[0] === "status";
      if (statusOnly) {
        if (patch.status !== "sent" && patch.status !== "cancelled") {
          throw new Error("Unsupported purchase-order transition");
        }
        await callServerOperation<
          { id: string; status: string },
          { id: string }
        >("transitionPurchaseOrder", { id, status: patch.status });
      } else {
        await callServerOperation<
          { id: string; document: Record<string, unknown> },
          { id: string }
        >("updatePurchaseOrder", {
          id,
          document: patch as Record<string, unknown>,
        });
      }
      const updated = await getDoc(doc(db, "purchase_orders", id));
      if (!updated.exists()) throw new Error("Purchase order not found");
      return { id: updated.id, ...(updated.data() as object) } as PurchaseOrder;
    },
    async markFullyReceived(poId, receivedBy) {
      const { db } = getFirebase();
      const ref = doc(db, "purchase_orders", poId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("Purchase order not found");
      const po = snap.data() as PurchaseOrder;
      const receipts = po.items
        .map((item) => ({
          productId: item.productId,
          quantity: item.quantity - (item.receivedQty ?? 0),
        }))
        .filter((receipt) => receipt.quantity > 0.001);
      if (receipts.length === 0) {
        return { id: snap.id, ...(snap.data() as object) } as PurchaseOrder;
      }
      return firebaseAdapter.purchaseOrders.receiveItems(poId, receipts, receivedBy);
    },
    async receiveItems(poId, receipts, receivedBy) {
      void receivedBy;
      const { db } = getFirebase();
      await callServerOperation<
        {
          purchaseOrderId: string;
          receipts: Array<{ productId: string; quantity: number }>;
        },
        { id: string }
      >("receivePurchaseOrder", { purchaseOrderId: poId, receipts });
      const updated = await getDoc(doc(db, "purchase_orders", poId));
      if (!updated.exists()) throw new Error("Purchase order not found after receipt");
      return { id: updated.id, ...(updated.data() as object) } as PurchaseOrder;
    },
    async recordPayment(poId, paymentInput) {
      const { db } = getFirebase();
      const poRef = doc(db, "purchase_orders", poId);
      const result = await callServerOperation<
        { purchaseOrderId: string; payment: Record<string, unknown> },
        { purchaseOrderId: string; paymentId: string }
      >("recordSupplierPayment", {
        purchaseOrderId: poId,
        payment: paymentInput as Record<string, unknown>,
      });
      const [poSnap, paymentSnap] = await Promise.all([
        getDoc(poRef),
        getDoc(doc(db, "supplier_payments", result.paymentId)),
      ]);
      if (!poSnap.exists() || !paymentSnap.exists()) {
        throw new Error("Supplier payment was not committed");
      }
      return {
        po: { id: poSnap.id, ...(poSnap.data() as object) } as PurchaseOrder,
        payment: {
          id: paymentSnap.id,
          ...(paymentSnap.data() as object),
        } as SupplierPayment,
      };
    },
    async payments(poId) {
      const { db } = getFirebase();
      const snap = await getDocs(query(collection(db, "supplier_payments"), where("purchaseOrderId", "==", poId)));
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as SupplierPayment[];
    },
    async availableStock(productId) {
      return callServerOperation<
        { productId: string },
        Array<{ poId: string; poNumber: string; orderDate: string; remaining: number }>
      >("getAvailablePOStock", { productId });
    },
  },
  poAllocations: {
    async list() {
      const { db } = getFirebase();
      const snap = await getDocs(query(
        collection(db, "po_allocations"),
        orderBy("allocatedAt", "desc"),
        queryLimit(MAX_QUERY_DOCUMENTS + 1),
      ));
      assertQueryBound(snap.size, "PO allocations");
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as POAllocation[];
    },
    async byDeliveryOrder(doId) {
      const { db } = getFirebase();
      const snap = await getDocs(
        query(collection(db, "po_allocations"), where("deliveryOrderId", "==", doId)),
      );
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as POAllocation[];
    },
    async byPurchaseOrder(poId) {
      const { db } = getFirebase();
      const snap = await getDocs(
        query(collection(db, "po_allocations"), where("purchaseOrderId", "==", poId)),
      );
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as POAllocation[];
    },
  },
  invoices: {
    ...crud<Invoice>("invoices"),
    nextNumber: () => nextSequence("invoices", "INV"),
    listPage: listInvoicePage,
    async create(input) {
      const { db } = getFirebase();
      const result = await callServerOperation<
        { document: Record<string, unknown> },
        { id: string }
      >("createInvoice", { document: input as Record<string, unknown> });
      const snap = await getDoc(doc(db, "invoices", result.id));
      if (!snap.exists()) throw new Error("Invoice was not created");
      return { id: snap.id, ...(snap.data() as object) } as Invoice;
    },
    async update(id, patch) {
      const { db } = getFirebase();
      const ref = doc(db, "invoices", id);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("Invoice not found");
      const current = { id: snap.id, ...(snap.data() as object) } as Invoice;
      const targetStatus = patch.status ?? current.status;
      const isTransition = targetStatus !== current.status;

      if (!isTransition) {
        if (current.status !== "draft") {
          throw new Error("Issued invoices cannot be edited");
        }
        if (patch.amountPaid !== undefined && patch.amountPaid !== current.amountPaid) {
          throw new Error("Use the payment workflow to change amount paid");
        }
        const {
          id: _id,
          invoiceNumber: _invoiceNumber,
          amountPaid: _amountPaid,
          status: _status,
          ...draftPatch
        } = patch;
        await updateDoc(ref, {
          ...draftPatch,
          status: "draft",
          updatedAt: serverTimestamp(),
        });
      } else {
        if (current.status === "draft" && targetStatus === "sent") {
          const {
            id: _id,
            invoiceNumber: _invoiceNumber,
            amountPaid: _amountPaid,
            status: _status,
            ...draftPatch
          } = patch;
          if (Object.keys(draftPatch).length > 0) {
            await updateDoc(ref, {
              ...draftPatch,
              status: "draft",
              updatedAt: serverTimestamp(),
            });
          }
        } else if (
          !(
            current.status !== "draft" &&
            current.status !== "cancelled" &&
            targetStatus === "cancelled"
          )
        ) {
          throw new Error(`Unsupported invoice transition from ${current.status} to ${targetStatus}`);
        }
        await callServerOperation<
          { id: string; status: string },
          { id: string }
        >("transitionInvoice", { id, status: targetStatus });
      }

      const updated = await getDoc(ref);
      return { id: updated.id, ...(updated.data() as object) } as Invoice;
    },
    async recordPayment(invoiceId, paymentInput) {
      const { db } = getFirebase();
      const invRef = doc(db, "invoices", invoiceId);
      const result = await callServerOperation<
        { invoiceId: string; payment: Record<string, unknown> },
        { invoiceId: string; paymentId: string }
      >("recordInvoicePayment", {
        invoiceId,
        payment: paymentInput as Record<string, unknown>,
      });
      const [invoiceSnap, paymentSnap] = await Promise.all([
        getDoc(invRef),
        getDoc(doc(db, "payments", result.paymentId)),
      ]);
      if (!invoiceSnap.exists() || !paymentSnap.exists()) {
        throw new Error("Invoice payment was not committed");
      }
      return {
        invoice: {
          id: invoiceSnap.id,
          ...(invoiceSnap.data() as object),
        } as Invoice,
        payment: {
          id: paymentSnap.id,
          ...(paymentSnap.data() as object),
        } as Payment,
      };
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
      const snap = await getDocs(query(
        collection(db, "payments"),
        orderBy("createdAt", "desc"),
        queryLimit(MAX_QUERY_DOCUMENTS + 1),
      ));
      assertQueryBound(snap.size, "Customer payments");
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
      const snap = await getDocs(query(
        collection(db, "supplier_payments"),
        orderBy("createdAt", "desc"),
        queryLimit(MAX_QUERY_DOCUMENTS + 1),
      ));
      assertQueryBound(snap.size, "Supplier payments");
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
      const requestedLimit = Math.min(filter?.limit ?? 250, MAX_QUERY_DOCUMENTS);
      constraints.push(queryLimit(requestedLimit));
      const snap = await getDocs(query(collection(db, "activity_logs"), ...constraints));
      const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as ActivityLog[];
      return all;
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
      const result = await callServerOperation<
        { entry: Record<string, unknown> },
        { id: string }
      >("writeActivityLog", {
        entry: entry as unknown as Record<string, unknown>,
      });
      return { id: result.id, ...entry, at: new Date().toISOString() };
    },
  },
  users: {
    async list() {
      const { db } = getFirebase();
      const snap = await getDocs(query(
        collection(db, "users"),
        orderBy("displayName", "asc"),
        queryLimit(MAX_QUERY_DOCUMENTS + 1),
      ));
      assertQueryBound(snap.size, "Users");
      return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as object) })) as User[];
    },
    async get(uid) {
      const { db } = getFirebase();
      const s = await getDoc(doc(db, "users", uid));
      return s.exists() ? ({ uid: s.id, ...(s.data() as object) } as User) : null;
    },
    async invite(input) {
      const { db, auth } = getFirebase();
      const result = await callServerOperation<
        { email: string; displayName: string; role: User["role"] },
        { uid: string }
      >("inviteUser", input);
      await sendPasswordResetEmail(auth, input.email);
      const snap = await getDoc(doc(db, "users", result.uid));
      if (!snap.exists()) throw new Error("User profile was not created");
      return { uid: snap.id, ...(snap.data() as object) } as User;
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
      const snap = await getDocs(query(
        collection(db, "stock_movements"),
        orderBy("at", "desc"),
        queryLimit(MAX_QUERY_DOCUMENTS + 1),
      ));
      assertQueryBound(snap.size, "Stock movements");
      return snap.docs.map((d) => docData<StockMovement>(d));
    },
    async byProduct(productId) {
      const { db } = getFirebase();
      const snap = await getDocs(
        query(collection(db, "stock_movements"), where("productId", "==", productId), orderBy("at", "desc")),
      );
      return snap.docs.map((d) => docData<StockMovement>(d));
    },
    async adjust(productId, qty, reason, _recordedBy) {
      const { db } = getFirebase();
      const result = await callServerOperation<
        { productId: string; quantity: number; reason: string },
        { productId: string; movementId: string }
      >("adjustStock", { productId, quantity: qty, reason });
      const [productSnap, movementSnap] = await Promise.all([
        getDoc(doc(db, "products", result.productId)),
        getDoc(doc(db, "stock_movements", result.movementId)),
      ]);
      if (!productSnap.exists() || !movementSnap.exists()) {
        throw new Error("Stock adjustment was not committed");
      }
      return {
        product: { id: productSnap.id, ...(productSnap.data() as object) } as Product,
        movement: docData<StockMovement>(movementSnap),
      };
    },
  },
};
