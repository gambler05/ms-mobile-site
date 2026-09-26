import { z } from "zod";
import { prisma, type Tx } from "@/server/db";
import type { Ctx } from "@/server/auth/guard";
import { ctxHas } from "@/server/auth/guard";
import { audit } from "@/server/audit";
import { ConflictError, DomainError, NotFoundError } from "@/server/errors";
import { nextNumber } from "./counters";
import { applyMovement, release, reserve } from "./stock";
import { emitEvent } from "./notifications";
import { customerSchema, createCustomer } from "./customers";
import { decryptSecret, encryptSecret, generatePin, generateToken, hashToken } from "@/server/crypto";
import { computeTotals } from "@/lib/money";
import {
  BLOCK_REASONS,
  DEFAULT_QC_ITEMS,
  DEVICE_KINDS,
  PRIORITIES,
  TICKET_STATUSES,
  transitionGuard,
  type TicketStatus,
} from "@/lib/domain/tickets";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

// ---------------------------------------------------------------------------
// Schémas
// ---------------------------------------------------------------------------

export const deviceSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(DEVICE_KINDS),
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(80),
  color: z.string().trim().max(40).default(""),
  imei: z.string().trim().max(20).default(""),
  serial: z.string().trim().max(60).default(""),
});

export const ticketCreateSchema = z.object({
  customerId: z.string().optional(),
  newCustomer: customerSchema.optional(),
  device: deviceSchema,
  reportedIssue: z.string().trim().min(3).max(2000),
  cosmeticState: z.string().trim().max(500).default(""),
  reception: z.record(z.string(), z.boolean()).default({}),
  accessories: z.array(z.string().trim().min(1).max(60)).default([]),
  technicianId: z.string().nullable().default(null),
  promisedAt: z.string().datetime().nullable().default(null),
  priority: z.enum(PRIORITIES).default("NORMAL"),
  estimateCents: z.number().int().min(0).default(0),
  depositCents: z.number().int().min(0).default(0),
  depositMethod: z.enum(["CASH", "CARD", "TRANSFER"]).default("CASH"),
  unlockCode: z.string().max(64).optional(),
  warrantyMonths: z.number().int().min(0).max(24).default(3),
  signatureDataUrl: z.string().max(400_000).optional(),
  consentAccepted: z.boolean().default(false),
  warrantyOfTicketId: z.string().optional(),
  internalNotes: z.string().max(2000).default(""),
});
export type TicketCreateInput = z.infer<typeof ticketCreateSchema>;

export const quoteLineSchema = z.object({
  kind: z.enum(["PART", "LABOR", "OTHER"]),
  productId: z.string().optional(),
  label: z.string().trim().min(1).max(200),
  qty: z.number().int().min(1).max(999),
  unitCents: z.number().int().min(0),
  taxRateBp: z.number().int().min(0).max(5000).default(2000),
});
export const quoteSchema = z.object({
  lines: z.array(quoteLineSchema).min(1),
  discountCents: z.number().int().min(0).default(0),
  note: z.string().max(1000).default(""),
});

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export const ticketInclude = {
  customer: true,
  device: true,
  shop: true,
  events: { orderBy: { createdAt: "desc" as const } },
  interventions: { orderBy: { createdAt: "asc" as const } },
  quotes: { include: { lines: { orderBy: { position: "asc" as const } } }, orderBy: { version: "desc" as const } },
  parts: { include: { product: true } },
  attachments: { orderBy: { createdAt: "asc" as const } },
  payments: { orderBy: { createdAt: "asc" as const } },
} as const;

export async function getTicket(ctx: Ctx, id: string) {
  const t = await prisma.repairTicket.findFirst({ where: { id, orgId: ctx.orgId }, include: ticketInclude });
  if (!t) throw new NotFoundError("Ticket introuvable");
  return t;
}

export type TicketFull = Awaited<ReturnType<typeof getTicket>>;

/** Total dû, acomptes et solde. Le total est celui du devis accepté sinon l'estimation. */
export function ticketFinancials(t: { estimateCents: number; laborCents: number; discountCents: number; quotes: { status: string; totalCents: number }[]; payments: { amountCents: number; status: string; kind: string }[] }) {
  const accepted = t.quotes.find((q) => q.status === "ACCEPTED");
  const totalCents = accepted ? accepted.totalCents : t.estimateCents;
  const paidCents = t.payments.filter((p) => p.status !== "FAILED").reduce((s, p) => s + p.amountCents, 0);
  const depositCents = t.payments.filter((p) => p.kind === "DEPOSIT" && p.status !== "FAILED").reduce((s, p) => s + p.amountCents, 0);
  return { totalCents, paidCents, depositCents, balanceDueCents: Math.max(0, totalCents - paidCents), hasAcceptedQuote: Boolean(accepted) };
}

export interface TicketFilters {
  q?: string;
  status?: TicketStatus[];
  technicianId?: string;
  priority?: string;
  overdue?: boolean;
  ready?: boolean;
  blocked?: boolean;
  includeDrafts?: boolean;
  from?: Date;
  to?: Date;
  shopId?: string;
  sort?: "promisedAt" | "createdAt" | "number";
}

