import { prisma, type Tx } from "@/server/db";
import type { Ctx } from "@/server/auth/guard";
import { ConflictError, DomainError, NotFoundError } from "@/server/errors";
import { audit } from "@/server/audit";
import type { MovementType } from "@/lib/domain/inventory";

/**
 * Toute variation de stock passe par `applyMovement` dans une transaction :
 * 1. mise à jour conditionnelle du niveau (refus atomique des stocks négatifs non autorisés),
 * 2. écriture d'un mouvement immuable portant le solde après opération.
 * Sous SQLite l'écrivain est unique ; sous PostgreSQL l'UPDATE conditionnel sérialise les ventes
 * concurrentes de la dernière unité : un seul des deux `updateMany` verra `onHand >= qty`.
 */
export interface MovementInput {
  orgId: string;
  shopId: string;
  productId: string;
  type: MovementType;
  qty: number; // signé
  reason?: string;
  refType?: string;
  refId?: string;
  unitCostCents?: number;
  authorId?: string;
  allowNegative?: boolean;
  /** Variation du stock réservé (positive = réserver, négative = libérer). */
  reservedDelta?: number;
}

export async function ensureLevel(tx: Tx, productId: string, shopId: string) {
  return tx.stockLevel.upsert({
    where: { productId_shopId: { productId, shopId } },
    create: { productId, shopId },
    update: {},
  });
}

export async function applyMovement(tx: Tx, m: MovementInput) {
  if (!Number.isInteger(m.qty) || (m.qty === 0 && !m.reservedDelta)) throw new DomainError("Quantité invalide");
  await ensureLevel(tx, m.productId, m.shopId);
  const reservedDelta = m.reservedDelta ?? 0;
  const where = {
    productId: m.productId,
    shopId: m.shopId,
    ...(m.qty < 0 && !m.allowNegative ? { onHand: { gte: -m.qty } } : {}),
    ...(reservedDelta < 0 ? { reserved: { gte: -reservedDelta } } : {}),
  };
  const updated = await tx.stockLevel.updateMany({
    where,
    data: { onHand: { increment: m.qty }, reserved: { increment: reservedDelta } },
  });
  if (updated.count !== 1) {
    throw new ConflictError("Stock insuffisant : l'opération a été refusée pour éviter un stock négatif");
  }
  const level = await tx.stockLevel.findUniqueOrThrow({ where: { productId_shopId: { productId: m.productId, shopId: m.shopId } } });
  if (m.qty === 0) return { level, movement: null };
  const movement = await tx.stockMovement.create({
    data: {
      orgId: m.orgId,
      shopId: m.shopId,
      productId: m.productId,
      type: m.type,
      qty: m.qty,
      balanceAfter: level.onHand,
      reason: m.reason ?? "",
      refType: m.refType ?? null,
      refId: m.refId ?? null,
      unitCostCents: m.unitCostCents ?? 0,
      authorId: m.authorId ?? null,
    },
  });
  return { level, movement };
}

/** Réservation : n'affecte pas le stock physique, seulement la quantité réservée (disponible = onHand − reserved). */
export async function reserve(tx: Tx, orgId: string, shopId: string, productId: string, qty: number) {
  await ensureLevel(tx, productId, shopId);
  const updated = await tx.stockLevel.updateMany({
    where: { productId, shopId, onHand: { gte: qty } },
    data: { reserved: { increment: qty } },
  });
  if (updated.count !== 1) throw new ConflictError("Quantité disponible insuffisante pour réserver");
  void orgId;
}

export async function release(tx: Tx, shopId: string, productId: string, qty: number) {
  const updated = await tx.stockLevel.updateMany({
    where: { productId, shopId, reserved: { gte: qty } },
    data: { reserved: { decrement: qty } },
  });
  if (updated.count !== 1) throw new ConflictError("Réservation incohérente");
}

export async function adjustStock(ctx: Ctx, input: { productId: string; qty: number; reason: string; type?: "IN" | "OUT" | "ADJUSTMENT" }) {
  if (!input.reason.trim()) throw new DomainError("Un motif est obligatoire pour un ajustement");
  const product = await prisma.product.findFirst({ where: { id: input.productId, orgId: ctx.orgId } });
  if (!product) throw new NotFoundError("Produit introuvable");
  const result = await prisma.$transaction((tx) =>
    applyMovement(tx, {
      orgId: ctx.orgId,
      shopId: ctx.shopId,
      productId: input.productId,
      type: input.type ?? "ADJUSTMENT",
      qty: input.qty,
      reason: input.reason,
      unitCostCents: product.costCents,
      authorId: ctx.user.id,
    }),
  );
  await audit(ctx, "stock.adjust", "Product", input.productId, {}, { qty: input.qty, reason: input.reason });
  return result;
}

export async function transferStock(ctx: Ctx, input: { productId: string; toShopId: string; qty: number; reason: string }) {
  if (input.qty <= 0) throw new DomainError("Quantité invalide");
  if (input.toShopId === ctx.shopId) throw new DomainError("La boutique de destination doit être différente");
  const target = await prisma.shop.findFirst({ where: { id: input.toShopId, orgId: ctx.orgId } });
  if (!target) throw new DomainError("Boutique de destination inconnue");
  const refId = `${ctx.shopId}>${input.toShopId}:${Date.now()}`;
  await prisma.$transaction(async (tx) => {
    await applyMovement(tx, { orgId: ctx.orgId, shopId: ctx.shopId, productId: input.productId, type: "TRANSFER_OUT", qty: -input.qty, reason: input.reason, refType: "TRANSFER", refId, authorId: ctx.user.id });
    await applyMovement(tx, { orgId: ctx.orgId, shopId: input.toShopId, productId: input.productId, type: "TRANSFER_IN", qty: input.qty, reason: input.reason, refType: "TRANSFER", refId, authorId: ctx.user.id });
  });
  await audit(ctx, "stock.transfer", "Product", input.productId, {}, input);
}

/** Produits sous le seuil d'alerte pour la boutique (disponible = onHand − reserved). */
export async function lowStock(orgId: string, shopId: string) {
  const levels = await prisma.stockLevel.findMany({
    where: { shopId, product: { orgId, active: true, type: { in: ["PART", "ACCESSORY", "CONSUMABLE"] } } },
    include: { product: { include: { supplier: true } } },
  });
  return levels
    .filter((l) => l.onHand - l.reserved <= l.product.alertThreshold)
    .map((l) => ({ ...l, available: l.onHand - l.reserved, missing: Math.max(0, l.product.alertThreshold + 1 - (l.onHand - l.reserved) - l.expected) }))
    .sort((a, b) => a.available - b.available);
}
