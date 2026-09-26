import { requirePage, ctxHas } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { getT } from "@/i18n/server";
import { ensureDefaultTemplates, getAllSettings } from "@/server/services/settings";
import { channelStatus } from "@/server/integrations/channels";
import { storageStatus } from "@/server/integrations/storage";
import { assistantStatus } from "@/server/services/assistant";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata = { title: "Réglages" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requirePage("settings.view");
  const t = await getT();
  const { tab = "general" } = await searchParams;
  await ensureDefaultTemplates(ctx.orgId);
  const [settings, shops, users, templates, audit, jobRuns] = await Promise.all([
    getAllSettings(ctx.orgId),
    prisma.shop.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
    ctxHas(ctx, "users.manage") ? prisma.user.findMany({ where: { orgId: ctx.orgId }, include: { memberships: true }, orderBy: { name: "asc" } }) : [],
    prisma.template.findMany({ where: { orgId: ctx.orgId }, orderBy: [{ key: "asc" }, { channel: "asc" }] }),
    ctxHas(ctx, "audit.view") ? prisma.auditLog.findMany({ where: { orgId: ctx.orgId }, orderBy: { createdAt: "desc" }, take: 200 }) : [],
    prisma.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 40 }),
  ]);
  return (
    <div className="mx-auto max-w-6xl space-y-4 anim-in">
      <h1 className="display text-[24px]">{t("settings.title")}</h1>
      <SettingsView
        tab={tab}
        canManage={ctxHas(ctx, "settings.manage")}
        canUsers={ctxHas(ctx, "users.manage")}
        canAudit={ctxHas(ctx, "audit.view")}
        settings={settings}
        shops={shops.map((s) => ({ id: s.id, code: s.code, name: s.name, address: s.address, phone: s.phone, email: s.email, taxRateBp: s.taxRateBp, hours: JSON.parse(s.hoursJson) as { day: string; open: string; close: string }[] }))}
        users={users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, active: u.active, shopIds: u.memberships.map((m) => m.shopId), lastLoginAt: u.lastLoginAt?.toISOString() ?? null, mfaEnabled: u.mfaEnabled }))}
        templates={templates.map((x) => ({ id: x.id, key: x.key, channel: x.channel, locale: x.locale, subject: x.subject, body: x.body, active: x.active }))}
        integrations={{ channels: channelStatus(), storage: storageStatus(), assistant: assistantStatus(), paymentsWebhook: Boolean(process.env.PAYMENT_WEBHOOK_SECRET), cronSecret: Boolean(process.env.CRON_SECRET), database: process.env.DATABASE_PROVIDER ?? "sqlite" }}
        audit={audit.map((a) => ({ id: a.id, userName: a.userName, action: a.action, entityType: a.entityType, entityId: a.entityId, createdAt: a.createdAt.toISOString(), after: a.afterJson }))}
        jobRuns={jobRuns.map((j) => ({ id: j.id, jobName: j.jobName, status: j.status, summary: j.summary, startedAt: j.startedAt.toISOString(), finishedAt: j.finishedAt?.toISOString() ?? null }))}
        currentUserId={ctx.user.id}
      />
    </div>
  );
}
