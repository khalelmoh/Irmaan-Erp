import type {
  Customer,
  Invoice,
  POAllocation,
  Product,
  PurchaseOrder,
  StockMovement,
  Supplier,
} from "@/types";

const round2 = (value: number) => Math.round(value * 100) / 100;

export type ReconciliationCategory =
  | "receivables"
  | "payables"
  | "inventory"
  | "allocations";

export interface ReconciliationIssue {
  category: ReconciliationCategory;
  entityId: string;
  label: string;
  recorded: number | null;
  expected: number | null;
  variance: number | null;
  detail: string;
}

export function reconcileERP(input: {
  customers: Customer[];
  suppliers: Supplier[];
  products: Product[];
  invoices: Invoice[];
  purchaseOrders: PurchaseOrder[];
  stockMovements: StockMovement[];
  poAllocations: POAllocation[];
}) {
  const issues: ReconciliationIssue[] = [];

  for (const customer of input.customers) {
    const expected = round2(
      input.invoices
        .filter(
          (invoice) =>
            invoice.customerId === customer.id &&
            invoice.status !== "draft" &&
            invoice.status !== "cancelled",
        )
        .reduce((sum, invoice) => {
          const open = Math.max(0, invoice.total - invoice.amountPaid);
          return sum + (invoice.type === "credit_note" ? -open : open);
        }, 0),
    );
    const recorded = round2(customer.balance);
    if (Math.abs(recorded - expected) > 0.01) {
      issues.push({
        category: "receivables",
        entityId: customer.id,
        label: `${customer.code} - ${customer.name}`,
        recorded,
        expected,
        variance: round2(recorded - expected),
        detail: "Customer balance differs from open invoices and credit notes.",
      });
    }
  }

  for (const supplier of input.suppliers) {
    const expected = round2(
      input.purchaseOrders
        .filter(
          (po) =>
            po.supplierId === supplier.id &&
            po.status !== "draft" &&
            po.status !== "cancelled",
        )
        .reduce((sum, po) => sum + Math.max(0, po.total - po.amountPaid), 0),
    );
    const recorded = round2(supplier.balance);
    if (Math.abs(recorded - expected) > 0.01) {
      issues.push({
        category: "payables",
        entityId: supplier.id,
        label: `${supplier.code} - ${supplier.name}`,
        recorded,
        expected,
        variance: round2(recorded - expected),
        detail: "Supplier balance differs from committed unpaid purchase orders.",
      });
    }
  }

  for (const product of input.products) {
    const latest = input.stockMovements
      .filter((movement) => movement.productId === product.id)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
    if (!latest) {
      issues.push({
        category: "inventory",
        entityId: product.id,
        label: `${product.sku} - ${product.name}`,
        recorded: round2(product.stock),
        expected: null,
        variance: null,
        detail: "No stock movement exists to support the current stock balance.",
      });
    } else {
      const recorded = round2(product.stock);
      const expected = round2(latest.balanceAfter);
      if (Math.abs(recorded - expected) > 0.001) {
        issues.push({
          category: "inventory",
          entityId: product.id,
          label: `${product.sku} - ${product.name}`,
          recorded,
          expected,
          variance: round2(recorded - expected),
          detail: `Current stock differs from the latest movement (${latest.kind}).`,
        });
      }
    }
  }

  for (const po of input.purchaseOrders) {
    for (const item of po.items) {
      const expected = round2(
        input.poAllocations
          .filter(
            (allocation) =>
              allocation.purchaseOrderId === po.id &&
              allocation.productId === item.productId,
          )
          .reduce((sum, allocation) => sum + allocation.quantity, 0),
      );
      const recorded = round2(item.allocatedQty ?? 0);
      const received = round2(item.receivedQty ?? 0);
      if (Math.abs(recorded - expected) > 0.001 || recorded > received + 0.001) {
        issues.push({
          category: "allocations",
          entityId: po.id,
          label: `${po.poNumber} - ${item.name}`,
          recorded,
          expected,
          variance: round2(recorded - expected),
          detail:
            recorded > received + 0.001
              ? "Allocated quantity exceeds received quantity."
              : "PO allocated quantity differs from allocation records.",
        });
      }
    }
  }

  return issues;
}
