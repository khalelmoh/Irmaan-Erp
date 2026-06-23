import { Timestamp } from "firebase-admin/firestore";

export const BACKUP_COLLECTIONS = [
  "users",
  "settings",
  "customers",
  "suppliers",
  "products",
  "sales_orders",
  "delivery_orders",
  "purchase_orders",
  "po_allocations",
  "invoices",
  "payments",
  "supplier_payments",
  "stock_movements",
  "activity_logs",
  "counters",
] as const;

export type BackupDocument = { id: string } & Record<string, unknown>;

export interface BackupPayload {
  formatVersion: 2;
  exportedAt: string;
  projectId?: string;
  documentCount?: number;
  collectionCount?: number;
  data: Record<string, BackupDocument[]>;
}

export function encodeFirestoreValue(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return { __type: "timestamp", value: value.toDate().toISOString() };
  }
  if (Array.isArray(value)) return value.map(encodeFirestoreValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, encodeFirestoreValue(child)]),
    );
  }
  return value;
}

export function decodeFirestoreValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeFirestoreValue);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (
      record.__type === "timestamp" &&
      typeof record.value === "string" &&
      !Number.isNaN(Date.parse(record.value))
    ) {
      return Timestamp.fromDate(new Date(record.value));
    }
    if (
      typeof record._seconds === "number" &&
      typeof record._nanoseconds === "number" &&
      Object.keys(record).every((key) => key === "_seconds" || key === "_nanoseconds")
    ) {
      return new Timestamp(record._seconds, record._nanoseconds);
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, child]) => [key, decodeFirestoreValue(child)]),
    );
  }
  return value;
}

export function normalizeBackupPayload(raw: unknown): BackupPayload {
  if (!raw || typeof raw !== "object") throw new Error("Backup payload must be an object");
  const source = raw as Record<string, unknown>;
  const rawData =
    source.data && typeof source.data === "object" && !Array.isArray(source.data)
      ? source.data as Record<string, unknown>
      : source;
  const data: Record<string, BackupDocument[]> = {};

  for (const [collection, documents] of Object.entries(rawData)) {
    if (["formatVersion", "exportedAt", "projectId"].includes(collection)) continue;
    const documentList = Array.isArray(documents)
      ? documents
      : documents && typeof documents === "object"
        ? Object.entries(documents as Record<string, unknown>).map(([id, document]) => ({
            id,
            ...(document && typeof document === "object" && !Array.isArray(document)
              ? document as Record<string, unknown>
              : {}),
          }))
        : null;
    if (!documentList) throw new Error(`Collection ${collection} has an invalid document map`);
    const ids = new Set<string>();
    data[collection] = documentList.map((document, index) => {
      if (!document || typeof document !== "object" || Array.isArray(document)) {
        throw new Error(`Collection ${collection} document ${index + 1} is invalid`);
      }
      const decoded = decodeFirestoreValue(document) as BackupDocument;
      if (typeof decoded.id !== "string" || !decoded.id) {
        throw new Error(`Collection ${collection} document ${index + 1} has no ID`);
      }
      if (ids.has(decoded.id)) {
        throw new Error(`Collection ${collection} contains duplicate ID ${decoded.id}`);
      }
      ids.add(decoded.id);
      return decoded;
    });
  }

  if (Object.keys(data).length === 0) throw new Error("Backup contains no collections");
  const exportedAt =
    typeof source.exportedAt === "string" && !Number.isNaN(Date.parse(source.exportedAt))
      ? source.exportedAt
      : new Date(0).toISOString();

  return {
    formatVersion: 2,
    exportedAt,
    projectId: typeof source.projectId === "string" ? source.projectId : undefined,
    data,
  };
}
