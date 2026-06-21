"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { dataAdapter } from "@/services";
import { canAccessPath } from "@/lib/route-access";
import type { Role, User } from "@/types";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

const PUBLIC_PATHS = ["/login", "/verify", "/forgot-password", "/reset-password"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    dataAdapter.currentUser().then((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_PATHS.some((p) => pathname?.startsWith(p));
    if (!user && !isPublic) router.replace("/login");
    if (user && pathname === "/login") router.replace("/dashboard");
    if (user && !isPublic && !canAccessPath(user.role as Role, pathname ?? "")) {
      router.replace("/dashboard");
    }
  }, [user, loading, pathname, router]);

  const signIn = useCallback(async (email: string, password: string) => {
    const u = await dataAdapter.signIn(email, password);
    setUser(u);
    router.replace("/dashboard");
  }, [router]);

  const signOut = useCallback(async () => {
    await dataAdapter.signOut();
    setUser(null);
    router.replace("/login");
  }, [router]);

  const requestPasswordReset = useCallback(async (email: string) => {
    await dataAdapter.requestPasswordReset(email);
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, signIn, signOut, requestPasswordReset }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
};
