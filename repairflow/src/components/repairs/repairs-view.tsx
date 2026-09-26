"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Columns3, LayoutList, CalendarDays, Search, Filter, ExternalLink, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { fmtDate, fmtMoney, fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";
import { Sheet } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger, Segmented } from "@/components/ui/menu";
import { StatusBadge, PriorityBadge, BlockBadge } from "@/components/shared/status-badge";
import { TICKET_STATUSES, nextStatuses, type TicketStatus } from "@/lib/domain/tickets";
import { transitionAction, deleteDraftAction } from "@/app/actions/tickets";
import { Badge } from "@/components/ui/badge";
import { addDays, eachDayOfInterval, format, isSameDay, startOfWeek } from "date-fns";
import { fr as frLocale, enGB, arSA } from "date-fns/locale";
const DF_LOCALES = { fr: frLocale, en: enGB, ar: arSA } as const;

export interface TicketRow {
  id: string; number: string; status: string; blockReason: string | null; priority: string; customer: string; customerId: string; phone: string; device: string; deviceKind: string; issue: string; technicianId: string | null; technician: string | null; promisedAt: string | null; receivedAt: string; readyAt: string | null; overdue: boolean; totalCents: number; balanceDueCents: number;
}
type Tech = { id: string; name: string; role: string };
type Draft = { id: string; updatedAt: string; data: Record<string, unknown> };

const ALL_COLUMNS = ["number", "customer", "device", "status", "technician", "promised", "balance", "priority"] as const;
type Col = (typeof ALL_COLUMNS)[number];

