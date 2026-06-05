import type { Customer, Product, DeliveryOrder, Invoice, Payment, User, SalesOrder } from "@/types";

const now = new Date().toISOString();

export const seedUsers: User[] = [
  {
    uid: "u_admin",
    email: "admin@irmaan.co",
    displayName: "Amina Yusuf",
    role: "admin",
    active: true,
    createdAt: now,
  },
  {
    uid: "u_sales",
    email: "sales@irmaan.co",
    displayName: "Hassan Omar",
    role: "sales",
    active: true,
    createdAt: now,
  },
];

export const seedCustomers: Customer[] = [
  {
    id: "c1",
    code: "CUST-0001",
    name: "Berbera Construction Ltd",
    contactPerson: "Mohamed Ali",
    phone: "+252 63 4 100 200",
    email: "info@berberaconstr.co",
    address: "Port Road, Berbera",
    city: "Berbera",
    country: "Somalia",
    taxId: "BC-119",
    balance: 12400,
    notes: "",
    active: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "c2",
    code: "CUST-0002",
    name: "Arabsiyo Trading Co.",
    contactPerson: "Layla Farah",
    phone: "+252 63 4 555 100",
    email: "ops@arabsiyo.com",
    address: "Main Bazaar, Arabsiyo",
    city: "Arabsiyo",
    country: "Somalia",
    taxId: "AT-321",
    balance: 0,
    notes: "",
    active: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "c3",
    code: "CUST-0003",
    name: "Hargeisa Builders Plc",
    contactPerson: "Ibrahim Sheikh",
    phone: "+252 63 4 778 991",
    email: "purchase@hgbuilders.com",
    address: "26 June Ave, Hargeisa",
    city: "Hargeisa",
    country: "Somalia",
    taxId: "HB-902",
    balance: 4250,
    notes: "Net-30 terms",
    active: true,
    createdAt: now,
    updatedAt: now,
  },
];

export const seedProducts: Product[] = [
  {
    id: "p1",
    sku: "PRD-0001",
    name: "Horn Cement OPC 42.5",
    description: "Ordinary Portland Cement, 50kg bag",
    unit: "Bag",
    unitPrice: 8.5,
    cost: 6.2,
    stock: 12500,
    reorderLevel: 1000,
    category: "Cement",
    active: true,
    createdAt: now,
    updatedAt: now,
  },
];

export const seedDOs: DeliveryOrder[] = [
  {
    id: "do1",
    doNumber: "DO-00001",
    customerId: "c2",
    customerSnapshot: {
      name: "Arabsiyo Trading Co.",
      address: "Main Bazaar, Arabsiyo",
      phone: "+252 63 4 555 100",
    },
    salespersonId: "u_sales",
    salespersonName: "Hassan Omar",
    orderDate: new Date(Date.now() - 86400000 * 4).toISOString(),
    items: [
      { productId: "p1", name: "Horn Cement OPC 42.5", quantity: 600, unit: "Bag", unitPrice: 8.5 },
    ],
    loadingDetails: {
      driverName: "JIBRIL",
      mobile: "634443061",
      truckPlate: "Z8997",
      owner: "Arabsiyo Trading Co.",
      destination: "ARABSIYO",
    },
    status: "delivered",
    authorizedBy: "Amina Yusuf",
    qrPayload: "/verify/do1",
    notes: "",
    createdAt: now,
    updatedAt: now,
    createdBy: "u_sales",
  },
  {
    id: "do2",
    doNumber: "DO-00002",
    customerId: "c1",
    customerSnapshot: {
      name: "Berbera Construction Ltd",
      address: "Port Road, Berbera",
      phone: "+252 63 4 100 200",
    },
    salespersonId: "u_sales",
    salespersonName: "Hassan Omar",
    orderDate: new Date(Date.now() - 86400000 * 2).toISOString(),
    items: [
      { productId: "p1", name: "Horn Cement OPC 42.5", quantity: 400, unit: "Bag", unitPrice: 8.5 },
    ],
    loadingDetails: {
      driverName: "ABDI",
      mobile: "634110022",
      truckPlate: "B4421",
      owner: "Berbera Construction Ltd",
      destination: "BERBERA",
    },
    status: "issued",
    authorizedBy: "Amina Yusuf",
    qrPayload: "/verify/do2",
    notes: "Deliver before noon",
    createdAt: now,
    updatedAt: now,
    createdBy: "u_sales",
  },
  {
    id: "do3",
    doNumber: "DO-00003",
    customerId: "c3",
    customerSnapshot: {
      name: "Hargeisa Builders Plc",
      address: "26 June Ave, Hargeisa",
      phone: "+252 63 4 778 991",
    },
    salespersonId: "u_sales",
    salespersonName: "Hassan Omar",
    orderDate: new Date().toISOString(),
    items: [
      { productId: "p1", name: "Horn Cement OPC 42.5", quantity: 200, unit: "Bag", unitPrice: 8.5 },
    ],
    loadingDetails: {
      driverName: "FARAH",
      mobile: "634998877",
      truckPlate: "H1190",
      owner: "Hargeisa Builders Plc",
      destination: "HARGEISA",
    },
    status: "draft",
    authorizedBy: "",
    qrPayload: "/verify/do3",
    notes: "",
    createdAt: now,
    updatedAt: now,
    createdBy: "u_sales",
  },
];