export async function listTickets(ctx: Ctx, f: TicketFilters = {}) {
  const now = new Date();
  return prisma.repairTicket.findMany({
    where: {
      orgId: ctx.orgId,
      shopId: f.shopId ?? ctx.shopId,
      isDraft: f.includeDrafts ? undefined : false,
      ...(f.status?.length ? { status: { in: f.status } } : {}),
      ...(f.technicianId ? { technicianId: f.technicianId } : {}),
      ...(f.priority ? { priority: f.priority } : {}),
      ...(f.blocked ? { blockReason: { not: null } } : {}),
      ...(f.ready ? { status: "READY" } : {}),
      ...(f.overdue ? { promisedAt: { lt: now }, status: { in: ["RECEIVED", "DIAGNOSIS", "QUOTE_SENT", "AWAITING_APPROVAL", "IN_REPAIR", "QUALITY_CHECK"] } } : {}),
      ...(f.from || f.to ? { createdAt: { gte: f.from, lte: f.to } } : {}),
      ...(f.q
        ? {
            OR: [
              { number: { contains: f.q.toUpperCase() } },
              { customer: { lastName: { contains: f.q } } },
              { customer: { firstName: { contains: f.q } } },
              { customer: { phoneNormalized: { contains: f.q.replace(/\D/g, "") || "§" } } },
              { device: { model: { contains: f.q } } },
              { device: { brand: { contains: f.q } } },
              { device: { imei: { contains: f.q } } },
              { reportedIssue: { contains: f.q } },
            ],
          }
        : {}),
    },
    include: { customer: true, device: true, quotes: { where: { status: "ACCEPTED" }, select: { totalCents: true, status: true } }, payments: { select: { amountCents: true, status: true, kind: true } } },
    orderBy: f.sort === "number" ? { number: "desc" } : f.sort === "createdAt" ? { createdAt: "desc" } : [{ promisedAt: "asc" }, { createdAt: "desc" }],
    take: 500,
  });
}

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

async function addEvent(tx: Tx, ticketId: string, ctx: Ctx | null, data: { type: string; message?: string; fromStatus?: string | null; toStatus?: string | null; payload?: unknown; visibleToCustomer?: boolean }) {
  return tx.ticketEvent.create({
    data: {
      ticketId,
      type: data.type,
      message: data.message ?? "",
      fromStatus: data.fromStatus ?? null,
      toStatus: data.toStatus ?? null,
      payloadJson: JSON.stringify(data.payload ?? {}),
      visibleToCustomer: data.visibleToCustomer ?? false,
      authorId: ctx?.user.id ?? null,
      authorName: ctx?.user.name ?? "Client",
    },
  });
}

function deviceLabel(d: { brand: string; model: string }) {
  return `${d.brand} ${d.model}`.trim();
}

