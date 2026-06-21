/**
 * Active data adapter.
 *
 * Local demo/dev defaults to MockAdapter.
 * Production should set NEXT_PUBLIC_USE_FIREBASE=true.
 */
import { activeAdapterName, dataAdapter } from "@/services/selectedAdapter";

const globalForAdapter = globalThis as typeof globalThis & {
  __irmaanAdapterWarningShown?: boolean;
};

if (
  typeof window !== "undefined" &&
  process.env.NODE_ENV === "production" &&
  activeAdapterName === "mock" &&
  !globalForAdapter.__irmaanAdapterWarningShown
) {
  globalForAdapter.__irmaanAdapterWarningShown = true;
  console.warn(
    "[irmaan-erp] Running with MockAdapter in a production build. " +
      "Set NEXT_PUBLIC_USE_FIREBASE=true before deploying real company data.",
  );
}

export { activeAdapterName, dataAdapter };
