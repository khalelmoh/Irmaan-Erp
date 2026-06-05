"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, Search } from "lucide-react";
import { CommandPalette } from "./CommandPalette";

export function Topbar() {
  const { user, signOut } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Cmd/Ctrl+K opens the global palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header className="h-16 sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-200 flex items-center justify-between px-6">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="relative w-full max-w-md hidden md:flex items-center gap-2 text-left h-9 rounded-md border border-slate-200 bg-slate-50 hover:bg-white hover:border-brand-300 transition-colors px-3 text-sm text-slate-500"
        >
          <Search className="h-4 w-4 text-slate-400" />
          <span className="flex-1">Search anything…</span>
          <kbd className="hidden lg:inline-flex items-center text-[10px] font-mono text-slate-400 border border-slate-200 rounded px-1.5 py-0.5 bg-white">
            ⌘K
          </kbd>
        </button>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-medium text-slate-900">{user?.displayName}</div>
            <div className="text-xs text-slate-500 capitalize">{user?.role}</div>
          </div>
          <div className="h-9 w-9 rounded-full bg-brand-700 text-white flex items-center justify-center text-sm font-semibold">
            {user?.displayName?.[0] ?? "U"}
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} title="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
