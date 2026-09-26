"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { Wrench, Users, Boxes, ShoppingCart, LayoutDashboard, Bell, BarChart3, Settings, Plus, Search } from "lucide-react";
import { useUi } from "@/store/ui";
import { useT } from "@/i18n/client";
import { globalSearchAction, type SearchResults } from "@/app/actions/search";
import { StatusBadge } from "@/components/shared/status-badge";

export function CommandPalette({ permissions }: { permissions: string[] }) {
  const t = useT();
  const router = useRouter();
  const { paletteOpen, setPaletteOpen } = useUi();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [pending, start] = useTransition();
  const can = (p: string) => permissions.includes(p);

  useEffect(() => {
    if (!paletteOpen) {
      setQ("");
      setResults(null);
      return;
    }
  }, [paletteOpen]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    const h = setTimeout(() => {
      start(async () => {
        const r = await globalSearchAction(q);
        if (r.ok) setResults(r.data);
      });
    }, 160);
    return () => clearTimeout(h);
  }, [q]);

  const go = (href: string) => {
    setPaletteOpen(false);
    router.push(href);
  };

  const pages = [
    { href: "/", label: t("nav.dashboard"), icon: LayoutDashboard, perm: "dashboard.view" },
    { href: "/repairs", label: t("nav.repairs"), icon: Wrench, perm: "tickets.view" },
    { href: "/customers", label: t("nav.customers"), icon: Users, perm: "customers.view" },
    { href: "/inventory", label: t("nav.inventory"), icon: Boxes, perm: "inventory.view" },
    { href: "/pos", label: t("nav.pos"), icon: ShoppingCart, perm: "pos.sell" },
    { href: "/notifications", label: t("nav.notifications"), icon: Bell, perm: "notifications.manage" },
    { href: "/reports", label: t("nav.reports"), icon: BarChart3, perm: "reports.view" },
    { href: "/settings", label: t("nav.settings"), icon: Settings, perm: "settings.view" },
  ].filter((p) => can(p.perm));

  return (
    <D.Root open={paletteOpen} onOpenChange={setPaletteOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40 anim-fade" />
        <D.Content className="glass fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-[var(--radius-lg)] shadow-[var(--shadow-3)] anim-in focus:outline-none">
          <D.Title className="sr-only">{t("shortcuts.palette")}</D.Title>
          <D.Description className="sr-only">{t("common.searchPlaceholder")}</D.Description>
          <Command label={t("shortcuts.palette")} shouldFilter={!results} loop>
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 text-muted" />
              <Command.Input value={q} onValueChange={setQ} placeholder={t("common.searchPlaceholder")} className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-subtle" autoFocus />
              {pending ? <span className="size-3.5 animate-spin rounded-full border-2 border-muted border-t-transparent" /> : null}
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2 scroll-thin [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-subtle">
              <Command.Empty className="px-3 py-8 text-center text-[13px] text-muted">{t("common.empty")}</Command.Empty>
              {results ? (
                <>
                  {results.tickets.length ? (
                    <Command.Group heading={t("nav.repairs")}>
                      {results.tickets.map((r) => (
                        <Item key={r.id} onSelect={() => go(`/repairs/${r.id}`)}>
                          <Wrench className="size-4 text-muted" />
                          <span className="mono text-accent">{r.number}</span>
                          <span className="truncate">{r.label}</span>
                          <span className="ms-auto"><StatusBadge status={r.status} compact /></span>
                        </Item>
                      ))}
                    </Command.Group>
                  ) : null}
                  {results.customers.length ? (
                    <Command.Group heading={t("nav.customers")}>
                      {results.customers.map((r) => (
                        <Item key={r.id} onSelect={() => go(`/customers/${r.id}`)}>
                          <Users className="size-4 text-muted" />
                          <span>{r.label}</span>
                          <span className="ms-auto text-muted">{r.sub}</span>
                        </Item>
                      ))}
                    </Command.Group>
                  ) : null}
                  {results.products.length ? (
                    <Command.Group heading={t("nav.inventory")}>
                      {results.products.map((r) => (
                        <Item key={r.id} onSelect={() => go(`/inventory/${r.id}`)}>
                          <Boxes className="size-4 text-muted" />
                          <span className="truncate">{r.label}</span>
                          <span className="mono text-subtle">{r.sku}</span>
                          <span className="tnum ms-auto text-muted">{r.available}</span>
                        </Item>
                      ))}
                    </Command.Group>
                  ) : null}
                </>
              ) : (
                <>
                  <Command.Group heading={t("common.actions")}>
                    {can("tickets.create") ? (
                      <Item onSelect={() => go("/repairs/new")} value="nouvelle réparation new ticket">
                        <Plus className="size-4 text-accent" /> {t("dashboard.newRepair")}
                      </Item>
                    ) : null}
                    {can("pos.sell") ? (
                      <Item onSelect={() => go("/pos")} value="nouvelle vente sale">
                        <ShoppingCart className="size-4 text-accent" /> {t("dashboard.newSale")}
                      </Item>
                    ) : null}
                  </Command.Group>
                  <Command.Group heading="Navigation">
                    {pages.map((p) => (
                      <Item key={p.href} onSelect={() => go(p.href)} value={p.label}>
                        <p.icon className="size-4 text-muted" /> {p.label}
                      </Item>
                    ))}
                  </Command.Group>
                </>
              )}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function Item({ children, onSelect, value }: { children: React.ReactNode; onSelect: () => void; value?: string }) {
  return (
    <Command.Item value={value} onSelect={onSelect} className="flex cursor-default items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13.5px] data-[selected=true]:bg-hover">
      {children}
    </Command.Item>
  );
}
