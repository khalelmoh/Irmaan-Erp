import test from "node:test";
import assert from "node:assert/strict";
import { computeTotals } from "../src/lib/invoice";
import { computePOTotals } from "../src/lib/purchase-order";
import { remainingToDeliver, remainingToInvoice } from "../src/lib/sales-order";
import { arAging, salesSummary } from "../src/lib/reports";
import { canAccessPath } from "../src/lib/route-access";
import type { Invoice, SalesOrder } from "../src/types";
import {
  decodeFirestoreValue,
  encodeFirestoreValue,
  normalizeBackupPayload,
} from "../scripts/backup-format";
import { Timestamp } from "firebase-admin/firestore";
import { reconcileERP } from "../src/lib/reconciliation";
import {
  verificationPath,
  verificationUrl,
} from "../src/lib/document-verification";
import type {
  Customer,
  POAllocation,
  Product,
  PurchaseOrder,
  StockMovement,
  Supplier,
} from "../src/types";

test("invoice and PO totals round monetary values consistently", () => {
  const items = [
    { quantity: 3, unitPrice: 10.115 },
    { quantity: 2, unitPrice: 4.335 },
  ];
  assert.deepEqual(computeTotals(items, 0.05), {
    subtotal: 39.02,
    taxAmount: 1.95,
    total: 40.97,
  });
  assert.deepEqual(computePOTotals(items, 0.05), {
    subtotal: 39.02,
    taxAmount: 1.95,
    total: 40.97,
  });
});

test("sales-order remaining quantities cannot become hidden by partial progress", () => {
  const so = {
    status: "confirmed",
    items: [
      {
        productId: "p1",
        name: "Cement",
        unit: "Bag",
        unitPrice: 8,
        quantity: 100,
        deliveredQty: 35,
        invoicedQty: 20,
        lineTotal: 800,
      },
    ],
  } as SalesOrder;

  assert.equal(remainingToDeliver(so)[0].remaining, 65);
  assert.equal(remainingToInvoice(so)[0].remaining, 80);
});

test("credit notes reduce billed sales and are excluded from receivables aging", () => {
  const issueDate = new Date().toISOString();
  const invoice = {
    id: "inv-1",
    type: "invoice",
    status: "sent",
    issueDate,
    dueDate: issueDate,
    total: 100,
    amountPaid: 0,
  } as Invoice;
  const credit = {
    ...invoice,
    id: "cn-1",
    type: "credit_note",
    total: 25,
  } as Invoice;

  const range = {
    from: issueDate.slice(0, 10),
    to: issueDate.slice(0, 10),
  };
  assert.equal(salesSummary([invoice, credit], [], range).billed, 75);
  assert.equal(arAging([invoice, credit]).flatMap((bucket) => bucket.invoices).length, 1);
});

test("route access follows the ERP role boundaries", () => {
  assert.equal(canAccessPath("sales", "/invoices/new"), true);
  assert.equal(canAccessPath("sales", "/purchase-orders"), false);
  assert.equal(canAccessPath("warehouse", "/inventory/movements"), true);
  assert.equal(canAccessPath("warehouse", "/reports"), false);
  assert.equal(canAccessPath("manager", "/reports/profit"), true);
  assert.equal(canAccessPath("manager", "/users"), false);
  assert.equal(canAccessPath("admin", "/users"), true);
});

test("document verification links use one encoded public route", () => {
  assert.equal(verificationPath("so/123"), "/verify/so%2F123");
  assert.equal(
    verificationUrl("invoice 42", "https://irmaan-erp.vercel.app"),
    "https://irmaan-erp.vercel.app/verify/invoice%2042",
  );
});

test("backup format preserves Firestore timestamps and accepts legacy backups", () => {
  const timestamp = Timestamp.fromDate(new Date("2026-06-20T12:00:00.000Z"));
  const encoded = encodeFirestoreValue({ createdAt: timestamp });
  const decoded = decodeFirestoreValue(encoded) as { createdAt: Timestamp };
  assert.equal(decoded.createdAt.toDate().toISOString(), "2026-06-20T12:00:00.000Z");

  const legacy = normalizeBackupPayload({
    customers: {
      "customer-1": {
        createdAt: { _seconds: 1_750_420_800, _nanoseconds: 0 },
      },
    },
  });
  assert.equal(legacy.data.customers.length, 1);
  assert.ok(legacy.data.customers[0].createdAt instanceof Timestamp);
});

test("reconciliation detects financial, stock, and allocation drift", () => {
  const issues = reconcileERP({
    customers: [{ id: "c1", code: "C-1", name: "Customer", balance: 90 } as Customer],
    suppliers: [{ id: "s1", code: "S-1", name: "Supplier", balance: 80 } as Supplier],
    products: [{ id: "p1", sku: "P-1", name: "Product", stock: 12 } as Product],
    invoices: [
      {
        id: "i1",
        customerId: "c1",
        type: "invoice",
        status: "sent",
        total: 100,
        amountPaid: 20,
      } as Invoice,
    ],
    purchaseOrders: [
      {
        id: "po1",
        poNumber: "PO-1",
        supplierId: "s1",
        status: "sent",
        total: 100,
        amountPaid: 10,
        items: [
          {
            productId: "p1",
            name: "Product",
            quantity: 10,
            receivedQty: 5,
            allocatedQty: 4,
          },
        ],
      } as PurchaseOrder,
    ],
    stockMovements: [
      {
        id: "m1",
        productId: "p1",
        at: "2026-06-20T12:00:00.000Z",
        balanceAfter: 10,
      } as StockMovement,
    ],
    poAllocations: [
      {
        id: "a1",
        purchaseOrderId: "po1",
        productId: "p1",
        quantity: 2,
      } as POAllocation,
    ],
  });

  assert.deepEqual(
    new Set(issues.map((issue) => issue.category)),
    new Set(["receivables", "payables", "inventory", "allocations"]),
  );
});
