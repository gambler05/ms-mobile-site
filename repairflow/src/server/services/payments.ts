import { z } from "zod";
import { prisma, type Tx } from "@/server/db";
import type { Ctx } from "@/server/auth/guard";
import { ctxHas } from "@/server/auth/guard";
import { audit } from "@/server/audit";
import { ConflictError, DomainError, NotFoundError } from "@/server/errors";
import { nextNumber } from "./counters";
import { applyMovement } from "./stock";
import { computeTotals } from "@/lib/money";
import { PAYMENT_METHODS, initialPaymentStatus, type PaymentMethod } from "@/lib/domain/sales";
import { LIMITED_DISCOUNT_MAX_BP } from "@/lib/domain/roles";
import { recomputeSegment } from "./customers";

// ---------------------------------------------------------------------------
// Caisse : sessions d'ouverture / clôture
// ---------------------------------------------------------------------------

export async function currentRegister(shopId: string) {
  return prisma.registerSession.findFirst({ where: { shopId, status: "OPEN" }, orderBy: { openedAt: "desc" } });
}

export async function openRegister(ctx: Ctx, openingCashCents: number) {
  if (await currentRegister(ctx.shopId)) throw new ConflictError("Une caisse est déjà ouverte");
  const s = await prisma.registerSession.create({ data: { shopId: ctx.shopId, openedById: ctx.user.id, openingCashCents } });
  await audit(ctx, "register.open", "RegisterSession", s.id, {}, { openingCashCents });
  return s;
}

export async function registerSummary(sessionId: string) {
  const session = await prisma.registerSession.findUniqueOrThrow({ where: { id: sessionId } });
  const payments = await prisma.payment.findMany({ where: { registerSessionId: sessionId, status: { not: "FAILED" } } });
  const byMethod: Record<string, number> = {};
  for (const p of payments) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amountCents;
  const expectedCashCents = session.openingCashCents + (byMethod.CASH ?? 0);
  return { session, byMethod, expectedCashCents, count: payments.length };
}

export async function closeRegister(ctx: Ctx, countedCashCents: number, differenceReason: string) {
  const open = await currentRegister(ctx.shopId);
  if (!open) throw new ConflictError("Aucune caisse ouverte");
  const { expectedCashCents } = await registerSummary(open.id);
  const differenceCents = countedCashCents - expectedCashCents;
  if (differenceCents !== 0 && differenceReason.trim().length < 3) throw new DomainError("Un écart de caisse doit être justifié");
  const closed = await prisma.registerSession.update({
    where: { id: open.id },
    data: { status: "CLOSED", closedAt: new Date(), closedById: ctx.user.id, expectedCashCents, countedCashCents, differenceCents, differenceReason },
  });
  await audit(ctx, "register.close", "RegisterSession", open.id, {}, { expectedCashCents, countedCashCents, differenceCents, differenceReason });
  return closed;
}

// ---------------------------------------------------------------------------
// Paiements sur ticket (acompte, solde)
// ---------------------------------------------------------------------------

export async function recordTicketPaymentTx(tx: Tx, ctx: Ctx, ticketId: string, p: { amountCents: number; method: PaymentMethod; kind: "DEPOSIT" | "PAYMENT"; idempotencyKey?: string; providerRef?: string }) {
  if (p.amountCents <= 0) throw new DomainError("Montant invalide");
  if (p.idempotencyKey) {
    const dup = await tx.payment.findUnique({ where: { idempotencyKey: p.idempotencyKey } });
    if (dup) return dup;
  }
  const register = await tx.registerSession.findFirst({ where: { shopId: ctx.shopId, status: "OPEN" } });
  if (p.method === "CASH" && !register) throw new ConflictError("Ouvrez la caisse avant d'encaisser des espèces");
  const status = initialPaymentStatus(p.method);
  return tx.payment.create({
    data: {
      orgId: ctx.orgId,
      shopId: ctx.shopId,
      ticketId,
      registerSessionId: register?.id ?? null,
      method: p.method,
      kind: p.kind,
      amountCents: p.amountCents,
      status,
      settledAt: status === "SETTLED" ? new Date() : null,
      providerRef: p.providerRef ?? "",
      idempotencyKey: p.idempotencyKey ?? null,
      authorId: ctx.user.id,
    },
  });
}

