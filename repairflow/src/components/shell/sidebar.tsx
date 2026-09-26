"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Wrench, Users, Boxes, ShoppingCart, Bell, BarChart3, Settings, PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { useUi } from "@/store/ui";
import { Logo } from "@/components/ui/logo";
import { Tooltip } from "@/components/ui/menu";
import type { Permission } from "@/lib/domain/roles";

export const NAV_ITEMS: { href: string; key: "dashboard" | "repairs" | "customers" | "inventory" | "pos" | "notifications" | "reports" | "assistant" | "settings"; icon: React.ComponentType<{ className?: string }>; perm: Permission }[] = [
  { href: "/", key: "dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
  { href: "/repairs", key: "repairs", icon: Wrench, perm: "tickets.view" },
  { href: "/customers", key: "customers", icon: Users, perm: "customers.view" },
  { href: "/inventory", key: "inventory", icon: Boxes, perm: "inventory.view" },
  { href: "/pos", key: "pos", icon: ShoppingCart, perm: "pos.sell" },
  { href: "/notifications", key: "notifications", icon: Bell, perm: "notifications.manage" },
  { href: "/reports", key: "reports", icon: BarChart3, perm: "reports.view" },
  { href: "/assistant", key: "assistant", icon: Sparkles, perm: "assistant.use" },
  { href: "/settings", key: "settings", icon: Settings, perm: "settings.view" },
];

export function Sidebar({ permissions, unread, isDemo }: { permissions: Permission[]; unread: number; isDemo: boolean }) {
  const t = useT();
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUi();
  const allowed = new Set(permissions);
  return (
    <aside className={cn("hidden lg:flex sticky top-0 h-dvh shrink-0 flex-col border-e border-border bg-nav transition-[width] duration-[var(--dur-slow)] ease-[var(--ease-out)]", sidebarCollapsed ? "w-[64px]" : "w-[232px]")} aria-label="Navigation principale">
      <div className={cn("flex h-14 items-center border-b border-border", sidebarCollapsed ? "justify-center" : "px-4")}>
        <Link href="/" aria-label="RepairFlow">
          <Logo collapsed={sidebarCollapsed} />
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 p-2">
        {NAV_ITEMS.filter((i) => allowed.has(i.perm)).map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const link = (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex h-9 items-center gap-3 rounded-[var(--radius-sm)] px-2.5 text-[13.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-fg",
                active && "bg-active text-fg highlight-top",
                sidebarCollapsed && "justify-center px-0",
              )}
            >
              {active ? <span aria-hidden className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-accent" /> : null}
              <item.icon className={cn("size-[18px] shrink-0", active ? "text-accent" : "text-subtle group-hover:text-fg")} />
              {!sidebarCollapsed ? <span className="truncate">{t(`nav.${item.key}`)}</span> : null}
              {item.key === "notifications" && unread > 0 ? (
                <span className={cn("tnum ms-auto rounded-full bg-accent px-1.5 text-[10.5px] font-semibold text-accent-fg", sidebarCollapsed && "absolute end-1.5 top-1 ms-0 min-w-4 px-1")}>{unread > 99 ? "99+" : unread}</span>
              ) : null}
            </Link>
          );
          return sidebarCollapsed ? (
            <Tooltip key={item.href} label={t(`nav.${item.key}`)} side="right">
              {link}
            </Tooltip>
          ) : (
            link
          );
        })}
      </nav>
      <div className="border-t border-border p-2">
        {isDemo && !sidebarCollapsed ? <div className="mb-2 rounded-[var(--radius-xs)] border border-champagne/30 bg-champagne-soft px-2 py-1 text-[11px] font-medium text-champagne">{t("nav.demoBadge")}</div> : null}
        <button type="button" onClick={toggleSidebar} className={cn("flex h-9 w-full items-center gap-3 rounded-[var(--radius-sm)] px-2.5 text-[13px] text-muted hover:bg-hover hover:text-fg", sidebarCollapsed && "justify-center px-0")} aria-label={sidebarCollapsed ? t("nav.expand") : t("nav.collapse")}>
          {sidebarCollapsed ? <PanelLeftOpen className="size-[18px] rtl:-scale-x-100" /> : <PanelLeftClose className="size-[18px] rtl:-scale-x-100" />}
          {!sidebarCollapsed ? <span>{t("nav.collapse")}</span> : null}
        </button>
      </div>
    </aside>
  );
}

export function MobileNav({ permissions, unread }: { permissions: Permission[]; unread: number }) {
  const t = useT();
  const pathname = usePathname();
  const allowed = new Set(permissions);
  const items = NAV_ITEMS.filter((i) => allowed.has(i.perm) && ["dashboard", "repairs", "pos", "inventory", "notifications"].includes(i.key)).slice(0, 5);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-nav/95 backdrop-blur safe-bottom lg:hidden no-print" aria-label="Navigation mobile">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium text-subtle", active && "text-accent")}>
            <item.icon className="size-5" />
            <span>{t(`nav.${item.key}`)}</span>
            {item.key === "notifications" && unread > 0 ? <span className="absolute end-[calc(50%-16px)] top-1 size-2 rounded-full bg-accent" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