// ─── Sample invoice + partial payment, so the demo isn't empty ─────────────
export const seedInvoices: Invoice[] = [
  {
    id: "inv1",
    invoiceNumber: "INV-00001",
    type: "invoice",
    customerId: "c1",
    customerSnapshot: {
      name: "Berbera Construction Ltd",
      address: "Port Road, Berbera",
      phone: "+252 63 4 100 200",
    },
    doIds: ["do2"],
    issueDate: new Date(Date.now() - 86400000 * 2).toISOString(),
    dueDate: new Date(Date.now() + 86400000 * 28).toISOString(),
    items: [
      { productId: "p1", name: "Horn Cement OPC 42.5", quantity: 400, unit: "Bag", unitPrice: 8.5, lineTotal: 3400 },
    ],
    subtotal: 3400,
    taxRate: 0.05,
    taxAmount: 170,
    total: 3570,
    amountPaid: 1500,
    status: "partial",
    notes: "Net-30 payment terms",
    createdAt: now,
    updatedAt: now,
  },
];

export const seedPayments: Payment[] = [
  {
    id: "pay1",
    invoiceId: "inv1",
    invoiceNumber: "INV-00001",
    customerId: "c1",
    amount: 1500,
    method: "bank",
    reference: "TXN-998877",
    paidAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    recordedBy: "u_admin",
    notes: "First instalment via Dahabshiil",
    createdAt: now,
  },
];

// ─── Sample Sales Order ─────────────────────────────────────────────────────────

export const seedSalesOrders: SalesOrder[] = [
  {
    id: "so1",
    soNumber: "SO-00001",
    customerId: "c1",
    customerSnapshot: {
      name: "Berbera Construction Ltd",
      address: "Port Road, Berbera",
      phone: "+252 63 4 100 200",
    },
    salespersonId: "u_sales",
    salespersonName: "Hassan Omar",
    orderDate: new Date(Date.now() - 86400000 * 5).toISOString(),
    items: [
      {
        productId: "p1",
        name: "Horn Cement OPC 42.5",
        quantity: 800,
        deliveredQty: 400,
        invoicedQty: 400,
        unit: "Bag",
        unitPrice: 8.5,
        lineTotal: 6800,
      },
    ],
    subtotal: 6800,
    taxRate: 0.05,
    taxAmount: 340,
    total: 7140,
    status: "confirmed",
    notes: "Large order, partial delivery in progress",
    createdAt: now,
    updatedAt: now,
    createdBy: "u_sales",
  },
  {
    id: "so2",
    soNumber: "SO-00002",
    customerId: "c3",
    customerSnapshot: {
      name: "Hargeisa Builders Plc",
      address: "26 June Ave, Hargeisa",
      phone: "+252 63 4 778 991",
    },
    salespersonId: "u_sales",
    salespersonName: "Hassan Omar",
    orderDate: new Date().toISOString(),
    validUntil: new Date(Date.now() + 86400000 * 30).toISOString(),
    items: [
      {
        productId: "p1",
        name: "Horn Cement OPC 42.5",
        quantity: 500,
        deliveredQty: 0,
        invoicedQty: 0,
        unit: "Bag",
        unitPrice: 8.5,
        lineTotal: 4250,
      },
    ],
    subtotal: 4250,
    taxRate: 0.05,
    taxAmount: 212.5,
    total: 4462.5,
    status: "quotation",
    notes: "Pending customer confirmation",
    createdAt: now,
    updatedAt: now,
    createdBy: "u_sales",
  },
];