export async function createTicket(ctx: Ctx, raw: TicketCreateInput, opts: { draftId?: string } = {}) {
  const input = ticketCreateSchema.parse(raw);
  let customerId = input.customerId;
  if (!customerId) {
    if (!input.newCustomer) throw new DomainError("Client requis");
    customerId = (await createCustomer(ctx, input.newCustomer)).id;
  }
  const customer = await prisma.customer.findFirst({ where: { id: customerId, orgId: ctx.orgId } });
  if (!customer) throw new NotFoundError("Client introuvable");
  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: ctx.shopId } });
  const trackingToken = generateToken();
  const pin = generatePin();

  const ticket = await prisma.$transaction(async (tx) => {
    let deviceId = input.device.id;
    if (deviceId) {
      const d = await tx.device.findFirst({ where: { id: deviceId, orgId: ctx.orgId, customerId } });
      if (!d) throw new NotFoundError("Appareil introuvable");
    } else {
      const { id: _omit, ...devData } = input.device;
      void _omit;
      deviceId = (await tx.device.create({ data: { ...devData, orgId: ctx.orgId, customerId } })).id;
    }
    const number = await nextNumber(tx, ctx.shopId, "TICKET", shop.code);
    const t = await tx.repairTicket.create({
      data: {
        orgId: ctx.orgId,
        shopId: ctx.shopId,
        number,
        customerId,
        deviceId,
        status: "RECEIVED",
        priority: input.priority,
        technicianId: input.technicianId,
        reportedIssue: input.reportedIssue,
        cosmeticState: input.cosmeticState,
        receptionJson: JSON.stringify(input.reception),
        accessoriesJson: JSON.stringify(input.accessories),
        internalNotes: input.internalNotes,
        estimateCents: input.estimateCents,
        taxRateBp: shop.taxRateBp,
        warrantyMonths: input.warrantyMonths,
        warrantyOfTicketId: input.warrantyOfTicketId ?? null,
        promisedAt: input.promisedAt ? new Date(input.promisedAt) : null,
        unlockCodeEnc: input.unlockCode ? encryptSecret(input.unlockCode) : null,
        unlockCodeExpiresAt: input.unlockCode ? new Date(Date.now() + (await unlockRetentionDays(ctx.orgId)) * 86_400_000) : null,
        trackingTokenHash: hashToken(trackingToken),
        trackingTokenEnc: encryptSecret(trackingToken),
        trackingDocPin: hashToken(pin),
        qcJson: JSON.stringify(DEFAULT_QC_ITEMS.map((label) => ({ label, done: false }))),
        createdById: ctx.user.id,
      },
    });
    await addEvent(tx, t.id, ctx, { type: "STATUS", toStatus: "RECEIVED", message: "Appareil reçu en atelier", visibleToCustomer: true });
    if (input.signatureDataUrl) {
      const { storeDataUrl } = await import("@/server/integrations/storage");
      const stored = await storeDataUrl(ctx.orgId, input.signatureDataUrl, `signature-${number}.png`);
      await tx.attachment.create({ data: { orgId: ctx.orgId, ticketId: t.id, kind: "SIGNATURE", ...stored, createdById: ctx.user.id } });
      await addEvent(tx, t.id, ctx, { type: "SYSTEM", message: "Accord et signature du client enregistrés" });
    }
    if (input.depositCents > 0) {
      const { recordTicketPaymentTx } = await import("./payments");
      await recordTicketPaymentTx(tx, ctx, t.id, { amountCents: input.depositCents, method: input.depositMethod, kind: "DEPOSIT" });
      await addEvent(tx, t.id, ctx, { type: "PAYMENT", message: `Acompte de ${(input.depositCents / 100).toFixed(2)} € enregistré`, payload: { amountCents: input.depositCents }, visibleToCustomer: true });
    }
    if (opts.draftId) await tx.draft.deleteMany({ where: { id: opts.draftId, userId: ctx.user.id } });
    return t;
  });

  await audit(ctx, "ticket.create", "RepairTicket", ticket.id, {}, { number: ticket.number, customerId, unlockCode: input.unlockCode ? "***" : undefined });
  const device = await prisma.device.findUniqueOrThrow({ where: { id: ticket.deviceId } });
  await emitEvent({
    orgId: ctx.orgId,
    shopId: ctx.shopId,
    event: "TICKET_RECEIVED",
    occurrenceKey: `ticket:${ticket.id}:RECEIVED`,
    title: `Dépôt ${ticket.number}`,
    body: `${deviceLabel(device)} — ${customer.firstName} ${customer.lastName}`,
    link: `/repairs/${ticket.id}`,
    entityType: "RepairTicket",
    entityId: ticket.id,
    customer: customerForNotif(customer),
    vars: {
      ticketNumber: ticket.number,
      device: deviceLabel(device),
      shopName: shop.name,
      trackingUrl: trackingUrl(trackingToken),
      promisedDate: ticket.promisedAt ? format(ticket.promisedAt, "d MMMM", { locale: fr }) : "à confirmer",
    },
  });
  return { ticket, trackingToken, pin };
}

function customerForNotif(c: { id: string; firstName: string; lastName: string; email: string; phone: string; consentEmail: boolean; consentSms: boolean; consentWhatsapp: boolean }) {
  return { id: c.id, name: `${c.firstName} ${c.lastName}`, email: c.email, phone: c.phone, consentEmail: c.consentEmail, consentSms: c.consentSms, consentWhatsapp: c.consentWhatsapp };
}

export function trackingUrl(token: string) {
  return `${process.env.APP_URL ?? "http://localhost:3000"}/t/${token}`;
}

async function unlockRetentionDays(orgId: string): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { orgId_key: { orgId, key: "retention.unlockCodeDays" } } });
  return s ? Number(JSON.parse(s.valueJson)) : 30;
}

// ---------------------------------------------------------------------------
// Brouillons
// ---------------------------------------------------------------------------

export async function saveDraft(ctx: Ctx, data: unknown, draftId?: string) {
  const json = JSON.stringify(data);
  if (draftId) {
    const d = await prisma.draft.findFirst({ where: { id: draftId, userId: ctx.user.id } });
    if (d) return prisma.draft.update({ where: { id: draftId }, data: { dataJson: json } });
  }
  return prisma.draft.create({ data: { userId: ctx.user.id, shopId: ctx.shopId, kind: "TICKET", dataJson: json } });
}

export async function listDrafts(ctx: Ctx) {
  return prisma.draft.findMany({ where: { userId: ctx.user.id, kind: "TICKET", shopId: ctx.shopId }, orderBy: { updatedAt: "desc" } });
}

export async function deleteDraft(ctx: Ctx, id: string) {
  await prisma.draft.deleteMany({ where: { id, userId: ctx.user.id } });
}

// ---------------------------------------------------------------------------
// Transitions de statut
// ---------------------------------------------------------------------------