export async function recordTicketPayment(ctx: Ctx, ticketId: string, input: { amountCents: number; method: PaymentMethod; kind: "DEPOSIT" | "PAYMENT"; idempotencyKey?: string }) {
  const parsed = z.object({ amountCents: z.number().int().positive(), method: z.enum(PAYMENT_METHODS), kind: z.enum(["DEPOSIT", "PAYMENT"]), idempotencyKey: z.string().max(80).optional() }).parse(input);
  const t = await prisma.repairTicket.findFirst({ where: { id: ticketId, orgId: ctx.orgId }, include: { quotes: true, payments: true, shop: true, customer: true } });
  if (!t) throw new NotFoundError("Ticket introuvable");
  const { ticketFinancials } = await import("./tickets");
  const fin = ticketFinancials(t);
  if (parsed.kind === "PAYMENT" && parsed.amountCents > fin.balanceDueCents) throw new DomainError(`Le montant dépasse le solde dû (${(fin.balanceDueCents / 100).toFixed(2)} €)`);
  const payment = await prisma.$transaction(async (tx) => {
    const pay = await recordTicketPaymentTx(tx, ctx, ticketId, parsed);
    // Règlement du solde : une vente de type « règlement réparation » est générée pour la comptabilité de caisse.
    if (parsed.kind === "PAYMENT") {
      const number = await nextNumber(tx, ctx.shopId, "SALE", "VTE");
      const sale = await tx.sale.create({
        data: {
          orgId: ctx.orgId,
          shopId: ctx.shopId,
          number,
          kind: "REPAIR_SETTLEMENT",
          customerId: t.customerId,
          ticketId,
          sellerId: ctx.user.id,
          registerSessionId: pay.registerSessionId,
          subtotalCents: parsed.amountCents,
          taxCents: computeTotals([{ qty: 1, unitCents: parsed.amountCents, taxRateBp: t.taxRateBp }]).taxCents,
          totalCents: parsed.amountCents,
          lines: { create: [{ label: `Réparation ${t.number}`, qty: 1, unitCents: parsed.amountCents, taxRateBp: t.taxRateBp, totalCents: parsed.amountCents }] },
        },
      });
      await tx.payment.update({ where: { id: pay.id }, data: { saleId: sale.id } });
    }
    await tx.ticketEvent.create({
      data: {
        ticketId,
        type: "PAYMENT",
        message: `${parsed.kind === "DEPOSIT" ? "Acompte" : "Règlement"} de ${(parsed.amountCents / 100).toFixed(2)} € (${parsed.method})${pay.status === "RECORDED" ? " — en attente de confirmation" : ""}`,
        payloadJson: JSON.stringify({ paymentId: pay.id, amountCents: parsed.amountCents, method: parsed.method }),
        visibleToCustomer: true,
        authorId: ctx.user.id,
        authorName: ctx.user.name,
      },
    });
    return pay;
  });
  await audit(ctx, "payment.record", "Payment", payment.id, {}, parsed);
  await recomputeSegment(t.customerId);
  return payment;
}

/** Confirmation d'encaissement effectif (terminal, virement reçu, webhook prestataire). */
export async function settlePayment(ctx: Ctx | null, paymentId: string, providerRef = "") {
  const r = await prisma.payment.updateMany({ where: { id: paymentId, status: "RECORDED", ...(ctx ? { orgId: ctx.orgId } : {}) }, data: { status: "SETTLED", settledAt: new Date(), providerRef } });
  if (r.count === 1 && ctx) await audit(ctx, "payment.settle", "Payment", paymentId, { status: "RECORDED" }, { status: "SETTLED", providerRef });
  return r.count === 1;
}

export async function failPayment(ctx: Ctx, paymentId: string, reason: string) {
  const r = await prisma.payment.updateMany({ where: { id: paymentId, status: "RECORDED", orgId: ctx.orgId }, data: { status: "FAILED", providerRef: reason } });
  if (r.count === 1) await audit(ctx, "payment.fail", "Payment", paymentId, {}, { reason });
  return r.count === 1;
}

