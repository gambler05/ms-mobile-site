"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Archive, CheckCheck, RefreshCw, ExternalLink } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge, type Tone } from "@/components/ui/badge";
import { Checkbox, Segmented } from "@/components/ui/menu";
import { EmptyState } from "@/components/ui/states";
import { archiveAction, markReadAction, retryJobAction } from "@/app/actions/notifications";
import { NOTIFICATION_EVENTS } from "@/lib/domain/notifications";

type Item = { id: string; type: string; title: string; body: string; urgent: boolean; link: string; shopId: string | null; readAt: string | null; archivedAt: string | null; createdAt: string };
type Job = { id: string; channel: string; eventType: string; recipient: string; status: string; attempts: number; maxAttempts: number; lastError: string; nextAttemptAt: string; sentAt: string | null; createdAt: string; entityType: string | null; entityId: string | null; deliveries: { id: string; attempt: number; status: string; detail: string; createdAt: string }[] };

const JOB_TONE: Record<string, Tone> = { PENDING: "neutral", SENDING: "accent", SENT: "success", SIMULATED: "iris", FAILED: "warning", DEAD: "danger", CANCELLED: "neutral" };

export function NotificationsView({ items, jobs, channels, shops, tab }: { items: Item[]; jobs: Job[]; channels: { channel: string; configured: boolean; missing: string[]; demoMode: boolean }[]; shops: { id: string; name: string }[]; tab: string }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const setParam = (k: string, v: string | null) => { const p = new URLSearchParams(sp.toString()); if (v) p.set(k, v); else p.delete(k); router.replace(`${pathname}?${p}`); };
  const list = items.filter((n) => (tab === "unread" ? !n.readAt && !n.archivedAt : tab === "urgent" ? n.urgent && !n.archivedAt : tab === "archived" ? Boolean(n.archivedAt) : !n.archivedAt));
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) toast.error(r.error); else { setSel(new Set()); router.refresh(); } });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label={t("notifications.title")} className="h-auto flex-wrap" value={tab} onChange={(v) => setParam("tab", v === "unread" ? null : v)} options={(["unread", "urgent", "all", "archived", "queue"] as const).map((k) => ({ value: k, label: `${t(`notifications.tabs.${k}`)}${k === "unread" ? ` (${items.filter((n) => !n.readAt && !n.archivedAt).length})` : k === "queue" ? ` (${jobs.filter((j) => j.status === "PENDING" || j.status === "FAILED").length})` : ""}` }))} />
        {tab !== "queue" ? <><Select className="w-auto" value={sp.get("type") ?? ""} onChange={(e) => setParam("type", e.target.value || null)} aria-label="Type"><option value="">Type : {t("common.all")}</option>{NOTIFICATION_EVENTS.map((e) => <option key={e} value={e}>{t(`notifications.types.${e}`)}</option>)}</Select>{shops.length > 1 ? <Select className="w-auto" value={sp.get("shop") ?? ""} onChange={(e) => setParam("shop", e.target.value || null)} aria-label={t("common.shop")}><option value="">{t("common.shop")} : {t("common.all")}</option>{shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select> : null}</> : null}
        {sel.size ? <div className="ms-auto flex gap-2"><Button size="sm" loading={pending} onClick={() => act(() => markReadAction(Array.from(sel)))}><CheckCheck /> {t("notifications.markRead")}</Button><Button size="sm" variant="ghost" loading={pending} onClick={() => act(() => archiveAction(Array.from(sel)))}><Archive /> {t("notifications.archive")}</Button></div> : null}
      </div>

      {tab === "queue" ? (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-5">{channels.map((c) => <div key={c.channel} className="surface p-3 text-[12.5px]"><div className="flex items-center justify-between"><span className="font-medium">{c.channel}</span><Badge tone={c.configured ? "success" : "warning"}>{c.configured ? t("notifications.channelStatus.configured") : t("notifications.channelStatus.missing")}</Badge></div>{c.demoMode && c.channel !== "INAPP" ? <div className="mt-1 text-[11px] text-champagne">{t("notifications.channelStatus.demo")}</div> : null}{c.missing.length ? <div className="mono mt-1 truncate text-[10.5px] text-subtle" title={c.missing.join(", ")}>{c.missing.join(", ")}</div> : null}</div>)}</div>
          <ul className="surface divide-y divide-border">
            {jobs.length === 0 ? <li className="p-6 text-center text-[13px] text-muted">{t("common.empty")}</li> : null}
            {jobs.map((j) => <li key={j.id}><button type="button" className="flex w-full flex-wrap items-center gap-3 px-4 py-2.5 text-start text-[13px] hover:bg-hover" onClick={() => setOpenJob(openJob === j.id ? null : j.id)}><Badge>{j.channel}</Badge><span className="w-[150px] truncate">{t(`notifications.types.${j.eventType}` as never)}</span><span className="mono flex-1 truncate text-muted">{j.recipient.replace(/^(.{2}).*(@.*)$/, "$1***$2").replace(/\d(?=\d{2})/g, "•")}</span><span className="text-[11.5px] text-subtle">{fmtDateTime(j.createdAt, t.locale)}</span><span className="tnum text-[11.5px] text-muted">{t("notifications.attempts")} {j.attempts}/{j.maxAttempts}</span><Badge tone={JOB_TONE[j.status] ?? "neutral"}>{t(`notifications.queueStatus.${j.status}` as never)}</Badge>{j.status === "DEAD" || j.status === "FAILED" ? <Button size="sm" variant="ghost" loading={pending} onClick={(e) => { e.stopPropagation(); act(() => retryJobAction(j.id)); }}><RefreshCw /> {t("notifications.retry")}</Button> : null}</button>
              {openJob === j.id ? <div className="border-t border-border bg-hover/40 px-4 py-2 text-[12.5px]"><div className="mb-1 font-medium">{t("notifications.deliveries")}</div>{j.lastError ? <p className="mb-1 text-danger">{j.lastError}</p> : null}<ul className="space-y-0.5">{j.deliveries.map((d) => <li key={d.id} className="flex gap-3"><span className="tnum text-subtle">#{d.attempt}</span><span>{fmtDateTime(d.createdAt, t.locale)}</span><Badge tone={JOB_TONE[d.status] ?? "neutral"}>{d.status}</Badge><span className="truncate text-muted">{d.detail}</span></li>)}{j.deliveries.length === 0 ? <li className="text-muted">Prochaine tentative : {fmtDateTime(j.nextAttemptAt, t.locale)}</li> : null}</ul>{j.entityType === "RepairTicket" && j.entityId ? <Link href={`/repairs/${j.entityId}`} className="mt-1 inline-flex items-center gap-1 text-accent hover:underline"><ExternalLink className="size-3" /> ticket</Link> : null}</div> : null}
            </li>)}
          </ul>
        </div>
      ) : list.length === 0 ? <EmptyState title={t("notifications.empty")} /> : (
        <ul className="surface divide-y divide-border">
          <li className="flex items-center gap-3 px-4 py-2 text-[12px] text-muted"><Checkbox checked={sel.size === list.length && list.length > 0} onCheckedChange={(v) => setSel(v ? new Set(list.map((n) => n.id)) : new Set())} aria-label={t("common.selectAll")} /> {t("common.selectAll")}</li>
          {list.map((n) => (
            <li key={n.id} className={cn("flex items-start gap-3 px-4 py-3", !n.readAt && "bg-accent-soft/20")}>
              <Checkbox checked={sel.has(n.id)} onCheckedChange={(v) => { const s = new Set(sel); if (v) s.add(n.id); else s.delete(n.id); setSel(s); }} aria-label={n.title} className="mt-0.5" />
              <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.urgent ? "bg-danger" : n.readAt ? "bg-transparent" : "bg-accent")} />
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{n.title}</span><Badge>{t(`notifications.types.${n.type}` as never)}</Badge>{n.urgent ? <Badge tone="danger">!</Badge> : null}</div><p className="text-[13px] text-muted">{n.body}</p><div className="mt-0.5 text-[11.5px] text-subtle">{fmtRelative(n.createdAt, t.locale)} · {shops.find((s) => s.id === n.shopId)?.name ?? ""}</div></div>
              {n.link ? <Button asChild size="sm" variant="ghost"><Link href={n.link} onClick={() => start(async () => { await markReadAction([n.id]); })}><ExternalLink /> {t("common.details")}</Link></Button> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
