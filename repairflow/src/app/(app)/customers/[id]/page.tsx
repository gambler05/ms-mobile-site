import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { requirePage, ctxHas } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { getT } from "@/i18n/server";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { ticketFinancials } from "@/server/services/tickets";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { SegmentBadge } from "@/components/customers/customers-view";
import { CustomerEdit } from "./customer-edit";
import { findDuplicates } from "@/server/services/customers";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("customers.view");
  const t = await getT();
  const { id } = await params;
  const c = await prisma.customer.findFirst({ where: { id, orgId: ctx.orgId }, include: { devices: true, tickets: { include: { device: true, quotes: { select: { status: true, totalCents: true } }, payments: { select: { amountCents: true, status: true, kind: true } } }, orderBy: { createdAt: "desc" } }, sales: { include: { payments: true }, orderBy: { createdAt: "desc" }, take: 50 }, creditNotes: true, attachments: true } });
  if (!c) notFound();
  const outstanding = c.tickets.reduce((s, tk) => s + (["DELIVERED", "CANCELLED"].includes(tk.status) ? 0 : ticketFinancials({ ...tk, quotes: tk.quotes, payments: tk.payments }).balanceDueCents), 0);
  const revenue = c.sales.filter((s) => s.status !== "CANCELLED").reduce((s, x) => s + x.totalCents, 0) + c.tickets.filter((tk) => tk.status === "DELIVERED").reduce((s, tk) => s + ticketFinancials({ ...tk, quotes: tk.quotes, payments: tk.payments }).paidCents, 0);
  const dups = ctxHas(ctx, "customers.merge") ? await findDuplicates(ctx, id) : [];
  return (
    <div className="mx-auto max-w-6xl space-y-4 anim-in">
      <Link href="/customers" className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-fg"><ArrowLeft className="size-3.5 rtl:-scale-x-100" /> {t("customers.title")}</Link>
      <header className="surface highlight-top flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="flex flex-wrap items-center gap-2"><h1 className="display text-[24px]">{c.firstName} {c.lastName}</h1><SegmentBadge segment={c.segment} />{(JSON.parse(c.tagsJson) as string[]).map((x) => <Badge key={x} tone="outline">{x}</Badge>)}</div>{c.company ? <p className="text-muted">{c.company}</p> : null}<p className="mt-1 text-[13.5px]">{c.phone}{c.email ? ` · ${c.email}` : ""}</p><p className="text-[12.5px] text-muted">{[c.address, c.postalCode, c.city].filter(Boolean).join(", ")}</p>{dups.length ? <Link href="/customers" className="mt-2 inline-block text-[12px] text-warning hover:underline">⚠ {t("customers.duplicates")}</Link> : null}</div>
        <div className="flex gap-2">{ctxHas(ctx, "customers.edit") ? <CustomerEdit customer={{ id: c.id, firstName: c.firstName, lastName: c.lastName, company: c.company, email: c.email, phone: c.phone, address: c.address, postalCode: c.postalCode, city: c.city, notes: c.notes, tags: (JSON.parse(c.tagsJson) as string[]).join(", "), segment: c.segment as never, consentEmail: c.consentEmail, consentSms: c.consentSms, consentWhatsapp: c.consentWhatsapp, consentMarketing: c.consentMarketing }} /> : null}<Button asChild variant="primary"><Link href={`/repairs/new?customer=${c.id}`}><Plus /> {t("tickets.new")}</Link></Button></div>
      </header>
      <div className="grid gap-3 sm:grid-cols-4">
        {[[t("customers.outstanding"), fmtMoney(outstanding, t.locale)], ["CA cumulé", fmtMoney(revenue, t.locale)], [t("customers.loyalty"), String(c.loyaltyPoints)], [t("customers.toPickup"), String(c.tickets.filter((x) => x.status === "READY").length)]].map(([k, v]) => <div key={k} className="surface p-4"><div className="text-[12px] text-muted">{k}</div><div className="display tnum mt-1 text-[20px] font-semibold">{v}</div></div>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card><CardHeader title={t("customers.repairs")} /><CardBody className="p-0 pb-1"><ul className="divide-y divide-border">{c.tickets.length === 0 ? <li className="px-5 py-4 text-[13px] text-muted">{t("common.empty")}</li> : null}{c.tickets.map((tk) => { const fin = ticketFinancials({ ...tk, quotes: tk.quotes, payments: tk.payments }); return <li key={tk.id}><Link href={`/repairs/${tk.id}`} className="flex items-center gap-3 px-5 py-2.5 text-[13px] hover:bg-hover"><span className="mono w-[104px] text-accent">{tk.number}</span><span className="min-w-0 flex-1"><span className="block truncate">{tk.device.brand} {tk.device.model}</span><span className="block truncate text-[11.5px] text-muted">{tk.reportedIssue}</span></span><span className="text-[12px] text-muted">{fmtDate(tk.createdAt, t.locale)}</span><StatusBadge status={tk.status} compact /><span className="tnum w-20 text-end">{fmtMoney(fin.totalCents, t.locale)}</span></Link></li>; })}</ul></CardBody></Card>
          <Card><CardHeader title={t("customers.purchases")} /><CardBody className="p-0 pb-1"><ul className="divide-y divide-border">{c.sales.length === 0 ? <li className="px-5 py-4 text-[13px] text-muted">{t("common.empty")}</li> : null}{c.sales.map((s) => <li key={s.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]"><span className="mono w-[104px]">{s.number}</span><span className="flex-1 text-muted">{fmtDateTime(s.createdAt, t.locale)}</span>{s.kind !== "SALE" ? <Badge tone={s.kind === "RETURN" ? "danger" : "iris"}>{s.kind === "RETURN" ? t("pos.refund") : t("pos.repairSettlement")}</Badge> : null}<span className="tnum w-20 text-end font-medium">{fmtMoney(s.totalCents, t.locale)}</span><a className="text-[11.5px] text-accent hover:underline" href={`/api/receipts/${s.id}`} target="_blank" rel="noreferrer">PDF</a></li>)}</ul></CardBody></Card>
        </div>
        <div className="space-y-4">
          <Card><CardHeader title={t("customers.devices")} /><CardBody className="space-y-2 text-[13px]">{c.devices.map((d) => <div key={d.id} className="rounded-[var(--radius-sm)] border border-border px-3 py-2"><div className="font-medium">{d.brand} {d.model}</div><div className="mono text-[11.5px] text-muted">{d.imei || d.serial || d.color || t(`deviceKind.${d.kind}` as never)}</div></div>)}{c.devices.length === 0 ? <p className="text-muted">{t("common.empty")}</p> : null}</CardBody></Card>
          <Card><CardHeader title={t("customers.consents")} /><CardBody className="space-y-1 text-[13px]">{[["consentEmail", t("customers.consentEmail")], ["consentSms", t("customers.consentSms")], ["consentWhatsapp", t("customers.consentWhatsapp")], ["consentMarketing", t("customers.consentMarketing")]].map(([k, l]) => <div key={k} className="flex justify-between"><span className="text-muted">{l}</span><span>{(c as unknown as Record<string, boolean>)[k!] ? "✓" : "—"}</span></div>)}</CardBody></Card>
          {c.creditNotes.length ? <Card><CardHeader title={t("customers.creditNotes")} /><CardBody className="space-y-1 text-[13px]">{c.creditNotes.map((cn) => <div key={cn.id} className="flex justify-between"><span className="mono">{cn.number}</span><span className="tnum">{fmtMoney(cn.remainingCents, t.locale)} / {fmtMoney(cn.amountCents, t.locale)}</span></div>)}</CardBody></Card> : null}
          {c.notes ? <Card><CardHeader title={t("common.notes")} /><CardBody className="text-[13px] whitespace-pre-wrap">{c.notes}</CardBody></Card> : null}
        </div>
      </div>
    </div>
  );
}