// ---------------------------------------------------------------------------
// Ventes en caisse
// ---------------------------------------------------------------------------

/** Catalogue vendable de la boutique (recherche par nom, SKU, code-barres, marque). */
export async function posCatalog(ctx: Ctx, q: string) {
  const term = q.trim();
  const rows = await prisma.product.findMany({
    where: { orgId: ctx.orgId, active: true, priceCents: { gt: 0 }, ...(term ? { OR: [{ name: { contains: term } }, { sku: { contains: term.toUpperCase() } }, { barcode: term }, { brand: { contains: term } }] } : {}) },
    include: { stockLevels: { where: { shopId: ctx.shopId } }, units: { where: { shopId: ctx.shopId, status: "IN_STOCK" }, select: { id: true, imei: true, serial: true, grade: true, color: true, capacity: true } } },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    take: 80,
  });
  return rows.map((p) => ({ id: p.id, name: p.name, sku: p.sku, barcode: p.barcode, type: p.type, category: p.category, priceCents: p.priceCents, taxRateBp: p.taxRateBp, serialized: p.serialized, available: (p.stockLevels[0]?.onHand ?? 0) - (p.stockLevels[0]?.reserved ?? 0), units: p.units }));
}

export const saleSchema = z.object({
  customerId: z.string().nullable().default(null),
  lines: z
    .array(
      z.object({
        productId: z.string(),
        serializedUnitId: z.string().optional(),
        qty: z.number().int().min(1).max(999),
        unitCents: z.number().int().min(0),
        discountCents: z.number().int().min(0).default(0),
      }),
    )
    .min(1),
  globalDiscountCents: z.number().int().min(0).default(0),
  payments: z.array(z.object({ method: z.enum(PAYMENT_METHODS), amountCents: z.number().int().positive(), creditNoteId: z.string().optional() })).min(1),
  notes: z.string().max(500).default(""),
  idempotencyKey: z.string().min(8).max(80),
});
export type SaleInput = z.infer<typeof saleSchema>;

