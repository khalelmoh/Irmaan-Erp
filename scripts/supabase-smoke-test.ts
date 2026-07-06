import { createClient } from "@supabase/supabase-js";

const REQUIRED_TABLES = [
  "users",
  "company_settings",
  "customers",
  "suppliers",
  "products",
  "activity_logs",
  "document_counters",
  "sales_orders",
  "delivery_orders",
  "stock_movements",
  "po_allocations",
  "purchase_orders",
  "supplier_payments",
  "invoices",
  "payments",
] as const;

const RPC_CHECKS = [
  {
    name: "preview_document_number",
    args: { p_name: "smoke_test", p_prefix: "TST", p_width: 5 },
  },
  {
    name: "verify_document",
    args: { p_id: "00000000-0000-0000-0000-000000000000" },
  },
] as const;

function loadLocalEnvironment() {
  try {
    process.loadEnvFile?.(".env.local");
  } catch {
    // CI and production hosts generally provide environment variables directly.
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Add it to .env.local, then run this command again.`,
    );
  }
  return value;
}

async function main() {
  loadLocalEnvironment();

  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const failures: string[] = [];

  console.log("Checking Supabase tables...");
  for (const table of REQUIRED_TABLES) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });

    if (error) {
      failures.push(`${table}: ${error.message}`);
      console.log(`  FAIL ${table}`);
    } else {
      console.log(`  OK   ${table} (${count ?? 0} rows)`);
    }
  }

  console.log("\nChecking Supabase RPCs...");
  for (const check of RPC_CHECKS) {
    const { error } = await supabase.rpc(check.name, check.args);
    if (error) {
      failures.push(`${check.name}: ${error.message}`);
      console.log(`  FAIL ${check.name}`);
    } else {
      console.log(`  OK   ${check.name}`);
    }
  }

  const { data: settings, error: settingsError } = await supabase
    .from("company_settings")
    .select("id")
    .eq("id", "default")
    .maybeSingle();

  if (settingsError) {
    failures.push(`company_settings default row: ${settingsError.message}`);
  } else if (!settings) {
    failures.push("company_settings default row: missing");
  } else {
    console.log("\nOK   company_settings default row");
  }

  if (failures.length > 0) {
    console.error("\nSupabase smoke test failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("\nSupabase smoke test passed.");
}

main().catch((error) => {
  console.error("Supabase smoke test crashed:", error);
  process.exit(1);
});
