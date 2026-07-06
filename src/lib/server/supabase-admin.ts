import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@/types";

type GenericTable<Row extends Record<string, unknown>> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

type SupabaseUserRow = {
  uid: string;
  email: string;
  display_name: string;
  role: User["role"];
  active: boolean;
  created_at: string | null;
};

type SupabaseDatabase = {
  public: {
    Tables: {
      users: {
        Row: SupabaseUserRow;
        Insert: Omit<SupabaseUserRow, "created_at"> & { created_at?: string | null };
        Update: Partial<Omit<SupabaseUserRow, "uid">>;
        Relationships: [];
      };
      company_settings: GenericTable<Record<string, unknown>>;
      customers: GenericTable<Record<string, unknown>>;
      suppliers: GenericTable<Record<string, unknown>>;
      products: GenericTable<Record<string, unknown>>;
      sales_orders: GenericTable<Record<string, unknown>>;
      delivery_orders: GenericTable<Record<string, unknown>>;
      purchase_orders: GenericTable<Record<string, unknown>>;
      po_allocations: GenericTable<Record<string, unknown>>;
      invoices: GenericTable<Record<string, unknown>>;
      payments: GenericTable<Record<string, unknown>>;
      supplier_payments: GenericTable<Record<string, unknown>>;
      stock_movements: GenericTable<Record<string, unknown>>;
      activity_logs: GenericTable<Record<string, unknown>>;
      document_counters: GenericTable<Record<string, unknown>>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

let adminClient: SupabaseClient<SupabaseDatabase> | null = null;

export function getSupabaseAdmin() {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase server operations require NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  adminClient = createClient<SupabaseDatabase>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return adminClient;
}

export function supabaseUserRowToUser(row: SupabaseUserRow): User {
  return {
    uid: row.uid,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    active: row.active,
    createdAt: row.created_at ?? "",
  };
}

export async function requireSupabaseAdminUser(token: string) {
  const supabase = getSupabaseAdmin();
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    throw Object.assign(new Error("Sign in again to continue"), { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("uid, email, display_name, role, active, created_at")
    .eq("uid", authData.user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile || profile.role !== "admin" || profile.active === false) {
    throw Object.assign(new Error("Administrator access required"), { status: 403 });
  }

  return supabaseUserRowToUser(profile as SupabaseUserRow);
}