export async function transitionTicket(ctx: Ctx, ticketId: string, to: TicketStatus, opts: { note?: string; blockReason?: string | null } = {}) {
  if (!TICKET_STATUSES.includes(to)) throw new DomainError("Statut inconnu");
  const t = await getTicket(ctx, ticketId);
  const from = t.status as TicketStatus;
  const fin = ticketFinancials(t);
  const qc = JSON.parse(t.qcJson) as { label: string; done: boolean }[];
  const err = transitionGuard(from, to, {
    hasAcceptedQuote: fin.hasAcceptedQuote,
    hasPendingQuote: t.quotes.some((q) => q.status === "SENT"),
    qcComplete: qc.length > 0 && qc.every((i) => i.done),
    balanceDueCents: fin.balanceDueCents,
    hasConsumedParts: t.parts.some((p) => p.status === "CONSUMED"),
  });
  if (err) throw new DomainError(err);
  if (opts.blockReason && !BLOCK_REASONS.includes(opts.blockReason as never)) throw new DomainError("Motif de blocage inconnu");

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Annulation : libération des pièces réservées (jamais de recréation de stock pour les pièces consommées).
    if (to === "CANCELLED") {
      for (const p of t.parts.filter((p) => p.status === "RESERVED")) {
        await release(tx, t.shopId, p.productId, p.qty);
        await tx.ticketPart.update({ where: { id: p.id }, data: { status: "RELEASED", releasedAt: now } });
      }
    }
    await tx.repairTicket.update({
      where: { id: ticketId },
      data: {
        status: to,
        blockReason: to === "CANCELLED" || to === "DELIVERED" ? null : (opts.blockReason ?? null),
        readyAt: to === "READY" ? now : t.readyAt,
        deliveredAt: to === "DELIVERED" ? now : t.deliveredAt,
        closedAt: to === "DELIVERED" || to === "CANCELLED" ? now : null,
      },
    });
    await addEvent(tx, ticketId, ctx, { type: "STATUS", fromStatus: from, toStatus: to, message: opts.note ?? "", visibleToCustomer: to !== "CANCELLED" || Boolean(opts.note) });
  });
  await audit(ctx, "ticket.transition", "RepairTicket", ticketId, { status: from }, { status: to, blockReason: opts.blockReason });

  if (to === "READY") {
    await emitEvent({
      orgId: ctx.orgId,
      shopId: ctx.shopId,
      event: "DEVICE_READY",
      occurrenceKey: `ticket:${ticketId}:READY:${now.toISOString().slice(0, 10)}`,
      title: `Prêt : ${t.number}`,
      body: `${deviceLabel(t.device)} est prêt à être récupéré`,
      link: `/repairs/${ticketId}`,
      entityType: "RepairTicket",
      entityId: ticketId,
      customer: customerForNotif(t.customer),
      vars: { ticketNumber: t.number, device: deviceLabel(t.device), shopName: t.shop.name, balanceDue: (fin.balanceDueCents / 100).toFixed(2) + " €", shopHours: shopHoursLabel(t.shop.hoursJson) },
    });
  }
}

function shopHoursLabel(hoursJson: string): string {
  try {
    const h = JSON.parse(hoursJson) as { day: string; open: string; close: string }[];
    return h.map((x) => `${x.day} ${x.open}–${x.close}`).join(", ");
  } catch {
    return "";
  }
}

export async function setBlockReason(ctx: Ctx, ticketId: string, reason: string | null, note = "") {
  const t = await getTicket(ctx, ticketId);
  if (reason && !BLOCK_REASONS.includes(reason as never)) throw new DomainError("Motif inconnu");
  await prisma.$transaction(async (tx) => {
    await tx.repairTicket.update({ where: { id: ticketId }, data: { blockReason: reason } });
    await addEvent(tx, ticketId, ctx, { type: "SYSTEM", message: reason ? `Blocage : ${reason}${note ? " — " + note : ""}` : "Blocage levé", payload: { blockReason: reason } });
  });
  void t;
}

export async function assignTechnician(ctx: Ctx, ticketId: string, technicianId: string | null) {
  await getTicket(ctx, ticketId);
  if (technicianId) {
    const u = await prisma.user.findFirst({ where: { id: technicianId, orgId: ctx.orgId, active: true } });
    if (!u) throw new DomainError("Technicien inconnu");
  }
  await prisma.$transaction(async (tx) => {
    await tx.repairTicket.update({ where: { id: ticketId }, data: { technicianId } });
    await addEvent(tx, ticketId, ctx, { type: "SYSTEM", message: technicianId ? "Technicien assigné" : "Technicien retiré", payload: { technicianId } });
  });
}

export async function updateTicketFields(ctx: Ctx, ticketId: string, data: { diagnosis?: string; internalNotes?: string; promisedAt?: string | null; priority?: string; estimateCents?: number; warrantyMonths?: number }) {
  const t = await getTicket(ctx, ticketId);
  const parsed = z
    .object({
      diagnosis: z.string().max(4000).optional(),
      internalNotes: z.string().max(4000).optional(),
      promisedAt: z.string().datetime().nullable().optional(),
      priority: z.enum(PRIORITIES).optional(),
      estimateCents: z.number().int().min(0).optional(),
      warrantyMonths: z.number().int().min(0).max(24).optional(),
    })
    .parse(data);
  await prisma.$transaction(async (tx) => {
    await tx.repairTicket.update({
      where: { id: ticketId },
      data: { ...parsed, promisedAt: parsed.promisedAt === undefined ? undefined : parsed.promisedAt ? new Date(parsed.promisedAt) : null },
    });
    if (parsed.diagnosis !== undefined && parsed.diagnosis !== t.diagnosis) {
      await addEvent(tx, ticketId, ctx, { type: "NOTE", message: "Diagnostic mis à jour", payload: { diagnosis: parsed.diagnosis } });
    }
  });
  await audit(ctx, "ticket.update", "RepairTicket", ticketId, { diagnosis: t.diagnosis, promisedAt: t.promisedAt }, parsed);
}

