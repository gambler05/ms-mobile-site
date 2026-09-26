import { prisma } from "@/server/db";
import { emitEvent, processQueue } from "@/server/services/notifications";
import { purgeExpiredUnlockCodes } from "@/server/services/tickets";
import { getSetting } from "@/server/services/settings";
import { ACTIVE_STATUSES } from "@/lib/domain/tickets";
import { differenceInDays, format } from "date-fns";
import { fr } from "date-fns/locale";

/**
 * Tâches planifiées (voir docs/TACHES.md). Chacune est idempotente : la déduplication des notifications
 * repose sur une clé d'occurrence stable (par jour), donc un second passage le même jour est sans effet.
 */
async function run<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const r = await prisma.jobRun.create({ data: { jobName: name, status: "RUNNING" } });
  try {
    const out = await fn();
    await prisma.jobRun.update({ where: { id: r.id }, data: { status: "OK", finishedAt: new Date(), summary: JSON.stringify(out).slice(0, 500) } });
    return out;
  } catch (e) {
    await prisma.jobRun.update({ where: { id: r.id }, data: { status: "FAILED", finishedAt: new Date(), summary: String(e).slice(0, 500) } });
    throw e;
  }
}

export async function detectOverdueTickets() {
  return run("overdue", async () => {
    const now = new Date();
    const day = format(now, "yyyy-MM-dd");
    const tickets = await prisma.repairTicket.findMany({ where: { isDraft: false, status: { in: [...ACTIVE_STATUSES] }, promisedAt: { lt: now } }, include: { device: true } });
    for (const t of tickets) {
      const tech = t.technicianId ? await prisma.user.findUnique({ where: { id: t.technicianId }, select: { name: true } }) : null;
      await emitEvent({ orgId: t.orgId, shopId: t.shopId, event: "TICKET_OVERDUE", occurrenceKey: `ticket:${t.id}:OVERDUE:${day}`, title: `Retard : ${t.number}`, body: `${t.device.brand} ${t.device.model} promis le ${format(t.promisedAt!, "d MMM", { locale: fr })}`, link: `/repairs/${t.id}`, urgent: true, entityType: "RepairTicket", entityId: t.id, userId: t.technicianId ?? undefined, vars: { technicianName: tech?.name ?? "" } });
    }
    return { overdue: tickets.length };
  });
}

export async function sendPickupReminders() {
  return run("pickup_reminders", async () => {
    const orgs = await prisma.organization.findMany({ select: { id: true } });
    let sent = 0;
    for (const org of orgs) {
      const days = await getSetting(org.id, "notif.pickupReminderDays");
      const tickets = await prisma.repairTicket.findMany({ where: { orgId: org.id, status: "READY", readyAt: { lt: new Date(Date.now() - days * 86_400_000) } }, include: { customer: true, device: true, shop: true } });
      for (const t of tickets) {
        const daysReady = differenceInDays(new Date(), t.readyAt!);
        // Un rappel tous les `days` jours au plus.
        const bucket = Math.floor(daysReady / days);
        await emitEvent({ orgId: t.orgId, shopId: t.shopId, event: "PICKUP_REMINDER", occurrenceKey: `ticket:${t.id}:PICKUP:${bucket}`, title: `Rappel de retrait : ${t.number}`, body: `Prêt depuis ${daysReady} jours`, link: `/repairs/${t.id}`, entityType: "RepairTicket", entityId: t.id, customer: { id: t.customer.id, name: `${t.customer.firstName} ${t.customer.lastName}`, email: t.customer.email, phone: t.customer.phone, consentEmail: t.customer.consentEmail, consentSms: t.customer.consentSms, consentWhatsapp: t.customer.consentWhatsapp }, vars: { ticketNumber: t.number, device: `${t.device.brand} ${t.device.model}`, shopName: t.shop.name, daysReady, trackingUrl: "(lien de suivi)" } });
        sent++;
      }
    }
    return { reminders: sent };
  });
}

export async function detectLowStock() {
  return run("low_stock", async () => {
    const day = format(new Date(), "yyyy-MM-dd");
    const levels = await prisma.stockLevel.findMany({ where: { product: { active: true, type: { in: ["PART", "ACCESSORY", "CONSUMABLE"] } } }, include: { product: true } });
    let n = 0;
    for (const l of levels) {
      if (l.onHand - l.reserved > l.product.alertThreshold) continue;
      await emitEvent({ orgId: l.product.orgId, shopId: l.shopId, event: "LOW_STOCK", occurrenceKey: `stock:${l.productId}:${l.shopId}:${day}`, title: `Stock critique : ${l.product.name}`, body: `Disponible ${l.onHand - l.reserved} (seuil ${l.product.alertThreshold})`, link: `/inventory/${l.productId}`, entityType: "Product", entityId: l.productId });
      n++;
    }
    return { alerts: n };
  });
}

export async function purgeSensitiveData() {
  return run("purge", async () => ({ unlockCodesPurged: await purgeExpiredUnlockCodes(), sessionsPurged: (await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })).count, loginAttemptsPurged: (await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } })).count }));
}

export async function runNotificationQueue() {
  return run("notification_queue", () => processQueue());
}

export async function runAllJobs() {
  const results: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries({ overdue: detectOverdueTickets, pickup: sendPickupReminders, lowStock: detectLowStock, purge: purgeSensitiveData, queue: runNotificationQueue })) {
    try {
      results[name] = await fn();
    } catch (e) {
      results[name] = { error: String(e) };
    }
  }
  return results;
}
