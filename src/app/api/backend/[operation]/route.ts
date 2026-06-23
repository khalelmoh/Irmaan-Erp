import { NextRequest, NextResponse } from "next/server";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedOperations = new Set([
  "adjustStock",
  "createCustomer",
  "createDeliveryOrder",
  "createInvoice",
  "createProduct",
  "createPurchaseOrder",
  "createSalesOrder",
  "createSupplier",
  "decidePurchaseOrderApproval",
  "getAvailablePOStock",
  "inviteUser",
  "receivePurchaseOrder",
  "recordInvoicePayment",
  "recordSupplierPayment",
  "requestPurchaseOrderApproval",
  "transitionDeliveryOrder",
  "transitionInvoice",
  "transitionPurchaseOrder",
  "transitionSalesOrder",
  "updatePurchaseOrder",
  "verifyDocument",
  "writeActivityLog",
]);

function ensureAdminApp() {
  if (getApps().length > 0) return;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  initializeApp({
    credential:
      projectId && clientEmail && privateKey
        ? cert({ projectId, clientEmail, privateKey })
        : applicationDefault(),
    projectId,
  });
}

function statusForCode(code: string | undefined) {
  switch (code) {
    case "unauthenticated":
      return 401;
    case "permission-denied":
      return 403;
    case "not-found":
      return 404;
    case "already-exists":
    case "aborted":
      return 409;
    case "invalid-argument":
    case "failed-precondition":
    case "out-of-range":
      return 400;
    case "resource-exhausted":
      return 429;
    default:
      return 500;
  }
}

function asISOString(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }
  return new Date((value as string | number | Date | undefined) ?? Date.now()).toISOString();
}

async function verifyDocument(data: unknown) {
  const id =
    data && typeof data === "object" && "id" in data
      ? (data as { id?: unknown }).id
      : undefined;

  if (typeof id !== "string" || !id.trim() || id.length > 200) {
    return {
      error: {
        code: "invalid-argument",
        message: "Document ID is required",
      },
    } as const;
  }

  const documentId = id.trim();
  const db = getFirestore();
  const [salesOrderSnap, invoiceSnap, purchaseOrderSnap, deliveryOrderSnap] =
    await Promise.all([
      db.doc(`sales_orders/${documentId}`).get(),
      db.doc(`invoices/${documentId}`).get(),
      db.doc(`purchase_orders/${documentId}`).get(),
      db.doc(`delivery_orders/${documentId}`).get(),
    ]);

  if (salesOrderSnap.exists) {
    const salesOrder = salesOrderSnap.data()!;
    return {
      data: {
        kind: "so",
        doc: {
          id: documentId,
          soNumber: salesOrder.soNumber,
          customerSnapshot: {
            name: salesOrder.customerSnapshot?.name ?? "Unknown",
          },
          salespersonName: salesOrder.salespersonName ?? "",
          orderDate: asISOString(salesOrder.orderDate),
          validUntil: salesOrder.validUntil
            ? asISOString(salesOrder.validUntil)
            : undefined,
          items: (salesOrder.items ?? []).map((item: Record<string, unknown>) => ({
            quantity: item.quantity,
          })),
          total: salesOrder.total,
          status: salesOrder.status,
        },
      },
    } as const;
  }

  if (invoiceSnap.exists) {
    const invoice = invoiceSnap.data()!;
    return {
      data: {
        kind: "invoice",
        doc: {
          id: documentId,
          invoiceNumber: invoice.invoiceNumber,
          type: invoice.type,
          customerSnapshot: {
            name: invoice.customerSnapshot?.name ?? "Unknown",
          },
          issueDate: asISOString(invoice.issueDate),
          dueDate: asISOString(invoice.dueDate),
          total: invoice.total,
          amountPaid: invoice.amountPaid ?? 0,
          status: invoice.status,
        },
      },
    } as const;
  }

  if (purchaseOrderSnap.exists) {
    const purchaseOrder = purchaseOrderSnap.data()!;
    return {
      data: {
        kind: "po",
        doc: {
          id: documentId,
          poNumber: purchaseOrder.poNumber,
          supplierSnapshot: {
            name: purchaseOrder.supplierSnapshot?.name ?? "Unknown",
          },
          orderDate: asISOString(purchaseOrder.orderDate),
          expectedDelivery: purchaseOrder.expectedDelivery
            ? asISOString(purchaseOrder.expectedDelivery)
            : undefined,
          items: (purchaseOrder.items ?? []).map(
            (item: Record<string, unknown>) => ({
              quantity: item.quantity,
              receivedQty: item.receivedQty ?? 0,
            }),
          ),
          total: purchaseOrder.total,
          amountPaid: purchaseOrder.amountPaid ?? 0,
          status: purchaseOrder.status,
        },
      },
    } as const;
  }

  if (deliveryOrderSnap.exists) {
    const deliveryOrder = deliveryOrderSnap.data()!;
    return {
      data: {
        kind: "do",
        doc: {
          id: documentId,
          doNumber: deliveryOrder.doNumber,
          customerSnapshot: {
            name: deliveryOrder.customerSnapshot?.name ?? "Unknown",
          },
          loadingDetails: {
            destination: deliveryOrder.loadingDetails?.destination ?? "",
            truckPlate: deliveryOrder.loadingDetails?.truckPlate ?? "",
            driverName: deliveryOrder.loadingDetails?.driverName ?? "",
          },
          salespersonName: deliveryOrder.salespersonName ?? "",
          createdAt: asISOString(deliveryOrder.createdAt),
          items: (deliveryOrder.items ?? []).map(
            (item: Record<string, unknown>) => ({
              quantity: item.quantity,
            }),
          ),
          status: deliveryOrder.status,
        },
      },
    } as const;
  }

  return { data: null } as const;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ operation: string }> },
) {
  const { operation } = await context.params;
  if (!allowedOperations.has(operation)) {
    return NextResponse.json(
      { error: { code: "not-found", message: "Unknown server operation" } },
      { status: 404 },
    );
  }

  try {
    ensureAdminApp();
    const body = (await request.json()) as { data?: unknown };

    if (operation === "verifyDocument") {
      const result = await verifyDocument(body.data);
      if ("error" in result && result.error) {
        return NextResponse.json(
          { error: result.error },
          { status: statusForCode(result.error.code) },
        );
      }
      return NextResponse.json({ data: result.data });
    }

    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : null;
    const { getAuth } = await import("firebase-admin/auth");
    const decodedToken = token ? await getAuth().verifyIdToken(token) : null;
    const operations = await import("../../../../../functions/src/index");
    const callable = operations[operation as keyof typeof operations] as {
      run?: (callableRequest: unknown) => Promise<unknown>;
    };

    if (typeof callable?.run !== "function") {
      throw new Error(`Operation ${operation} is not callable`);
    }

    const data = await callable.run({
      data: body.data ?? {},
      auth: decodedToken
        ? { uid: decodedToken.uid, token: decodedToken }
        : undefined,
      rawRequest: request,
    });

    return NextResponse.json({ data });
  } catch (error) {
    const value = error as {
      code?: string;
      message?: string;
      details?: unknown;
    };
    const code = value.code?.replace(/^functions\//, "") ?? "internal";
    const message =
      code === "internal"
        ? "The server could not complete this operation"
        : value.message ?? "The server operation failed";

    if (code === "internal") {
      console.error(`Backend operation ${operation} failed`, error);
    }

    return NextResponse.json(
      { error: { code, message, details: value.details } },
      { status: statusForCode(code) },
    );
  }
}
