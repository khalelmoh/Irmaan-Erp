import { z } from "zod";

export const customerSchema = z.object({
  name: z.string().min(2, "Name is required"),
  contactPerson: z.string().optional(),
  phone: z.string().min(5, "Phone is required"),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().min(2, "Address is required"),
  city: z.string().optional(),
  country: z.string().optional(),
  taxId: z.string().optional(),
  notes: z.string().optional(),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const productSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  unit: z.enum(["Bag", "Box", "Pcs", "Ton", "Liter", "Kg", "Meter"]),
  unitPrice: z.coerce.number().min(0),
  cost: z.coerce.number().min(0).optional(),
  stock: z.coerce.number().min(0),
  reorderLevel: z.coerce.number().min(0).optional(),
  category: z.string().optional(),
});
export type ProductInput = z.infer<typeof productSchema>;

export const doItemSchema = z.object({
  productId: z.string().min(1, "Pick a product"),
  name: z.string(),
  quantity: z.coerce.number().min(0.01, "Qty > 0"),
  unit: z.string(),
  unitPrice: z.coerce.number().min(0).optional(),
});

export const deliveryOrderSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  salesOrderId: z.string().optional(),
  salespersonName: z.string().min(1),
  orderDate: z.string().min(1),
  items: z.array(doItemSchema).min(1, "Add at least one item"),
  loadingDetails: z.object({
    driverName: z.string().min(1, "Driver name required"),
    mobile: z.string().min(5, "Driver mobile required"),
    truckPlate: z.string().min(1, "Truck plate required"),
    owner: z.string().min(1, "Owner required"),
    destination: z.string().min(1, "Destination required"),
  }),
  authorizedBy: z.string().optional(),
  notes: z.string().optional(),
});
export type DeliveryOrderInput = z.infer<typeof deliveryOrderSchema>;

// ─── Invoice ────────────────────────────────────────────────────────────────
export const invoiceItemSchema = z.object({
  productId: z.string(),
  name: z.string().min(1),
  quantity: z.coerce.number().min(0.01, "Qty > 0"),
  unit: z.string(),
  unitPrice: z.coerce.number().min(0, "Price >= 0"),
});

export const invoiceSchema = z.object({
  customerId: z.string().min(1, "Customer required"),
  doIds: z.array(z.string()).default([]),
  salesOrderId: z.string().optional(),
  type: z.enum(["invoice", "credit_note"]).optional(),
  originalInvoiceId: z.string().optional(),
  issueDate: z.string().min(1),
  dueDate: z.string().min(1),
  items: z.array(invoiceItemSchema).min(1, "Add at least one item"),
  taxRate: z.coerce.number().min(0).max(1, "Rate is 0-1 (e.g. 0.05 = 5%)"),
  notes: z.string().optional(),
});
export type InvoiceInput = z.infer<typeof invoiceSchema>;

// ─── Supplier ───────────────────────────────────────────────────────────────
export const supplierSchema = z.object({
  name: z.string().min(2, "Name is required"),
  contactPerson: z.string().optional(),
  phone: z.string().min(5, "Phone is required"),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().min(2, "Address is required"),
  city: z.string().optional(),
  country: z.string().optional(),
  taxId: z.string().optional(),
  notes: z.string().optional(),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

// ─── Purchase Order ─────────────────────────────────────────────────────────
export const poItemSchema = z.object({
  productId: z.string().min(1, "Pick a product"),
  name: z.string(),
  quantity: z.coerce.number().min(0.01, "Qty > 0"),
  unit: z.string(),
  unitPrice: z.coerce.number().min(0, "Price >= 0"),
});

export const purchaseOrderSchema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  orderDate: z.string().min(1),
  expectedDelivery: z.string().optional().or(z.literal("")),
  items: z.array(poItemSchema).min(1, "Add at least one item"),
  taxRate: z.coerce.number().min(0).max(1, "Rate is 0-1 (e.g. 0.05 = 5%)"),
  notes: z.string().optional(),
});
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

// ─── Payment ────────────────────────────────────────────────────────────────
export const paymentSchema = z.object({
  amount: z.coerce.number().positive("Amount must be positive"),
  method: z.enum(["cash", "bank", "mobile_money", "cheque"]),
  reference: z.string().optional(),
  paidAt: z.string().min(1),
  notes: z.string().optional(),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

// ─── Stock adjustment ─────────────────────────────────────────────────────
export const stockAdjustmentSchema = z.object({
  qty: z.coerce.number().refine((v) => v !== 0, "Quantity cannot be zero"),
  reason: z.string().min(2, "Reason is required"),
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

// ─── Sales Order ────────────────────────────────────────────────────────────
export const soItemSchema = z.object({
  productId: z.string().min(1, "Pick a product"),
  name: z.string(),
  quantity: z.coerce.number().min(0.01, "Qty > 0"),
  unit: z.string(),
  unitPrice: z.coerce.number().min(0, "Price >= 0"),
});

export const salesOrderSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  salespersonName: z.string().min(1),
  orderDate: z.string().min(1),
  validUntil: z.string().optional().or(z.literal("")),
  items: z.array(soItemSchema).min(1, "Add at least one item"),
  taxRate: z.coerce.number().min(0).max(1, "Rate is 0-1 (e.g. 0.05 = 5%)"),
  notes: z.string().optional(),
});
export type SalesOrderInput = z.infer<typeof salesOrderSchema>;
