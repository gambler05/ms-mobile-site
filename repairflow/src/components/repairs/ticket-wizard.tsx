"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Search, UserPlus, Camera, Trash2, Copy, Printer, ExternalLink, Save } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn, newIdempotencyKey } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/menu";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_RECEPTION_ITEMS, DEVICE_KINDS, IMEI_KINDS, PRIORITIES, type DeviceKind } from "@/lib/domain/tickets";
import { searchCustomersAction, createCustomerAction } from "@/app/actions/customers";
import { createTicketAction, saveDraftAction, uploadPhotoAction } from "@/app/actions/tickets";
import { fmtMoney } from "@/lib/format";

type Tech = { id: string; name: string };
type KnownDevice = { id: string; kind: string; brand: string; model: string; color: string; imei: string; serial: string };
interface WizardState {
  step: number;
  customerId?: string;
  customerLabel?: string;
  knownDevices?: KnownDevice[];
  newCustomer?: { firstName: string; lastName: string; phone: string; email: string; consentSms: boolean; consentEmail: boolean };
  device: { id?: string; kind: DeviceKind; brand: string; model: string; color: string; imei: string; serial: string };
  reportedIssue: string;
  cosmeticState: string;
  reception: Record<string, boolean>;
  accessories: string[];
  technicianId: string | null;
  promisedAt: string;
  priority: (typeof PRIORITIES)[number];
  estimateCents: number;
  depositCents: number;
  depositMethod: "CASH" | "CARD" | "TRANSFER";
  unlockCode: string;
  warrantyMonths: number;
  consentAccepted: boolean;
  signatureDataUrl?: string;
}

const LOCAL_KEY = "rf-ticket-wizard";
const empty = (): WizardState => ({ step: 0, device: { kind: "PHONE", brand: "", model: "", color: "", imei: "", serial: "" }, reportedIssue: "", cosmeticState: "", reception: {}, accessories: [], technicianId: null, promisedAt: "", priority: "NORMAL", estimateCents: 0, depositCents: 0, depositMethod: "CASH", unlockCode: "", warrantyMonths: 3, consentAccepted: false });

