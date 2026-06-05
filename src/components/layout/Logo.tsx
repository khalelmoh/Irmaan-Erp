import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg width="36" height="36" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="irmaan-lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1d4ed8" />
            <stop offset="100%" stopColor="#0b1e3f" />
          </linearGradient>
        </defs>
        {/* Rounded badge */}
        <rect x="2" y="2" width="36" height="36" rx="9" fill="url(#irmaan-lg)" />
        {/* Letter I — top serif */}
        <rect x="12" y="9" width="16" height="2.6" rx="1" fill="#ffffff" />
        {/* Letter I — stem */}
        <rect x="18.4" y="11.6" width="3.2" height="13" fill="#ffffff" />
        {/* Letter I — bottom serif */}
        <rect x="12" y="24.6" width="16" height="2.6" rx="1" fill="#ffffff" />
        {/* Horizon / trade-route arc beneath */}
        <path
          d="M8 31 Q 20 27 32 31"
          stroke="#60a5fa"
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />
        {/* Accent star */}
        <circle cx="32" cy="9" r="1.4" fill="#fbbf24" />
      </svg>
      {!compact && (
        <div className="leading-tight">
          <div className="font-semibold text-slate-900 text-sm">Irmaan</div>
          <div className="text-[10px] tracking-wide uppercase text-slate-500">
            Trading Company
          </div>
        </div>
      )}
    </div>
  );
}
