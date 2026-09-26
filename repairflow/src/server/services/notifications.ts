import { prisma, type Tx } from "@/server/db";
import { CUSTOMER_EVENTS, renderTemplate, type Channel, type NotificationEvent } from "@/lib/domain/notifications";
import { getChannelProvider, channelStatus } from "@/server/integrations/channels";

/**
 * Centre de notifications et file d'envoi.
 * - Une notification in-app est créée pour l'équipe (dédupliquée par `dedupeKey`).
 * - Pour les événements destinés au client, un job par canal consenti est mis en file,
 *   également dédupliqué : un rafraîchissement ou une relance technique ne crée jamais un doublon.
 * - Le worker (`processQueue`) tente l'envoi avec un nombre limité de nouvelles tentatives,
 *   un backoff exponentiel, et journalise chaque tentative dans NotificationDelivery.
 * - En DEMO_MODE, aucun envoi réel : le job est marqué SIMULATED.
 */

export interface EmitInput {
  orgId: string;
  shopId: string;
  event: NotificationEvent;
  /** Identifiant stable de l'occurrence (ex. `ticket:<id>:READY:<readyAt>`) — base de la déduplication. */
  occurrenceKey: string;
  title: string;
  body: string;
  link: string;
  urgent?: boolean;
  entityType?: string;
  entityId?: string;
  customer?: { id: string; name: string; email: string; phone: string; consentEmail: boolean; consentSms: boolean; consentWhatsapp: boolean; locale?: string };
  vars?: Record<string, string | number | undefined>;
  /** Destinataire staff explicite (sinon toute la boutique). */
  userId?: string;
}

export async function emitEvent(input: EmitInput, tx?: Tx) {
  const db = tx ?? prisma;
  const dedupeKey = `inapp:${input.occurrenceKey}`;
  const existing = await db.notification.findUnique({ where: { dedupeKey } });
  if (!existing) {
    await db.notification.create({
      data: {
        orgId: input.orgId,
        shopId: input.shopId,
        userId: input.userId ?? null,
        type: input.event,
        title: input.title,
        body: input.body,
        urgent: input.urgent ?? false,
        link: input.link,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        dedupeKey,
      },
    });
  }
  if (!input.customer || !CUSTOMER_EVENTS.has(input.event)) return;

  const prefs = await getEventChannels(db, input.orgId, input.event);
  const channels: { channel: Channel; recipient: string }[] = [];
  if (prefs.includes("EMAIL") && input.customer.consentEmail && input.customer.email) channels.push({ channel: "EMAIL", recipient: input.customer.email });
  if (prefs.includes("SMS") && input.customer.consentSms && input.customer.phone) channels.push({ channel: "SMS", recipient: input.customer.phone });
  if (prefs.includes("WHATSAPP") && input.customer.consentWhatsapp && input.customer.phone) channels.push({ channel: "WHATSAPP", recipient: input.customer.phone });

  for (const c of channels) {
    const key = `${c.channel}:${input.occurrenceKey}`;
    const already = await db.notificationJob.findUnique({ where: { dedupeKey: key } });
    if (already) continue;
    await db.notificationJob.create({
      data: {
        orgId: input.orgId,
        shopId: input.shopId,
        channel: c.channel,
        eventType: input.event,
        templateKey: input.event,
        recipient: c.recipient,
        locale: input.customer.locale ?? "fr",
        payloadJson: JSON.stringify({ ...input.vars, customerName: input.customer.name }),
        dedupeKey: key,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        nextAttemptAt: await nextSendWindow(db, input.orgId),
      },
    });
  }
}

async function getEventChannels(db: Tx | typeof prisma, orgId: string, event: NotificationEvent): Promise<Channel[]> {
  const s = await db.setting.findUnique({ where: { orgId_key: { orgId, key: `notif.channels.${event}` } } });
  if (s) return JSON.parse(s.valueJson) as Channel[];
  return ["EMAIL", "SMS"];
}

