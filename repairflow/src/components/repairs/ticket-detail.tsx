"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Printer, FileText, Link2, Copy, RefreshCw, Ban, Eye, EyeOff, Plus, Check, Trash2, Undo2, ShieldCheck, Camera, ChevronDown, MessageSquare, StickyNote, Wallet, Wrench, Package, Image as ImageIcon, CircleDot } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn, newIdempotencyKey } from "@/lib/utils";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Checkbox, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/menu";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, PriorityBadge, BlockBadge } from "@/components/shared/status-badge";
import { BLOCK_REASONS, nextStatuses, PRIORITIES, type TicketStatus } from "@/lib/domain/tickets";
import { computeTotals } from "@/lib/money";
import * as A from "@/app/actions/tickets";

type Perms = { transition: boolean; edit: boolean; quotes: boolean; parts: boolean; pay: boolean; unlock: boolean; adjust: boolean; assign: boolean };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ticket = any;

export function TicketDetail({ ticket: tk, fin, techs, catalog, perms, warrantyOf, related, registerOpen }: { ticket: Ticket; fin: { totalCents: number; paidCents: number; depositCents: number; balanceDueCents: number; hasAcceptedQuote: boolean }; techs: { id: string; name: string }[]; catalog: { id: string; name: string; sku: string; priceCents: number; costCents: number; available: number; compat: string[] }[]; perms: Perms; warrantyOf: { id: string; number: string } | null; related: { id: string; number: string; status: string }[]; registerOpen: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => start(async () => { const r = await fn(); if (!r.ok) toast.error(r.error ?? t("common.error")); else { if (ok) toast.success(ok); router.refresh(); } });
  const status = tk.status as TicketStatus;
  const closed = status === "DELIVERED" || status === "CANCELLED";
  const qc = tk.qcJson ? (JSON.parse(tk.qcJson) as { label: string; done: boolean }[]) : [];
  const qcDone = qc.filter((i) => i.done).length;
  const nextAction = nextActionLabel(status, fin, tk, t);
  const acceptedQuote = tk.quotes.find((q: { status: string }) => q.status === "ACCEPTED");
  const pendingQuote = tk.quotes.find((q: { status: string }) => q.status === "SENT");
  const [statusDialog, setStatusDialog] = useState<TicketStatus | null>(null);
  const [note, setNote] = useState("");
  const [blockDialog, setBlockDialog] = useState(false);

  return (
    <div className="mx-auto max-w-[1440px] space-y-4 anim-in">
      <Link href="/repairs" className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-fg"><ArrowLeft className="size-3.5 rtl:-scale-x-100" /> {t("tickets.title")}</Link>
      <header className="surface highlight-top flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="display mono text-[22px] text-accent">{tk.number}</h1>
            <StatusBadge status={status} />
            <BlockBadge reason={tk.blockReason} />
            <PriorityBadge priority={tk.priority} />
            {warrantyOf ? <Badge tone="champagne"><ShieldCheck className="size-3" /> <Link href={`/repairs/${warrantyOf.id}`} className="hover:underline">{t("tickets.detail.warrantyOf", { number: warrantyOf.number })}</Link></Badge> : null}
          </div>
          <p className="mt-1.5 text-[16px] font-medium">{tk.device.brand} {tk.device.model}{tk.device.color ? <span className="text-muted"> · {tk.device.color}</span> : null}</p>
          <p className="text-[12.5px] text-muted">{t(`deviceKind.${tk.device.kind}` as never)}{tk.device.imei ? <> · IMEI <span className="mono">{tk.device.imei}</span></> : tk.device.serial ? <> · S/N <span className="mono">{tk.device.serial}</span></> : null}</p>
          <div className="mt-3 flex items-center gap-2 rounded-[var(--radius-sm)] bg-accent-soft/50 px-3 py-2 text-[13px]"><CircleDot className="size-4 text-accent" /><span className="text-muted">{t("tickets.detail.nextAction")} :</span><span className="font-medium">{nextAction}</span></div>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button><Printer /> {t("tickets.detail.documents")} <ChevronDown className="size-3.5 opacity-70" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem asChild><a href={`/api/documents/${tk.id}/label`} target="_blank" rel="noreferrer"><Printer /> {t("tickets.detail.label")}</a></DropdownMenuItem>
              <DropdownMenuItem asChild><a href={`/api/documents/${tk.id}/deposit`} target="_blank" rel="noreferrer"><FileText /> {t("tickets.detail.depositSlip")}</a></DropdownMenuItem>
              {tk.quotes.length ? <DropdownMenuItem asChild><a href={`/api/documents/${tk.id}/quote`} target="_blank" rel="noreferrer"><FileText /> {t("tickets.detail.quotePdf")}</a></DropdownMenuItem> : null}
              <DropdownMenuItem asChild><a href={`/api/documents/${tk.id}/return`} target="_blank" rel="noreferrer"><FileText /> {t("tickets.detail.returnSlip")}</a></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {perms.transition && !closed ? (
            <>
              <Button variant="outline" onClick={() => setBlockDialog(true)}>{tk.blockReason ? t("tickets.detail.unblock") : t("tickets.detail.block")}</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="primary">{t("tickets.detail.transition")} <ChevronDown className="size-3.5 opacity-70" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent>
                  {nextStatuses(status).map((s) => <DropdownMenuItem key={s} destructive={s === "CANCELLED"} onSelect={() => setStatusDialog(s)}>→ {t(`status.${s}`)}</DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null}
          {status === "DELIVERED" && perms.edit ? <WarrantyReturnButton ticketId={tk.id} /> : null}
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title={t("tickets.wizard.issue")} />
            <CardBody className="space-y-4 text-[13.5px]">
              <p className="rounded-[var(--radius-sm)] bg-hover p-3">{tk.reportedIssue}</p>
              <div className="grid gap-3 text-[12.5px] sm:grid-cols-3">
                <div><div className="text-muted">{t("tickets.wizard.cosmetic")}</div><div>{tk.cosmeticState || "—"}</div></div>
                <div><div className="text-muted">{t("tickets.wizard.reception")}</div><div>{Object.entries(JSON.parse(tk.receptionJson || "{}") as Record<string, boolean>).filter(([, v]) => v).map(([k]) => k).join(", ") || "—"}</div></div>
                <div><div className="text-muted">{t("tickets.wizard.accessories")}</div><div>{(JSON.parse(tk.accessoriesJson || "[]") as string[]).join(", ") || "—"}</div></div>
              </div>
              <DiagnosisEditor ticketId={tk.id} value={tk.diagnosis} canEdit={perms.edit && !closed} />
            </CardBody>
          </Card>

          <Tabs defaultValue="timeline">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="timeline">{t("tickets.detail.timeline")}</TabsTrigger>
              <TabsTrigger value="quotes">{t("tickets.detail.quotes")} ({tk.quotes.length})</TabsTrigger>
              <TabsTrigger value="parts">{t("tickets.detail.parts")} ({tk.parts.length})</TabsTrigger>
              <TabsTrigger value="work">{t("tickets.detail.interventions")} ({tk.interventions.length})</TabsTrigger>
              <TabsTrigger value="qc">{t("tickets.detail.qc")} {qc.length ? `${qcDone}/${qc.length}` : ""}</TabsTrigger>
              <TabsTrigger value="photos">{t("tickets.detail.photos")} ({tk.attachments.filter((a: { kind: string }) => a.kind.startsWith("PHOTO")).length})</TabsTrigger>
            </TabsList>
            <TabsContent value="timeline" className="mt-3"><Timeline ticketId={tk.id} events={tk.events} canEdit={perms.edit} /></TabsContent>
            <TabsContent value="quotes" className="mt-3"><Quotes tk={tk} catalog={catalog} perms={perms} closed={closed} pendingQuote={pendingQuote} /></TabsContent>
            <TabsContent value="parts" className="mt-3"><Parts tk={tk} catalog={catalog} perms={perms} closed={closed} /></TabsContent>
            <TabsContent value="work" className="mt-3"><Interventions tk={tk} canEdit={perms.edit && !closed} /></TabsContent>
            <TabsContent value="qc" className="mt-3"><QcChecklist ticketId={tk.id} items={qc} canEdit={perms.edit && !closed} /></TabsContent>
            <TabsContent value="photos" className="mt-3"><Photos tk={tk} canEdit={perms.edit} /></TabsContent>
          </Tabs>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader title={t("tickets.detail.customerCard")} action={<Link href={`/customers/${tk.customerId}`} className="text-[12px] text-accent hover:underline">{t("common.openFull")}</Link>} />
            <CardBody className="text-[13.5px]">
              <div className="font-medium">{tk.customer.firstName} {tk.customer.lastName}</div>
              <div className="text-muted">{tk.customer.phone}</div>
              <div className="truncate text-muted">{tk.customer.email}</div>
              <div className="mt-2 flex gap-1.5"><Badge tone={tk.customer.segment === "VIP" ? "champagne" : tk.customer.segment === "LOYAL" ? "accent" : "neutral"}>{t(`customers.segments.${tk.customer.segment}` as never)}</Badge>{(JSON.parse(tk.customer.tagsJson) as string[]).map((x) => <Badge key={x} tone="outline">{x}</Badge>)}</div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t("tickets.detail.deadline")} />
            <CardBody className="text-[13.5px]">
              <DeadlineEditor tk={tk} techs={techs} perms={perms} closed={closed} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t("tickets.detail.payments")} />
            <CardBody className="space-y-3 text-[13.5px]">
              <dl className="grid grid-cols-2 gap-y-1">
                <dt className="text-muted">{t("tickets.detail.total")}</dt><dd className="tnum text-end">{fmtMoney(fin.totalCents, t.locale)}{!fin.hasAcceptedQuote ? <span className="ms-1 text-[11px] text-subtle">({t("tickets.wizard.estimate").toLowerCase()})</span> : null}</dd>
                <dt className="text-muted">{t("tickets.detail.paid")}</dt><dd className="tnum text-end text-success">{fmtMoney(fin.paidCents, t.locale)}</dd>
                <dt className="font-medium">{t("tickets.detail.due")}</dt><dd className={cn("tnum text-end text-[16px] font-semibold", fin.balanceDueCents > 0 ? "" : "text-success")}>{fmtMoney(fin.balanceDueCents, t.locale)}</dd>
              </dl>
              {tk.payments.length ? <ul className="divide-y divide-border rounded-[var(--radius-sm)] border border-border text-[12.5px]">{tk.payments.map((p: { id: string; amountCents: number; method: string; kind: string; status: string; createdAt: string }) => <li key={p.id} className="flex items-center justify-between px-2.5 py-1.5"><span>{p.kind === "DEPOSIT" ? t("tickets.wizard.deposit") : p.kind === "REFUND" ? t("pos.refund") : t("tickets.detail.payments")} · {t(`pos.methods.${p.method}` as never)}<span className="block text-[11px] text-subtle">{fmtDateTime(p.createdAt, t.locale)}{p.status === "RECORDED" ? ` · ${t("pos.recordedHint")}` : ""}</span></span><span className="tnum font-medium">{fmtMoney(p.amountCents, t.locale)}</span></li>)}</ul> : null}
              {perms.pay && !closed ? <PaymentButtons ticketId={tk.id} balance={fin.balanceDueCents} registerOpen={registerOpen} /> : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t("tickets.detail.tracking")} />
            <CardBody className="space-y-2 text-[13px]">
              <TrackingControls tk={tk} canEdit={perms.edit} />
            </CardBody>
          </Card>
          {tk.hasUnlockCode || (perms.edit && !closed) ? (
            <Card>
              <CardHeader title={t("tickets.detail.unlockCode")} />
              <CardBody><UnlockCode tk={tk} perms={perms} closed={closed} /></CardBody>
            </Card>
          ) : null}
          {related.length ? <Card><CardHeader title={t("tickets.detail.warrantyReturn")} /><CardBody className="space-y-1 text-[13px]">{related.map((r) => <Link key={r.id} href={`/repairs/${r.id}`} className="flex items-center justify-between hover:underline"><span className="mono text-accent">{r.number}</span><StatusBadge status={r.status} compact /></Link>)}</CardBody></Card> : null}
        </aside>
      </div>

      <Dialog open={Boolean(statusDialog)} onOpenChange={(o) => !o && setStatusDialog(null)}>
        <DialogContent title={`${t("tickets.detail.transition")} → ${statusDialog ? t(`status.${statusDialog}`) : ""}`} size="sm">
          <Field label={t("common.notes")} id="tn"><Textarea id="tn" value={note} onChange={(e) => setNote(e.target.value)} rows={3} /></Field>
          <DialogFooter>
            <Button onClick={() => setStatusDialog(null)}>{t("common.cancel")}</Button>
            <Button variant={statusDialog === "CANCELLED" ? "danger" : "primary"} loading={pending} onClick={() => { const s = statusDialog!; run(() => A.transitionAction(tk.id, s, note), t(`status.${s}`)); setStatusDialog(null); setNote(""); }}>{t("common.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={blockDialog} onOpenChange={setBlockDialog}>
        <DialogContent title={t("tickets.detail.block")} size="sm">
          <div className="space-y-2">
            {BLOCK_REASONS.map((r) => <Button key={r} className="w-full justify-start" variant={tk.blockReason === r ? "primary" : "secondary"} onClick={() => { run(() => A.setBlockAction(tk.id, r), t(`block.${r}`)); setBlockDialog(false); }}>{t(`block.${r}`)}</Button>)}
            {tk.blockReason ? <Button variant="success" className="w-full" onClick={() => { run(() => A.setBlockAction(tk.id, null), t("tickets.detail.unblock")); setBlockDialog(false); }}>{t("tickets.detail.unblock")}</Button> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function nextActionLabel(status: TicketStatus, fin: { balanceDueCents: number; hasAcceptedQuote: boolean }, tk: Ticket, t: ReturnType<typeof useT>) {
  if (tk.blockReason) return t(`block.${tk.blockReason}` as never);
  switch (status) {
    case "RECEIVED": return t("tickets.detail.diagnosis");
    case "DIAGNOSIS": return t("tickets.detail.newQuote");
    case "QUOTE_SENT": case "AWAITING_APPROVAL": return t("tickets.detail.acceptQuote") + " / " + t("tickets.detail.refuseQuote");
    case "IN_REPAIR": return tk.parts.some((p: { status: string }) => p.status === "RESERVED") ? t("tickets.detail.consume") : t("tickets.detail.qc");
    case "QUALITY_CHECK": return t("tickets.detail.qcComplete");
    case "READY": return fin.balanceDueCents > 0 ? t("tickets.detail.recordPayment") : t("tickets.detail.deliver");
    default: return "—";
  }
}

function DiagnosisEditor({ ticketId, value, canEdit }: { ticketId: string; value: string; canEdit: boolean }) {
  const t = useT();
  const router = useRouter();
  const [v, setV] = useState(value);
  const [pending, start] = useTransition();
  return (
    <div>
      <div className="mb-1 text-[12.5px] font-medium text-muted">{t("tickets.detail.diagnosis")}</div>
      {canEdit ? (
        <>
          <Textarea value={v} onChange={(e) => setV(e.target.value)} rows={3} />
          {v !== value ? <div className="mt-2 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setV(value)}>{t("common.cancel")}</Button><Button size="sm" variant="primary" loading={pending} onClick={() => start(async () => { const r = await A.updateTicketAction(ticketId, { diagnosis: v }); if (!r.ok) toast.error(r.error); else router.refresh(); })}>{t("common.save")}</Button></div> : null}
        </>
      ) : <p className="rounded-[var(--radius-sm)] bg-hover p-3">{value || "—"}</p>}
    </div>
  );
}

const EVENT_ICON: Record<string, React.ComponentType<{ className?: string }>> = { STATUS: CircleDot, NOTE: StickyNote, MESSAGE: MessageSquare, QUOTE: FileText, PAYMENT: Wallet, PART: Package, PHOTO: ImageIcon, QC: ShieldCheck, SYSTEM: Wrench };

function Timeline({ ticketId, events, canEdit }: { ticketId: string; events: { id: string; type: string; message: string; fromStatus: string | null; toStatus: string | null; visibleToCustomer: boolean; authorName: string; createdAt: string }[]; canEdit: boolean }) {
  const t = useT();
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="surface p-3">
          <Textarea rows={2} placeholder={visible ? t("tickets.detail.messageCustomer") : t("tickets.detail.internalNote")} value={msg} onChange={(e) => setMsg(e.target.value)} />
          <div className="mt-2 flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-[12.5px] text-muted"><Switch checked={visible} onCheckedChange={setVisible} /> {t("tickets.detail.visibleToCustomer")}</label>
            <Button size="sm" variant="primary" disabled={!msg.trim()} loading={pending} onClick={() => start(async () => { const r = await A.addMessageAction(ticketId, msg, visible); if (!r.ok) toast.error(r.error); else { setMsg(""); router.refresh(); } })}>{t("tickets.detail.send")}</Button>
          </div>
        </div>
      ) : null}
      <ol className="relative ms-3 border-s border-border ps-6">
        {events.map((e) => {
          const Icon = EVENT_ICON[e.type] ?? CircleDot;
          return (
            <li key={e.id} className="relative pb-5 last:pb-0">
              <span className={cn("absolute -start-[31px] flex size-[22px] items-center justify-center rounded-full border bg-surface", e.type === "STATUS" ? "border-accent text-accent" : e.type === "PAYMENT" ? "border-success text-success" : "border-border-strong text-muted")}><Icon className="size-3" /></span>
              <div className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-subtle"><span className="font-medium text-muted">{e.authorName}</span><time dateTime={e.createdAt}>{fmtDateTime(e.createdAt, t.locale)}</time><span>· {t(`tickets.detail.eventTypes.${e.type}` as never)}</span>{e.visibleToCustomer ? <Badge tone="accent" className="text-[10.5px]">{t("tickets.detail.visibleToCustomer")}</Badge> : null}</div>
              <div className="mt-0.5 text-[13.5px]">
                {e.type === "STATUS" && e.toStatus ? <span className="flex flex-wrap items-center gap-1.5">{e.fromStatus ? <><StatusBadge status={e.fromStatus} compact /><span className="text-subtle">→</span></> : null}<StatusBadge status={e.toStatus} compact />{e.message ? <span className="text-muted">— {e.message}</span> : null}</span> : <span className={cn(e.type === "MESSAGE" && "block rounded-[var(--radius-sm)] bg-accent-soft/40 px-3 py-2")}>{e.message}</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Quotes({ tk, catalog, perms, closed, pendingQuote }: { tk: Ticket; catalog: { id: string; name: string; sku: string; priceCents: number; available: number }[]; perms: Perms; closed: boolean; pendingQuote?: { id: string } }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<{ kind: "PART" | "LABOR" | "OTHER"; productId?: string; label: string; qty: number; unitCents: number; taxRateBp: number }[]>(() => tk.quotes[0]?.lines?.map((l: { kind: never; productId: string | null; label: string; qty: number; unitCents: number; taxRateBp: number }) => ({ kind: l.kind, productId: l.productId ?? undefined, label: l.label, qty: l.qty, unitCents: l.unitCents, taxRateBp: l.taxRateBp })) ?? [{ kind: "LABOR", label: t("tickets.detail.labor"), qty: 1, unitCents: 3000, taxRateBp: tk.taxRateBp }]);
  const [discount, setDiscount] = useState(0);
  const [note, setNote] = useState("Garantie 3 mois pièces et main-d'œuvre.");
  const [pending, start] = useTransition();
  const totals = computeTotals(lines, discount);
  const submit = (send: boolean) => start(async () => { const r = await A.createQuoteAction(tk.id, { lines, discountCents: discount, note }, send); if (!r.ok) toast.error(r.error); else { setOpen(false); toast.success(send ? t("tickets.detail.sendQuote") : t("common.save")); router.refresh(); } });
  return (
    <div className="space-y-3">
      {perms.quotes && !closed ? <Button variant="primary" onClick={() => setOpen(true)}><Plus /> {t("tickets.detail.newQuote")}</Button> : null}
      {tk.quotes.length === 0 ? <p className="text-[13px] text-muted">{t("common.empty")}</p> : null}
      {tk.quotes.map((q: { id: string; version: number; status: string; totalCents: number; taxCents: number; discountCents: number; note: string; sentAt: string | null; decidedAt: string | null; decidedVia: string | null; decisionNote: string; lines: { id: string; label: string; qty: number; unitCents: number; totalCents: number; kind: string }[] }) => (
        <Card key={q.id} className={cn(q.status === "ACCEPTED" && "border-success/40", q.status === "SENT" && "border-accent/40")}>
          <CardHeader title={<span className="flex items-center gap-2">{t("tickets.detail.quoteVersion", { v: q.version })}<Badge tone={q.status === "ACCEPTED" ? "success" : q.status === "REFUSED" ? "danger" : q.status === "SENT" ? "accent" : "neutral"}>{t(`tickets.detail.quoteStatus.${q.status}` as never)}</Badge></span>} description={q.decidedAt ? `${fmtDateTime(q.decidedAt, t.locale)} · ${q.decidedVia === "PORTAL" ? t("tracking.title") : "Comptoir"}${q.decisionNote ? " — " + q.decisionNote : ""}` : q.sentAt ? fmtDateTime(q.sentAt, t.locale) : undefined} action={q.status === "SENT" && perms.quotes ? <div className="flex gap-1.5"><Button size="sm" variant="success" loading={pending} onClick={() => start(async () => { const r = await A.decideQuoteAction(tk.id, q.id, true); if (!r.ok) toast.error(r.error); else router.refresh(); })}><Check /> {t("tickets.detail.acceptQuote")}</Button><Button size="sm" variant="danger" loading={pending} onClick={() => start(async () => { const r = await A.decideQuoteAction(tk.id, q.id, false); if (!r.ok) toast.error(r.error); else router.refresh(); })}>{t("tickets.detail.refuseQuote")}</Button></div> : null} />
          <CardBody>
            <table className="w-full text-[13px]"><tbody>{q.lines.map((l) => <tr key={l.id} className="border-t border-border"><td className="py-1.5">{l.label}<span className="ms-1 text-[11px] text-subtle">{l.kind === "PART" ? t("tickets.detail.part") : l.kind === "LABOR" ? t("tickets.detail.labor") : ""}</span></td><td className="tnum py-1.5 text-end text-muted">{l.qty} × {fmtMoney(l.unitCents, t.locale)}</td><td className="tnum py-1.5 text-end font-medium">{fmtMoney(l.totalCents, t.locale)}</td></tr>)}</tbody>
              <tfoot>{q.discountCents ? <tr className="border-t border-border"><td colSpan={2} className="py-1 text-end text-muted">{t("tickets.detail.discount")}</td><td className="tnum py-1 text-end">−{fmtMoney(q.discountCents, t.locale)}</td></tr> : null}<tr className="border-t border-border"><td colSpan={2} className="py-1.5 text-end font-medium">{t("common.total")} <span className="text-[11px] font-normal text-subtle">({t("tickets.detail.tax")} {fmtMoney(q.taxCents, t.locale)})</span></td><td className="tnum py-1.5 text-end text-[15px] font-semibold">{fmtMoney(q.totalCents, t.locale)}</td></tr></tfoot></table>
            {q.note ? <p className="mt-2 text-[12px] text-muted">{q.note}</p> : null}
          </CardBody>
        </Card>
      ))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t("tickets.detail.newQuote")} size="lg" description={pendingQuote ? "Le devis en attente sera remplacé par cette nouvelle version." : undefined}>
          <div className="space-y-3">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[90px_1fr_64px_110px_32px] items-end gap-2">
                <Field label={i === 0 ? "Type" : ""}><Select value={l.kind} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, kind: e.target.value as never } : x)))}><option value="PART">{t("tickets.detail.part")}</option><option value="LABOR">{t("tickets.detail.labor")}</option><option value="OTHER">{t("tickets.detail.other")}</option></Select></Field>
                <Field label={i === 0 ? "Libellé" : ""}>{l.kind === "PART" ? <Select value={l.productId ?? ""} onChange={(e) => { const p = catalog.find((c) => c.id === e.target.value); setLines(lines.map((x, j) => (j === i ? { ...x, productId: p?.id, label: p?.name ?? x.label, unitCents: p?.priceCents ?? x.unitCents } : x))); }}><option value="">{t("tickets.detail.pickProduct")}</option>{catalog.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.available})</option>)}</Select> : <Input value={l.label} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />}</Field>
                <Field label={i === 0 ? t("common.quantity") : ""}><Input type="number" min={1} value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x)))} /></Field>
                <Field label={i === 0 ? t("common.price") : ""}><MoneyInput valueCents={l.unitCents} onChangeCents={(c) => setLines(lines.map((x, j) => (j === i ? { ...x, unitCents: c } : x)))} /></Field>
                <Button size="icon" variant="ghost" aria-label="Retirer" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 /></Button>
              </div>
            ))}
            <Button size="sm" onClick={() => setLines([...lines, { kind: "LABOR", label: "", qty: 1, unitCents: 0, taxRateBp: tk.taxRateBp }])}><Plus /> {t("tickets.detail.addLine")}</Button>
            <div className="grid gap-3 sm:grid-cols-2"><Field label={t("tickets.detail.discount")}><MoneyInput valueCents={discount} onChangeCents={setDiscount} /></Field><Field label={t("common.notes")}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
            <div className="flex items-baseline justify-between rounded-[var(--radius-sm)] bg-hover px-3 py-2"><span className="text-[12.5px] text-muted">{t("tickets.detail.tax")} {fmtMoney(totals.taxCents, t.locale)}</span><span className="display tnum text-[20px] font-semibold">{fmtMoney(totals.totalCents, t.locale)}</span></div>
          </div>
          <DialogFooter><Button onClick={() => submit(false)} loading={pending}>{t("common.save")}</Button><Button variant="primary" onClick={() => submit(true)} loading={pending} disabled={lines.length === 0}>{t("tickets.detail.sendQuote")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Parts({ tk, catalog, perms, closed }: { tk: Ticket; catalog: { id: string; name: string; sku: string; priceCents: number; available: number; compat: string[] }[]; perms: Perms; closed: boolean }) {
  const t = useT();
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [q, setQ] = useState("");
  const [returnFor, setReturnFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) toast.error(r.error); else router.refresh(); });
  const model = `${tk.device.model}`.toLowerCase();
  const filtered = catalog.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.sku.toLowerCase().includes(q.toLowerCase())).sort((a, b) => Number(b.compat.some((x) => model.includes(x.toLowerCase()))) - Number(a.compat.some((x) => model.includes(x.toLowerCase()))));
  return (
    <div className="space-y-3">
      {perms.parts && !closed ? (
        <div className="surface flex flex-wrap items-end gap-2 p-3">
          <Field label={t("tickets.detail.reservePart")} className="min-w-[220px] flex-1"><Input placeholder={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} /></Field>
          <Field label="Pièce" className="min-w-[260px] flex-1"><Select value={productId} onChange={(e) => setProductId(e.target.value)}><option value="">{t("tickets.detail.pickProduct")}</option>{filtered.slice(0, 60).map((c) => <option key={c.id} value={c.id} disabled={c.available <= 0}>{c.compat.some((x) => model.includes(x.toLowerCase())) ? "★ " : ""}{c.name} · {c.available} dispo</option>)}</Select></Field>
          <Field label={t("common.quantity")} className="w-20"><Input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} /></Field>
          <Button variant="primary" disabled={!productId} loading={pending} onClick={() => act(() => A.reservePartAction(tk.id, productId, qty))}><Plus /> {t("tickets.detail.reservePart")}</Button>
        </div>
      ) : null}
      {tk.parts.length === 0 ? <p className="text-[13px] text-muted">{t("common.empty")}</p> : (
        <ul className="surface divide-y divide-border">
          {tk.parts.map((p: { id: string; qty: number; status: string; unitPriceCents: number; unitCostCents: number; reservedAt: string; consumedAt: string | null; product: { name: string; sku: string } }) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
              <span className="min-w-0 flex-1"><span className="font-medium">{p.qty} × {p.product.name}</span><span className="mono ms-2 text-subtle">{p.product.sku}</span><span className="block text-[11.5px] text-muted">{fmtDateTime(p.consumedAt ?? p.reservedAt, t.locale)} · {fmtMoney(p.unitPriceCents, t.locale)}</span></span>
              <Badge tone={p.status === "CONSUMED" ? "success" : p.status === "RESERVED" ? "accent" : "neutral"}>{t(`tickets.detail.partsStatus.${p.status}` as never)}</Badge>
              {perms.parts && !closed && p.status === "RESERVED" ? <><Button size="sm" variant="primary" loading={pending} onClick={() => act(() => A.consumePartAction(tk.id, p.id))}><Check /> {t("tickets.detail.consume")}</Button><Button size="sm" variant="ghost" loading={pending} onClick={() => act(() => A.releasePartAction(tk.id, p.id))}>{t("tickets.detail.release")}</Button></> : null}
              {perms.adjust && p.status === "CONSUMED" ? <Button size="sm" variant="ghost" onClick={() => setReturnFor(p.id)}><Undo2 /> {t("tickets.detail.returnToStock")}</Button> : null}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={Boolean(returnFor)} onOpenChange={(o) => !o && setReturnFor(null)}>
        <DialogContent title={t("tickets.detail.returnToStock")} size="sm" description="Le retour crée un mouvement de stock tracé et audité. Motif obligatoire.">
          <Field label={t("common.reason")} id="rr"><Input id="rr" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <DialogFooter><Button onClick={() => setReturnFor(null)}>{t("common.cancel")}</Button><Button variant="primary" disabled={reason.trim().length < 5} loading={pending} onClick={() => { act(() => A.returnPartAction(tk.id, returnFor!, reason)); setReturnFor(null); setReason(""); }}>{t("common.confirm")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Interventions({ tk, canEdit }: { tk: Ticket; canEdit: boolean }) {
  const t = useT();
  const router = useRouter();
  const [desc, setDesc] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [labor, setLabor] = useState(0);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      {canEdit ? (
        <div className="surface grid gap-2 p-3 sm:grid-cols-[1fr_90px_120px_auto] sm:items-end">
          <Field label={t("tickets.detail.addIntervention")}><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          <Field label="Minutes"><Input type="number" min={0} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></Field>
          <Field label={t("tickets.detail.labor")}><MoneyInput valueCents={labor} onChangeCents={setLabor} /></Field>
          <Button variant="primary" disabled={!desc.trim()} loading={pending} onClick={() => start(async () => { const r = await A.addInterventionAction(tk.id, { description: desc, minutes, laborCents: labor }); if (!r.ok) toast.error(r.error); else { setDesc(""); router.refresh(); } })}><Plus /></Button>
        </div>
      ) : null}
      {tk.interventions.length === 0 ? <p className="text-[13px] text-muted">{t("common.empty")}</p> : <ul className="surface divide-y divide-border">{tk.interventions.map((i: { id: string; description: string; minutes: number; laborCents: number; createdAt: string; technician: string }) => <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]"><span><span className="font-medium">{i.description}</span><span className="block text-[11.5px] text-muted">{i.technician} · {fmtDateTime(i.createdAt, t.locale)} · {i.minutes} min</span></span><span className="tnum">{fmtMoney(i.laborCents, t.locale)}</span></li>)}</ul>}
    </div>
  );
}

function QcChecklist({ ticketId, items, canEdit }: { ticketId: string; items: { label: string; done: boolean }[]; canEdit: boolean }) {
  const t = useT();
  const router = useRouter();
  const [list, setList] = useState(items);
  const [pending, start] = useTransition();
  const changed = JSON.stringify(list) !== JSON.stringify(items);
  return (
    <div className="surface p-4">
      <ul className="grid gap-2 sm:grid-cols-2">{list.map((i, k) => <li key={i.label}><label className={cn("flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-border px-3 py-2 text-[13px]", i.done && "border-success/40 bg-success-soft/30")}><Checkbox checked={i.done} disabled={!canEdit} onCheckedChange={(v) => setList(list.map((x, j) => (j === k ? { ...x, done: v === true } : x)))} /> {i.label}</label></li>)}</ul>
      {canEdit ? <div className="mt-3 flex items-center justify-between"><span className="text-[12.5px] text-muted">{list.filter((i) => i.done).length}/{list.length}</span><div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setList(list.map((x) => ({ ...x, done: true })))}>{t("common.selectAll")}</Button><Button size="sm" variant="primary" disabled={!changed} loading={pending} onClick={() => start(async () => { const r = await A.updateQcAction(ticketId, list); if (!r.ok) toast.error(r.error); else router.refresh(); })}>{t("common.save")}</Button></div></div> : null}
    </div>
  );
}

function Photos({ tk, canEdit }: { tk: Ticket; canEdit: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const upload = (kind: string, files: FileList | null) => { if (!files) return; start(async () => { for (const f of Array.from(files)) { const fd = new FormData(); fd.set("file", f); fd.set("kind", kind); const r = await A.uploadPhotoAction(tk.id, fd); if (!r.ok) toast.error(r.error); } router.refresh(); }); };
  const groups = [["PHOTO_BEFORE", "Avant"], ["PHOTO_AFTER", "Après"], ["DOCUMENT", t("tickets.detail.documents")], ["SIGNATURE", t("tickets.wizard.signature")]] as const;
  return (
    <div className="space-y-4">
      {groups.map(([kind, label]) => {
        const items = tk.attachments.filter((a: { kind: string }) => a.kind === kind);
        if (!items.length && (kind === "SIGNATURE" || !canEdit)) return null;
        return (
          <div key={kind}>
            <div className="mb-2 flex items-center justify-between"><h3 className="text-[13px] font-medium">{label}</h3>{canEdit && kind !== "SIGNATURE" ? <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] text-accent hover:underline"><Camera className="size-4" /> {t("tickets.wizard.addPhoto")}<input type="file" accept={kind === "DOCUMENT" ? "application/pdf,image/*" : "image/*"} capture={kind === "DOCUMENT" ? undefined : "environment"} multiple className="sr-only" onChange={(e) => upload(kind, e.target.files)} /></label> : null}</div>
            <div className="flex flex-wrap gap-2">{items.map((a: { id: string; url: string; filename: string; mime: string; visibleToCustomer: boolean }) => <figure key={a.id} className="relative w-28"><a href={a.url} target="_blank" rel="noreferrer" className="block h-28 overflow-hidden rounded-[var(--radius-sm)] border border-border bg-hover">{a.mime.startsWith("image/") ? <img src={a.url} alt={a.filename} className="size-full object-cover" /> : <span className="flex size-full items-center justify-center text-muted"><FileText /></span>}</a>{canEdit ? <label className="mt-1 flex items-center gap-1 text-[11px] text-muted"><Checkbox checked={a.visibleToCustomer} onCheckedChange={(v) => start(async () => { await A.toggleAttachmentVisibilityAction(tk.id, a.id, v === true); router.refresh(); })} className="size-3.5" /> Client</label> : null}</figure>)}{items.length === 0 ? <span className="text-[12.5px] text-subtle">{t("common.empty")}</span> : null}</div>
          </div>
        );
      })}
      {pending ? <p className="text-[12px] text-muted">{t("common.loading")}</p> : null}
    </div>
  );
}

function DeadlineEditor({ tk, techs, perms, closed }: { tk: Ticket; techs: { id: string; name: string }[]; perms: Perms; closed: boolean }) {
  const t = useT();
  const router = useRouter();
  const [, start] = useTransition();
  const overdue = tk.promisedAt && new Date(tk.promisedAt) < new Date() && !closed && tk.status !== "READY";
  return (
    <dl className="space-y-2.5">
      <div><dt className="text-[12px] text-muted">{t("tickets.received")}</dt><dd className="tnum">{fmtDateTime(tk.receivedAt, t.locale)}</dd></div>
      <div><dt className="text-[12px] text-muted">{t("tickets.promised")}</dt><dd>{perms.edit && !closed ? <Input type="datetime-local" defaultValue={tk.promisedAt ? new Date(new Date(tk.promisedAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""} onBlur={(e) => start(async () => { const v = e.target.value; await A.updateTicketAction(tk.id, { promisedAt: v ? new Date(v).toISOString() : null }); router.refresh(); })} className={cn(overdue && "border-danger text-danger")} /> : <span className={cn("tnum", overdue && "text-danger")}>{tk.promisedAt ? fmtDateTime(tk.promisedAt, t.locale) : t("tickets.noPromise")}</span>}{overdue ? <span className="mt-1 block text-[11.5px] text-danger">⚠ {t("tickets.overdue")}</span> : null}</dd></div>
      <div><dt className="text-[12px] text-muted">{t("common.technician")}</dt><dd>{perms.assign && !closed ? <Select value={tk.technicianId ?? ""} onChange={(e) => start(async () => { const r = await A.assignAction(tk.id, e.target.value || null); if (!r.ok) toast.error(r.error); router.refresh(); })}><option value="">{t("tickets.unassigned")}</option>{techs.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select> : techs.find((u) => u.id === tk.technicianId)?.name ?? t("tickets.unassigned")}</dd></div>
      <div><dt className="text-[12px] text-muted">{t("common.priority")}</dt><dd>{perms.edit && !closed ? <Select value={tk.priority} onChange={(e) => start(async () => { await A.updateTicketAction(tk.id, { priority: e.target.value }); router.refresh(); })}>{PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}</Select> : t(`priority.${tk.priority}` as never)}</dd></div>
      {tk.readyAt ? <div><dt className="text-[12px] text-muted">{t("status.READY")}</dt><dd className="tnum">{fmtDateTime(tk.readyAt, t.locale)}</dd></div> : null}
      {tk.deliveredAt ? <div><dt className="text-[12px] text-muted">{t("status.DELIVERED")}</dt><dd className="tnum">{fmtDateTime(tk.deliveredAt, t.locale)} · {t("tickets.wizard.warranty")} {tk.warrantyMonths}</dd></div> : null}
    </dl>
  );
}

function PaymentButtons({ ticketId, balance, registerOpen }: { ticketId: string; balance: number; registerOpen: boolean }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState<"DEPOSIT" | "PAYMENT" | null>(null);
  const [amount, setAmount] = useState(balance);
  const [method, setMethod] = useState<"CASH" | "CARD" | "TRANSFER">(registerOpen ? "CASH" : "CARD");
  const [pending, start] = useTransition();
  return (
    <>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => { setAmount(0); setOpen("DEPOSIT"); }}>{t("tickets.detail.recordDeposit")}</Button>
        <Button size="sm" variant="primary" className="flex-1" disabled={balance <= 0} onClick={() => { setAmount(balance); setOpen("PAYMENT"); }}><Wallet /> {t("tickets.detail.recordPayment")}</Button>
      </div>
      <Dialog open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent title={open === "DEPOSIT" ? t("tickets.detail.recordDeposit") : t("tickets.detail.recordPayment")} size="sm">
          <div className="space-y-3">
            <Field label={t("common.total")}><MoneyInput valueCents={amount} onChangeCents={setAmount} /></Field>
            <Field label={t("tickets.wizard.depositMethod")}><Select value={method} onChange={(e) => setMethod(e.target.value as never)}><option value="CASH" disabled={!registerOpen}>{t("pos.methods.CASH")}{!registerOpen ? " — caisse fermée" : ""}</option><option value="CARD">{t("pos.methods.CARD")}</option><option value="TRANSFER">{t("pos.methods.TRANSFER")}</option></Select></Field>
            {method !== "CASH" ? <p className="text-[12px] text-muted">{t("pos.recordedHint")}</p> : null}
          </div>
          <DialogFooter><Button onClick={() => setOpen(null)}>{t("common.cancel")}</Button><Button variant="primary" loading={pending} disabled={amount <= 0} onClick={() => start(async () => { const r = await A.recordTicketPaymentAction(ticketId, { amountCents: amount, method, kind: open!, idempotencyKey: newIdempotencyKey() }); if (!r.ok) toast.error(r.error); else { setOpen(null); toast.success(fmtMoney(amount, t.locale)); router.refresh(); } })}>{t("common.confirm")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TrackingControls({ tk, canEdit }: { tk: Ticket; canEdit: boolean }) {
  const t = useT();
  const router = useRouter();
  const [fresh, setFresh] = useState<{ url: string; pin?: string } | null>(tk.trackingUrl ? { url: tk.trackingUrl } : null);
  const [pending, start] = useTransition();
  return (
    <>
      {tk.trackingRevokedAt ? <Badge tone="danger"><Ban className="size-3" /> {t("tickets.detail.revoked")}</Badge> : <Badge tone="success"><Link2 className="size-3" /> Actif</Badge>}
      {fresh ? <div className="rounded-[var(--radius-sm)] border border-accent/40 bg-accent-soft/40 p-2"><div className="flex items-center gap-1"><code className="mono flex-1 truncate text-[11.5px]">{fresh.url}</code><Button size="icon-sm" variant="ghost" aria-label={t("tickets.detail.copyLink")} onClick={() => { void navigator.clipboard.writeText(fresh.url); toast.success(t("common.copied")); }}><Copy /></Button></div>{fresh.pin ? <div className="mt-1 text-[12px]">{t("tickets.wizard.docPin")} : <span className="mono font-semibold tracking-widest">{fresh.pin}</span></div> : null}</div> : null}
      {canEdit ? <div className="flex gap-2"><Button size="sm" loading={pending} onClick={() => start(async () => { const r = await A.regenerateTrackingAction(tk.id); if (!r.ok) toast.error(r.error); else { setFresh(r.data); router.refresh(); } })}><RefreshCw /> {t("tickets.detail.regenerate")}</Button>{!tk.trackingRevokedAt ? <Button size="sm" variant="danger" loading={pending} onClick={() => start(async () => { const r = await A.revokeTrackingAction(tk.id); if (!r.ok) toast.error(r.error); else { setFresh(null); router.refresh(); } })}><Ban /> {t("tickets.detail.revoke")}</Button> : null}</div> : null}
    </>
  );
}

function UnlockCode({ tk, perms, closed }: { tk: Ticket; perms: Perms; closed: boolean }) {
  const t = useT();
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [edit, setEdit] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2 text-[13px]">
      {tk.hasUnlockCode ? (
        <div className="flex items-center gap-2">
          <span className="mono min-w-[80px] text-[16px] tracking-widest">{code ?? "••••••"}</span>
          {perms.unlock ? <Button size="sm" variant="ghost" loading={pending} onClick={() => (code ? setCode(null) : start(async () => { const r = await A.revealUnlockCodeAction(tk.id); if (!r.ok) toast.error(r.error); else setCode(r.data ?? t("tickets.detail.noCode")); }))}>{code ? <><EyeOff /> {t("tickets.detail.hide")}</> : <><Eye /> {t("tickets.detail.reveal")}</>}</Button> : null}
          {perms.edit && !closed ? <Button size="sm" variant="ghost" onClick={() => start(async () => { await A.setUnlockCodeAction(tk.id, null); setCode(null); router.refresh(); })}><Trash2 /></Button> : null}
        </div>
      ) : <span className="text-muted">{t("tickets.detail.noCode")}</span>}
      {tk.unlockCodeExpiresAt ? <p className="text-[11.5px] text-subtle">Suppression automatique le {fmtDate(tk.unlockCodeExpiresAt, t.locale)}</p> : null}
      {perms.edit && !closed && !tk.hasUnlockCode ? <div className="flex gap-2"><Input type="password" autoComplete="off" className="mono" placeholder="Code" value={edit} onChange={(e) => setEdit(e.target.value)} /><Button size="md" disabled={!edit} loading={pending} onClick={() => start(async () => { const r = await A.setUnlockCodeAction(tk.id, edit); if (!r.ok) toast.error(r.error); else { setEdit(""); router.refresh(); } })}>{t("common.save")}</Button></div> : null}
    </div>
  );
}

function WarrantyReturnButton({ ticketId }: { ticketId: string }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [issue, setIssue] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><ShieldCheck /> {t("tickets.detail.warrantyReturn")}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t("tickets.detail.warrantyReturn")} size="sm" description="Un nouveau ticket relié à celui-ci sera créé (même client, même appareil).">
          <Field label={t("tickets.wizard.issue")} id="wi"><Textarea id="wi" value={issue} onChange={(e) => setIssue(e.target.value)} rows={3} /></Field>
          <DialogFooter><Button onClick={() => setOpen(false)}>{t("common.cancel")}</Button><Button variant="primary" disabled={issue.trim().length < 3} loading={pending} onClick={() => start(async () => { const r = await A.warrantyReturnAction(ticketId, issue); if (!r.ok) toast.error(r.error); else { toast.success(r.data.inWarranty ? "Retour sous garantie créé" : "Garantie expirée : ticket créé hors garantie"); router.push(`/repairs/${r.data.id}`); } })}>{t("common.confirm")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