export async function addMessage(ctx: Ctx, ticketId: string, message: string, visibleToCustomer: boolean) {
  await getTicket(ctx, ticketId);
  const text = z.string().trim().min(1).max(2000).parse(message);
  await prisma.$transaction((tx) => addEvent(tx, ticketId, ctx, { type: visibleToCustomer ? "MESSAGE" : "NOTE", message: text, visibleToCustomer }));
}

export async function addIntervention(ctx: Ctx, ticketId: string, data: { description: string; minutes: number; laborCents: number }) {
  await getTicket(ctx, ticketId);
  const parsed = z.object({ description: z.string().trim().min(1).max(1000), minutes: z.number().int().min(0).max(6000), laborCents: z.number().int().min(0) }).parse(data);
  await prisma.$transaction(async (tx) => {
    await tx.ticketIntervention.create({ data: { ticketId, technicianId: ctx.user.id, ...parsed } });
    await tx.repairTicket.update({ where: { id: ticketId }, data: { laborCents: { increment: parsed.laborCents } } });
    await addEvent(tx, ticketId, ctx, { type: "NOTE", message: `Intervention : ${parsed.description}`, payload: parsed, visibleToCustomer: true });
  });
}

export async function updateQc(ctx: Ctx, ticketId: string, items: { label: string; done: boolean }[]) {
  await getTicket(ctx, ticketId);
  const parsed = z.array(z.object({ label: z.string().min(1).max(120), done: z.boolean() })).parse(items);
  const complete = parsed.length > 0 && parsed.every((i) => i.done);
  await prisma.$transaction(async (tx) => {
    await tx.repairTicket.update({ where: { id: ticketId }, data: { qcJson: JSON.stringify(parsed) } });
    if (complete) await addEvent(tx, ticketId, ctx, { type: "QC", message: "Contrôle qualité validé", visibleToCustomer: true });
  });
}

// ---------------------------------------------------------------------------
// Devis versionnés
// ---------------------------------------------------------------------------

export async function createQuote(ctx: Ctx, ticketId: string, raw: z.infer<typeof quoteSchema>, send = true) {
  const t = await getTicket(ctx, ticketId);
  if (t.status === "DELIVERED" || t.status === "CANCELLED") throw new DomainError("Ticket clôturé");
  const input = quoteSchema.parse(raw);
  const totals = computeTotals(input.lines.map((l) => ({ qty: l.qty, unitCents: l.unitCents, taxRateBp: l.taxRateBp })), input.discountCents);
  const version = (t.quotes[0]?.version ?? 0) + 1;
  const quote = await prisma.$transaction(async (tx) => {
    // Les devis précédents encore ouverts deviennent obsolètes : un seul devis actif à la fois.
    await tx.quote.updateMany({ where: { ticketId, status: { in: ["DRAFT", "SENT"] } }, data: { status: "SUPERSEDED" } });
    const q = await tx.quote.create({
      data: {
        ticketId,
        version,
        status: send ? "SENT" : "DRAFT",
        ...totals,
        note: input.note,
        sentAt: send ? new Date() : null,
        createdById: ctx.user.id,
        lines: { create: input.lines.map((l, i) => ({ ...l, productId: l.productId ?? null, totalCents: l.qty * l.unitCents, position: i })) },
      },
      include: { lines: true },
    });
    if (send && (t.status === "RECEIVED" || t.status === "DIAGNOSIS")) {
      await tx.repairTicket.update({ where: { id: ticketId }, data: { status: "QUOTE_SENT" } });
      await addEvent(tx, ticketId, ctx, { type: "STATUS", fromStatus: t.status, toStatus: "QUOTE_SENT", visibleToCustomer: true });
    }
    await addEvent(tx, ticketId, ctx, { type: "QUOTE", message: `Devis v${version} ${send ? "envoyé" : "préparé"} : ${(totals.totalCents / 100).toFixed(2)} €`, payload: { quoteId: q.id, version, totalCents: totals.totalCents }, visibleToCustomer: send });
    return q;
  });
  await audit(ctx, "quote.create", "Quote", quote.id, {}, { ticketId, version, totals });
  if (send) {
    await emitEvent({
      orgId: ctx.orgId,
      shopId: ctx.shopId,
      event: "QUOTE_AVAILABLE",
      occurrenceKey: `quote:${quote.id}:SENT`,
      title: `Devis v${version} envoyé — ${t.number}`,
      body: `${(totals.totalCents / 100).toFixed(2)} € pour ${deviceLabel(t.device)}`,
      link: `/repairs/${ticketId}`,
      entityType: "RepairTicket",
      entityId: ticketId,
      customer: customerForNotif(t.customer),
      vars: { ticketNumber: t.number, device: deviceLabel(t.device), shopName: t.shop.name, quoteTotal: (totals.totalCents / 100).toFixed(2) + " €", trackingUrl: "(lien de suivi)" },
    });
  }
  return quote;
}

