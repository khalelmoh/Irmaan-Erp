"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Building2,
  Package,
  History,
  Truck,
  ShoppingCart,
  FileText,
  BarChart3,
  ShieldCheck,
  UserCog,
  Settings,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { useAuth } from "@/contexts/AuthContext";

type Role = "admin" | "manager" | "sales" | "warehouse";
const nav: { href: string; label: string; icon: typeof Users; roles?: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/suppliers", label: "Suppliers", icon: Building2 },
  { href: "/products", label: "Products", icon: Package },
  { href: "/inventory/movements", label: "Stock Movements", icon: History },
  { href: "/sales-orders", label: "Sales Orders", icon: ClipboardList },
  { href: "/delivery-orders", label: "Delivery Orders", icon: Truck },
  { href: "/purchase-orders", label: "Purchase Orders", icon: ShoppingCart },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/audit", label: "Audit Log", icon: ShieldCheck, roles: ["admin", "manager"] },
  { href: "/users", label: "Users", icon: UserCog, roles: ["admin"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = (user?.role ?? "sales") as Role;
  const visible = nav.filter((n) => !n.roles || n.roles.includes(role));
  return (
    <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 h-screen sticky top-0 border-r border-slate-200 bg-white">
      <div className="px-5 h-16 flex items-center border-b border-slate-200">
        <Logo />
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visible.map((n) => {
          const active = pathname?.startsWith(n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-50 text-brand-800 border border-brand-100"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <Icon className={cn("h-4 w-4", active ? "text-brand-700" : "text-slate-400")} />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-slate-100">
        <Link
          href="#"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>
    </aside>
  );
}
