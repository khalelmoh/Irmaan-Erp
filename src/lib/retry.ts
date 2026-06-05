/**
 * Lightweight retry wrapper for network operations.
 * Uses exponential backoff with jitter, up to N attempts.
 *
 * Usage:
 *   const result = await withRetry(() => dataAdapter.invoices.list(), {
 *     retries: 3,
 *     onAttempt: (n) => console.log(`Attempt ${n}`),
 *   });
 */
export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Predicate — return true to retry. Default retries on any error. */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  onAttempt?: (attempt: number) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 300;
  const max = opts.maxDelayMs ?? 5000;
  const shouldRetry = opts.shouldRetry ?? (() => true);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    opts.onAttempt?.(attempt);
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt > retries || !shouldRetry(err, attempt)) break;
      const delay = Math.min(base * 2 ** (attempt - 1), max);
      const jitter = Math.random() * 150;
      await new Promise((r) => setTimeout(r, delay + jitter));
    }
  }
  throw lastErr;
}

/** Returns a user-friendly error message from any error value. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    // Firebase often wraps errors with a code on the message
    if (err.message.includes("auth/")) return prettyFirebaseAuth(err.message);
    if (err.message.includes("permission-denied")) return "You don't have permission for that action.";
    if (err.message.includes("unavailable") || err.message.includes("network")) {
      return "Network problem. Please check your connection and try again.";
    }
    return err.message;
  }
  return typeof err === "string" ? err : "Something went wrong.";
}

function prettyFirebaseAuth(msg: string) {
  if (msg.includes("auth/wrong-password") || msg.includes("auth/invalid-credential"))
    return "Incorrect email or password.";
  if (msg.includes("auth/user-not-found")) return "No account found for this email.";
  if (msg.includes("auth/too-many-requests"))
    return "Too many attempts. Please wait a few minutes and try again.";
  if (msg.includes("auth/network-request-failed"))
    return "Network problem. Check your connection.";
  if (msg.includes("auth/unauthorized-domain"))
    return "This domain isn't authorized for sign-in. Contact your administrator.";
  return msg.replace("Firebase: ", "");
}
