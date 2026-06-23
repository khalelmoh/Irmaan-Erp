import type { Role } from "@/types";

const ALL: Role[] = ["admin", "manager", "sales", "warehouse"];

export const ROUTE_ROLES: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: "/settings", roles: ["admin"] },
  { prefix: "/backups", roles: ["admin"] },
  { prefix: "/users", roles: ["admin"] },
  { prefix: "/audit", roles: ["admin", "manager"] },
  { prefix: "/reports", roles: ["admin", "manager"] },
  { prefix: "/purchase-orders", roles: ["admin", "manager", "warehouse"] },
  { prefix: "/inventory", roles: ["admin", "manager", "warehouse"] },
  { prefix: "/suppliers", roles: ["admin", "manager", "warehouse"] },
  { prefix: "/invoices", roles: ["admin", "manager", "sales"] },
  { prefix: "/sales-orders", roles: ALL },
  { prefix: "/delivery-orders", roles: ALL },
  { prefix: "/products", roles: ALL },
  { prefix: "/customers", roles: ALL },
  { prefix: "/dashboard", roles: ALL },
];

export function canAccessPath(role: Role, pathname: string) {
  const rule = ROUTE_ROLES.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return !rule || rule.roles.includes(role);
}
