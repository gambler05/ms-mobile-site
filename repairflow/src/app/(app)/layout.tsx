import { requirePage } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { ROLE_PERMISSIONS } from "@/lib/domain/roles";
import { Sidebar, MobileNav } from "@/components/shell/sidebar";
import { CommandBar } from "@/components/shell/command-bar";
import { CommandPalette } from "@/components/shell/command-palette";
import { OfflineBanner } from "@/components/shell/offline-banner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage();
  const permissions = Array.from(ROLE_PERMISSIONS[ctx.role]);
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({ where: { orgId: ctx.orgId, archivedAt: null, OR: [{ shopId: ctx.shopId }, { shopId: null }], AND: [{ OR: [{ userId: null }, { userId: ctx.user.id }] }] }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.notification.count({ where: { orgId: ctx.orgId, archivedAt: null, readAt: null, OR: [{ shopId: ctx.shopId }, { shopId: null }], AND: [{ OR: [{ userId: null }, { userId: ctx.user.id }] }] } }),
  ]);
  return (
    <div className="relative z-[1] flex min-h-dvh">
      <Sidebar permissions={permissions} unread={unread} isDemo={ctx.user.isDemoOrg} />
      <div className="flex min-w-0 flex-1 flex-col">
        <CommandBar
          user={{ name: ctx.user.name, email: ctx.user.email, role: ctx.role, activeShopId: ctx.shopId, shops: ctx.user.shops, permissions }}
          notifications={notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, urgent: n.urgent, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() }))}
          unread={unread}
        />
        <OfflineBanner />
        <main id="main" className="flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-8">
          {children}
        </main>
      </div>
      <MobileNav permissions={permissions} unread={unread} />
      <CommandPalette permissions={permissions} />
    </div>
  );
}
