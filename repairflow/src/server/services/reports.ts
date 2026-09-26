import { prisma } from "@/server/db";
import type { Ctx } from "@/server/auth/guard";
import { ACTIVE_STATUSES } from "@/lib/domain/tickets";
import { differenceInHours, eachDayOfInterval, endOfDay, format, startOfDay, subDays } from "date-fns";

/**
 * Méthodes de calcul (documentées dans docs/RAPPORTS.md) :
 * - Encaissé aujourd'hui : somme des paiements SETTLED du jour (acomptes et ventes inclus, remboursements déduits).
 * - Ventes : total TTC des ventes de type SALE (moins retours) par date de vente.
 * - Réparations facturées : total des règlements de réparation (REPAIR_SETTLEMENT) + acomptes réglés.
 * - Marge brute vente = total TTC HT-isé − coût d'achat des lignes (coût unitaire figé à la vente).
 * - Marge brute réparation = total devis accepté HT − coût des pièces consommées.
 * - Durée moyenne = réception → prêt, en heures, sur les tickets prêts/livrés de la période.
 * - Respect des délais = part des tickets prêts avant ou à la date promise.
 * - Taux de retour garantie = tickets avec warrantyOfTicketId / tickets livrés de la période.
 */

export interface Period {
  from: Date;
  to: Date;
}

export function periodFromKey(key: string): Period {
  const now = new Date();
  const days = key === "7d" ? 7 : key === "90d" ? 90 : key === "365d" ? 365 : key === "1d" ? 1 : 30;
  return { from: startOfDay(subDays(now, days - 1)), to: endOfDay(now) };
}

export async function dashboardMetrics(ctx: Ctx) {
  const now = new Date();
  const dayStart = startOfDay(now);
  const shopId = ctx.shopId;
  const [settledToday, active, ready, overdue, lowStockCount] = await Promise.all([
    prisma.payment.aggregate({ where: { shopId, status: "SETTLED", settledAt: { gte: dayStart } }, _sum: { amountCents: true } }),
    prisma.repairTicket.count({ where: { shopId, isDraft: false, status: { in: [...ACTIVE_STATUSES] } } }),
    prisma.repairTicket.count({ where: { shopId, isDraft: false, status: "READY" } }),
    prisma.repairTicket.count({ where: { shopId, isDraft: false, status: { in: [...ACTIVE_STATUSES] }, promisedAt: { lt: now } } }),
    prisma.stockLevel.findMany({ where: { shopId, product: { active: true, type: { in: ["PART", "ACCESSORY", "CONSUMABLE"] } } }, include: { product: { select: { alertThreshold: true } } } }),
  ]);
  return {
    settledTodayCents: settledToday._sum.amountCents ?? 0,
    activeRepairs: active,
    readyForPickup: ready,
    overdue,
    lowStock: lowStockCount.filter((l) => l.onHand - l.reserved <= l.product.alertThreshold).length,
  };
}

export async function revenueSeries(ctx: Ctx, period: Period) {
  const [sales, settlements, payments] = await Promise.all([
    prisma.sale.findMany({ where: { shopId: ctx.shopId, kind: { in: ["SALE", "RETURN"] }, createdAt: { gte: period.from, lte: period.to } }, select: { createdAt: true, totalCents: true } }),
    prisma.sale.findMany({ where: { shopId: ctx.shopId, kind: "REPAIR_SETTLEMENT", createdAt: { gte: period.from, lte: period.to } }, select: { createdAt: true, totalCents: true } }),
    prisma.payment.findMany({ where: { shopId: ctx.shopId, status: "SETTLED", settledAt: { gte: period.from, lte: period.to } }, select: { settledAt: true, amountCents: true } }),
  ]);
  const days = eachDayOfInterval({ start: period.from, end: period.to });
  const byDay = new Map(days.map((d) => [format(d, "yyyy-MM-dd"), { date: format(d, "yyyy-MM-dd"), salesCents: 0, repairsCents: 0, settledCents: 0 }]));
  for (const s of sales) byDay.get(format(s.createdAt, "yyyy-MM-dd"))!.salesCents += s.totalCents;
  for (const s of settlements) byDay.get(format(s.createdAt, "yyyy-MM-dd"))!.repairsCents += s.totalCents;
  for (const p of payments) if (p.settledAt) byDay.get(format(p.settledAt, "yyyy-MM-dd"))!.settledCents += p.amountCents;
  const series = Array.from(byDay.values());
  const totals = series.reduce((a, d) => ({ salesCents: a.salesCents + d.salesCents, repairsCents: a.repairsCents + d.repairsCents, settledCents: a.settledCents + d.settledCents }), { salesCents: 0, repairsCents: 0, settledCents: 0 });
  return { series, totals };
}

