import { getFirebase } from "@/lib/firebase";

type ServerOperationError = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export async function callServerOperation<TInput, TResult>(
  operation: string,
  data: TInput,
  options: { public?: boolean } = {},
): Promise<TResult> {
  const { auth } = getFirebase();
  const token = options.public ? null : await auth.currentUser?.getIdToken();

  if (!options.public && !token) {
    throw new Error("Sign in required");
  }

  const response = await fetch(`/api/backend/${encodeURIComponent(operation)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  const payload = (await response.json().catch(() => ({}))) as
    | { data: TResult }
    | ServerOperationError;

  if (!response.ok || !("data" in payload)) {
    const message =
      "error" in payload && payload.error?.message
        ? payload.error.message
        : "The server operation failed";
    const error = new Error(message) as Error & {
      code?: string;
      details?: unknown;
    };
    if ("error" in payload) {
      error.code = payload.error?.code;
      error.details = payload.error?.details;
    }
    throw error;
  }

  return payload.data;
}