// ─── Suppliers ─────────────────────────────────────────────────────────────
export const seedSuppliers: import("@/types").Supplier[] = [
  {
    id: "s1",
    code: "SUP-0001",
    name: "Horn Cement Industries Ltd",
    contactPerson: "Khalid Mahdi",
    phone: "+252 63 4 220 110",
    email: "sales@horncement.so",
    address: "Industrial Zone, Berbera",
    city: "Berbera",
    country: "Somalia",
    taxId: "HCI-554",
    balance: 8200,
    notes: "Primary cement supplier",
    active: true,
    createdAt: now,
    updatedAt: now,
  },
];

// ─── Sample Purchase Order ─────────────────────────────────────────────────
import type { PurchaseOrder, SupplierPayment } from "@/types";

export const seedPOs: PurchaseOrder[] = [
  {
    id: "po1",
    poNumber: "PO-00001",
    supplierId: "s1",
    supplierSnapshot: {
      name: "Horn Cement Industries Ltd",
      address: "Industrial Zone, Berbera",
      phone: "+252 63 4 220 110",
    },
    orderDate: new Date(Date.now() - 86400000 * 7).toISOString(),
    expectedDelivery: new Date(Date.now() + 86400000 * 3).toISOString(),
    items: [
      {
        productId: "p1",
        name: "Horn Cement OPC 42.5",
        quantity: 2000,
        receivedQty: 1200,
        allocatedQty: 1000,
        unit: "Bag",
        unitPrice: 6.2,
        lineTotal: 12400,
      },
    ],
    subtotal: 12400,
    taxRate: 0,
    taxAmount: 0,
    total: 12400,
    amountPaid: 4200,
    status: "partial_received",
    notes: "Two-truck delivery, first batch received",
    qrPayload: "/verify/po1",
    createdAt: now,
    updatedAt: now,
    createdBy: "u_admin",
  },
];

export const seedSupplierPayments: SupplierPayment[] = [
  {
    id: "spay1",
    purchaseOrderId: "po1",
    poNumber: "PO-00001",
    supplierId: "s1",
    amount: 4200,
    method: "bank",
    reference: "WIRE-440022",
    paidAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    recordedBy: "u_admin",
    notes: "Advance payment (~33%)",
    createdAt: now,
  },
];

import type { POAllocation } from "@/types";

export const seedPOAllocations: POAllocation[] = [
  {
    id: "alloc1",
    deliveryOrderId: "do1",
    doNumber: "DO-00001",
    purchaseOrderId: "po1",
    poNumber: "PO-00001",
    productId: "p1",
    productName: "Horn Cement OPC 42.5",
    quantity: 600,
    allocatedAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    allocatedBy: "u_sales",
  },
  {
    id: "alloc2",
    deliveryOrderId: "do2",
    doNumber: "DO-00002",
    purchaseOrderId: "po1",
    poNumber: "PO-00001",
    productId: "p1",
    productName: "Horn Cement OPC 42.5",
    quantity: 400,
    allocatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    allocatedBy: "u_sales",
  },
];
