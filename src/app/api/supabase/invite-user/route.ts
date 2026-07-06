import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/types";
import {
  getSupabaseAdmin,
  requireSupabaseAdminUser,
  supabaseUserRowToUser,
} from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES: User["role"][] = ["admin", "manager", "sales", "warehouse"];

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : null;

    if (!token) return jsonError(401, "unauthenticated", "Sign in required");
    await requireSupabaseAdminUser(token);

    const input = (await request.json()) as {
      email?: unknown;
      displayName?: unknown;
      role?: unknown;
    };
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const displayName =
      typeof input.displayName === "string" ? input.displayName.trim() : "";
    const role = input.role;

    if (!email || !email.includes("@") || !displayName || !ROLES.includes(role as User["role"])) {
      return jsonError(400, "invalid-argument", "Valid email, name, and role are required");
    }
    const validRole = role as User["role"];

    const supabase = getSupabaseAdmin();
    const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;
    const redirectTo = origin ? `${origin.replace(/\/+$/, "")}/reset-password` : undefined;
    const { data: inviteData, error: inviteError } =
      await supabase.auth.admin.inviteUserByEmail(email, {
        data: { displayName, role },
        redirectTo,
      });

    if (inviteError) {
      const message = inviteError.message.toLowerCase();
      if (message.includes("already") || message.includes("registered")) {
        return jsonError(409, "already-exists", "A user with this email already exists");
      }
      throw inviteError;
    }

    const uid = inviteData.user?.id;
    if (!uid) throw new Error("Supabase did not return an invited user");

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .upsert({
        uid,
        email,
        display_name: displayName,
        role: validRole,
        active: true,
      })
      .select("uid, email, display_name, role, active, created_at")
      .single();

    if (profileError) throw profileError;
    return NextResponse.json({ data: supabaseUserRowToUser(profile) });
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: unknown }).status)
        : 500;
    if (status >= 500) console.error("Supabase invite failed", error);
    return jsonError(
      Number.isFinite(status) ? status : 500,
      status === 401 ? "unauthenticated" : status === 403 ? "permission-denied" : "internal",
      error instanceof Error ? error.message : "Unable to invite user",
    );
  }
}