export function TicketWizard({ techs, draftId: initialDraftId, initial, canUnlockCode, registerOpen }: { techs: Tech[]; draftId?: string; initial?: Partial<WizardState>; canUnlockCode: boolean; registerOpen: boolean }) {
  const t = useT();
  const router = useRouter();
  const steps = t.list("tickets.wizard.steps");
  const [s, setS] = useState<WizardState>(() => ({ ...empty(), ...(initial ?? {}) }));
  const [draftId, setDraftId] = useState(initialDraftId);
  const [pending, start] = useTransition();
  const [done, setDone] = useState<{ id: string; number: string; trackingToken: string; pin: string } | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const dirty = useRef(false);
  const idem = useRef(newIdempotencyKey());

  // Brouillon local (sécurité hors-ligne) : ne contient jamais le code de déverrouillage ni la signature.
  useEffect(() => {
    if (!initial && !initialDraftId) {
      try {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (raw) setS({ ...empty(), ...(JSON.parse(raw) as Partial<WizardState>) });
      } catch { /* ignore */ }
    }
  }, [initial, initialDraftId]);
  useEffect(() => {
    if (done) return;
    const { unlockCode: _u, signatureDataUrl: _sig, ...safe } = s;
    void _u; void _sig;
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(safe)); } catch { /* ignore */ }
  }, [s, done]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty.current && !done) { e.preventDefault(); } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [done]);

  const up = useCallback(<K extends keyof WizardState>(k: K, v: WizardState[K]) => { dirty.current = true; setS((p) => ({ ...p, [k]: v })); }, []);
  const needsImei = IMEI_KINDS.has(s.device.kind);

  const validate = (step: number): string | null => {
    if (step === 0 && !s.customerId && !(s.newCustomer && s.newCustomer.firstName && s.newCustomer.lastName)) return t("tickets.wizard.customerRequired");
    if (step === 1 && (!s.device.brand.trim() || !s.device.model.trim())) return t("tickets.wizard.deviceRequired");
    if (step === 2 && s.reportedIssue.trim().length < 3) return t("tickets.wizard.issueRequired");
    if (step === 5 && !s.consentAccepted) return t("tickets.wizard.consentRequired");
    return null;
  };
  const next = () => { const err = validate(s.step); if (err) return toast.error(err); up("step", Math.min(s.step + 1, steps.length - 1)); };
  const prev = () => up("step", Math.max(s.step - 1, 0));

  const saveDraft = () => start(async () => {
    const { unlockCode: _u, signatureDataUrl: _sig, ...safe } = s; void _u; void _sig;
    const r = await saveDraftAction(safe, draftId);
    if (r.ok) { setDraftId(r.data.id); toast.success(t("tickets.wizard.draftSaved")); } else toast.error(r.error);
  });

  const submit = () => {
    for (let i = 0; i <= 5; i++) { const err = validate(i); if (err) { up("step", i); return toast.error(err); } }
    start(async () => {
      let customerId = s.customerId;
      if (!customerId && s.newCustomer) {
        const c = await createCustomerAction({ ...s.newCustomer, company: "", address: "", postalCode: "", city: "", notes: "", tags: [], segment: "NEW", consentWhatsapp: false, consentMarketing: false });
        if (!c.ok) { toast.error(c.error); return; }
        customerId = c.data.id;
        setS((p) => ({ ...p, customerId }));
      }
      const r = await createTicketAction({
        customerId,
        device: s.device,
        reportedIssue: s.reportedIssue,
        cosmeticState: s.cosmeticState,
        reception: s.reception,
        accessories: s.accessories,
        technicianId: s.technicianId,
        promisedAt: s.promisedAt ? new Date(s.promisedAt).toISOString() : null,
        priority: s.priority,
        estimateCents: s.estimateCents,
        depositCents: s.depositCents,
        depositMethod: s.depositMethod,
        unlockCode: s.unlockCode || undefined,
        warrantyMonths: s.warrantyMonths,
        signatureDataUrl: s.signatureDataUrl,
        consentAccepted: s.consentAccepted,
        internalNotes: "",
      }, draftId);
      if (!r.ok) { toast.error(r.error); return; }
      for (const f of photos) {
        const fd = new FormData();
        fd.set("file", f);
        fd.set("kind", "PHOTO_BEFORE");
        await uploadPhotoAction(r.data.id, fd);
      }
      dirty.current = false;
      localStorage.removeItem(LOCAL_KEY);
      setDone(r.data);
      toast.success(t("tickets.wizard.created", { number: r.data.number }));
    });
  };

  if (done) {
    const url = `${window.location.origin}/t/${done.trackingToken}`;
    return (
      <div className="surface-raised mt-6 p-6 anim-in">
        <div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-full bg-success-soft text-success"><Check className="size-5" /></span><h2 className="display text-[20px]">{t("tickets.wizard.created", { number: done.number })}</h2></div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div><dt className="text-[12px] font-medium text-muted">{t("tickets.wizard.trackingLink")}</dt><dd className="mt-1 flex items-center gap-2"><code className="mono truncate rounded bg-hover px-2 py-1 text-[12px]">{url}</code><Button size="icon-sm" variant="ghost" aria-label={t("tickets.detail.copyLink")} onClick={() => { void navigator.clipboard.writeText(url); toast.success(t("common.copied")); }}><Copy /></Button></dd></div>
          <div><dt className="text-[12px] font-medium text-muted">{t("tickets.wizard.docPin")}</dt><dd className="mono mt-1 text-[22px] font-semibold tracking-[0.3em]">{done.pin}</dd></div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild variant="primary"><Link href={`/repairs/${done.id}`}><ExternalLink /> {t("tickets.wizard.openTicket")}</Link></Button>
          <Button asChild><a href={`/api/documents/${done.id}/label`} target="_blank" rel="noreferrer"><Printer /> {t("tickets.wizard.printLabel")}</a></Button>
          <Button asChild><a href={`/api/documents/${done.id}/deposit`} target="_blank" rel="noreferrer">{t("tickets.detail.depositSlip")}</a></Button>
          <Button variant="ghost" onClick={() => { setDone(null); setS(empty()); setPhotos([]); idem.current = newIdempotencyKey(); }}>{t("tickets.new")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[220px_1fr]">
      <ol className="flex gap-1 overflow-x-auto no-scrollbar lg:flex-col lg:gap-0.5" aria-label="Étapes">
        {steps.map((label, i) => (
          <li key={label}>
            <button type="button" onClick={() => { if (i < s.step || !validate(s.step)) up("step", i); }} aria-current={i === s.step ? "step" : undefined} className={cn("flex w-full items-center gap-2.5 whitespace-nowrap rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-muted hover:bg-hover", i === s.step && "bg-active font-medium text-fg", i < s.step && "text-fg")}>
              <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px]", i < s.step ? "border-success bg-success text-inverse" : i === s.step ? "border-accent text-accent" : "border-border-strong")}>{i < s.step ? <Check className="size-3" /> : i + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      <div className="surface min-w-0 p-5 sm:p-6">
        {s.step === 0 && <StepCustomer s={s} up={up} />}
        {s.step === 1 && (
          <div className="space-y-4">
            {s.knownDevices?.length ? (
              <div>
                <div className="mb-2 text-[12.5px] font-medium text-muted">{t("tickets.wizard.existingDevices")}</div>
                <div className="flex flex-wrap gap-2">
                  {s.knownDevices.map((d) => (
                    <button key={d.id} type="button" onClick={() => up("device", { id: d.id, kind: d.kind as DeviceKind, brand: d.brand, model: d.model, color: d.color, imei: d.imei, serial: d.serial })} className={cn("rounded-[var(--radius-sm)] border px-3 py-2 text-start text-[13px] hover:border-accent", s.device.id === d.id ? "border-accent bg-accent-soft" : "border-border")}>
                      <div className="font-medium">{d.brand} {d.model}</div><div className="mono text-[11px] text-muted">{d.imei || d.serial || d.color}</div>
                    </button>
                  ))}
                  <button type="button" onClick={() => up("device", { kind: "PHONE", brand: "", model: "", color: "", imei: "", serial: "" })} className={cn("rounded-[var(--radius-sm)] border border-dashed px-3 py-2 text-[13px]", !s.device.id ? "border-accent" : "border-border")}>{t("tickets.wizard.newDevice")}</button>
                </div>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("tickets.wizard.kind")} id="kind"><Select id="kind" value={s.device.kind} onChange={(e) => up("device", { ...s.device, id: undefined, kind: e.target.value as DeviceKind })}>{DEVICE_KINDS.map((k) => <option key={k} value={k}>{t(`deviceKind.${k}`)}</option>)}</Select></Field>
              <Field label={t("tickets.wizard.brand")} id="brand"><Input id="brand" list="brands" value={s.device.brand} onChange={(e) => up("device", { ...s.device, id: undefined, brand: e.target.value })} /><datalist id="brands">{["Apple", "Samsung", "Xiaomi", "Google", "Huawei", "Sony", "Nintendo", "Dell", "HP", "Lenovo", "Asus"].map((b) => <option key={b} value={b} />)}</datalist></Field>
              <Field label={t("tickets.wizard.model")} id="model"><Input id="model" value={s.device.model} onChange={(e) => up("device", { ...s.device, id: undefined, model: e.target.value })} /></Field>
              <Field label={t("tickets.wizard.color")} id="color"><Input id="color" value={s.device.color} onChange={(e) => up("device", { ...s.device, color: e.target.value })} /></Field>
              {needsImei ? <Field label={t("tickets.wizard.imei")} id="imei" hint={t("common.optional")}><Input id="imei" inputMode="numeric" className="mono" value={s.device.imei} onChange={(e) => up("device", { ...s.device, imei: e.target.value })} /></Field> : <Field label={t("tickets.wizard.serial")} id="serial" hint={t("common.optional")}><Input id="serial" className="mono" value={s.device.serial} onChange={(e) => up("device", { ...s.device, serial: e.target.value })} /></Field>}
            </div>
          </div>
        )}
        {s.step === 2 && (
          <div className="space-y-4">
            <Field label={t("tickets.wizard.issue")} id="issue"><Textarea id="issue" rows={4} placeholder={t("tickets.wizard.issuePlaceholder")} value={s.reportedIssue} onChange={(e) => up("reportedIssue", e.target.value)} /></Field>
            <Field label={t("tickets.wizard.cosmetic")} id="cosmetic"><Input id="cosmetic" value={s.cosmeticState} onChange={(e) => up("cosmeticState", e.target.value)} /></Field>
            <fieldset>
              <legend className="mb-2 text-[12.5px] font-medium text-muted">{t("tickets.wizard.reception")}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {DEFAULT_RECEPTION_ITEMS.map((item) => (
                  <label key={item} className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-border px-3 py-2 text-[13px] has-[[data-state=checked]]:border-accent/50 has-[[data-state=checked]]:bg-accent-soft/40">
                    <Checkbox checked={Boolean(s.reception[item])} onCheckedChange={(v) => up("reception", { ...s.reception, [item]: v === true })} /> {item}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}
        {s.step === 3 && (
          <div className="space-y-4">
            <Field label={t("tickets.wizard.accessories")} id="acc">
              <Input id="acc" placeholder={t("tickets.wizard.accessoriesPlaceholder")} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const v = (e.target as HTMLInputElement).value.trim(); if (v) { up("accessories", [...s.accessories, v]); (e.target as HTMLInputElement).value = ""; } } }} />
              <div className="mt-2 flex flex-wrap gap-1.5">{s.accessories.map((a, i) => <Badge key={i} tone="outline">{a} <button type="button" aria-label="Retirer" onClick={() => up("accessories", s.accessories.filter((_, j) => j !== i))}>×</button></Badge>)}{["Coque", "Chargeur", "Carte SIM", "Étui"].filter((x) => !s.accessories.includes(x)).map((x) => <button key={x} type="button" className="rounded-[var(--radius-xs)] border border-dashed border-border px-1.5 text-[11.5px] text-muted hover:text-fg" onClick={() => up("accessories", [...s.accessories, x])}>+ {x}</button>)}</div>
            </Field>
            <div>
              <div className="mb-2 text-[12.5px] font-medium text-muted">{t("tickets.wizard.photos")}</div>
              <div className="flex flex-wrap gap-2">
                {photos.map((f, i) => <div key={i} className="relative size-20 overflow-hidden rounded-[var(--radius-sm)] border border-border"><img src={URL.createObjectURL(f)} alt="" className="size-full object-cover" /><button type="button" aria-label="Supprimer" className="absolute end-1 top-1 rounded bg-black/60 p-0.5 text-white" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}><Trash2 className="size-3" /></button></div>)}
                <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--radius-sm)] border border-dashed border-border-strong text-[11px] text-muted hover:border-accent hover:text-fg"><Camera className="size-5" />{t("tickets.wizard.addPhoto")}<input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => setPhotos([...photos, ...Array.from(e.target.files ?? [])].slice(0, 8))} /></label>
              </div>
            </div>
          </div>
        )}
        {s.step === 4 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("common.technician")} id="tech"><Select id="tech" value={s.technicianId ?? ""} onChange={(e) => up("technicianId", e.target.value || null)}><option value="">{t("tickets.unassigned")}</option>{techs.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
            <Field label={t("tickets.wizard.promisedAt")} id="promised"><Input id="promised" type="datetime-local" value={s.promisedAt} onChange={(e) => up("promisedAt", e.target.value)} /></Field>
            <Field label={t("common.priority")} id="prio"><Select id="prio" value={s.priority} onChange={(e) => up("priority", e.target.value as never)}>{PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}</Select></Field>
            <Field label={t("tickets.wizard.warranty")} id="warranty"><Input id="warranty" type="number" min={0} max={24} value={s.warrantyMonths} onChange={(e) => up("warrantyMonths", Number(e.target.value))} /></Field>
            <Field label={t("tickets.wizard.estimate")} id="estimate"><MoneyInput id="estimate" valueCents={s.estimateCents} onChangeCents={(c) => up("estimateCents", c)} /></Field>
            <Field label={t("tickets.wizard.deposit")} id="deposit"><MoneyInput id="deposit" valueCents={s.depositCents} onChangeCents={(c) => up("depositCents", c)} /></Field>
            {s.depositCents > 0 ? <Field label={t("tickets.wizard.depositMethod")} id="depm"><Select id="depm" value={s.depositMethod} onChange={(e) => up("depositMethod", e.target.value as never)}><option value="CASH" disabled={!registerOpen}>{t("pos.methods.CASH")}{!registerOpen ? ` — ${t("pos.registerClosed")}` : ""}</option><option value="CARD">{t("pos.methods.CARD")}</option><option value="TRANSFER">{t("pos.methods.TRANSFER")}</option></Select></Field> : null}
            {canUnlockCode ? <Field label={t("tickets.wizard.unlockCode")} id="unlock" hint={t("common.optional")}><Input id="unlock" type="password" autoComplete="off" className="mono" value={s.unlockCode} onChange={(e) => up("unlockCode", e.target.value)} /><p className="mt-1 text-[11.5px] text-subtle">{t("tickets.wizard.unlockHint")}</p></Field> : null}
          </div>
        )}
        {s.step === 5 && (
          <div className="space-y-4">
            <Summary s={s} techs={techs} />
            <div>
              <div className="mb-1.5 text-[12.5px] font-medium text-muted">{t("tickets.wizard.signature")}</div>
              <SignaturePad value={s.signatureDataUrl} onChange={(v) => up("signatureDataUrl", v)} clearLabel={t("tickets.wizard.clear")} />
            </div>
            <label className="flex items-start gap-2.5 text-[13px]"><Checkbox checked={s.consentAccepted} onCheckedChange={(v) => up("consentAccepted", v === true)} className="mt-0.5" /> {t("tickets.wizard.consent")}</label>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={saveDraft} loading={pending}><Save /> {t("tickets.wizard.saveDraft")}</Button>
          <div className="flex gap-2">
            {s.step > 0 ? <Button onClick={prev}>{t("common.previous")}</Button> : null}
            {s.step < steps.length - 1 ? <Button variant="primary" onClick={next}>{t("common.next")}</Button> : <Button variant="primary" onClick={submit} loading={pending}>{t("tickets.wizard.submit")}</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepCustomer({ s, up }: { s: WizardState; up: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; label: string; sub: string; devices: KnownDevice[] }[]>([]);
  const [creating, setCreating] = useState(Boolean(s.newCustomer));
  const [, start] = useTransition();
  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const h = setTimeout(() => start(async () => { const r = await searchCustomersAction(q); if (r.ok) setResults(r.data); }), 150);
    return () => clearTimeout(h);
  }, [q]);
  return (
    <div className="space-y-4">
      {s.customerId ? (
        <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-accent/40 bg-accent-soft/40 px-3 py-2 text-[13.5px]"><span><Check className="me-1.5 inline size-4 text-accent" />{s.customerLabel}</span><Button size="sm" variant="ghost" onClick={() => { up("customerId", undefined); up("customerLabel", undefined); up("knownDevices", undefined); }}>{t("common.edit")}</Button></div>
      ) : (
        <>
          <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-subtle" /><Input autoFocus className="ps-9" placeholder={t("tickets.wizard.searchCustomer")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("tickets.wizard.searchCustomer")} /></div>
          {results.length ? <ul className="divide-y divide-border rounded-[var(--radius-sm)] border border-border">{results.map((r) => <li key={r.id}><button type="button" className="flex w-full items-center justify-between px-3 py-2 text-start text-[13.5px] hover:bg-hover" onClick={() => { up("customerId", r.id); up("customerLabel", r.label); up("knownDevices", r.devices); up("newCustomer", undefined); }}><span>{r.label}</span><span className="text-[12px] text-muted">{r.sub}</span></button></li>)}</ul> : null}
          {!creating ? <Button onClick={() => setCreating(true)}><UserPlus /> {t("tickets.wizard.newCustomer")}</Button> : (
            <div className="grid gap-3 rounded-[var(--radius-md)] border border-border p-4 sm:grid-cols-2">
              <Field label="Prénom" id="fn"><Input id="fn" value={s.newCustomer?.firstName ?? ""} onChange={(e) => up("newCustomer", { ...(s.newCustomer ?? { firstName: "", lastName: "", phone: "", email: "", consentSms: true, consentEmail: true }), firstName: e.target.value })} /></Field>
              <Field label="Nom" id="ln"><Input id="ln" value={s.newCustomer?.lastName ?? ""} onChange={(e) => up("newCustomer", { ...(s.newCustomer ?? { firstName: "", lastName: "", phone: "", email: "", consentSms: true, consentEmail: true }), lastName: e.target.value })} /></Field>
              <Field label="Téléphone" id="ph"><Input id="ph" type="tel" value={s.newCustomer?.phone ?? ""} onChange={(e) => up("newCustomer", { ...(s.newCustomer ?? { firstName: "", lastName: "", phone: "", email: "", consentSms: true, consentEmail: true }), phone: e.target.value })} /></Field>
              <Field label="E-mail" id="em" hint={t("common.optional")}><Input id="em" type="email" value={s.newCustomer?.email ?? ""} onChange={(e) => up("newCustomer", { ...(s.newCustomer ?? { firstName: "", lastName: "", phone: "", email: "", consentSms: true, consentEmail: true }), email: e.target.value })} /></Field>
              <label className="flex items-center gap-2 text-[13px]"><Checkbox checked={s.newCustomer?.consentSms ?? true} onCheckedChange={(v) => up("newCustomer", { ...(s.newCustomer ?? { firstName: "", lastName: "", phone: "", email: "", consentSms: true, consentEmail: true }), consentSms: v === true })} /> {t("customers.consentSms")}</label>
              <label className="flex items-center gap-2 text-[13px]"><Checkbox checked={s.newCustomer?.consentEmail ?? true} onCheckedChange={(v) => up("newCustomer", { ...(s.newCustomer ?? { firstName: "", lastName: "", phone: "", email: "", consentSms: true, consentEmail: true }), consentEmail: v === true })} /> {t("customers.consentEmail")}</label>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Summary({ s, techs }: { s: WizardState; techs: Tech[] }) {
  const t = useT();
  const rows: [string, string][] = [
    [t("common.customer"), s.customerLabel ?? `${s.newCustomer?.firstName ?? ""} ${s.newCustomer?.lastName ?? ""}`],
    [t("common.device"), `${t(`deviceKind.${s.device.kind}`)} · ${s.device.brand} ${s.device.model}${s.device.color ? " · " + s.device.color : ""}`],
    [t("tickets.wizard.issue"), s.reportedIssue],
    [t("common.technician"), techs.find((u) => u.id === s.technicianId)?.name ?? t("tickets.unassigned")],
    [t("tickets.wizard.promisedAt"), s.promisedAt ? new Date(s.promisedAt).toLocaleString() : t("tickets.noPromise")],
    [t("tickets.wizard.estimate"), fmtMoney(s.estimateCents, t.locale)],
    [t("tickets.wizard.deposit"), s.depositCents ? `${fmtMoney(s.depositCents, t.locale)} (${t(`pos.methods.${s.depositMethod}`)})` : t("common.none")],
    [t("tickets.wizard.accessories"), s.accessories.join(", ") || t("common.none")],
  ];
  return <dl className="grid gap-x-6 gap-y-2 rounded-[var(--radius-md)] bg-hover p-4 text-[13px] sm:grid-cols-[160px_1fr]">{rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}</dl>;
}

export function SignaturePad({ value, onChange, clearLabel }: { value?: string; onChange: (v: string | undefined) => void; clearLabel: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const pos = (e: PointerEvent | React.PointerEvent) => { const c = ref.current!; const r = c.getBoundingClientRect(); return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height }; };
  const ctx = () => { const c = ref.current!.getContext("2d")!; c.lineWidth = 2.2; c.lineCap = "round"; c.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim() || "#111"; return c; };
  const isEmpty = useMemo(() => !value, [value]);
  return (
    <div>
      <canvas
        ref={ref}
        width={720}
        height={220}
        role="img"
        aria-label="Zone de signature"
        className="h-[160px] w-full touch-none rounded-[var(--radius-sm)] border border-border-strong bg-bg/40"
        onPointerDown={(e) => { drawing.current = true; ref.current!.setPointerCapture(e.pointerId); const c = ctx(); const p = pos(e); c.beginPath(); c.moveTo(p.x, p.y); }}
        onPointerMove={(e) => { if (!drawing.current) return; const c = ctx(); const p = pos(e); c.lineTo(p.x, p.y); c.stroke(); }}
        onPointerUp={() => { drawing.current = false; onChange(ref.current!.toDataURL("image/png")); }}
      />
      <div className="mt-1 flex justify-end"><Button size="sm" variant="ghost" disabled={isEmpty} onClick={() => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); onChange(undefined); }}>{clearLabel}</Button></div>
    </div>
  );
}
