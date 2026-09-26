"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Plus, Bell, ChevronDown, Store, Sun, Moon, Monitor, LogOut, Languages, Keyboard, Rows3, Wrench, ShoppingCart, UserPlus, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/i18n/client";
import { useUi, applyTheme } from "@/store/ui";
import { cn, initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem, Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { Logo } from "@/components/ui/logo";
import { logoutAction, setLocaleAction, switchShopAction } from "@/app/actions/auth";
import { markReadAction } from "@/app/actions/notifications";
import { LOCALE_LABELS, LOCALES } from "@/i18n/types";
import { fmtRelative } from "@/lib/format";
import { ShortcutsDialog } from "./shortcuts";

export interface ShellUser {
  name: string;
  email: string;
  role: string;
  activeShopId: string;
  shops: { id: string; name: string; code: string }[];
  permissions: string[];
}
export interface ShellNotification {
  id: string;
  title: string;
  body: string;
  link: string;
  urgent: boolean;
  readAt: string | null;
  createdAt: string;
}

export function CommandBar({ user, notifications, unread }: { user: ShellUser; notifications: ShellNotification[]; unread: number }) {
  const t = useT();
  const router = useRouter();
  const { theme, setTheme, density, setDensity, setPaletteOpen } = useUi();
  const [pending, start] = useTransition();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const shop = user.shops.find((s) => s.id === user.activeShopId);
  const can = (p: string) => user.permissions.includes(p);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
      }
      if (e.key === "n" && can("tickets.create")) router.push("/repairs/new");
      if (e.key === "g") {
        const next = (e2: KeyboardEvent) => {
          const map: Record<string, string> = { d: "/", r: "/repairs", c: "/customers", i: "/inventory", p: "/pos" };
          if (map[e2.key]) router.push(map[e2.key]!);
          window.removeEventListener("keydown", next);
        };
        window.addEventListener("keydown", next, { once: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-nav/85 px-3 backdrop-blur-md sm:px-4 no-print" role="banner">
      <Link href="/" className="shrink-0 lg:hidden" aria-label="RepairFlow">
        <Logo collapsed />
      </Link>
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="glass mx-1 flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-sm)] px-3 text-[13px] text-muted transition-colors hover:text-fg sm:max-w-md"
        aria-keyshortcuts="Control+K Meta+K"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">{t("common.searchPlaceholder")}</span>
        <kbd className="ms-auto hidden rounded border border-border-strong bg-bg/50 px-1.5 font-mono text-[10.5px] text-muted sm:inline" aria-hidden>⌘K</kbd>
      </button>

      {can("tickets.create") || can("pos.sell") ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="primary" size="sm" className="shrink-0 gap-1.5" aria-label={t("common.create")}>
              <Plus className="size-4" />
              <span className="hidden sm:inline">{t("common.create")}</span>
              <ChevronDown className="size-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {can("tickets.create") ? (
              <DropdownMenuItem onSelect={() => router.push("/repairs/new")}>
                <Wrench /> {t("dashboard.newRepair")} <kbd className="ms-auto font-mono text-[10.5px] text-subtle">N</kbd>
              </DropdownMenuItem>
            ) : null}
            {can("pos.sell") ? (
              <DropdownMenuItem onSelect={() => router.push("/pos")}>
                <ShoppingCart /> {t("dashboard.newSale")}
              </DropdownMenuItem>
            ) : null}
            {can("customers.edit") ? (
              <DropdownMenuItem onSelect={() => router.push("/customers?new=1")}>
                <UserPlus /> {t("dashboard.newCustomer")}
              </DropdownMenuItem>
            ) : null}
            {can("inventory.edit") ? (
              <DropdownMenuItem onSelect={() => router.push("/inventory/purchasing")}>
                <PackagePlus /> {t("dashboard.receiveStock")}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {user.shops.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="hidden gap-1.5 md:inline-flex" title={t("common.shop")}>
              <Store className="size-4" />
              <span className="max-w-[140px] truncate">{shop?.name}</span>
              <ChevronDown className="size-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>{t("common.shop")}</DropdownMenuLabel>
            {user.shops.map((s) => (
              <DropdownMenuCheckboxItem key={s.id} checked={s.id === user.activeShopId} onSelect={() => start(async () => { await switchShopAction(s.id); router.refresh(); })}>
                {s.name} <span className="ms-auto mono text-subtle">{s.code}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative shrink-0" aria-label={`${t("nav.notifications")}${unread ? ` (${unread})` : ""}`}>
            <Bell className="size-[18px]" />
            {unread > 0 ? <span className="absolute end-1.5 top-1.5 size-2 rounded-full bg-accent ring-2 ring-[var(--surface-nav)]" /> : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[360px] p-0">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-[13px] font-semibold">{t("nav.notifications")}</span>
            <Link href="/notifications" className="text-[12px] text-accent hover:underline">
              {t("common.all")}
            </Link>
          </div>
          <ul className="max-h-[380px] overflow-y-auto scroll-thin">
            {notifications.length === 0 ? <li className="px-3 py-6 text-center text-[13px] text-muted">{t("notifications.empty")}</li> : null}
            {notifications.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.link || "/notifications"}
                  onClick={() => start(async () => { await markReadAction([n.id]); })}
                  className={cn("flex gap-3 border-b border-border px-3 py-2.5 text-[13px] last:border-0 hover:bg-hover", !n.readAt && "bg-accent-soft/30")}
                >
                  <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.urgent ? "bg-danger" : n.readAt ? "bg-transparent" : "bg-accent")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{n.title}</span>
                    <span className="block truncate text-muted">{n.body}</span>
                    <span className="block text-[11px] text-subtle">{fmtRelative(n.createdAt, t.locale)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent ring-1 ring-border-strong" aria-label={`${initials(user.name)} · ${user.name} · ${t("nav.profile")}`}>
            {initials(user.name)}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60">
          <div className="px-2 py-1.5">
            <div className="text-[13px] font-medium">{user.name}</div>
            <div className="truncate text-[12px] text-muted">{user.email}</div>
            <div className="mt-1 text-[11px] uppercase tracking-wide text-subtle">{t(`roles.${user.role}` as never)}</div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t("common.theme")}</DropdownMenuLabel>
          {(["dark", "light", "system"] as const).map((th) => (
            <DropdownMenuCheckboxItem key={th} checked={theme === th} onSelect={(e) => { e.preventDefault(); setTheme(th); }}>
              {th === "dark" ? <Moon className="size-4" /> : th === "light" ? <Sun className="size-4" /> : <Monitor className="size-4" />} {t(`common.${th}`)}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t("common.density")}</DropdownMenuLabel>
          {(["comfortable", "compact"] as const).map((d) => (
            <DropdownMenuCheckboxItem key={d} checked={density === d} onSelect={(e) => { e.preventDefault(); setDensity(d); }}>
              <Rows3 className="size-4" /> {t(`common.${d}`)}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t("common.language")}</DropdownMenuLabel>
          {LOCALES.map((l) => (
            <DropdownMenuCheckboxItem key={l} checked={t.locale === l} onSelect={() => start(async () => { await setLocaleAction(l); router.refresh(); })}>
              <Languages className="size-4" /> {LOCALE_LABELS[l]}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
            <Keyboard /> {t("nav.shortcuts")} <kbd className="ms-auto font-mono text-[10.5px] text-subtle">?</kbd>
          </DropdownMenuItem>
          <DropdownMenuItem destructive onSelect={() => start(async () => { await logoutAction(); })}>
            <LogOut /> {t("nav.logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      {pending ? <span className="sr-only" aria-live="polite">{t("common.loading")}</span> : null}
      <span className="hidden" onClick={() => toast("")} />
    </header>
  );
}
