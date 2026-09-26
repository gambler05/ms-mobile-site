import { prisma, type Tx } from "@/server/db";
import type { Ctx } from "@/server/auth/guard";

const SENSITIVE_KEYS = /(password|unlock|secret|token|pin|iban|card)/i;

/** Masque récursivement les champs sensibles avant journalisation. */
export function maskSensitive<T>(value: T): T {
  if (Array.isArray(value)) return value.map(maskSensitive) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? (v == null ? v : "***") : maskSensitive(v);
    }
    return out as T;
  }
  return value;
}

export async function audit(
  ctx: Ctx | { orgId: string; shopId?: string; userId?: string; userName?: string },
  action: string,
  entityType: string,
  entityId: string,
  before: unknown = {},
  after: unknown = {},
  tx?: Tx,
): Promise<void> {
  const db = tx ?? prisma;
  const isCtx = "user" in ctx;
  await db.auditLog.create({
    data: {
      orgId: ctx.orgId,
      shopId: ctx.shopId ?? null,
      userId: isCtx ? ctx.user.id : (ctx.userId ?? null),
      userName: isCtx ? ctx.user.name : (ctx.userName ?? "système"),
      action,
      entityType,
      entityId,
      beforeJson: JSON.stringify(maskSensitive(before)),
      afterJson: JSON.stringify(maskSensitive(after)),
    },
  });
}
