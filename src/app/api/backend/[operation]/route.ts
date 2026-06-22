import { NextRequest, NextResponse } from "next/server";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import * as operations from "../../../../../functions/src/index";

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
    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : null;
    const decodedToken = token ? await getAuth().verifyIdToken(token) : null;
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