/** File « à traiter maintenant » : score d'urgence = retard, priorité, blocage, devis en attente ancien. */
export async function urgentQueue(ctx: Ctx, limit = 8) {
  const now = new Date();
  const tickets = await prisma.repairTicket.findMany({
    where: { shopId: ctx.shopId, isDraft: false, status: { in: [...ACTIVE_STATUSES] } },
    include: { customer: { select: { firstName: true, lastName: true } }, device: { select: { brand: true, model: true } } },
  });
  const scored = tickets.map((t) => {
    let score = 0;
    const reasons: string[] = [];
    if (t.promisedAt && t.promisedAt < now) {
      const h = differenceInHours(now, t.promisedAt);
      score += 50 + Math.min(h, 200);
      reasons.push("overdue");
    } else if (t.promisedAt && differenceInHours(t.promisedAt, now) < 24) {
      score += 30;
      reasons.push("due_soon");
    }
    if (t.priority === "URGENT") score += 40;
    if (t.priority === "HIGH") score += 20;
    if (t.blockReason) {
      score += 10;
      reasons.push("blocked");
    }
    if (t.status === "QUOTE_SENT" && differenceInHours(now, t.updatedAt) > 48) {
      score += 15;
      reasons.push("quote_stale");
    }
    if (t.status === "RECEIVED" && differenceInHours(now, t.receivedAt) > 24) {
      score += 25;
      reasons.push("no_diagnosis");
    }
    return { ticket: t, score, reasons };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function workshopLoad(ctx: Ctx) {
  const techs = await prisma.user.findMany({ where: { orgId: ctx.orgId, active: true, role: { in: ["TECH", "MANAGER", "ADMIN"] }, memberships: { some: { shopId: ctx.shopId } } }, select: { id: true, name: true } });
  const counts = await prisma.repairTicket.groupBy({ by: ["technicianId", "status"], where: { shopId: ctx.shopId, isDraft: false, status: { in: [...ACTIVE_STATUSES] } }, _count: true });
  return techs.map((t) => {
    const mine = counts.filter((c) => c.technicianId === t.id);
    return { ...t, total: mine.reduce((s, c) => s + c._count, 0), inRepair: mine.filter((c) => c.status === "IN_REPAIR").reduce((s, c) => s + c._count, 0) };
  }).concat([{ id: "", name: "Non assigné", total: counts.filter((c) => !c.technicianId).reduce((s, c) => s + c._count, 0), inRepair: 0 }]);
}

export async function readySince(ctx: Ctx, minDays = 3) {
  return prisma.repairTicket.findMany({
    where: { shopId: ctx.shopId, status: "READY", readyAt: { lt: subDays(new Date(), minDays) } },
    include: { customer: { select: { firstName: true, lastName: true, phone: true } }, device: { select: { brand: true, model: true } } },
    orderBy: { readyAt: "asc" },
    take: 10,
  });
}

export async function recentActivity(ctx: Ctx, limit = 12) {
  return prisma.auditLog.findMany({ where: { orgId: ctx.orgId, OR: [{ shopId: ctx.shopId }, { shopId: null }] }, orderBy: { createdAt: "desc" }, take: limit });
}

export async function topProducts(ctx: Ctx, period: Period, limit = 6) {
  const lines = await prisma.saleLine.groupBy({ by: ["productId"], where: { productId: { not: null }, sale: { shopId: ctx.shopId, kind: "SALE", createdAt: { gte: period.from, lte: period.to } } }, _sum: { qty: true, totalCents: true }, orderBy: { _sum: { totalCents: "desc" } }, take: limit });
  const products = await prisma.product.findMany({ where: { id: { in: lines.map((l) => l.productId!) } }, select: { id: true, name: true, sku: true } });
  return lines.map((l) => ({ product: products.find((p) => p.id === l.productId)!, qty: l._sum.qty ?? 0, totalCents: l._sum.totalCents ?? 0 }));
}

// ---------------------------------------------------------------------------
// Rapports détaillés
// ---------------------------------------------------------------------------

export async function financeReport(ctx: Ctx, period: Period, shopId = ctx.shopId) {
  const [sales, settlements, payments, consumedParts, tickets] = await Promise.all([
    prisma.sale.findMany({ where: { shopId, kind: { in: ["SALE", "RETURN"] }, createdAt: { gte: period.from, lte: period.to } }, include: { lines: true } }),
    prisma.sale.findMany({ where: { shopId, kind: "REPAIR_SETTLEMENT", createdAt: { gte: period.from, lte: period.to } } }),
    prisma.payment.groupBy({ by: ["method"], where: { shopId, status: "SETTLED", settledAt: { gte: period.from, lte: period.to } }, _sum: { amountCents: true } }),
    prisma.ticketPart.findMany({ where: { status: "CONSUMED", consumedAt: { gte: period.from, lte: period.to }, ticket: { shopId } } }),
    prisma.repairTicket.findMany({ where: { shopId, status: { in: ["READY", "DELIVERED"] }, readyAt: { gte: period.from, lte: period.to } }, include: { quotes: { where: { status: "ACCEPTED" } }, interventions: true } }),
  ]);
  const salesTotal = sales.reduce((s, x) => s + x.totalCents, 0);
  const salesTax = sales.reduce((s, x) => s + x.taxCents, 0);
  const salesCost = sales.reduce((s, x) => s + x.lines.reduce((a, l) => a + l.qty * l.unitCostCents, 0), 0);
  const repairsTotal = settlements.reduce((s, x) => s + x.totalCents, 0);
  const repairsTax = settlements.reduce((s, x) => s + x.taxCents, 0);
  const partsCost = consumedParts.reduce((s, p) => s + p.qty * p.unitCostCents, 0);
  const laborCents = tickets.reduce((s, t) => s + t.laborCents, 0);
  const acceptedQuotesNet = tickets.reduce((s, t) => s + (t.quotes[0] ? t.quotes[0].totalCents - t.quotes[0].taxCents : 0), 0);
  return {
    salesTotalCents: salesTotal,
    salesNetCents: salesTotal - salesTax,
    salesCostCents: salesCost,
    salesMarginCents: salesTotal - salesTax - salesCost,
    repairsTotalCents: repairsTotal,
    repairsNetCents: repairsTotal - repairsTax,
    partsCostCents: partsCost,
    laborCents,
    repairsMarginCents: acceptedQuotesNet - partsCost,
    settledByMethod: payments.map((p) => ({ method: p.method, amountCents: p._sum.amountCents ?? 0 })),
    settledTotalCents: payments.reduce((s, p) => s + (p._sum.amountCents ?? 0), 0),
  };
}

export async function workshopReport(ctx: Ctx, period: Period, shopId = ctx.shopId) {
  const done = await prisma.repairTicket.findMany({ where: { shopId, isDraft: false, status: { in: ["READY", "DELIVERED"] }, readyAt: { gte: period.from, lte: period.to } }, include: { quotes: { where: { status: "ACCEPTED" } } } });
  const delivered = await prisma.repairTicket.count({ where: { shopId, isDraft: false, status: "DELIVERED", deliveredAt: { gte: period.from, lte: period.to } } });
  const warrantyReturns = await prisma.repairTicket.count({ where: { shopId, warrantyOfTicketId: { not: null }, createdAt: { gte: period.from, lte: period.to } } });
  const durations = done.map((t) => differenceInHours(t.readyAt!, t.receivedAt));
  const onTime = done.filter((t) => !t.promisedAt || t.readyAt! <= t.promisedAt).length;
  const techs = await prisma.user.findMany({ where: { orgId: ctx.orgId, active: true }, select: { id: true, name: true } });
  const perTech = techs
    .map((u) => {
      const mine = done.filter((t) => t.technicianId === u.id);
      return { id: u.id, name: u.name, completed: mine.length, revenueCents: mine.reduce((s, t) => s + (t.quotes[0]?.totalCents ?? t.estimateCents), 0), avgHours: mine.length ? Math.round(mine.reduce((s, t) => s + differenceInHours(t.readyAt!, t.receivedAt), 0) / mine.length) : 0, onTime: mine.filter((t) => !t.promisedAt || t.readyAt! <= t.promisedAt).length };
    })
    .filter((t) => t.completed > 0);
  const byKind = await prisma.repairTicket.groupBy({ by: ["deviceId"], where: { shopId, createdAt: { gte: period.from, lte: period.to } }, _count: true });
  const devices = await prisma.device.findMany({ where: { id: { in: byKind.map((b) => b.deviceId) } }, select: { id: true, kind: true } });
  const kindCounts: Record<string, number> = {};
  for (const b of byKind) {
    const k = devices.find((d) => d.id === b.deviceId)?.kind ?? "OTHER";
    kindCounts[k] = (kindCounts[k] ?? 0) + b._count;
  }
  return {
    completed: done.length,
    delivered,
    avgHours: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
    onTimeRateBp: done.length ? Math.round((onTime / done.length) * 10_000) : 0,
    warrantyReturnRateBp: delivered ? Math.round((warrantyReturns / delivered) * 10_000) : 0,
    warrantyReturns,
    perTech,
    kindCounts,
  };
}

export async function stockReport(ctx: Ctx, shopId = ctx.shopId) {
  const levels = await prisma.stockLevel.findMany({ where: { shopId, product: { active: true } }, include: { product: true } });
  const since = subDays(new Date(), 90);
  const sold = await prisma.stockMovement.groupBy({ by: ["productId"], where: { shopId, type: { in: ["SALE", "CONSUMPTION"] }, createdAt: { gte: since } }, _sum: { qty: true } });
  const soldMap = new Map(sold.map((s) => [s.productId, -(s._sum.qty ?? 0)]));
  const byCategory: Record<string, { valueCents: number; items: number; sold90: number }> = {};
  let immobilized = 0;
  let valueCents = 0;
  const rows = levels.map((l) => {
    const value = l.onHand * l.product.costCents;
    valueCents += value;
    const sold90 = soldMap.get(l.productId) ?? 0;
    const cat = l.product.category || l.product.type;
    byCategory[cat] = byCategory[cat] ?? { valueCents: 0, items: 0, sold90: 0 };
    byCategory[cat].valueCents += value;
    byCategory[cat].items += l.onHand;
    byCategory[cat].sold90 += sold90;
    const rotation = l.onHand > 0 ? sold90 / l.onHand : 0; // ventes 90 j / stock actuel
    if (l.onHand > 0 && sold90 === 0) immobilized += value;
    return { product: l.product, onHand: l.onHand, reserved: l.reserved, valueCents: value, sold90, rotation };
  });
  return { valueCents, immobilizedCents: immobilized, byCategory, rows: rows.sort((a, b) => b.valueCents - a.valueCents) };
}

export async function categoryProfitability(ctx: Ctx, period: Period, shopId = ctx.shopId) {
  const lines = await prisma.saleLine.findMany({ where: { sale: { shopId, kind: { in: ["SALE", "RETURN"] }, createdAt: { gte: period.from, lte: period.to } } }, include: { product: { select: { category: true, type: true } } } });
  const out: Record<string, { revenueCents: number; costCents: number; qty: number }> = {};
  for (const l of lines) {
    const k = l.product?.category || l.product?.type || "Autre";
    out[k] = out[k] ?? { revenueCents: 0, costCents: 0, qty: 0 };
    out[k].revenueCents += l.totalCents;
    out[k].costCents += l.qty * l.unitCostCents;
    out[k].qty += l.qty;
  }
  return Object.entries(out).map(([category, v]) => ({ category, ...v, marginCents: v.revenueCents - v.costCents })).sort((a, b) => b.revenueCents - a.revenueCents);
}

export async function shopComparison(ctx: Ctx, period: Period) {
  const shops = ctx.user.shops;
  return Promise.all(shops.map(async (s) => ({ shop: s, finance: await financeReport(ctx, period, s.id), workshop: await workshopReport(ctx, period, s.id) })));
}