/** Respecte la plage horaire d'envoi configurée (par défaut 8h–20h, heure locale du serveur). */
async function nextSendWindow(db: Tx | typeof prisma, orgId: string): Promise<Date> {
  const s = await db.setting.findUnique({ where: { orgId_key: { orgId, key: "notif.window" } } });
  const win = s ? (JSON.parse(s.valueJson) as { start: number; end: number }) : { start: 8, end: 20 };
  const now = new Date();
  const h = now.getHours();
  if (h >= win.start && h < win.end) return now;
  const next = new Date(now);
  if (h >= win.end) next.setDate(next.getDate() + 1);
  next.setHours(win.start, 0, 0, 0);
  return next;
}

const BACKOFF_MINUTES = [1, 5, 15, 60, 240];

/** Traite les jobs dus. Appelé par le worker et par /api/jobs/run. Idempotent. */
export async function processQueue(limit = 50): Promise<{ processed: number; sent: number; simulated: number; failed: number }> {
  const due = await prisma.notificationJob.findMany({
    where: { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  });
  const stats = { processed: 0, sent: 0, simulated: 0, failed: 0 };
  for (const job of due) {
    // Verrou optimiste : seul un worker passe le job en SENDING.
    const locked = await prisma.notificationJob.updateMany({ where: { id: job.id, status: job.status }, data: { status: "SENDING" } });
    if (locked.count !== 1) continue;
    stats.processed++;
    const attempt = job.attempts + 1;
    try {
      const template = await prisma.template.findFirst({
        where: { orgId: job.orgId, key: job.templateKey, channel: job.channel, active: true, locale: job.locale },
      }) ?? await prisma.template.findFirst({ where: { orgId: job.orgId, key: job.templateKey, channel: job.channel, active: true } });
      if (!template) throw new Error(`Aucun template actif pour ${job.templateKey}/${job.channel}`);
      const vars = JSON.parse(job.payloadJson) as Record<string, string>;
      const body = renderTemplate(template.body, vars);
      const subject = renderTemplate(template.subject, vars);
      const provider = getChannelProvider(job.channel as Channel);
      const result = await provider.send({ to: job.recipient, subject, body });
      const status = result.simulated ? "SIMULATED" : "SENT";
      await prisma.$transaction([
        prisma.notificationJob.update({ where: { id: job.id }, data: { status, attempts: attempt, sentAt: new Date(), providerMessageId: result.providerMessageId ?? "", lastError: "" } }),
        prisma.notificationDelivery.create({ data: { jobId: job.id, attempt, status, detail: result.detail ?? "" } }),
      ]);
      if (result.simulated) stats.simulated++;
      else stats.sent++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const dead = attempt >= job.maxAttempts;
      const delay = BACKOFF_MINUTES[Math.min(attempt - 1, BACKOFF_MINUTES.length - 1)]!;
      await prisma.$transaction([
        prisma.notificationJob.update({
          where: { id: job.id },
          data: { status: dead ? "DEAD" : "FAILED", attempts: attempt, lastError: message.slice(0, 500), nextAttemptAt: new Date(Date.now() + delay * 60_000) },
        }),
        prisma.notificationDelivery.create({ data: { jobId: job.id, attempt, status: "FAILED", detail: message.slice(0, 500) } }),
      ]);
      stats.failed++;
    }
  }
  return stats;
}

/** Relance manuelle d'un job mort ou en échec (remet le compteur à zéro mais conserve l'historique). */
export async function retryJob(orgId: string, jobId: string) {
  const job = await prisma.notificationJob.findFirst({ where: { id: jobId, orgId } });
  if (!job) return;
  await prisma.notificationJob.update({ where: { id: jobId }, data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lastError: "" } });
}

export async function markRead(orgId: string, ids: string[], read = true) {
  await prisma.notification.updateMany({ where: { orgId, id: { in: ids } }, data: { readAt: read ? new Date() : null } });
}

export async function archive(orgId: string, ids: string[]) {
  await prisma.notification.updateMany({ where: { orgId, id: { in: ids } }, data: { archivedAt: new Date(), readAt: new Date() } });
}

export { channelStatus };
