"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Users, GitMerge } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { Sheet, Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { CustomerForm } from "./customer-form";
import { mergeCustomersAction, previewMergeAction } from "@/app/actions/customers";
import { fmtDate } from "@/lib/format";

export type CustomerRow = { id: string; name: string; company: string; phone: string; email: string; segment: string; tags: string[]; tickets: number; sales: number; toPickup: number; loyaltyPoints: number; updatedAt: string };
type Dup = { reason: string; customers: { id: string; name: string; phone: string; email: string; createdAt: string }[] };

export function SegmentBadge({ segment }: { segment: string }) {
  const t = useT();
  return <Badge tone={segment === "VIP" ? "champagne" : segment === "LOYAL" ? "accent" : "neutral"}>{segment === "VIP" ? "★ " : ""}{t(`customers.segments.${segment}` as never)}</Badge>;
}

export function CustomersView({ rows, duplicates, canEdit, canMerge, openNew }: { rows: CustomerRow[]; duplicates: Dup[]; canEdit: boolean; canMerge: boolean; openNew: boolean }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [creating, setCreating] = useState(openNew);
  const [merge, setMerge] = useState<Dup | null>(null);
  const setParam = (k: string, v: string | null) => { const p = new URLSearchParams(sp.toString()); if (v) p.set(k, v); else p.delete(k); router.replace(`${pathname}?${p}`); };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm"><Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" /><Input className="ps-8" defaultValue={sp.get("q") ?? ""} placeholder={t("common.search")} onKeyDown={(e) => { if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value); }} aria-label={t("common.search")} /></div>
        <Select className="w-auto" value={sp.get("segment") ?? ""} onChange={(e) => setParam("segment", e.target.value || null)} aria-label="Segment"><option value="">{t("common.all")}</option>{["NEW", "LOYAL", "VIP"].map((s) => <option key={s} value={s}>{t(`customers.segments.${s}` as never)}</option>)}</Select>
        {canMerge && duplicates.length ? <Button variant="outline" onClick={() => setMerge(duplicates[0]!)}><GitMerge /> {t("customers.duplicates")} ({duplicates.length})</Button> : null}
        {canEdit ? <Button variant="primary" className="ms-auto" onClick={() => setCreating(true)}><Plus /> {t("customers.new")}</Button> : null}
      </div>
      {rows.length === 0 ? <EmptyState icon={<Users />} title={t("customers.empty")} action={canEdit ? <Button variant="primary" onClick={() => setCreating(true)}>{t("customers.new")}</Button> : undefined} /> : (
        <>
          <div className="surface hidden overflow-hidden md:block">
            <Table>
              <THead><TR><TH>{t("common.customer")}</TH><TH>{t("customers.contact")}</TH><TH>Segment</TH><TH className="text-end">{t("customers.repairs")}</TH><TH className="text-end">{t("customers.purchases")}</TH><TH className="text-end">{t("customers.loyalty")}</TH><TH>{t("customers.toPickup")}</TH></TR></THead>
              <TBody>{rows.map((r) => <TR key={r.id} interactive onClick={() => router.push(`/customers/${r.id}`)}><TD><Link href={`/customers/${r.id}`} className="font-medium hover:underline">{r.name}</Link>{r.company ? <div className="text-[11.5px] text-muted">{r.company}</div> : null}</TD><TD className="text-muted"><div>{r.phone}</div><div className="truncate text-[11.5px]">{r.email}</div></TD><TD><div className="flex flex-wrap gap-1"><SegmentBadge segment={r.segment} />{r.tags.map((x) => <Badge key={x} tone="outline">{x}</Badge>)}</div></TD><TD className="tnum text-end">{r.tickets}</TD><TD className="tnum text-end">{r.sales}</TD><TD className="tnum text-end">{r.loyaltyPoints}</TD><TD>{r.toPickup ? <Badge tone="success">{r.toPickup}</Badge> : <span className="text-subtle">—</span>}</TD></TR>)}</TBody>
            </Table>
          </div>
          <ul className="space-y-2 md:hidden">{rows.map((r) => <li key={r.id}><Link href={`/customers/${r.id}`} className="surface block p-3"><div className="flex items-center justify-between"><span className="font-medium">{r.name}</span><SegmentBadge segment={r.segment} /></div><div className="text-[12.5px] text-muted">{r.phone}</div></Link></li>)}</ul>
        </>
      )}
      <Sheet open={creating} onOpenChange={setCreating} title={t("customers.new")}>
        <CustomerForm onDone={(id) => { setCreating(false); router.push(`/customers/${id}`); }} />
      </Sheet>
      <MergeDialog dup={merge} all={duplicates} onClose={() => setMerge(null)} />
    </div>
  );
}

function MergeDialog({ dup, all, onClose }: { dup: Dup | null; all: Dup[]; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [keep, setKeep] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ counts: Record<string, number>; merged: Record<string, string>; keep: string; merge: string } | null>(null);
  const [pending, start] = useTransition();
  const [index, setIndex] = useState(0);
  const cur = dup ? all[index] ?? dup : null;
  const other = cur && keep ? cur.customers.find((c) => c.id !== keep) : null;
  return (
    <Dialog open={Boolean(dup)} onOpenChange={(o) => { if (!o) { onClose(); setKeep(null); setPreview(null); } }}>
      <DialogContent title={t("customers.duplicates")} size="md" description={cur ? `${index + 1}/${all.length} · ${cur.reason === "phone" ? "même téléphone" : cur.reason === "email" ? "même e-mail" : "même nom"}` : undefined}>
        {cur ? (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">{cur.customers.map((c) => <button key={c.id} type="button" onClick={() => { setKeep(c.id); setPreview(null); }} className={cn("rounded-[var(--radius-md)] border p-3 text-start text-[13px]", keep === c.id ? "border-accent bg-accent-soft/40" : "border-border")}><div className="font-medium">{c.name}</div><div className="text-muted">{c.phone} · {c.email || "—"}</div><div className="text-[11.5px] text-subtle">{fmtDate(c.createdAt, t.locale)}</div>{keep === c.id ? <Badge tone="accent" className="mt-1">{t("customers.keep")}</Badge> : null}</button>)}</div>
            {keep && other && !preview ? <Button loading={pending} onClick={() => start(async () => { const r = await previewMergeAction(keep, other.id); if (r.ok) setPreview(r.data); else toast.error(r.error); })}>{t("customers.mergePreview")}</Button> : null}
            {preview ? <div className="rounded-[var(--radius-sm)] bg-hover p-3 text-[13px]"><div className="font-medium">{preview.merge} → {preview.keep}</div><ul className="mt-1 text-muted"><li>{preview.counts.tickets} réparation(s), {preview.counts.sales} vente(s), {preview.counts.devices} appareil(s), {preview.counts.credits} avoir(s) réattribués</li><li>Coordonnées conservées : {[preview.merged.phone, preview.merged.email, preview.merged.city].filter(Boolean).join(" · ")}</li></ul></div> : null}
          </div>
        ) : null}
        <DialogFooter>
          {all.length > 1 ? <Button variant="ghost" onClick={() => { setIndex((index + 1) % all.length); setKeep(null); setPreview(null); }}>{t("common.next")}</Button> : null}
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="danger" disabled={!preview} loading={pending} onClick={() => start(async () => { const r = await mergeCustomersAction(keep!, other!.id); if (!r.ok) toast.error(r.error); else { toast.success(t("customers.merge")); onClose(); router.refresh(); } })}>{t("customers.mergeConfirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
