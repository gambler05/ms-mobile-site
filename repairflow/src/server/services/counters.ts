import type { Tx } from "@/server/db";

/**
 * Numérotation séquentielle par boutique et par type, sûre en concurrence :
 * l'incrément se fait par `update` atomique dans la transaction appelante.
 * Format : <CODE>-<ANNÉE>-<00042> (ex. REP-2026-00042).
 */
export async function nextNumber(tx: Tx, shopId: string, kind: "TICKET" | "SALE" | "PO" | "CREDIT", prefix: string): Promise<string> {
  await tx.counter.upsert({ where: { shopId_kind: { shopId, kind } }, create: { shopId, kind, value: 0 }, update: {} });
  const row = await tx.counter.update({ where: { shopId_kind: { shopId, kind } }, data: { value: { increment: 1 } } });
  return `${prefix}-${new Date().getFullYear()}-${String(row.value).padStart(5, "0")}`;
}