/** Décision sur un devis, par le personnel (ctx) ou via le portail public (ctx = null). */
export async function decideQuote(ctx: Ctx | null, ticketId: string, quoteId: string, accepted: boolean, note = "") {
  const q = await prisma.quote.findFirst({ where: { id: quoteId, ticketId }, include: { ticket: true } });
  if (!q) throw new NotFoundError("Devis introuvable");
  if (ctx && q.ticket.orgId !== ctx.orgId) throw new NotFoundError("Devis introuvable");
  if (q.status !== "SENT") throw new ConflictError("Ce devis n'est plus en attente de décision");
  await prisma.$transaction(async (tx) => {
    await tx.quote.update({ where: { id: quoteId }, data: { status: accepted ? "ACCEPTED" : "REFUSED", decidedAt: new Date(), decidedVia: ctx ? "STAFF" : "PORTAL", decisionNote: note.slice(0, 500) } });
    const nextStatus: TicketStatus | null = accepted ? "IN_REPAIR" : null;
    if (nextStatus && q.ticket.status !== "IN_REPAIR") {
      await tx.repairTicket.update({ where: { id: ticketId }, data: { status: nextStatus, blockReason: null } });
      await addEvent(tx, ticketId, ctx, { type: "STATUS", fromStatus: q.ticket.status, toStatus: nextStatus, visibleToCustomer: true });
    }
    if (!accepted) {
      await tx.repairTicket.update({ where: { id: ticketId }, data: { blockReason: "CUSTOMER_AWAITED" } });
    }
    await addEvent(tx, ticketId, ctx, {
      type: "QUOTE",
      message: `Devis v${q.version} ${accepted ? "accepté" : "refusé"}${ctx ? "" : " par le client (espace de suivi)"}${note ? " — " + note : ""}`,
      payload: { quoteId, accepted },
      visibleToCustomer: true,
    });
  });
  if (ctx) await audit(ctx, accepted ? "quote.accept" : "quote.refuse", "Quote", quoteId, {}, { note });
  else await audit({ orgId: q.ticket.orgId, shopId: q.ticket.shopId, userName: "Portail client" }, accepted ? "quote.accept" : "quote.refuse", "Quote", quoteId, {}, { via: "PORTAL" });
}

// ---------------------------------------------------------------------------
// Pièces : réservation → consommation (mouvement de stock atomique) ; libération ; retour motivé
// ---------------------------------------------------------------------------

export async function reservePart(ctx: Ctx, ticketId: string, productId: string, qty: number) {
  const t = await getTicket(ctx, ticketId);
  if (qty <= 0) throw new DomainError("Quantité invalide");
  const product = await prisma.product.findFirst({ where: { id: productId, orgId: ctx.orgId, active: true } });
  if (!product) throw new NotFoundError("Pièce introuvable");
  const part = await prisma.$transaction(async (tx) => {
    await reserve(tx, ctx.orgId, t.shopId, productId, qty);
    const p = await tx.ticketPart.create({ data: { ticketId, productId, qty, unitCostCents: product.costCents, unitPriceCents: product.priceCents } });
    await addEvent(tx, ticketId, ctx, { type: "PART", message: `Pièce réservée : ${qty} × ${product.name}`, payload: { productId, qty } });
    return p;
  });
  await audit(ctx, "part.reserve", "TicketPart", part.id, {}, { ticketId, productId, qty });
  return part;
}

export async function consumePart(ctx: Ctx, ticketId: string, partId: string) {
  const t = await getTicket(ctx, ticketId);
  const part = t.parts.find((p) => p.id === partId);
  if (!part) throw new NotFoundError("Pièce introuvable");
  if (part.status !== "RESERVED") throw new ConflictError("Cette pièce n'est plus réservée");
  await prisma.$transaction(async (tx) => {
    // Une seule opération atomique : −qty sur le physique et −qty sur le réservé.
    const { movement } = await applyMovement(tx, {
      orgId: ctx.orgId,
      shopId: t.shopId,
      productId: part.productId,
      type: "CONSUMPTION",
      qty: -part.qty,
      reservedDelta: -part.qty,
      refType: "TICKET",
      refId: ticketId,
      unitCostCents: part.unitCostCents,
      authorId: ctx.user.id,
      reason: `Consommée sur ${t.number}`,
    });
    const claimed = await tx.ticketPart.updateMany({ where: { id: partId, status: "RESERVED" }, data: { status: "CONSUMED", consumedAt: new Date(), movementId: movement?.id ?? null } });
    if (claimed.count !== 1) throw new ConflictError("Pièce déjà consommée");
    await addEvent(tx, ticketId, ctx, { type: "PART", message: `Pièce consommée : ${part.qty} × ${part.product.name}`, payload: { partId }, visibleToCustomer: true });
  });
  await audit(ctx, "part.consume", "TicketPart", partId, { status: "RESERVED" }, { status: "CONSUMED" });
}

