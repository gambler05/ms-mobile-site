import { requirePage } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { getT } from "@/i18n/server";
import { channelStatus } from "@/server/integrations/channels";
import { NotificationsView } from "@/components/notifications/notifications-view";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ tab?: string; type?: string; shop?: string }> }) {
  const ctx = await requirePage("notifications.manage");
  const t = await getT();
  const sp = await searchParams;
  const shopFilter = sp.shop && ctx.user.shops.some((s) => s.id === sp.shop) ? sp.shop : undefined;
  const [items, jobs] = await Promise.all([
    prisma.notification.findMany({ where: { orgId: ctx.orgId, ...(shopFilter ? { shopId: shopFilter } : { OR: [{ shopId: { in: ctx.user.shops.map((s) => s.id) } }, { shopId: null }] }), ...(sp.type ? { type: sp.type } : {}), AND: [{ OR: [{ userId: null }, { userId: ctx.user.id }] }] }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.notificationJob.findMany({ where: { orgId: ctx.orgId }, include: { deliveries: { orderBy: { createdAt: "desc" } } }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  return (
    <div className="mx-auto max-w-6xl space-y-4 anim-in">
      <h1 className="display text-[24px]">{t("notifications.title")}</h1>
      <NotificationsView
        items={items.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, urgent: n.urgent, link: n.link, shopId: n.shopId, readAt: n.readAt?.toISOString() ?? null, archivedAt: n.archivedAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() }))}
        jobs={jobs.map((j) => ({ id: j.id, channel: j.channel, eventType: j.eventType, recipient: j.recipient, status: j.status, attempts: j.attempts, maxAttempts: j.maxAttempts, lastError: j.lastError, nextAttemptAt: j.nextAttemptAt.toISOString(), sentAt: j.sentAt?.toISOString() ?? null, createdAt: j.createdAt.toISOString(), entityType: j.entityType, entityId: j.entityId, deliveries: j.deliveries.map((d) => ({ id: d.id, attempt: d.attempt, status: d.status, detail: d.detail, createdAt: d.createdAt.toISOString() })) }))}
        channels={channelStatus()}
        shops={ctx.user.shops.map((s) => ({ id: s.id, name: s.name }))}
        tab={sp.tab ?? "unread"}
      />
    </div>
  );
}