export function RepairsView({ rows, techs, drafts, canTransition }: { rows: TicketRow[]; techs: Tech[]; drafts: Draft[]; canTransition: boolean }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const view = (sp.get("view") ?? "table") as "table" | "kanban" | "planning";
  const [selected, setSelected] = useState<TicketRow | null>(null);
  const [cols, setCols] = useState<Col[]>(() => {
    try {
      const raw = localStorage.getItem("rf-repairs-cols");
      return raw ? (JSON.parse(raw) as Col[]) : [...ALL_COLUMNS];
    } catch {
      return [...ALL_COLUMNS];
    }
  });
  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (v === null || v === "") p.delete(k);
    else p.set(k, v);
    router.replace(`${pathname}?${p.toString()}`);
  };
  const toggleCol = (c: Col) => {
    const next = cols.includes(c) ? cols.filter((x) => x !== c) : ALL_COLUMNS.filter((x) => cols.includes(x) || x === c);
    setCols(next);
    localStorage.setItem("rf-repairs-cols", JSON.stringify(next));
  };

  return (
    <div className="space-y-3">
      {drafts.length ? (
        <div className="surface flex flex-wrap items-center gap-2 px-4 py-2 text-[13px]">
          <FileText className="size-4 text-champagne" />
          <span className="font-medium">{t("tickets.drafts")} ({drafts.length})</span>
          {drafts.map((d) => (
            <span key={d.id} className="flex items-center gap-1 rounded-[var(--radius-xs)] border border-border px-2 py-0.5">
              <Link href={`/repairs/new?draft=${d.id}`} className="text-accent hover:underline">
                {String((d.data.device as { brand?: string } | undefined)?.brand ?? "…")} {String((d.data.device as { model?: string } | undefined)?.model ?? "")} · {fmtDateTime(d.updatedAt, t.locale)}
              </Link>
              <DraftDelete id={d.id} />
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Vue" value={view} onChange={(v) => setParam("view", v === "table" ? null : v)} options={[{ value: "table", label: <><LayoutList className="size-4" /> {t("tickets.views.table")}</> }, { value: "kanban", label: <><Columns3 className="size-4" /> {t("tickets.views.kanban")}</> }, { value: "planning", label: <><CalendarDays className="size-4" /> {t("tickets.views.planning")}</> }]} />
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input defaultValue={sp.get("q") ?? ""} placeholder={t("common.search")} className="ps-8" aria-label={t("common.search")} onKeyDown={(e) => { if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value); }} onBlur={(e) => { if (e.target.value !== (sp.get("q") ?? "")) setParam("q", e.target.value); }} />
        </div>
        <Select aria-label={t("tickets.filters.status")} value={sp.get("status") ?? ""} onChange={(e) => setParam("status", e.target.value || null)} className="w-auto min-w-[150px]">
          <option value="">{t("common.status")} : {t("common.all")}</option>
          <option value="active">{t("dashboard.kpi.active")}</option>
          {TICKET_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </Select>
        <Select aria-label={t("tickets.filters.technician")} value={sp.get("tech") ?? ""} onChange={(e) => setParam("tech", e.target.value || null)} className="w-auto min-w-[150px]">
          <option value="">{t("common.technician")} : {t("common.all")}</option>
          {techs.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
        <Button variant={sp.get("overdue") ? "danger" : "outline"} size="md" onClick={() => setParam("overdue", sp.get("overdue") ? null : "1")} aria-pressed={Boolean(sp.get("overdue"))}>{t("tickets.filters.overdue")}</Button>
        <Button variant={sp.get("blocked") ? "danger" : "outline"} size="md" onClick={() => setParam("blocked", sp.get("blocked") ? null : "1")} aria-pressed={Boolean(sp.get("blocked"))}>{t("tickets.filters.blocked")}</Button>
        {sp.toString() ? <Button variant="ghost" size="md" onClick={() => router.replace(pathname)}><X className="size-4" /> {t("common.reset")}</Button> : null}
        {view === "table" ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="md" className="ms-auto"><Filter className="size-4" /> {t("tickets.columns")}</Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              {ALL_COLUMNS.map((c) => <DropdownMenuCheckboxItem key={c} checked={cols.includes(c)} onSelect={(e) => { e.preventDefault(); toggleCol(c); }}>{colLabel(c, t)}</DropdownMenuCheckboxItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t("tickets.empty")} action={<Button asChild variant="primary"><Link href="/repairs/new">{t("tickets.emptyAction")}</Link></Button>} />
      ) : view === "kanban" ? (
        <Kanban rows={rows} onSelect={setSelected} canTransition={canTransition} />
      ) : view === "planning" ? (
        <Planning rows={rows} techs={techs} onSelect={setSelected} />
      ) : (
        <>
          <div className="surface hidden overflow-hidden md:block">
            <Table>
              <THead><TR>{cols.map((c) => <TH key={c} className={c === "balance" ? "text-end" : ""}>{colLabel(c, t)}</TH>)}</TR></THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id} interactive data-selected={selected?.id === r.id} onClick={() => setSelected(r)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setSelected(r); }}>
                    {cols.includes("number") && <TD><span className="mono text-accent">{r.number}</span></TD>}
                    {cols.includes("customer") && <TD><div className="truncate font-medium">{r.customer}</div><div className="truncate text-[11.5px] text-muted">{r.phone}</div></TD>}
                    {cols.includes("device") && <TD><div className="truncate">{r.device}</div><div className="truncate-2 max-w-[260px] text-[11.5px] text-muted">{r.issue}</div></TD>}
                    {cols.includes("status") && <TD><div className="flex flex-wrap gap-1"><StatusBadge status={r.status} /><BlockBadge reason={r.blockReason} /></div></TD>}
                    {cols.includes("technician") && <TD className="text-muted">{r.technician ?? <span className="text-subtle">{t("tickets.unassigned")}</span>}</TD>}
                    {cols.includes("promised") && <TD><span className={cn("tnum", r.overdue && "font-medium text-danger")}>{r.promisedAt ? fmtDate(r.promisedAt, t.locale) : <span className="text-subtle">{t("tickets.noPromise")}</span>}</span>{r.overdue ? <span className="ms-1 text-[11px] text-danger">⚠ {t("tickets.overdue")}</span> : null}</TD>}
                    {cols.includes("balance") && <TD className="tnum text-end">{r.balanceDueCents > 0 ? <span className="font-medium">{fmtMoney(r.balanceDueCents, t.locale)}</span> : <span className="text-subtle">—</span>}</TD>}
                    {cols.includes("priority") && <TD><PriorityBadge priority={r.priority} /></TD>}
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          <ul className="space-y-2 md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/repairs/${r.id}`} className="surface block p-3 active:bg-hover">
                  <div className="flex items-center justify-between gap-2"><span className="mono text-accent">{r.number}</span><StatusBadge status={r.status} compact /></div>
                  <div className="mt-1 font-medium">{r.device}</div>
                  <div className="text-[12.5px] text-muted">{r.customer}</div>
                  <div className="mt-1.5 flex items-center justify-between text-[12px]"><span className={cn(r.overdue && "text-danger")}>{r.promisedAt ? `${t("tickets.promised")} ${fmtDate(r.promisedAt, t.locale)}` : t("tickets.noPromise")}</span>{r.balanceDueCents > 0 ? <span className="tnum font-medium">{fmtMoney(r.balanceDueCents, t.locale)}</span> : null}</div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)} title={selected ? <span className="mono">{selected.number}</span> : ""} description={selected ? `${selected.device} · ${selected.customer}` : undefined}>
        {selected ? <TicketPeek row={selected} canTransition={canTransition} /> : null}
      </Sheet>
    </div>
  );
}

function colLabel(c: Col, t: ReturnType<typeof useT>) {
  return { number: t("tickets.number"), customer: t("common.customer"), device: t("common.device"), status: t("common.status"), technician: t("common.technician"), promised: t("tickets.promised"), balance: t("tickets.balance"), priority: t("common.priority") }[c];
}

function DraftDelete({ id }: { id: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <button type="button" aria-label="Supprimer le brouillon" className="rounded p-0.5 text-subtle hover:text-danger" onClick={() => start(async () => { await deleteDraftAction(id); router.refresh(); })}>
      <X className="size-3.5" />
    </button>
  );
}

function TicketPeek({ row, canTransition }: { row: TicketRow; canTransition: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = nextStatuses(row.status as TicketStatus).filter((s) => s !== "CANCELLED");
  return (
    <div className="space-y-4 text-[13.5px]">
      <div className="flex flex-wrap gap-1.5"><StatusBadge status={row.status} /><BlockBadge reason={row.blockReason} /><PriorityBadge priority={row.priority} /></div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <dt className="text-muted">{t("common.customer")}</dt><dd><Link href={`/customers/${row.customerId}`} className="text-accent hover:underline">{row.customer}</Link><div className="text-[12px] text-muted">{row.phone}</div></dd>
        <dt className="text-muted">{t("common.technician")}</dt><dd>{row.technician ?? t("tickets.unassigned")}</dd>
        <dt className="text-muted">{t("tickets.received")}</dt><dd className="tnum">{fmtDateTime(row.receivedAt, t.locale)}</dd>
        <dt className="text-muted">{t("tickets.promised")}</dt><dd className={cn("tnum", row.overdue && "text-danger")}>{row.promisedAt ? fmtDateTime(row.promisedAt, t.locale) : t("tickets.noPromise")}</dd>
        <dt className="text-muted">{t("tickets.detail.total")}</dt><dd className="tnum">{fmtMoney(row.totalCents, t.locale)}</dd>
        <dt className="text-muted">{t("tickets.detail.due")}</dt><dd className="tnum font-medium">{fmtMoney(row.balanceDueCents, t.locale)}</dd>
      </dl>
      <div>
        <div className="mb-1 text-[12px] font-medium text-muted">{t("tickets.wizard.issue")}</div>
        <p className="rounded-[var(--radius-sm)] bg-hover p-3">{row.issue}</p>
      </div>
      {canTransition && next.length ? (
        <div>
          <div className="mb-1.5 text-[12px] font-medium text-muted">{t("tickets.detail.transition")}</div>
          <div className="flex flex-wrap gap-1.5">
            {next.map((s) => (
              <Button key={s} size="sm" loading={pending} onClick={() => start(async () => { const r = await transitionAction(row.id, s); if (!r.ok) toast.error(r.error); else { toast.success(t(`status.${s}`)); router.refresh(); } })}>
                → {t(`status.${s}`)}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      <Button asChild variant="primary" className="w-full"><Link href={`/repairs/${row.id}`}><ExternalLink /> {t("common.openFull")}</Link></Button>
    </div>
  );
}

function Kanban({ rows, onSelect, canTransition }: { rows: TicketRow[]; onSelect: (r: TicketRow) => void; canTransition: boolean }) {
  const t = useT();
  const router = useRouter();
  const [dragId, setDragId] = useState<string | null>(null);
  const [, start] = useTransition();
  const columns = TICKET_STATUSES.filter((s) => s !== "DELIVERED" && s !== "CANCELLED");
  const drop = (status: TicketStatus) => {
    const row = rows.find((r) => r.id === dragId);
    setDragId(null);
    if (!row || row.status === status || !canTransition) return;
    start(async () => {
      const r = await transitionAction(row.id, status);
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });
  };
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 scroll-thin">
      {columns.map((s) => {
        const items = rows.filter((r) => r.status === s);
        return (
          <section key={s} aria-label={t(`status.${s}`)} className={cn("flex w-[268px] shrink-0 flex-col rounded-[var(--radius-md)] border border-border bg-surface/60", dragId && "border-dashed border-accent/40")} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(s)}>
            <header className="flex items-center justify-between px-3 py-2"><StatusBadge status={s} /><span className="tnum text-[12px] text-muted">{items.length}</span></header>
            <ul className="flex-1 space-y-2 px-2 pb-2">
              {items.map((r) => (
                <li key={r.id} draggable={canTransition} onDragStart={() => setDragId(r.id)} onDragEnd={() => setDragId(null)} className={cn("surface-raised cursor-grab p-3 text-[13px] active:cursor-grabbing", r.overdue && "border-danger/40")} onClick={() => onSelect(r)}>
                  <div className="flex items-center justify-between gap-2"><span className="mono text-accent">{r.number}</span><PriorityBadge priority={r.priority} /></div>
                  <div className="mt-1 font-medium">{r.device}</div>
                  <div className="truncate text-[12px] text-muted">{r.customer}</div>
                  <div className="mt-1.5 flex items-center justify-between text-[11.5px]"><span className={cn("text-muted", r.overdue && "font-medium text-danger")}>{r.promisedAt ? fmtDate(r.promisedAt, t.locale) : "—"}</span><span className="text-subtle">{r.technician?.split(" ")[0] ?? ""}</span></div>
                  {r.blockReason ? <div className="mt-1.5"><BlockBadge reason={r.blockReason} /></div> : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Planning({ rows, techs, onSelect }: { rows: TicketRow[]; techs: Tech[]; onSelect: (r: TicketRow) => void }) {
  const t = useT();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const days = useMemo(() => eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 5) }), [weekStart]);
  const lanes = [...techs.filter((u) => u.role !== "SELLER"), { id: "", name: t("tickets.unassigned"), role: "" }];
  const active = rows.filter((r) => !["DELIVERED", "CANCELLED"].includes(r.status));
  return (
    <div className="surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <Button size="sm" variant="ghost" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</Button>
        <span className="text-[13px] font-medium">{fmtDate(days[0]!, t.locale)} – {fmtDate(days[5]!, t.locale)}</span>
        <Button size="sm" variant="ghost" onClick={() => setWeekStart(addDays(weekStart, 7))}>›</Button>
      </div>
      <div className="overflow-x-auto scroll-thin">
        <div className="grid min-w-[900px]" style={{ gridTemplateColumns: `160px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div className="border-b border-e border-border bg-hover/40 px-3 py-2 text-[11.5px] font-medium uppercase tracking-wide text-subtle">{t("common.technician")}</div>
          {days.map((d) => <div key={d.toISOString()} className={cn("border-b border-border px-2 py-2 text-center text-[12px]", isSameDay(d, new Date()) && "bg-accent-soft/40 font-semibold")}>{format(d, "EEE d", { locale: DF_LOCALES[t.locale] })}</div>)}
          {lanes.map((lane) => (
            <div key={lane.id || "none"} className="contents">
              <div className="border-b border-e border-border px-3 py-2 text-[13px]">{lane.name}</div>
              {days.map((d) => {
                const items = active.filter((r) => (r.technicianId ?? "") === lane.id && r.promisedAt && isSameDay(new Date(r.promisedAt), d));
                return (
                  <div key={d.toISOString()} className="min-h-[56px] space-y-1 border-b border-border p-1">
                    {items.map((r) => (
                      <button key={r.id} type="button" onClick={() => onSelect(r)} className={cn("block w-full truncate rounded-[var(--radius-xs)] border border-border bg-raised px-1.5 py-1 text-start text-[11.5px] hover:border-accent", r.overdue && "border-danger/50")}>
                        <span className="mono text-accent">{r.number.split("-").pop()}</span> {r.device}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="border-t border-border px-3 py-2 text-[11.5px] text-subtle">{active.filter((r) => !r.promisedAt).length} {t("tickets.noPromise").toLowerCase()}</p>
      <Badge className="hidden" />
    </div>
  );
}