export async function releasePart(ctx: Ctx, ticketId: string, partId: string) {
  const t = await getTicket(ctx, ticketId);
  const part = t.parts.find((p) => p.id === partId);
  if (!part || part.status !== "RESERVED") throw new ConflictError("Seule une pièce réservée peut être libérée");
  await prisma.$transaction(async (tx) => {
    await release(tx, t.shopId, part.productId, part.qty);
    await tx.ticketPart.update({ where: { id: partId }, data: { status: "RELEASED", releasedAt: new Date() } });
    await addEvent(tx, ticketId, ctx, { type: "PART", message: `Réservation annulée : ${part.qty} × ${part.product.name}` });
  });
  await audit(ctx, "part.release", "TicketPart", partId, {}, {});
}

/**
 * Retour en stock d'une pièce consommée : règle explicite, motif obligatoire, permission d'ajustement,
 * mouvement RETURN tracé et lié au ticket. Jamais implicite lors d'une modification ou annulation.
 */
export async function returnConsumedPart(ctx: Ctx, ticketId: string, partId: string, reason: string) {
  if (!ctxHas(ctx, "inventory.adjust")) throw new DomainError("Permission d'ajustement de stock requise", "forbidden", 403);
  if (reason.trim().length < 5) throw new DomainError("Motif obligatoire (5 caractères minimum)");
  const t = await getTicket(ctx, ticketId);
  const part = t.parts.find((p) => p.id === partId);
  if (!part || part.status !== "CONSUMED") throw new ConflictError("Seule une pièce consommée peut être retournée en stock");
  await prisma.$transaction(async (tx) => {
    await applyMovement(tx, { orgId: ctx.orgId, shopId: t.shopId, productId: part.productId, type: "RETURN", qty: part.qty, refType: "TICKET", refId: ticketId, unitCostCents: part.unitCostCents, authorId: ctx.user.id, reason });
    await tx.ticketPart.update({ where: { id: partId }, data: { status: "RETURNED", releasedAt: new Date() } });
    await addEvent(tx, ticketId, ctx, { type: "PART", message: `Pièce retournée en stock : ${part.qty} × ${part.product.name} — ${reason}`, payload: { partId, reason } });
  });
  await audit(ctx, "part.return", "TicketPart", partId, { status: "CONSUMED" }, { status: "RETURNED", reason });
}

// ---------------------------------------------------------------------------
// Code de déverrouillage : accès restreint, journalisé, purge automatique
// ---------------------------------------------------------------------------

export async function revealUnlockCode(ctx: Ctx, ticketId: string): Promise<string | null> {
  if (!ctxHas(ctx, "tickets.unlock_code.view")) throw new DomainError("Accès refusé", "forbidden", 403);
  const t = await prisma.repairTicket.findFirst({ where: { id: ticketId, orgId: ctx.orgId }, select: { unlockCodeEnc: true, unlockCodeExpiresAt: true } });
  if (!t?.unlockCodeEnc) return null;
  if (t.unlockCodeExpiresAt && t.unlockCodeExpiresAt < new Date()) return null;
  await audit(ctx, "ticket.unlock_code.reveal", "RepairTicket", ticketId);
  return decryptSecret(t.unlockCodeEnc);
}

export async function setUnlockCode(ctx: Ctx, ticketId: string, code: string | null) {
  await getTicket(ctx, ticketId);
  const days = await unlockRetentionDays(ctx.orgId);
  await prisma.repairTicket.update({
    where: { id: ticketId },
    data: { unlockCodeEnc: code ? encryptSecret(code) : null, unlockCodeExpiresAt: code ? new Date(Date.now() + days * 86_400_000) : null },
  });
  await audit(ctx, code ? "ticket.unlock_code.set" : "ticket.unlock_code.clear", "RepairTicket", ticketId);
}

/** Tâche planifiée : suppression des codes arrivés à expiration. */
export async function purgeExpiredUnlockCodes(): Promise<number> {
  const r = await prisma.repairTicket.updateMany({
    where: { unlockCodeEnc: { not: null }, OR: [{ unlockCodeExpiresAt: { lt: new Date() } }, { status: { in: ["DELIVERED", "CANCELLED"] }, closedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } }] },
    data: { unlockCodeEnc: null, unlockCodeExpiresAt: null },
  });
  return r.count;
}

// ---------------------------------------------------------------------------
// Suivi client : lien opaque révocable
// ---------------------------------------------------------------------------

export async function regenerateTracking(ctx: Ctx, ticketId: string) {
  await getTicket(ctx, ticketId);
  const token = generateToken();
  const pin = generatePin();
  await prisma.repairTicket.update({ where: { id: ticketId }, data: { trackingTokenHash: hashToken(token), trackingTokenEnc: encryptSecret(token), trackingDocPin: hashToken(pin), trackingRevokedAt: null } });
  await audit(ctx, "ticket.tracking.regenerate", "RepairTicket", ticketId);
  return { token, url: trackingUrl(token), pin };
}