export async function createSale(ctx: Ctx, raw: SaleInput) {
  const input = saleSchema.parse(raw);
  const existing = await prisma.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { sale: true } });
  if (existing?.sale) return existing.sale; // rejouer la même requête ne crée pas de doublon

  const products = await prisma.product.findMany({ where: { id: { in: input.lines.map((l) => l.productId) }, orgId: ctx.orgId, active: true } });
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const l of input.lines) if (!byId.has(l.productId)) throw new NotFoundError("Produit introuvable ou inactif");

  const lineInputs = input.lines.map((l) => ({ qty: l.qty, unitCents: l.unitCents, discountCents: l.discountCents, taxRateBp: byId.get(l.productId)!.taxRateBp }));
  const totals = computeTotals(lineInputs, input.globalDiscountCents);

  // Contrôle des remises selon le rôle.
  const catalogTotal = input.lines.reduce((s, l) => s + l.qty * byId.get(l.productId)!.priceCents, 0);
  const effectiveDiscount = Math.max(0, catalogTotal - totals.totalCents);
  if (effectiveDiscount > 0 && !ctxHas(ctx, "pos.discount.any")) {
    if (!ctxHas(ctx, "pos.discount.limited")) throw new DomainError("Vous n'êtes pas autorisé à accorder une remise", "forbidden", 403);
    if (catalogTotal > 0 && effectiveDiscount * 10_000 > catalogTotal * LIMITED_DISCOUNT_MAX_BP) {
      throw new DomainError(`Remise limitée à ${LIMITED_DISCOUNT_MAX_BP / 100} % pour votre rôle : demandez une validation`, "forbidden", 403);
    }
  }

  const paid = input.payments.reduce((s, p) => s + p.amountCents, 0);
  if (paid !== totals.totalCents) throw new DomainError(`Le total des paiements (${(paid / 100).toFixed(2)} €) doit égaler le montant dû (${(totals.totalCents / 100).toFixed(2)} €)`);

  const register = await currentRegister(ctx.shopId);
  if (input.payments.some((p) => p.method === "CASH") && !register) throw new ConflictError("Ouvrez la caisse avant d'encaisser des espèces");

  const sale = await prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, ctx.shopId, "SALE", "VTE");
    const s = await tx.sale.create({
      data: {
        orgId: ctx.orgId,
        shopId: ctx.shopId,
        number,
        kind: "SALE",
        customerId: input.customerId,
        sellerId: ctx.user.id,
        registerSessionId: register?.id ?? null,
        ...totals,
        notes: input.notes,
      },
    });
    for (const l of input.lines) {
      const p = byId.get(l.productId)!;
      const line = await tx.saleLine.create({
        data: { saleId: s.id, productId: p.id, serializedUnitId: l.serializedUnitId ?? null, label: p.name, qty: l.qty, unitCents: l.unitCents, unitCostCents: p.costCents, discountCents: l.discountCents, taxRateBp: p.taxRateBp, totalCents: l.qty * l.unitCents - l.discountCents },
      });
      if (p.serialized) {
        if (!l.serializedUnitId || l.qty !== 1) throw new DomainError(`${p.name} : sélectionnez l'unité (numéro de série)`);
        // Empêche deux ventes concurrentes de la même unité : seul le premier UPDATE conditionnel réussit.
        const claimed = await tx.serializedUnit.updateMany({ where: { id: l.serializedUnitId, productId: p.id, shopId: ctx.shopId, status: "IN_STOCK" }, data: { status: "SOLD", saleLineId: line.id } });
        if (claimed.count !== 1) throw new ConflictError(`${p.name} : cette unité vient d'être vendue ou n'est plus disponible`);
      }
      await applyMovement(tx, { orgId: ctx.orgId, shopId: ctx.shopId, productId: p.id, type: "SALE", qty: -l.qty, refType: "SALE", refId: s.id, unitCostCents: p.costCents, authorId: ctx.user.id, reason: `Vente ${number}` });
    }
    for (const [i, pay] of input.payments.entries()) {
      if (pay.method === "CREDIT_NOTE") {
        if (!pay.creditNoteId || !input.customerId) throw new DomainError("Avoir requis");
        const used = await tx.creditNote.updateMany({ where: { id: pay.creditNoteId, customerId: input.customerId, remainingCents: { gte: pay.amountCents } }, data: { remainingCents: { decrement: pay.amountCents } } });
        if (used.count !== 1) throw new ConflictError("Avoir insuffisant ou déjà utilisé");
      }
      const status = initialPaymentStatus(pay.method);
      await tx.payment.create({
        data: { orgId: ctx.orgId, shopId: ctx.shopId, saleId: s.id, registerSessionId: register?.id ?? null, method: pay.method, kind: "PAYMENT", amountCents: pay.amountCents, status, settledAt: status === "SETTLED" ? new Date() : null, idempotencyKey: i === 0 ? input.idempotencyKey : `${input.idempotencyKey}:${i}`, authorId: ctx.user.id },
      });
    }
    return s;
  });
  await audit(ctx, "sale.create", "Sale", sale.id, {}, { number: sale.number, totalCents: sale.totalCents });
  if (input.customerId) {
    await addLoyaltyPoints(ctx.orgId, input.customerId, sale.totalCents);
    await recomputeSegment(input.customerId);
  }
  return sale;
}

async function addLoyaltyPoints(orgId: string, customerId: string, totalCents: number) {
  const s = await prisma.setting.findUnique({ where: { orgId_key: { orgId, key: "loyalty" } } });
  const cfg = s ? (JSON.parse(s.valueJson) as { enabled: boolean; pointsPerEuro: number }) : { enabled: true, pointsPerEuro: 1 };
  if (!cfg.enabled) return;
  const points = Math.floor((totalCents / 100) * cfg.pointsPerEuro);
  if (points > 0) await prisma.customer.update({ where: { id: customerId }, data: { loyaltyPoints: { increment: points } } });
}

