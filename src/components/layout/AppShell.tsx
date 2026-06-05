"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useAuth } from "@/contexts/AuthContext";

const HIDE_CHROME = ["/login", "/verify"];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const { user, loading } = useAuth();
  const bare =
    HIDE_CHROME.some((p) => pathname.startsWith(p)) ||
    pathname.includes("/pdf") ||
    pathname.includes("/print");

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-slate-500 text-sm">
        Loading…
      </div>
    );
  }

  if (bare || !user) return <>{children}</>;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
