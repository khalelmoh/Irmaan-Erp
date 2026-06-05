"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastKind = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastCtx {
  toast(t: Omit<Toast, "id">): void;
  success(title: string, description?: string): void;
  error(title: string, description?: string): void;
  warning(title: string, description?: string): void;
  info(title: string, description?: string): void;
}

const Ctx = createContext<ToastCtx | null>(null);

const TONE: Record<ToastKind, { bg: string; border: string; icon: typeof CheckCircle2; iconColor: string }> = {
  success: { bg: "bg-emerald-50", border: "border-emerald-200", icon: CheckCircle2, iconColor: "text-emerald-600" },
  error:   { bg: "bg-red-50",     border: "border-red-200",     icon: XCircle,       iconColor: "text-red-600" },
  warning: { bg: "bg-amber-50",   border: "border-amber-200",   icon: AlertTriangle, iconColor: "text-amber-600" },
  info:    { bg: "bg-sky-50",     border: "border-sky-200",     icon: Info,          iconColor: "text-sky-600" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = crypto.randomUUID();
    const duration = t.duration ?? (t.kind === "error" ? 6000 : 4000);
    setToasts((ts) => [...ts, { ...t, id }]);
    setTimeout(() => remove(id), duration);
  }, [remove]);

  const value: ToastCtx = {
    toast,
    success: (title, description) => toast({ kind: "success", title, description }),
    error:   (title, description) => toast({ kind: "error", title, description }),
    warning: (title, description) => toast({ kind: "warning", title, description }),
    info:    (title, description) => toast({ kind: "info", title, description }),
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* Toast viewport */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((t) => {
          const tone = TONE[t.kind];
          const Icon = tone.icon;
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-lg border shadow-lg p-3 pr-2 bg-white animate-in slide-in-from-right-4 fade-in duration-200",
                tone.bg,
                tone.border,
              )}
            >
              <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", tone.iconColor)} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-slate-900">{t.title}</div>
                {t.description && <div className="text-xs text-slate-600 mt-0.5">{t.description}</div>}
              </div>
              <button
                onClick={() => remove(t.id)}
                className="text-slate-400 hover:text-slate-700 p-0.5 rounded"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used within ToastProvider");
  return v;
}

/** Hook variant that ignores errors if the provider isn't mounted (for use in lib helpers). */
export function useToastOptional() {
  return useContext(Ctx);
}

// Tailwind doesn't ship animate-in by default; supply minimal keyframes.
// Add to globals.css if needed:
//   @keyframes slide-in-from-right-4 { from { transform: translateX(1rem); opacity: 0 } to { transform: none; opacity: 1 } }
//   .animate-in.slide-in-from-right-4 { animation: slide-in-from-right-4 .2s ease-out }
//   .fade-in { animation: fade-in .2s ease-out }

// We'll inject these in globals.css below.
useEffect; // tree-shake guard