/** URL de suivi courante (déchiffrée) pour l'impression et l'affichage au personnel autorisé. */
export async function getTrackingUrl(ctx: Ctx, ticketId: string): Promise<string | null> {
  const t = await prisma.repairTicket.findFirst({ where: { id: ticketId, orgId: ctx.orgId }, select: { trackingTokenEnc: true, trackingRevokedAt: true } });
  if (!t?.trackingTokenEnc || t.trackingRevokedAt) return null;
  return trackingUrl(decryptSecret(t.trackingTokenEnc));
}

export async function revokeTracking(ctx: Ctx, ticketId: string) {
  await getTicket(ctx, ticketId);
  await prisma.repairTicket.update({ where: { id: ticketId }, data: { trackingRevokedAt: new Date() } });
  await audit(ctx, "ticket.tracking.revoke", "RepairTicket", ticketId);
}

/** Vue publique : uniquement les champs autorisés. Jamais de notes internes, coûts, codes, autres clients. */
export async function getPublicTicket(token: string) {
  if (!token || token.length < 20) return null;
  const t = await prisma.repairTicket.findFirst({
    where: { trackingTokenHash: hashToken(token), trackingRevokedAt: null, isDraft: false },
    include: {
      device: { select: { kind: true, brand: true, model: true, color: true } },
      shop: { select: { name: true, address: true, phone: true, email: true, hoursJson: true, currency: true } },
      customer: { select: { firstName: true } },
      quotes: { where: { status: { in: ["SENT", "ACCEPTED", "REFUSED"] } }, include: { lines: { select: { label: true, qty: true, unitCents: true, totalCents: true, kind: true }, orderBy: { position: "asc" } } }, orderBy: { version: "desc" } },
      events: { where: { visibleToCustomer: true }, orderBy: { createdAt: "desc" }, select: { id: true, type: true, message: true, toStatus: true, createdAt: true } },
      payments: { select: { amountCents: true, status: true, kind: true } },
      attachments: { where: { visibleToCustomer: true }, select: { id: true, kind: true, filename: true, createdAt: true } },
    },
  });
  if (!t) return null;
  const fin = ticketFinancials({ ...t, quotes: t.quotes });
  return {
    id: t.id,
    number: t.number,
    status: t.status,
    blockReason: t.blockReason,
    promisedAt: t.promisedAt,
    readyAt: t.readyAt,
    device: t.device,
    shop: t.shop,
    customerFirstName: t.customer.firstName,
    quotes: t.quotes.map((q) => ({ id: q.id, version: q.version, status: q.status, totalCents: q.totalCents, taxCents: q.taxCents, discountCents: q.discountCents, note: q.note, lines: q.lines, sentAt: q.sentAt })),
    events: t.events,
    documents: t.attachments,
    financials: { totalCents: fin.totalCents, paidCents: fin.paidCents, balanceDueCents: fin.balanceDueCents },
    hasDocPin: Boolean(t.trackingDocPin),
  };
}

export async function verifyDocPin(token: string, pin: string): Promise<boolean> {
  const t = await prisma.repairTicket.findFirst({ where: { trackingTokenHash: hashToken(token), trackingRevokedAt: null }, select: { trackingDocPin: true } });
  return Boolean(t?.trackingDocPin && t.trackingDocPin === hashToken(pin));
}

// ---------------------------------------------------------------------------
// Retour sous garantie
// ---------------------------------------------------------------------------

export async function createWarrantyReturn(ctx: Ctx, originalTicketId: string, reportedIssue: string) {
  const original = await getTicket(ctx, originalTicketId);
  if (original.status !== "DELIVERED") throw new DomainError("Le ticket d'origine doit être livré");
  const expiry = original.deliveredAt ? new Date(original.deliveredAt.getTime() + original.warrantyMonths * 30 * 86_400_000) : null;
  const inWarranty = Boolean(expiry && expiry > new Date());
  const result = await createTicket(ctx, {
    customerId: original.customerId,
    device: { id: original.deviceId, kind: original.device.kind as never, brand: original.device.brand, model: original.device.model, color: original.device.color, imei: original.device.imei, serial: original.device.serial },
    reportedIssue,
    cosmeticState: "",
    reception: {},
    accessories: [],
    technicianId: original.technicianId,
    promisedAt: null,
    priority: "HIGH",
    estimateCents: 0,
    depositCents: 0,
    depositMethod: "CASH",
    warrantyMonths: original.warrantyMonths,
    warrantyOfTicketId: original.id,
    consentAccepted: true,
    internalNotes: inWarranty ? `Retour sous garantie du ticket ${original.number}` : `Retour HORS garantie (expirée) du ticket ${original.number}`,
  });
  await prisma.ticketEvent.create({ data: { ticketId: original.id, type: "SYSTEM", message: `Retour ${inWarranty ? "sous garantie" : "hors garantie"} ouvert : ${result.ticket.number}`, payloadJson: JSON.stringify({ ticketId: result.ticket.id }), authorId: ctx.user.id, authorName: ctx.user.name } });
  return { ...result, inWarranty };
}
