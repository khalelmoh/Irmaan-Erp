import type { Role } from "@/types";

export type Permission =
  | "create_so"
  | "create_do"
  | "create_po"
  | "create_invoice"
  | "record_payment"
  | "manage_stock"
  | "manage_customers"
  | "manage_suppliers"
  | "manage_products"
  | "view_reports"
  | "view_audit"
  | "manage_users"
  | "manage_settings";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    "create_so", "create_do", "create_po", "create_invoice", "record_payment",
    "manage_stock", "manage_customers", "manage_suppliers", "manage_products",
    "view_reports", "view_audit", "manage_users", "manage_settings",
  ],
  manager: [
    "create_so", "create_do", "create_po", "create_invoice", "record_payment",
    "manage_stock", "manage_customers", "manage_suppliers", "manage_products",
    "view_reports", "view_audit",
  ],
  sales: [
    "create_so", "create_do", "create_invoice",
    "manage_customers",
  ],
  warehouse: [
    "create_do", "manage_stock", "manage_products",
  ],
};

export function hasPermission(role: Role, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}

export function canAccess(role: Role | undefined, perm: Permission): boolean {
  if (!role) return false;
  return hasPermission(role, perm);
}
