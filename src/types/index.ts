// ─── Domain types ────────────────────────────────────────────────────────────

export type Role = "admin" | "manager" | "sales" | "warehouse";

export interface User {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  active: boolean;
  createdAt: string; // ISO
}

export interface Customer {
  id: string;
  code: string;            // CUST-0001
  name: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  address: string;
  city?: string;
  country?: string;
  taxId?: string;
  balance: number;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  code: string;            // SUP-0001
  name: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  address: string;
  city?: string;
  country?: string;
  taxId?: string;
  balance: number;         // outstanding A/P
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ProductUnit = "Bag" | "Box" | "Pcs" | "Ton" | "Liter" | "Kg" | "Meter";

export interface Product {
  id: string;
  sku: string;             // PRD-0001
  name: string;
  description?: string;
  unit: ProductUnit;
  unitPrice: number;
  cost?: number;
  stock: number;
  reorderLevel?: number;
  category?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DOItem {
  productId: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
}

// ─── Sales Orders ─────────────────────────────────────────────────────────
export type SOStatus = "quotation" | "confirmed" | "fully_delivered" | "invoiced" | "cancelled";

export interface SOItem {
  productId: string;
  name: string;              // snapshot
  quantity: number;
  deliveredQty: number;      // running total delivered via DOs
  invoicedQty: number;       // running total invoiced
  unit: string;
  unitPrice: number;
  lineTotal: number;
}

export interface SalesOrder {
  id: string;
  soNumber: string;          // SO-00001
  customerId: string;
  customerSnapshot: { name: string; address: string; phone: string };
  salespersonId: string;
  salespersonName: string;
  orderDate: string;         // ISO date
  validUntil?: string;       // quotation expiry
  items: SOItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  status: SOStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface LoadingDetails {
  driverName: string;
  mobile: string;
  truckPlate: string;
  owner: string;
  destination: string;
}

export type DOStatus = "draft" | "issued" | "delivered" | "cancelled";

export interface DeliveryOrder {
  id: string;
  doNumber: string;        // DO-00001
  customerId: string;
  customerSnapshot: { name: string; address: string; phone: string };
  salespersonId: string;
  salespersonName: string;
  orderDate: string;       // ISO date
  items: DOItem[];
  loadingDetails: LoadingDetails;
  status: DOStatus;
  authorizedBy?: string;
  invoiceId?: string;
  salesOrderId?: string;   // link back to parent SO
  allocations?: POAllocation[];  // PO allocation breakdown (FIFO)
  qrPayload: string;       // URL the QR encodes
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type POStatus = "draft" | "sent" | "partial_received" | "received" | "cancelled";
export type ApprovalStatus = "not_requested" | "pending" | "approved" | "rejected";

export interface POItem {
  productId: string;
  name: string;             // snapshot
  quantity: number;         // ordered
  receivedQty?: number;     // running total received (server-managed)
  allocatedQty?: number;    // running total allocated to DOs (server-managed)
  unit: string;
  unitPrice: number;
  lineTotal: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierSnapshot: { name: string; address: string; phone: string };
  orderDate: string;
  expectedDelivery?: string;
  items: POItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  amountPaid: number;       // A/P tracking
  status: POStatus;
  approvalStatus?: ApprovalStatus;
  approvalRequestedBy?: string;
  approvalRequestedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  receivedAt?: string;      // when fully received
  notes?: string;
  qrPayload: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/** Tracks how much of a DO line item was sourced from a specific PO (FIFO allocation). */
export interface POAllocation {
  id: string;
  deliveryOrderId: string;
  doNumber: string;
  purchaseOrderId: string;
  poNumber: string;
  productId: string;
  productName: string;       // snapshot
  quantity: number;           // how many units from this PO
  allocatedAt: string;        // ISO timestamp
  allocatedBy: string;
}

export interface SupplierPayment {
  id: string;
  purchaseOrderId: string;
  poNumber: string;
  supplierId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  paidAt: string;
  recordedBy: string;
  notes?: string;
  createdAt: string;
}

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "partial"
  | "paid"
  | "overdue"
  | "cancelled";

export type InvoiceType = "invoice" | "credit_note";

export interface InvoiceItem extends DOItem {
  unitPrice: number;
  lineTotal: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  type: InvoiceType;         // "invoice" or "credit_note"
  customerId: string;
  customerSnapshot: { name: string; address: string; phone: string };
  doIds: string[];
  salesOrderId?: string;     // link back to parent SO
  originalInvoiceId?: string; // for credit notes: the invoice being credited
  issueDate: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  status: InvoiceStatus;
  approvalStatus?: ApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentMethod = "cash" | "bank" | "mobile_money" | "cheque";

// ─── Stock Movements ───────────────────────────────────────────────────────
export type StockMovementKind =
  | "po_receipt"        // PO line received → stock IN
  | "po_receipt_reverse"// edge case: PO line returned/cancelled
  | "do_issue"          // DO issued → stock OUT
  | "do_cancel"         // DO cancelled → stock returned IN
  | "adjustment_in"     // manual adjustment, +
  | "adjustment_out"    // manual adjustment, −
  | "opening_balance";  // seed / initial stock

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;   // snapshot for history accuracy
  unit: string;
  qty: number;           // positive for IN, negative for OUT
  kind: StockMovementKind;
  reason?: string;       // user-entered for adjustments
  // Link back to source document
  sourceType?: "purchase_order" | "delivery_order" | "adjustment";
  sourceId?: string;
  sourceNumber?: string; // e.g. "PO-00001"
  // Snapshot of stock AFTER this movement
  balanceAfter: number;
  recordedBy: string;
  at: string;            // ISO timestamp
}

// ─── Activity log ─────────────────────────────────────────────────────────
export type ActivityAction =
  // Auth
  | "auth.login" | "auth.logout" | "auth.password_reset_requested"
  // Customers / Suppliers / Products
  | "customer.create" | "customer.update"
  | "supplier.create" | "supplier.update"
  | "product.create" | "product.update"
  // Sales Orders
  | "so.create" | "so.update" | "so.confirm" | "so.cancel"
  // Delivery Orders
  | "do.create" | "do.update" | "do.cancel" | "do.issue" | "do.mark_delivered"
  // Purchase Orders
  | "po.create" | "po.update" | "po.confirm" | "po.cancel" | "po.receive" | "po.payment"
  | "po.approval_requested" | "po.approved" | "po.rejected"
  // Invoices
  | "invoice.create" | "invoice.update" | "invoice.cancel" | "invoice.send" | "invoice.payment" | "credit_note.create"
  // Stock
  | "stock.adjust";

export type EntityType =
  | "user" | "customer" | "supplier" | "product"
  | "sales_order" | "delivery_order" | "purchase_order" | "invoice" | "credit_note"
  | "payment" | "supplier_payment" | "stock_movement";

export interface ActivityLog {
  id: string;
  at: string;                       // ISO timestamp
  actorUid: string;
  actorName: string;                // snapshot for display when user is deleted
  action: ActivityAction;
  entityType: EntityType;
  entityId: string;
  entityLabel: string;              // human-readable: "DO-00001", "Berbera Construction Ltd"
  summary: string;                  // one-line description: "Issued DO-00001 to Berbera Construction Ltd ($5,400)"
  diff?: Record<string, { from?: unknown; to?: unknown }>;  // optional before/after for important changes
  metadata?: Record<string, unknown>;
}

export interface Payment {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  paidAt: string;       // ISO
  recordedBy: string;
  notes?: string;
  createdAt: string;
}
