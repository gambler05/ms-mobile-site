/** Rôles et permissions. La vérification s'effectue TOUJOURS côté serveur (src/server/auth/guard.ts). */
export const ROLES = ["ADMIN", "MANAGER", "TECH", "SELLER"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "dashboard.view",
  "tickets.view",
  "tickets.create",
  "tickets.edit",
  "tickets.assign",
  "tickets.transition",
  "tickets.delete",
  "tickets.unlock_code.view",
  "quotes.manage",
  "parts.manage",
  "customers.view",
  "customers.edit",
  "customers.merge",
  "inventory.view",
  "inventory.edit",
  "inventory.adjust",
  "inventory.import",
  "inventory.count",
  "purchasing.manage",
  "pos.sell",
  "pos.discount.limited",
  "pos.discount.any",
  "pos.refund",
  "register.open_close",
  "payments.record",
  "reports.view",
  "reports.finance",
  "notifications.manage",
  "settings.view",
  "settings.manage",
  "users.manage",
  "audit.view",
  "assistant.use",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  ADMIN: new Set(ALL),
  MANAGER: new Set(ALL.filter((p) => !["users.manage"].includes(p))),
  TECH: new Set<Permission>([
    "dashboard.view",
    "tickets.view",
    "tickets.create",
    "tickets.edit",
    "tickets.transition",
    "tickets.unlock_code.view",
    "quotes.manage",
    "parts.manage",
    "customers.view",
    "customers.edit",
    "inventory.view",
    "purchasing.manage",
    "payments.record",
    "notifications.manage",
    "settings.view",
    "assistant.use",
  ]),
  SELLER: new Set<Permission>([
    "dashboard.view",
    "tickets.view",
    "tickets.create",
    "customers.view",
    "customers.edit",
    "inventory.view",
    "pos.sell",
    "pos.discount.limited",
    "register.open_close",
    "payments.record",
    "notifications.manage",
    "settings.view",
    "assistant.use",
  ]),
};

export function roleHas(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/** Remise maximale (en points de base du sous-total) autorisée sans permission « pos.discount.any ». */
export const LIMITED_DISCOUNT_MAX_BP = 1000; // 10 %
