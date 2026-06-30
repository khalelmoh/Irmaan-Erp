import type {
  Customer,
  Supplier,
  Product,
  SalesOrder,
  DeliveryOrder,
  PurchaseOrder,
  POAllocation,
  Invoice,
  Payment,
  SupplierPayment,
  StockMovement,
  ActivityLog,
  User,
} from "@/types";

export type Listable<T> = {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  create(input: Omit<T, "id" | "createdAt" | "updatedAt">): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
};

export type ListPageCursor = unknown;

export interface ListPageOptions<TStatus extends string = string> {
  pageSize: number;
  cursor?: ListPageCursor | null;
  status?: TStatus | "all";
  search?: string;
}

export interface ListPageResult<T> {
  items: T[];
  nextCursor: ListPageCursor | null;
  hasMore: boolean;
}

export type Pageable<T, TStatus extends string = string> = {
  listPage(options: ListPageOptions<TStatus>): Promise<ListPageResult<T>>;
};

// ─── Company Settings ───────────────────────────────────────────────────────
export interface CompanySettings {
  companyName: string;
  logo?: string;             // base64 or URL
  address: string;
  phone: string;
  email: string;
  taxId?: string;
  currency: string;          // "USD", "KES", etc.
  currencySymbol: string;    // "$", "KSh", etc.
  defaultTaxRate: number;
  defaultPaymentTerms: number; // days
  invoiceFooter?: string;    // bank details, terms & conditions
}

export type VerificationResult =
  | { kind: "so"; doc: SalesOrder }
  | { kind: "do"; doc: DeliveryOrder }
  | { kind: "invoice"; doc: Invoice }
  | { kind: "po"; doc: PurchaseOrder };

export interface DataAdapter {
  // auth
  signIn(email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  currentUser(): Promise<User | null>;
  /** Sends a password reset email (Firebase) or stub-resets in mock. */
  requestPasswordReset(email: string): Promise<void>;
  verification: {
    get(id: string): Promise<VerificationResult | null>;
  };

  // company settings
  settings: {
    get(): Promise<CompanySettings>;
    update(patch: Partial<CompanySettings>): Promise<CompanySettings>;
  };

  // domain
  customers: Listable<Customer>;
  suppliers: Listable<Supplier>;
  products: Listable<Product>;
  salesOrders: Listable<SalesOrder> & {
    nextNumber(): Promise<string>;
    /** Confirm a quotation → status becomes "confirmed". */
    confirm(soId: string): Promise<SalesOrder>;
    /** Update delivered quantities when a DO is created/delivered from this SO. */
    updateDeliveredQty(
      soId: string,
      items: Array<{ productId: string; quantity: number }>,
    ): Promise<SalesOrder>;
    /** Update invoiced quantities when an invoice is created from this SO. */
    updateInvoicedQty(
      soId: string,
      items: Array<{ productId: string; quantity: number }>,
    ): Promise<SalesOrder>;
  };
  deliveryOrders: Listable<DeliveryOrder> & Pageable<DeliveryOrder, DeliveryOrder["status"]> & {
    nextNumber(): Promise<string>;
  };
  purchaseOrders: Listable<PurchaseOrder> & Pageable<PurchaseOrder, PurchaseOrder["status"] | "pending_receipt"> & {
    nextNumber(): Promise<string>;
    requestApproval(poId: string): Promise<PurchaseOrder>;
    decideApproval(
      poId: string,
      decision: "approved" | "rejected",
      reason?: string,
    ): Promise<PurchaseOrder>;
    /** Receive all remaining items; updates stock + status + receivedAt. */
    markFullyReceived(poId: string, receivedBy: string): Promise<PurchaseOrder>;
    /** Receive a partial quantity per item; updates stock proportionally. */
    receiveItems(
      poId: string,
      receipts: Array<{ productId: string; quantity: number }>,
      receivedBy: string,
    ): Promise<PurchaseOrder>;
    /** Record a payment to the supplier for this PO. */
    recordPayment(
      poId: string,
      payment: Omit<SupplierPayment, "id" | "purchaseOrderId" | "poNumber" | "supplierId" | "createdAt">,
    ): Promise<{ po: PurchaseOrder; payment: SupplierPayment }>;
    payments(poId: string): Promise<SupplierPayment[]>;
    /** Get remaining allocatable qty per product across all received POs (FIFO-ordered). */
    availableStock(productId: string): Promise<Array<{
      poId: string;
      poNumber: string;
      orderDate: string;
      remaining: number;  // receivedQty − allocatedQty
    }>>;
  };
  poAllocations: {
    list(): Promise<POAllocation[]>;
    byDeliveryOrder(doId: string): Promise<POAllocation[]>;
    byPurchaseOrder(poId: string): Promise<POAllocation[]>;
  };
  invoices: Listable<Invoice> & Pageable<Invoice, Invoice["status"]> & {
    nextNumber(): Promise<string>;
    recordPayment(
      invoiceId: string,
      payment: Omit<Payment, "id" | "invoiceId" | "invoiceNumber" | "customerId" | "createdAt">,
    ): Promise<{ invoice: Invoice; payment: Payment }>;
    payments(invoiceId: string): Promise<Payment[]>;
  };
  payments: {
    list(): Promise<Payment[]>;
    byCustomer(customerId: string): Promise<Payment[]>;
  };
  supplierPayments: {
    list(): Promise<SupplierPayment[]>;
    bySupplier(supplierId: string): Promise<SupplierPayment[]>;
  };
  stockMovements: {
    list(): Promise<StockMovement[]>;
    byProduct(productId: string): Promise<StockMovement[]>;
    /** Manual adjustment (+ or − qty). Atomically updates product stock. */
    adjust(
      productId: string,
      qty: number,
      reason: string,
      recordedBy: string,
    ): Promise<{ product: Product; movement: StockMovement }>;
  };
  activityLog: {
    list(filter?: { actorUid?: string; entityType?: string; limit?: number }): Promise<ActivityLog[]>;
    byEntity(entityType: string, entityId: string): Promise<ActivityLog[]>;
    /** Append an entry. Caller (UI or service layer) creates these for all important actions. */
    log(entry: Omit<ActivityLog, "id" | "at">): Promise<ActivityLog>;
  };
  users: {
    list(): Promise<User[]>;
    get(uid: string): Promise<User | null>;
    /** Invite a new user. Mock creates locally; Firebase creates an Auth account + Firestore profile + sends reset email. */
    invite(input: { email: string; displayName: string; role: User["role"] }): Promise<User>;
    update(uid: string, patch: Partial<Pick<User, "displayName" | "role" | "active">>): Promise<User>;
  };
}
