import { notFound } from "next/navigation";
import { requirePage, ctxHas } from "@/server/auth/guard";
import { getTicket, getTrackingUrl, ticketFinancials } from "@/server/services/tickets";
import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { TicketDetail } from "@/components/repairs/ticket-detail";
import { signedFileUrl } from "@/server/crypto";

export const dynamic = "force-dynamic";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("tickets.view");
  const { id } = await params;
  let t;
  try {
    t = await getTicket(ctx, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const [techs, parts, warrantyOf, related, registerOpen] = await Promise.all([
    prisma.user.findMany({ where: { orgId: ctx.orgId, active: true, role: { in: ["TECH", "MANAGER", "ADMIN"] } }, select: { id: true, name: true } }),
    prisma.product.findMany({ where: { orgId: ctx.orgId, active: true, type: { in: ["PART", "CONSUMABLE", "ACCESSORY"] } }, include: { stockLevels: { where: { shopId: ctx.shopId } } }, orderBy: { name: "asc" } }),
    t.warrantyOfTicketId ? prisma.repairTicket.findUnique({ where: { id: t.warrantyOfTicketId }, select: { id: true, number: true } }) : null,
    prisma.repairTicket.findMany({ where: { warrantyOfTicketId: t.id }, select: { id: true, number: true, status: true } }),
    prisma.registerSession.findFirst({ where: { shopId: ctx.shopId, status: "OPEN" } }),
  ]);
  const fin = ticketFinancials(t);
  const trackingUrl = ctxHas(ctx, "tickets.edit") ? await getTrackingUrl(ctx, id) : null;
  const data = {
    ...t,
    promisedAt: t.promisedAt?.toISOString() ?? null,
    receivedAt: t.receivedAt.toISOString(),
    readyAt: t.readyAt?.toISOString() ?? null,
    deliveredAt: t.deliveredAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    closedAt: t.closedAt?.toISOString() ?? null,
    unlockCodeExpiresAt: t.unlockCodeExpiresAt?.toISOString() ?? null,
    trackingRevokedAt: t.trackingRevokedAt?.toISOString() ?? null,
    hasUnlockCode: Boolean(t.unlockCodeEnc),
    unlockCodeEnc: undefined,
    trackingTokenHash: undefined,
    trackingTokenEnc: undefined,
    trackingUrl,
    trackingDocPin: undefined,
    customer: { ...t.customer, createdAt: t.customer.createdAt.toISOString(), updatedAt: t.customer.updatedAt.toISOString() },
    device: { ...t.device, createdAt: t.device.createdAt.toISOString() },
    shop: { ...t.shop, createdAt: t.shop.createdAt.toISOString() },
    events: t.events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    interventions: t.interventions.map((i) => ({ ...i, createdAt: i.createdAt.toISOString(), technician: techs.find((u) => u.id === i.technicianId)?.name ?? "" })),
    quotes: t.quotes.map((q) => ({ ...q, sentAt: q.sentAt?.toISOString() ?? null, decidedAt: q.decidedAt?.toISOString() ?? null, createdAt: q.createdAt.toISOString() })),
    parts: t.parts.map((p) => ({ ...p, reservedAt: p.reservedAt.toISOString(), consumedAt: p.consumedAt?.toISOString() ?? null, releasedAt: p.releasedAt?.toISOString() ?? null, product: { ...p.product, createdAt: p.product.createdAt.toISOString(), updatedAt: p.product.updatedAt.toISOString() } })),
    attachments: t.attachments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString(), url: signedFileUrl(a.storageKey, 3600) })),
    payments: t.payments.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), settledAt: p.settledAt?.toISOString() ?? null })),
  };
  return (
    <TicketDetail
      ticket={data}
      fin={fin}
      techs={techs}
      catalog={parts.map((p) => ({ id: p.id, name: p.name, sku: p.sku, priceCents: p.priceCents, costCents: p.costCents, available: (p.stockLevels[0]?.onHand ?? 0) - (p.stockLevels[0]?.reserved ?? 0), compat: JSON.parse(p.compatibilitiesJson) as string[] }))}
      perms={{ transition: ctxHas(ctx, "tickets.transition"), edit: ctxHas(ctx, "tickets.edit"), quotes: ctxHas(ctx, "quotes.manage"), parts: ctxHas(ctx, "parts.manage"), pay: ctxHas(ctx, "payments.record"), unlock: ctxHas(ctx, "tickets.unlock_code.view"), adjust: ctxHas(ctx, "inventory.adjust"), assign: ctxHas(ctx, "tickets.assign") }}
      warrantyOf={warrantyOf}
      related={related}
      registerOpen={Boolean(registerOpen)}
    />
  );
}
