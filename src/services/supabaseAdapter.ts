import { getSupabase } from "@/lib/supabase";
import type {
  ActivityLog,
  Customer,
  DeliveryOrder,
  Invoice,
  Payment,
  POAllocation,
  Product,
  PurchaseOrder,
  SalesOrder,
  StockMovement,
  Supplier,
  SupplierPayment,
  User,
} from "@/types";
import type {
  CompanySettings,
  DataAdapter,
  Listable,
  VerificationResult,
} from "./types";

const DEFAULT_SUPABASE_SETTINGS: CompanySettings = {
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

type JsonRecord = Record<string, unknown>;

type JsonRow = {
  id: string;
  document: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
};

type UserRow = {
  uid: string;
  email: string;
  display_name: string;
  role: User["role"];
  active: boolean;
  created_at: string | null;
};

type StockAdjustmentResult = {
  productId: string;
  movementId: string;
};

function migrationPending(feature: string): never {
  throw new Error(
    `${feature} is not migrated to Supabase yet. This workflow needs a Supabase RPC/Postgres function before it can replace the Firebase transaction safely.`,
  );
}

async function migrationPendingAsync<T>(feature: string): Promise<T> {
  migrationPending(feature);
}

function rowToDocument<T extends { id: string }>(row: JsonRow): T {
  const document = (row.document ?? {}) as JsonRecord;
  return ({
    id: row.id,
    ...document,
    createdAt: typeof document.createdAt === "string" ? document.createdAt : row.created_at ?? "",
    updatedAt: typeof document.updatedAt === "string" ? document.updatedAt : row.updated_at ?? "",
  } as unknown) as T;
}

function userRowToUser(row: UserRow): User {
  return {
    uid: row.uid,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    active: row.active,
    createdAt: row.created_at ?? "",
  };
}

function jsonCrud<T extends { id: string }>(table: string): Listable<T> {
  return {
    async list() {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from(table)
        .select("id, document, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return ((data ?? []) as JsonRow[]).map(rowToDocument<T>);
    },
    async get(id) {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from(table)
        .select("id, document, created_at, updated_at")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      return data ? rowToDocument<T>(data as JsonRow) : null;
    },
    async create(input) {
      const supabase = getSupabase();
      const now = new Date().toISOString();
      const document = {
        ...(input as JsonRecord),
        createdAt: now,
        updatedAt: now,
      };
      const { data, error } = await supabase
        .from(table)
        .insert({ document })
        .select("id, document, created_at, updated_at")
        .single();

      if (error) throw error;
      return rowToDocument<T>(data as JsonRow);
    },
    async update(id, patch) {
      const supabase = getSupabase();
      const current = await this.get(id);
      if (!current) throw new Error("Record not found");

      const now = new Date().toISOString();
      const document = {
        ...(current as unknown as JsonRecord),
        ...(patch as JsonRecord),
        id: undefined,
        updatedAt: now,
      };
      delete document.id;

      const { data, error } = await supabase
        .from(table)
        .update({ document })
        .eq("id", id)
        .select("id, document, created_at, updated_at")
        .single();

      if (error) throw error;
      return rowToDocument<T>(data as JsonRow);
    },
    async remove(id) {
      const supabase = getSupabase();
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
  };
}

function unavailableListable<T extends { id: string }>(feature: string): Listable<T> {
  return {
    list: () => migrationPendingAsync<T[]>(feature),
    get: () => migrationPendingAsync<T | null>(feature),
    create: () => migrationPendingAsync<T>(feature),
    update: () => migrationPendingAsync<T>(feature),
    remove: () => migrationPendingAsync<void>(feature),
  };
}

const customers = jsonCrud<Customer>("customers");
const suppliers = jsonCrud<Supplier>("suppliers");
const products = jsonCrud<Product>("products");
const salesOrders = jsonCrud<SalesOrder>("sales_orders");
const deliveryOrders = jsonCrud<DeliveryOrder>("delivery_orders");
const purchaseOrders = jsonCrud<PurchaseOrder>("purchase_orders");
const invoices = jsonCrud<Invoice>("invoices");
const payments = jsonCrud<Payment>("payments");
const stockMovements = jsonCrud<StockMovement>("stock_movements");
const poAllocations = jsonCrud<POAllocation>("po_allocations");
const supplierPayments = jsonCrud<SupplierPayment>("supplier_payments");

export const supabaseAdapter: DataAdapter = {
  async signIn(email, password) {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const uid = data.user?.id;
    if (!uid) throw new Error("Supabase did not return an authenticated user");

    const user = await supabaseAdapter.users.get(uid);
    if (!user) throw new Error("Your account exists, but no ERP user profile was found");
    if (!user.active) throw new Error("This ERP user account is inactive");
    return user;
  },
  async signOut() {
    const { error } = await getSupabase().auth.signOut();
    if (error) throw error;
  },
  async currentUser() {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    const user = await supabaseAdapter.users.get(data.user.id);
    return user?.active ? user : null;
  },
  async requestPasswordReset(email) {
    const redirectTo =
      typeof window === "undefined" ? undefined : `${window.location.origin}/reset-password`;
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  },
  verification: {
    async get(id) {
      const { data, error } = await getSupabase().rpc("verify_document", {
        p_id: id,
      });
      if (error) throw error;
      return data as VerificationResult | null;
    },
  },
  settings: {
    async get() {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("company_settings")
        .select("document")
        .eq("id", "default")
        .maybeSingle();

      if (error) throw error;
      return {
        ...DEFAULT_SUPABASE_SETTINGS,
        ...((data?.document as JsonRecord | null) ?? {}),
      };
    },
    async update(patch) {
      const supabase = getSupabase();
      const next = { ...(await this.get()), ...patch };
      const { data, error } = await supabase
        .from("company_settings")
        .upsert({ id: "default", document: next, updated_at: new Date().toISOString() })
        .select("document")
        .single();

      if (error) throw error;
      return {
        ...DEFAULT_SUPABASE_SETTINGS,
        ...((data.document as JsonRecord | null) ?? {}),
      };
    },
  },
  customers,
  suppliers,
  products,
  salesOrders: {
    list: salesOrders.list,
    get: salesOrders.get,
    async create(input) {
      const { data, error } = await getSupabase().rpc("create_sales_order", {
        p_document: input as JsonRecord,
      });
      if (error) throw error;
      const created = await salesOrders.get(data as string);
      if (!created) throw new Error("Sales order was not created");
      return created;
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

      const { error } = await getSupabase().rpc("transition_sales_order", {
        p_id: id,
        p_status: status,
      });
      if (error) throw error;

      const updated = await salesOrders.get(id);
      if (!updated) throw new Error("Sales order not found");
      return updated;
    },
    remove: () => migrationPendingAsync("Sales order deletion"),
    async nextNumber() {
      const { data, error } = await getSupabase().rpc("preview_document_number", {
        p_name: "sales_orders",
        p_prefix: "SO",
        p_width: 5,
      });
      if (error) throw error;
      return data as string;
    },
    async confirm(soId) {
      return supabaseAdapter.salesOrders.update(soId, { status: "confirmed" });
    },
    updateDeliveredQty: () => migrationPendingAsync("Sales order delivery totals"),
    updateInvoicedQty: () => migrationPendingAsync("Sales order invoice totals"),
  },
  deliveryOrders: {
    list: deliveryOrders.list,
    get: deliveryOrders.get,
    async create(input) {
      const { data, error } = await getSupabase().rpc("create_delivery_order", {
        p_document: input as JsonRecord,
      });
      if (error) throw error;
      const created = await deliveryOrders.get(data as string);
      if (!created) throw new Error("Delivery order was not created");
      return created;
    },
    async update(id, patch) {
      const keys = Object.keys(patch).filter((key) => key !== "id");
      const isStatusOnly = keys.length === 1 && keys[0] === "status";
      const operation = isStatusOnly ? "transition_delivery_order" : "update_delivery_order";
      const payload = isStatusOnly
        ? { p_id: id, p_status: patch.status }
        : { p_id: id, p_document: patch as JsonRecord };

      const { error } = await getSupabase().rpc(operation, payload);
      if (error) throw error;

      const updated = await deliveryOrders.get(id);
      if (!updated) throw new Error("Delivery order not found");
      return updated;
    },
    remove: () => migrationPendingAsync("Delivery order deletion"),
    async nextNumber() {
      const { data, error } = await getSupabase().rpc("preview_document_number", {
        p_name: "delivery_orders",
        p_prefix: "DO",
        p_width: 5,
      });
      if (error) throw error;
      return data as string;
    },
  },
  purchaseOrders: {
    list: purchaseOrders.list,
    get: purchaseOrders.get,
    async create(input) {
      const { data, error } = await getSupabase().rpc("create_purchase_order", {
        p_document: input as JsonRecord,
      });
      if (error) throw error;
      const created = await purchaseOrders.get(data as string);
      if (!created) throw new Error("Purchase order was not created");
      return created;
    },
    async update(id, patch) {
      const keys = Object.keys(patch).filter((key) => key !== "id");
      const isStatusOnly = keys.length === 1 && keys[0] === "status";
      const status = patch.status;

      if (isStatusOnly && (status === "sent" || status === "cancelled")) {
        const { error } = await getSupabase().rpc("transition_purchase_order", {
          p_id: id,
          p_status: status,
        });
        if (error) throw error;
      } else {
        const { error } = await getSupabase().rpc("update_purchase_order", {
          p_id: id,
          p_document: patch as JsonRecord,
        });
        if (error) throw error;
      }

      const updated = await purchaseOrders.get(id);
      if (!updated) throw new Error("Purchase order not found");
      return updated;
    },
    remove: () => migrationPendingAsync("Purchase order deletion"),
    async nextNumber() {
      const { data, error } = await getSupabase().rpc("preview_document_number", {
        p_name: "purchase_orders",
        p_prefix: "PO",
        p_width: 5,
      });
      if (error) throw error;
      return data as string;
    },
    async requestApproval(poId) {
      const { error } = await getSupabase().rpc("request_purchase_order_approval", {
        p_id: poId,
      });
      if (error) throw error;
      const updated = await purchaseOrders.get(poId);
      if (!updated) throw new Error("Purchase order not found");
      return updated;
    },
    async decideApproval(poId, decision, reason) {
      const { error } = await getSupabase().rpc("decide_purchase_order_approval", {
        p_id: poId,
        p_decision: decision,
        p_reason: reason ?? null,
      });
      if (error) throw error;
      const updated = await purchaseOrders.get(poId);
      if (!updated) throw new Error("Purchase order not found");
      return updated;
    },
    async markFullyReceived(poId, receivedBy) {
      const po = await purchaseOrders.get(poId);
      if (!po) throw new Error("Purchase order not found");
      const receipts = po.items
        .map((item) => ({
          productId: item.productId,
          quantity: item.quantity - (item.receivedQty ?? 0),
        }))
        .filter((receipt) => receipt.quantity > 0.001);
      if (receipts.length === 0) return po;
      return supabaseAdapter.purchaseOrders.receiveItems(poId, receipts, receivedBy);
    },
    async receiveItems(poId, receipts, _receivedBy) {
      const { error } = await getSupabase().rpc("receive_purchase_order", {
        p_purchase_order_id: poId,
        p_receipts: receipts,
      });
      if (error) throw error;
      const updated = await purchaseOrders.get(poId);
      if (!updated) throw new Error("Purchase order not found");
      return updated;
    },
    async recordPayment(poId, payment) {
      const { data, error } = await getSupabase().rpc("record_supplier_payment", {
        p_purchase_order_id: poId,
        p_payment: payment as JsonRecord,
      });
      if (error) throw error;

      const [po, savedPayment] = await Promise.all([
        purchaseOrders.get(poId),
        supplierPayments.get(data as string),
      ]);
      if (!po || !savedPayment) throw new Error("Supplier payment was not committed");
      return { po, payment: savedPayment };
    },
    async payments(poId) {
      const { data, error } = await getSupabase()
        .from("supplier_payments")
        .select("id, document, created_at, updated_at")
        .eq("document->>purchaseOrderId", poId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as JsonRow[]).map(rowToDocument<SupplierPayment>);
    },
    async availableStock(productId) {
      const { data, error } = await getSupabase().rpc("available_po_stock", {
        p_product_id: productId,
      });
      if (error) throw error;
      return ((data ?? []) as Array<{
        po_id: string;
        po_number: string;
        order_date: string;
        remaining: number;
      }>).map((row) => ({
        poId: row.po_id,
        poNumber: row.po_number,
        orderDate: row.order_date,
        remaining: row.remaining,
      }));
    },
  },
  poAllocations: {
    list: poAllocations.list,
    async byDeliveryOrder(doId) {
      const { data, error } = await getSupabase()
        .from("po_allocations")
        .select("id, document, created_at, updated_at")
        .eq("document->>deliveryOrderId", doId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as JsonRow[]).map(rowToDocument<POAllocation>);
    },
    async byPurchaseOrder(poId) {
      const { data, error } = await getSupabase()
        .from("po_allocations")
        .select("id, document, created_at, updated_at")
        .eq("document->>purchaseOrderId", poId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as JsonRow[]).map(rowToDocument<POAllocation>);
    },
  },
  invoices: {
    list: invoices.list,
    get: invoices.get,
    async create(input) {
      const { data, error } = await getSupabase().rpc("create_invoice", {
        p_document: input as JsonRecord,
      });
      if (error) throw error;
      const created = await invoices.get(data as string);
      if (!created) throw new Error("Invoice was not created");
      return created;
    },
    async update(id, patch) {
      const keys = Object.keys(patch).filter((key) => key !== "id");
      const isStatusOnly = keys.length === 1 && keys[0] === "status";
      const status = patch.status;

      if (isStatusOnly && (status === "sent" || status === "cancelled")) {
        const { error } = await getSupabase().rpc("transition_invoice", {
          p_id: id,
          p_status: status,
        });
        if (error) throw error;
      } else {
        const { error } = await getSupabase().rpc("update_invoice", {
          p_id: id,
          p_document: patch as JsonRecord,
        });
        if (error) throw error;
      }

      const updated = await invoices.get(id);
      if (!updated) throw new Error("Invoice not found");
      return updated;
    },
    remove: () => migrationPendingAsync("Invoice deletion"),
    async nextNumber() {
      const { data, error } = await getSupabase().rpc("preview_document_number", {
        p_name: "invoices",
        p_prefix: "INV",
        p_width: 5,
      });
      if (error) throw error;
      return data as string;
    },
    async recordPayment(invoiceId, payment) {
      const { data, error } = await getSupabase().rpc("record_invoice_payment", {
        p_invoice_id: invoiceId,
        p_payment: payment as JsonRecord,
      });
      if (error) throw error;
      const [invoice, savedPayment] = await Promise.all([
        invoices.get(invoiceId),
        payments.get(data as string),
      ]);
      if (!invoice || !savedPayment) throw new Error("Invoice payment was not committed");
      return { invoice, payment: savedPayment };
    },
    async payments(invoiceId) {
      const { data, error } = await getSupabase()
        .from("payments")
        .select("id, document, created_at, updated_at")
        .eq("document->>invoiceId", invoiceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as JsonRow[]).map(rowToDocument<Payment>);
    },
  },
  payments: {
    list: payments.list,
    async byCustomer(customerId) {
      const { data, error } = await getSupabase()
        .from("payments")
        .select("id, document, created_at, updated_at")
        .eq("document->>customerId", customerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as JsonRow[]).map(rowToDocument<Payment>);
    },
  },
  supplierPayments: {
    list: supplierPayments.list,
    async bySupplier(supplierId) {
      const { data, error } = await getSupabase()
        .from("supplier_payments")
        .select("id, document, created_at, updated_at")
        .eq("document->>supplierId", supplierId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as JsonRow[]).map(rowToDocument<SupplierPayment>);
    },
  },
  stockMovements: {
    list: stockMovements.list,
    async byProduct(productId) {
      const { data, error } = await getSupabase()
        .from("stock_movements")
        .select("id, document, created_at, updated_at")
        .eq("document->>productId", productId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as JsonRow[]).map(rowToDocument<StockMovement>);
    },
    async adjust(productId, qty, reason, _recordedBy) {
      const { data, error } = await getSupabase().rpc("adjust_stock", {
        p_product_id: productId,
        p_quantity: qty,
        p_reason: reason,
      });
      if (error) throw error;

      const result = data as StockAdjustmentResult | null;
      if (!result) throw new Error("Stock adjustment was not committed");

      const [product, movement] = await Promise.all([
        products.get(result.productId),
        stockMovements.get(result.movementId),
      ]);
      if (!product || !movement) throw new Error("Stock adjustment was not committed");
      return { product, movement };
    },
  },
  activityLog: {
    async list(filter) {
      const supabase = getSupabase();
      let query = supabase
        .from("activity_logs")
        .select("id, document, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(filter?.limit ?? 250);

      if (filter?.actorUid) query = query.eq("document->>actorUid", filter.actorUid);
      if (filter?.entityType) query = query.eq("document->>entityType", filter.entityType);

      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as JsonRow[]).map(rowToDocument<ActivityLog>);
    },
    async byEntity(entityType, entityId) {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("activity_logs")
        .select("id, document, created_at, updated_at")
        .eq("document->>entityType", entityType)
        .eq("document->>entityId", entityId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return ((data ?? []) as JsonRow[]).map(rowToDocument<ActivityLog>);
    },
    async log(entry) {
      const supabase = getSupabase();
      const document = { ...entry, at: new Date().toISOString() };
      const { data, error } = await supabase
        .from("activity_logs")
        .insert({ document })
        .select("id, document, created_at, updated_at")
        .single();

      if (error) throw error;
      return rowToDocument<ActivityLog>(data as JsonRow);
    },
  },
  users: {
    async list() {
      const { data, error } = await getSupabase()
        .from("users")
        .select("uid, email, display_name, role, active, created_at")
        .order("display_name", { ascending: true });

      if (error) throw error;
      return ((data ?? []) as UserRow[]).map(userRowToUser);
    },
    async get(uid) {
      const { data, error } = await getSupabase()
        .from("users")
        .select("uid, email, display_name, role, active, created_at")
        .eq("uid", uid)
        .maybeSingle();

      if (error) throw error;
      return data ? userRowToUser(data as UserRow) : null;
    },
    async invite(input) {
      const supabase = getSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sign in required");

      const response = await fetch("/api/supabase/invite-user", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      const payload = await response.json().catch(() => null) as {
        data?: User;
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Unable to invite user");
      }
      if (!payload?.data) throw new Error("User profile was not created");
      return payload.data;
    },
    async update(uid, patch) {
      const body: Partial<UserRow> = {};
      if (patch.displayName !== undefined) body.display_name = patch.displayName;
      if (patch.role !== undefined) body.role = patch.role;
      if (patch.active !== undefined) body.active = patch.active;

      const { data, error } = await getSupabase()
        .from("users")
        .update(body)
        .eq("uid", uid)
        .select("uid, email, display_name, role, active, created_at")
        .single();

      if (error) throw error;
      return userRowToUser(data as UserRow);
    },
  },
};