/** Retour / remboursement partiel ou total : vente négative liée, remise en stock, avoir ou remboursement. */
export async function refundSale(ctx: Ctx, saleId: string, input: { lines: { saleLineId: string; qty: number }[]; method: "CASH" | "CARD" | "TRANSFER" | "CREDIT_NOTE"; reason: string; restock: boolean }) {
  if (!ctxHas(ctx, "pos.refund")) throw new DomainError("Permission de remboursement requise", "forbidden", 403);
  if (input.reason.trim().length < 3) throw new DomainError("Motif obligatoire");
  const sale = await prisma.sale.findFirst({ where: { id: saleId, orgId: ctx.orgId }, include: { lines: true } });
  if (!sale || sale.kind === "RETURN") throw new NotFoundError("Vente introuvable");
  const register = await currentRegister(ctx.shopId);
  if (input.method === "CASH" && !register) throw new ConflictError("Ouvrez la caisse pour rembourser en espèces");

  const result = await prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, ctx.shopId, "SALE", "RET");
    let total = 0;
    let tax = 0;
    const ret = await tx.sale.create({ data: { orgId: ctx.orgId, shopId: ctx.shopId, number, kind: "RETURN", customerId: sale.customerId, refundOfSaleId: sale.id, sellerId: ctx.user.id, registerSessionId: register?.id ?? null, notes: input.reason } });
    for (const r of input.lines) {
      const line = sale.lines.find((l) => l.id === r.saleLineId);
      if (!line || r.qty < 1 || r.qty > line.qty) throw new DomainError("Ligne de retour invalide");
      const alreadyReturned = await tx.saleLine.aggregate({ where: { sale: { refundOfSaleId: sale.id }, label: line.label, productId: line.productId }, _sum: { qty: true } });
      if ((-(alreadyReturned._sum.qty ?? 0)) + r.qty > line.qty) throw new ConflictError("Quantité déjà retournée");
      const unitNet = Math.round((line.totalCents / line.qty)); // remise ligne répartie
      const amount = unitNet * r.qty;
      total += amount;
      tax += computeTotals([{ qty: r.qty, unitCents: unitNet, taxRateBp: line.taxRateBp }]).taxCents;
      await tx.saleLine.create({ data: { saleId: ret.id, productId: line.productId, label: line.label, qty: -r.qty, unitCents: line.unitCents, unitCostCents: line.unitCostCents, taxRateBp: line.taxRateBp, totalCents: -amount } });
      if (line.productId && input.restock) {
        await applyMovement(tx, { orgId: ctx.orgId, shopId: ctx.shopId, productId: line.productId, type: "RETURN", qty: r.qty, refType: "SALE", refId: ret.id, unitCostCents: line.unitCostCents, authorId: ctx.user.id, reason: `Retour ${number} : ${input.reason}` });
        if (line.serializedUnitId) await tx.serializedUnit.update({ where: { id: line.serializedUnitId }, data: { status: "IN_STOCK", saleLineId: null } });
      }
    }
    await tx.sale.update({ where: { id: ret.id }, data: { subtotalCents: -total, taxCents: -tax, totalCents: -total } });
    const fullyRefunded = total >= sale.totalCents;
    await tx.sale.update({ where: { id: sale.id }, data: { status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
    let creditNoteId: string | null = null;
    if (input.method === "CREDIT_NOTE") {
      if (!sale.customerId) throw new DomainError("Un avoir nécessite un client identifié");
      const cn = await tx.creditNote.create({ data: { orgId: ctx.orgId, customerId: sale.customerId, number: await nextNumber(tx, ctx.shopId, "CREDIT", "AV"), amountCents: total, remainingCents: total, sourceSaleId: sale.id, expiresAt: new Date(Date.now() + 365 * 86_400_000) } });
      creditNoteId = cn.id;
    }
    await tx.payment.create({ data: { orgId: ctx.orgId, shopId: ctx.shopId, saleId: ret.id, registerSessionId: register?.id ?? null, method: input.method, kind: "REFUND", amountCents: -total, status: "SETTLED", settledAt: new Date(), authorId: ctx.user.id } });
    return { ret, total, creditNoteId };
  });
  await audit(ctx, "sale.refund", "Sale", saleId, {}, { ...input, total: result.total });
  return result;
}
