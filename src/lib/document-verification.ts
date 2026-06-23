export function verificationPath(documentId: string) {
  const id = documentId.trim();
  if (!id) throw new Error("Document ID is required");
  return `/verify/${encodeURIComponent(id)}`;
}

export function verificationUrl(documentId: string, runtimeOrigin?: string) {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const base = configuredOrigin || runtimeOrigin?.trim();

  if (!base) {
    throw new Error("Verification URL origin is not configured");
  }

  return new URL(verificationPath(documentId), `${base.replace(/\/+$/, "")}/`).toString();
}
