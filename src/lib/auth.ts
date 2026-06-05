import type { Role } from "@/types";

const matrix: Record<string, Role[]> = {
  "users.manage": ["admin"],
  "customers.write": ["admin", "manager", "sales"],
  "products.write": ["admin", "manager", "warehouse"],
  "do.create": ["admin", "manager", "sales", "warehouse"],
  "po.create": ["admin", "manager"],
  "invoice.create": ["admin", "manager", "sales"],
  "payment.record": ["admin", "manager"],
  "reports.view": ["admin", "manager"],
};

export const can = (role: Role | undefined, perm: keyof typeof matrix) =>
  !!role && matrix[perm].includes(role);
