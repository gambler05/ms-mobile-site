"use client";
import { useState } from "react";
import { Check, Clock, MapPin, Phone, FileText, Lock, MessageSquare, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoMark } from "@/components/ui/logo";

const STEP_INDEX: Record<string, number> = { RECEIVED: 0, DIAGNOSIS: 1, QUOTE_SENT: 2, AWAITING_APPROVAL: 2, IN_REPAIR: 3, QUALITY_CHECK: 4, READY: 5, DELIVERED: 6, CANCELLED: -1 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function TrackingClient({ token, data }: { token: string; data: any }) {
  const t = useT();
  const steps = t.list("tracking.steps");
  const idx = STEP_INDEX[data.status] ?? 0;
  const [decided, setDecided] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [docs, setDocs] = useState<{ id: string; filename: string; url: string; kind: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = data.quotes.find((q: { status: string }) => q.status === "SENT");
  const accepted = data.quotes.find((q: { status: string }) => q.status === "ACCEPTED");
  const hours = (() => { try { return JSON.parse(data.shop.hoursJson) as { day: string; open: string; close: string }[]; } catch { return []; } })();

  const call = async (body: unknown) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/public/track/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Erreur");
      return j;
    } finally { setBusy(false); }
  };

  return (
    <main className="relative z-[1] mx-auto min-h-dvh max-w-lg px-4 pb-12 pt-6">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2"><LogoMark size={26} /><span className="text-[13px] font-medium text-muted">{data.shop.name}</span></div>
        <span className="mono text-[12px] text-subtle">{data.number}</span>
      </header>
      <h1 className="display text-[26px] leading-tight">{t("tracking.hello", { name: data.customerFirstName })}</h1>
      <p className="mt-1 text-[14px] text-muted">{t("tracking.title")}</p>

      <section className="surface-raised mt-5 p-5">
        <div className="flex items-start gap-3"><span className="flex size-10 items-center justify-center rounded-[var(--radius-md)] bg-accent-soft text-accent"><Smartphone className="size-5" /></span><div><div className="text-[12px] text-muted">{t("tracking.device")}</div><div className="text-[16px] font-semibold">{data.device.brand} {data.device.model}</div><div className="text-[12.5px] text-muted">{data.device.color}</div></div></div>
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-[12px] text-muted"><span>{t("tracking.progress")}</span>{data.status !== "CANCELLED" ? <span className="font-medium text-fg">{steps[Math.max(0, idx)]}</span> : <span className="font-medium text-danger">{t("status.CANCELLED")}</span>}</div>
          <ol className="grid grid-cols-7 gap-1" aria-label={t("tracking.progress")}>
            {steps.map((s, i) => (
              <li key={s} className="text-center">
                <div className={cn("h-1.5 rounded-full", i < idx ? "bg-success" : i === idx ? "bg-accent" : "bg-hover")} />
                <span className={cn("mt-1 block text-[9.5px] leading-tight", i <= idx ? "text-fg" : "text-subtle")}>{s}</span>
              </li>
            ))}
          </ol>
        </div>
        {data.blockReason ? <p className="mt-4 rounded-[var(--radius-sm)] bg-warning-soft px-3 py-2 text-[13px] text-warning">⏸ {t(`tracking.blocked.${data.blockReason}` as never)}</p> : null}
        <div className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
          <div className="rounded-[var(--radius-sm)] bg-hover p-3"><div className="flex items-center gap-1 text-[11.5px] text-muted"><Clock className="size-3.5" /> {t("tracking.eta")}</div><div className="mt-0.5 font-medium">{data.status === "READY" ? t("status.READY") : data.status === "DELIVERED" ? t("status.DELIVERED") : data.promisedAt ? fmtDate(data.promisedAt, t.locale, { weekday: "short", day: "numeric", month: "short" }) : "—"}</div></div>
          <div className="rounded-[var(--radius-sm)] bg-hover p-3"><div className="text-[11.5px] text-muted">{data.financials.balanceDueCents > 0 ? t("tracking.balance") : t("tracking.paid")}</div><div className="tnum mt-0.5 font-medium">{fmtMoney(data.financials.balanceDueCents > 0 ? data.financials.balanceDueCents : data.financials.paidCents, t.locale)}</div></div>
        </div>
      </section>

      {(pending || accepted || data.quotes.length) ? (
        <section className="surface mt-4 p-5">
          <h2 className="text-[15px] font-semibold">{t("tracking.quote")}</h2>
          {(pending ?? accepted ?? data.quotes[0]) ? (() => { const q = pending ?? accepted ?? data.quotes[0]; return (
            <div className="mt-3">
              <ul className="divide-y divide-border text-[13.5px]">{q.lines.map((l: { label: string; qty: number; totalCents: number }, i: number) => <li key={i} className="flex justify-between py-1.5"><span>{l.qty > 1 ? `${l.qty} × ` : ""}{l.label}</span><span className="tnum">{fmtMoney(l.totalCents, t.locale)}</span></li>)}</ul>
              {q.discountCents ? <div className="flex justify-between py-1.5 text-[13px] text-muted"><span>{t("tickets.detail.discount")}</span><span className="tnum">−{fmtMoney(q.discountCents, t.locale)}</span></div> : null}
              <div className="mt-2 flex items-baseline justify-between border-t border-border pt-3"><span className="font-medium">{t("common.total")} <span className="text-[11.5px] font-normal text-muted">({t("tickets.detail.tax")} {fmtMoney(q.taxCents, t.locale)})</span></span><span className="display tnum text-[22px] font-semibold">{fmtMoney(q.totalCents, t.locale)}</span></div>
              {q.note ? <p className="mt-2 text-[12.5px] text-muted">{q.note}</p> : null}
              {q.status === "SENT" && !decided ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button variant="primary" size="lg" loading={busy} onClick={async () => { try { await call({ action: "decide", quoteId: q.id, accepted: true }); setDecided("ok"); } catch (e) { toast.error((e as Error).message); } }}><Check /> {t("tracking.accept")}</Button>
                  <Button size="lg" loading={busy} onClick={async () => { try { await call({ action: "decide", quoteId: q.id, accepted: false }); setDecided("ko"); } catch (e) { toast.error((e as Error).message); } }}>{t("tracking.refuse")}</Button>
                </div>
              ) : null}
              {decided ? <p className="mt-4 rounded-[var(--radius-sm)] bg-success-soft px-3 py-2 text-[13px] text-success">{t("tracking.decided")}</p> : null}
              {q.status === "ACCEPTED" ? <p className="mt-3 text-[12.5px] text-success">✓ {t("tickets.detail.quoteStatus.ACCEPTED")} · {fmtDateTime(q.decidedAt ?? q.sentAt, t.locale)}</p> : q.status === "REFUSED" ? <p className="mt-3 text-[12.5px] text-muted">{t("tickets.detail.quoteStatus.REFUSED")}</p> : null}
            </div>
          ); })() : null}
        </section>
      ) : null}

      <section className="surface mt-4 p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold"><MessageSquare className="size-4 text-muted" /> {t("tracking.messages")}</h2>
        <ol className="mt-3 space-y-3">
          {data.events.slice(0, 12).map((e: { id: string; type: string; message: string; toStatus: string | null; createdAt: string }) => (
            <li key={e.id} className="flex gap-3 text-[13.5px]"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" /><div><div>{e.type === "STATUS" && e.toStatus ? <span className="font-medium">{t(`status.${e.toStatus}` as never)}</span> : null}{e.message ? <span className={e.type === "STATUS" ? "text-muted" : ""}>{e.type === "STATUS" ? " — " : ""}{e.message}</span> : null}</div><time className="text-[11.5px] text-subtle">{fmtDateTime(e.createdAt, t.locale)}</time></div></li>
          ))}
        </ol>
      </section>

      <section className="surface mt-4 p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold"><FileText className="size-4 text-muted" /> {t("tracking.documents")}</h2>
        {docs ? (
          docs.length ? <ul className="mt-3 space-y-1 text-[13.5px]">{docs.map((d) => <li key={d.id}><a className="text-accent hover:underline" href={d.url} target="_blank" rel="noreferrer">{d.filename}</a></li>)}</ul> : <p className="mt-2 text-[13px] text-muted">{t("common.empty")}</p>
        ) : (
          <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); try { const j = await call({ action: "documents", pin }); setDocs(j.documents); } catch (err) { toast.error((err as Error).message); } }}>
            <div className="relative flex-1"><Lock className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-subtle" /><Input inputMode="numeric" pattern="\d{4}" maxLength={4} className="mono ps-9 tracking-[0.4em]" placeholder="••••" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} aria-label={t("tracking.docPin")} /></div>
            <Button type="submit" loading={busy} disabled={pin.length !== 4}>{t("common.confirm")}</Button>
          </form>
        )}
        {!docs ? <p className="mt-2 text-[12px] text-subtle">{t("tracking.docPin")}</p> : null}
      </section>

      <section className="surface mt-4 p-5 text-[13.5px]">
        <h2 className="text-[15px] font-semibold">{t("tracking.contact")}</h2>
        <p className="mt-2 flex items-start gap-2 text-muted"><MapPin className="mt-0.5 size-4 shrink-0" /> {data.shop.address}</p>
        <p className="mt-1 flex items-center gap-2"><Phone className="size-4 shrink-0 text-muted" /> <a href={`tel:${data.shop.phone.replace(/\s/g, "")}`} className="text-accent">{data.shop.phone}</a></p>
        {hours.length ? <div className="mt-3"><div className="text-[12px] text-muted">{t("tracking.hours")}</div><ul className="tnum mt-1">{hours.map((h) => <li key={h.day} className="flex justify-between"><span>{h.day}</span><span>{h.open} – {h.close}</span></li>)}</ul></div> : null}
      </section>
      <p className="mt-6 text-center text-[11px] text-subtle">RepairFlow · {data.shop.name}</p>
    </main>
  );
}
