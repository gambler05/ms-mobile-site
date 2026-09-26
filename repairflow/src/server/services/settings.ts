import { prisma } from "@/server/db";
import type { Ctx } from "@/server/auth/guard";
import { audit } from "@/server/audit";
import { z } from "zod";
import { validateTemplate, type NotificationEvent } from "@/lib/domain/notifications";
import { DomainError } from "@/server/errors";

export const SETTING_SCHEMAS = {
  "retention.unlockCodeDays": z.number().int().min(1).max(365),
  "retention.closedTicketYears": z.number().int().min(1).max(10),
  "notif.window": z.object({ start: z.number().int().min(0).max(23), end: z.number().int().min(1).max(24) }),
  "notif.pickupReminderDays": z.number().int().min(1).max(60),
  loyalty: z.object({ enabled: z.boolean(), pointsPerEuro: z.number().min(0).max(100), vipThresholdCents: z.number().int().min(0) }),
  "assistant.enabled": z.boolean(),
  "assistant.allowExternal": z.boolean(),
} as const;
export type SettingKey = keyof typeof SETTING_SCHEMAS;

const DEFAULTS: { [K in SettingKey]: z.infer<(typeof SETTING_SCHEMAS)[K]> } = {
  "retention.unlockCodeDays": 30,
  "retention.closedTicketYears": 5,
  "notif.window": { start: 8, end: 20 },
  "notif.pickupReminderDays": 5,
  loyalty: { enabled: true, pointsPerEuro: 1, vipThresholdCents: 100_000 },
  "assistant.enabled": true,
  "assistant.allowExternal": false,
};

export async function getSetting<K extends SettingKey>(orgId: string, key: K): Promise<z.infer<(typeof SETTING_SCHEMAS)[K]>> {
  const s = await prisma.setting.findUnique({ where: { orgId_key: { orgId, key } } });
  if (!s) return DEFAULTS[key];
  const parsed = SETTING_SCHEMAS[key].safeParse(JSON.parse(s.valueJson));
  return (parsed.success ? parsed.data : DEFAULTS[key]) as z.infer<(typeof SETTING_SCHEMAS)[K]>;
}

export async function getAllSettings(orgId: string) {
  const out = {} as { [K in SettingKey]: z.infer<(typeof SETTING_SCHEMAS)[K]> };
  for (const k of Object.keys(SETTING_SCHEMAS) as SettingKey[]) (out as Record<string, unknown>)[k] = await getSetting(orgId, k);
  const channels = await prisma.setting.findMany({ where: { orgId, key: { startsWith: "notif.channels." } } });
  return { ...out, channels: Object.fromEntries(channels.map((c) => [c.key.replace("notif.channels.", ""), JSON.parse(c.valueJson) as string[]])) };
}

export async function setSetting(ctx: Ctx, key: string, value: unknown) {
  if (key.startsWith("notif.channels.")) {
    z.array(z.enum(["INAPP", "EMAIL", "SMS", "WHATSAPP", "PUSH"])).parse(value);
  } else {
    const schema = SETTING_SCHEMAS[key as SettingKey];
    if (!schema) throw new DomainError("Paramètre inconnu");
    schema.parse(value);
  }
  await prisma.setting.upsert({ where: { orgId_key: { orgId: ctx.orgId, key } }, create: { orgId: ctx.orgId, key, valueJson: JSON.stringify(value) }, update: { valueJson: JSON.stringify(value) } });
  await audit(ctx, "settings.update", "Setting", key, {}, { value });
}

export async function upsertTemplate(ctx: Ctx, input: { id?: string; key: NotificationEvent; channel: string; locale: string; subject: string; body: string; active: boolean }) {
  const check = validateTemplate(input.key, input.body + " " + input.subject);
  if (!check.ok) throw new DomainError(`Variables inconnues : ${check.unknown.map((v) => `{{${v}}}`).join(", ")}`);
  const data = { orgId: ctx.orgId, key: input.key, channel: input.channel, locale: input.locale, subject: input.subject, body: input.body, active: input.active };
  const t = await prisma.template.upsert({ where: { orgId_key_channel_locale: { orgId: ctx.orgId, key: input.key, channel: input.channel, locale: input.locale } }, create: data, update: data });
  await audit(ctx, "template.update", "Template", t.id, {}, { key: input.key, channel: input.channel });
  return t;
}

/** Templates par défaut (créés au seed et à la première ouverture des réglages). */
export const DEFAULT_TEMPLATES: { key: NotificationEvent; channel: string; subject: string; body: string }[] = [
  { key: "TICKET_RECEIVED", channel: "EMAIL", subject: "Dépôt confirmé — {{ticketNumber}}", body: "Bonjour {{customerName}},\n\nNous avons bien reçu votre {{device}} (dossier {{ticketNumber}}). Délai estimé : {{promisedDate}}.\nSuivez l'avancement : {{trackingUrl}}\n\n{{shopName}}" },
  { key: "TICKET_RECEIVED", channel: "SMS", subject: "", body: "{{shopName}} : votre {{device}} est bien pris en charge (dossier {{ticketNumber}}). Suivi : {{trackingUrl}}" },
  { key: "QUOTE_AVAILABLE", channel: "EMAIL", subject: "Votre devis {{ticketNumber}} est disponible", body: "Bonjour {{customerName}},\n\nLe devis pour votre {{device}} s'élève à {{quoteTotal}}. Vous pouvez l'accepter ou le refuser en ligne : {{trackingUrl}}\n\n{{shopName}}" },
  { key: "QUOTE_AVAILABLE", channel: "SMS", subject: "", body: "{{shopName}} : devis {{quoteTotal}} pour votre {{device}}. Répondre : {{trackingUrl}}" },
  { key: "DEVICE_READY", channel: "EMAIL", subject: "Votre {{device}} est prêt", body: "Bonjour {{customerName}},\n\nVotre {{device}} (dossier {{ticketNumber}}) est prêt. Solde à régler : {{balanceDue}}.\nHoraires : {{shopHours}}\n\n{{shopName}}" },
  { key: "DEVICE_READY", channel: "SMS", subject: "", body: "{{shopName}} : votre {{device}} est prêt ! Solde {{balanceDue}}. Horaires : {{shopHours}}" },
  { key: "PICKUP_REMINDER", channel: "SMS", subject: "", body: "{{shopName}} : votre {{device}} vous attend depuis {{daysReady}} jours (dossier {{ticketNumber}})." },
  { key: "PICKUP_REMINDER", channel: "EMAIL", subject: "Rappel : votre appareil vous attend", body: "Bonjour {{customerName}},\n\nVotre {{device}} est prêt depuis {{daysReady}} jours. Nous vous attendons en boutique.\n\n{{shopName}}" },
];

export async function ensureDefaultTemplates(orgId: string) {
  for (const t of DEFAULT_TEMPLATES) {
    await prisma.template.upsert({ where: { orgId_key_channel_locale: { orgId, key: t.key, channel: t.channel, locale: "fr" } }, create: { orgId, ...t, locale: "fr" }, update: {} });
  }
}
