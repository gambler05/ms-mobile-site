import Link from "next/link";
import { Suspense } from "react";
import { Plus, ChevronDown, Wallet, Wrench, PackageCheck, Clock, AlertTriangle, ShoppingCart, UserPlus, PackagePlus } from "lucide-react";
import { requirePage } from "@/server/auth/guard";
import { getT } from "@/i18n/server";
import { dashboardMetrics, periodFromKey, readySince, recentActivity, revenueSeries, topProducts, urgentQueue, workshopLoad } from "@/server/services/reports";
import { lowStock } from "@/server/services/stock";
import { fmtMoney, fmtDate, fmtRelative } from "@/lib/format";
import { KpiTile } from "@/components/ui/kpi";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RevenueChart } from "@/components/dashboard/revenue-chart-lazy";
import { StatusBadge } from "@/components/shared/status-badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/states";
import { differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";

export const metadata = { title: "Tableau de bord" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const ctx = await requirePage("dashboard.view");
  const t = await getT();
  const { period = "30d" } = await searchParams;
  const hour = new Date().getHours();
  const greeting = t(`dashboard.greeting.${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}`);
  const shop = ctx.user.shops.find((s) => s.id === ctx.shopId);
  const m = await dashboardMetrics(ctx);
  const dateLabel = new Intl.DateTimeFormat(t.locale === "fr" ? "fr-FR" : t.locale === "ar" ? "ar-MA" : "en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 anim-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-muted">
            {greeting}, {ctx.user.name.split(" ")[0]} · <span className="capitalize">{dateLabel}</span> · {shop?.name}
          </p>
          <h1 className="display mt-1 text-[24px]">{t("nav.dashboard")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label={t("dashboard.secondary")}>
                {t("dashboard.secondary")} <ChevronDown className="size-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem asChild><Link href="/pos"><ShoppingCart /> {t("dashboard.newSale")}</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link href="/customers?new=1"><UserPlus /> {t("dashboard.newCustomer")}</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link href="/inventory/purchasing"><PackagePlus /> {t("dashboard.receiveStock")}</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button asChild variant="primary">
            <Link href="/repairs/new"><Plus /> {t("dashboard.newRepair")}</Link>
          </Button>
        </div>
      </header>

      <section aria-label="Indicateurs" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile label={t("dashboard.kpi.settledToday")} value={fmtMoney(m.settledTodayCents, t.locale)} hint={t("dashboard.kpi.settledTodayHint")} href="/pos/sales?period=1d" tone="accent" icon={<Wallet />} emphasis />
        <KpiTile label={t("dashboard.kpi.active")} value={String(m.activeRepairs)} hint={t("dashboard.kpi.activeHint")} href="/repairs?status=active" icon={<Wrench />} />
        <KpiTile label={t("dashboard.kpi.ready")} value={String(m.readyForPickup)} hint={t("dashboard.kpi.readyHint")} href="/repairs?status=READY" tone="success" icon={<PackageCheck />} />
        <KpiTile label={t("dashboard.kpi.overdue")} value={String(m.overdue)} hint={t("dashboard.kpi.overdueHint")} href="/repairs?overdue=1" tone={m.overdue > 0 ? "danger" : "neutral"} icon={<Clock />} />
        <KpiTile label={t("dashboard.kpi.lowStock")} value={String(m.lowStock)} hint={t("dashboard.kpi.lowStockHint")} href="/inventory?low=1" tone={m.lowStock > 0 ? "warning" : "neutral"} icon={<AlertTriangle />} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Suspense fallback={<Skeleton className="h-[360px]" />}>
          <RevenueSection period={period} />
        </Suspense>
        <div className="grid gap-4">
          <Suspense fallback={<Skeleton className="h-[240px]" />}>
            <QueueSection />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-[120px]" />}>
            <LoadSection />
          </Suspense>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Suspense fallback={<Skeleton className="h-[200px]" />}><ReadySinceSection /></Suspense>
        <Suspense fallback={<Skeleton className="h-[200px]" />}><PartsSection /></Suspense>
        <Suspense fallback={<Skeleton className="h-[200px]" />}><ActivitySection /></Suspense>
        <Suspense fallback={<Skeleton className="h-[200px]" />}><TopProductsSection period={period} /></Suspense>
      </section>
    </div>
  );
}

async function RevenueSection({ period }: { period: string }) {
  const ctx = await requirePage("dashboard.view");
  const t = await getT();
  const { series, totals } = await revenueSeries(ctx, periodFromKey(period));
  return (
    <Card className="flex flex-col">
      <CardHeader
        title={t("dashboard.revenue")}
        description={t("dashboard.revenueHint")}
        action={
          <nav aria-label={t("common.period")} className="flex gap-1 rounded-[var(--radius-sm)] border border-border p-0.5">
            {["7d", "30d", "90d"].map((p) => (
              <Link key={p} href={`/?period=${p}`} scroll={false} aria-current={p === period ? "page" : undefined} className={cn("rounded-[var(--radius-xs)] px-2 py-1 text-[12px] font-medium text-muted", p === period && "bg-active text-fg")}>
                {p.replace("d", " j")}
              </Link>
            ))}
          </nav>
        }
      />
      <CardBody className="flex-1">
        <div className="mb-3 grid grid-cols-3 gap-3">
          {[
            { label: t("dashboard.sales"), v: totals.salesCents, c: "var(--chart-1)" },
            { label: t("dashboard.repairsBilled"), v: totals.repairsCents, c: "var(--chart-2)" },
            { label: t("dashboard.settled"), v: totals.settledCents, c: "var(--chart-3)" },
          ].map((s) => (
            <div key={s.label} className="min-w-0">
              <div className="flex items-center gap-1.5 text-[12px] text-muted">
                <span aria-hidden className="size-2 rounded-full" style={{ background: s.c }} />
                <span className="truncate">{s.label}</span>
              </div>
              <div className="display tnum mt-0.5 text-[18px] font-semibold">{fmtMoney(s.v, t.locale)}</div>
            </div>
          ))}
        </div>
        <RevenueChart data={series} labels={{ sales: t("dashboard.sales"), repairs: t("dashboard.repairsBilled"), settled: t("dashboard.settled") }} locale={t.locale} summary={t("dashboard.chartSummary", { sales: fmtMoney(totals.salesCents, t.locale), repairs: fmtMoney(totals.repairsCents, t.locale), settled: fmtMoney(totals.settledCents, t.locale) })} />
      </CardBody>
    </Card>
  );
}

async function QueueSection() {
  const ctx = await requirePage("dashboard.view");
  const t = await getT();
  const queue = await urgentQueue(ctx, 7);
  return (
    <Card>
      <CardHeader title={t("dashboard.queue")} action={<Link href="/repairs?overdue=1" className="text-[12px] text-accent hover:underline">{t("common.all")}</Link>} />
      <CardBody className="p-0 pb-1">
        {queue.length === 0 ? <p className="px-[var(--pad-card)] pb-4 text-[13px] text-muted">{t("dashboard.queueEmpty")}</p> : null}
        <ul className="divide-y divide-border">
          {queue.map(({ ticket, reasons }) => (
            <li key={ticket.id}>
              <Link href={`/repairs/${ticket.id}`} className="flex items-center gap-3 px-[var(--pad-card)] py-2.5 hover:bg-hover">
                <span className="mono w-[104px] shrink-0 text-accent">{ticket.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px]">{ticket.device.brand} {ticket.device.model} · {ticket.customer.lastName}</span>
                  <span className="block truncate text-[11.5px] text-muted">{reasons.map((r) => t(`dashboard.reasons.${r}` as never)).join(" · ")}</span>
                </span>
                <StatusBadge status={ticket.status} compact />
              </Link>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

async function LoadSection() {
  const ctx = await requirePage("dashboard.view");
  const t = await getT();
  const load = await workshopLoad(ctx);
  const max = Math.max(1, ...load.map((l) => l.total));
  return (
    <Card>
      <CardHeader title={t("dashboard.load")} />
      <CardBody>
        <ul className="space-y-2">
          {load.filter((l) => l.total > 0 || l.id).map((l) => (
            <li key={l.id || "none"} className="grid grid-cols-[110px_1fr_32px] items-center gap-2 text-[12.5px]">
              <span className="truncate text-muted">{l.name}</span>
              <span className="h-2 overflow-hidden rounded-full bg-hover" role="img" aria-label={`${l.name} : ${l.total}`}>
                <span className="block h-full rounded-full bg-accent/80" style={{ width: `${(l.total / max) * 100}%` }} />
              </span>
              <span className="tnum text-end font-medium">{l.total}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

async function ReadySinceSection() {
  const ctx = await requirePage("dashboard.view");
  const t = await getT();
  const rows = await readySince(ctx, 3);
  return (
    <Card>
      <CardHeader title={t("dashboard.readySince")} />
      <CardBody className="p-0 pb-2">
        {rows.length === 0 ? <p className="px-[var(--pad-card)] pb-3 text-[13px] text-muted">{t("dashboard.readySinceEmpty")}</p> : null}
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/repairs/${r.id}`} className="flex items-center justify-between gap-2 px-[var(--pad-card)] py-2 text-[13px] hover:bg-hover">
                <span className="min-w-0"><span className="mono text-accent">{r.number}</span> <span className="truncate text-muted">{r.customer.lastName}</span></span>
                <span className="tnum shrink-0 rounded bg-warning-soft px-1.5 text-[11.5px] font-medium text-warning">{t("dashboard.days", { n: differenceInDays(new Date(), r.readyAt!) })}</span>
              </Link>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

async function PartsSection() {
  const ctx = await requirePage("dashboard.view");
  const t = await getT();
  const rows = (await lowStock(ctx.orgId, ctx.shopId)).slice(0, 6);
  return (
    <Card>
      <CardHeader title={t("dashboard.partsToOrder")} action={<Link href="/inventory?low=1" className="text-[12px] text-accent hover:underline">{t("common.all")}</Link>} />
      <CardBody className="p-0 pb-2">
        {rows.length === 0 ? <p className="px-[var(--pad-card)] pb-3 text-[13px] text-muted">{t("dashboard.partsEmpty")}</p> : null}
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/inventory/${r.productId}`} className="flex items-center justify-between gap-2 px-[var(--pad-card)] py-2 text-[13px] hover:bg-hover">
                <span className="min-w-0 truncate">{r.product.name}</span>
                <span className={cn("tnum shrink-0 text-[12px] font-medium", r.available <= 0 ? "text-danger" : "text-warning")}>{r.available}{r.expected ? <span className="text-subtle"> +{r.expected}</span> : null}</span>
              </Link>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

async function ActivitySection() {
  const ctx = await requirePage("dashboard.view");
  const t = await getT();
  const rows = await recentActivity(ctx, 8);
  return (
    <Card>
      <CardHeader title={t("dashboard.activity")} />
      <CardBody className="p-0 pb-2">
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="px-[var(--pad-card)] py-2 text-[12.5px]">
              <div className="flex justify-between gap-2"><span className="truncate font-medium">{r.userName}</span><span className="shrink-0 text-subtle">{fmtRelative(r.createdAt, t.locale)}</span></div>
              <div className="mono truncate text-muted">{r.action}</div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

async function TopProductsSection({ period }: { period: string }) {
  const ctx = await requirePage("dashboard.view");
  const t = await getT();
  const rows = await topProducts(ctx, periodFromKey(period), 6);
  return (
    <Card>
      <CardHeader title={t("dashboard.topProducts")} />
      <CardBody className="p-0 pb-2">
        {rows.length === 0 ? <p className="px-[var(--pad-card)] pb-3 text-[13px] text-muted">{t("dashboard.topEmpty")}</p> : null}
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.product.id}>
              <Link href={`/inventory/${r.product.id}`} className="flex items-center justify-between gap-2 px-[var(--pad-card)] py-2 text-[13px] hover:bg-hover">
                <span className="min-w-0"><span className="block truncate">{r.product.name}</span><span className="mono text-subtle">{r.product.sku} · ×{r.qty}</span></span>
                <span className="tnum shrink-0 font-medium">{fmtMoney(r.totalCents, t.locale)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
export { fmtDate };
