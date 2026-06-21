import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const projectId = "irmaan-erp-test";
let environment: RulesTestEnvironment;

test.before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

test.beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users/admin"), {
        email: "admin@example.com",
        displayName: "Admin",
        role: "admin",
        active: true,
      }),
      setDoc(doc(db, "users/manager"), {
        email: "manager@example.com",
        displayName: "Manager",
        role: "manager",
        active: true,
      }),
      setDoc(doc(db, "users/sales"), {
        email: "sales@example.com",
        displayName: "Sales",
        role: "sales",
        active: true,
      }),
      setDoc(doc(db, "users/warehouse"), {
        email: "warehouse@example.com",
        displayName: "Warehouse",
        role: "warehouse",
        active: true,
      }),
      setDoc(doc(db, "users/inactive"), {
        email: "inactive@example.com",
        displayName: "Inactive",
        role: "sales",
        active: false,
      }),
      setDoc(doc(db, "customers/customer-1"), {
        name: "Customer",
        balance: 100,
      }),
      setDoc(doc(db, "suppliers/supplier-1"), {
        name: "Supplier",
        balance: 100,
      }),
      setDoc(doc(db, "products/product-1"), {
        name: "Product",
        unitPrice: 10,
        stock: 20,
      }),
      setDoc(doc(db, "invoices/invoice-1"), {
        invoiceNumber: "INV-00001",
        type: "invoice",
        customerId: "customer-1",
        status: "draft",
        amountPaid: 0,
        notes: "",
      }),
    ]);
  });
});

test.after(async () => {
  await environment.cleanup();
});

test("authentication and active-user checks protect business data", async () => {
  const anonymous = environment.unauthenticatedContext().firestore();
  const sales = environment.authenticatedContext("sales").firestore();
  const inactive = environment.authenticatedContext("inactive").firestore();

  await assertFails(getDoc(doc(anonymous, "customers/customer-1")));
  await assertSucceeds(getDoc(doc(sales, "customers/customer-1")));
  await assertFails(getDoc(doc(inactive, "customers/customer-1")));
});

test("role boundaries protect supplier and audit data", async () => {
  const sales = environment.authenticatedContext("sales").firestore();
  const manager = environment.authenticatedContext("manager").firestore();

  await assertFails(getDoc(doc(sales, "suppliers/supplier-1")));
  await assertSucceeds(getDoc(doc(manager, "suppliers/supplier-1")));
  await assertFails(getDoc(doc(sales, "activity_logs/log-1")));
});

test("accounting documents are server-only writes", async () => {
  const admin = environment.authenticatedContext("admin").firestore();
  const sales = environment.authenticatedContext("sales").firestore();

  await assertFails(setDoc(doc(admin, "purchase_orders/po-1"), { status: "draft" }));
  await assertFails(setDoc(doc(sales, "sales_orders/so-1"), { status: "quotation" }));
  await assertFails(setDoc(doc(sales, "delivery_orders/do-1"), { status: "draft" }));
  await assertFails(setDoc(doc(sales, "invoices/invoice-2"), { status: "draft" }));
  await assertFails(setDoc(doc(admin, "payments/payment-1"), { amount: 10 }));
});

test("stock and balances cannot be changed directly", async () => {
  const warehouse = environment.authenticatedContext("warehouse").firestore();
  const manager = environment.authenticatedContext("manager").firestore();
  const sales = environment.authenticatedContext("sales").firestore();

  await assertFails(updateDoc(doc(warehouse, "products/product-1"), { stock: 19 }));
  await assertSucceeds(updateDoc(doc(warehouse, "products/product-1"), { unitPrice: 11 }));
  await assertFails(updateDoc(doc(manager, "suppliers/supplier-1"), { balance: 50 }));
  await assertFails(updateDoc(doc(sales, "customers/customer-1"), { balance: 50 }));
});

test("invoice clients may edit drafts but cannot post them", async () => {
  const sales = environment.authenticatedContext("sales").firestore();

  await assertSucceeds(updateDoc(doc(sales, "invoices/invoice-1"), { notes: "Updated" }));
  await assertFails(updateDoc(doc(sales, "invoices/invoice-1"), { status: "sent" }));
  await assertFails(updateDoc(doc(sales, "invoices/invoice-1"), { amountPaid: 10 }));
  await assertFails(updateDoc(doc(sales, "invoices/invoice-1"), { type: "credit_note" }));
});

test("audit entries are server-only", async () => {
  const sales = environment.authenticatedContext("sales").firestore();
  const valid = {
    actorUid: "sales",
    actorName: "Sales",
    action: "invoice.update",
    entityType: "invoice",
    entityId: "invoice-1",
    entityLabel: "INV-00001",
    summary: "Updated invoice",
  };

  await assertFails(setDoc(doc(sales, "activity_logs/log-1"), valid));
  await assertFails(
    setDoc(doc(sales, "activity_logs/log-2"), { ...valid, actorUid: "admin" }),
  );
  assert.equal(true, true);
});
