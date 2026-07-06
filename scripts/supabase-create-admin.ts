import { createClient } from "@supabase/supabase-js";

type AuthUser = {
  id: string;
  email?: string;
};

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

async function findAuthUserByEmail(
  supabase: ReturnType<typeof createClient>,
  email: string,
) {
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const user = data.users.find(
      (candidate: AuthUser) => candidate.email?.toLowerCase() === email,
    );
    if (user) return user;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function main() {
  loadLocalEnvironment();

  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const email = requiredEnv("SUPABASE_ADMIN_EMAIL").toLowerCase();
  const password = requiredEnv("SUPABASE_ADMIN_PASSWORD");
  const displayName = process.env.SUPABASE_ADMIN_NAME?.trim() || "Admin User";

  if (password.length < 8) {
    throw new Error("SUPABASE_ADMIN_PASSWORD must be at least 8 characters");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const existingUser = await findAuthUserByEmail(supabase, email);
  let user = existingUser;

  if (existingUser) {
    const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: { displayName, role: "admin" },
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { displayName, role: "admin" },
    });
    if (error) throw error;
    user = data.user;
  }

  if (!user) throw new Error("Supabase did not return an auth user");

  if (existingUser) {
    console.log(`Updated auth user password: ${email}`);
  } else {
    console.log(`Created auth user: ${email}`);
  }

  const { error: profileError } = await supabase.from("users").upsert({
    uid: user.id,
    email,
    display_name: displayName,
    role: "admin",
    active: true,
  });

  if (profileError) {
    if (profileError.code === "PGRST205") {
      throw new Error(
        "The public.users table does not exist yet. Apply supabase/migrations/001_initial_supabase_foundation.sql through 006_stock_and_verification.sql, then rerun this command.",
      );
    }
    throw profileError;
  }

  console.log(`Admin profile is ready: ${displayName} <${email}>`);
  console.log("You can now sign in with SUPABASE_ADMIN_EMAIL and SUPABASE_ADMIN_PASSWORD.");
}

main().catch((error) => {
  console.error("Supabase admin setup failed:", error);
  process.exit(1);
});
