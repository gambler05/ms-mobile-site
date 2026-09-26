"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, ScanLine, Trash2, Minus, Plus, User, Wallet, Receipt, Lock, Unlock, Undo2, CheckCircle2, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn, newIdempotencyKey } from "@/lib/utils";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { computeTotals } from "@/lib/money";
import { LIMITED_DISCOUNT_MAX_BP } from "@/lib/domain/roles";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/menu";
import { EmptyState } from "@/components/ui/states";
import { closeRegisterAction, createSaleAction, customerCreditsAction, openRegisterAction, posCatalogAction, refundSaleAction, settlePaymentAction } from "@/app/actions/pos";
import { searchCustomersAction } from "@/app/actions/customers";
import { BarcodeScanner } from "@/components/shared/barcode-scanner";

type Product = { id: string; name: string; sku: string; barcode: string; type: string; category: string; priceCents: number; taxRateBp: number; serialized: boolean; available: number; units: { id: string; imei: string; serial: string; grade: string; color: string; capacity: string }[] };
type CartLine = { key: string; product: Product; qty: number; unitCents: number; discountCents: number; serializedUnitId?: string; unitLabel?: string };
type Register = { id: string; openedAt: string; openingCashCents: number; expectedCashCents: number; byMethod: Record<string, number>; count: number } | null;
type RecentSale = { id: string; number: string; kind: string; status: string; totalCents: number; createdAt: string; customer: string | null; payments: { id: string; method: string; amountCents: number; status: string }[]; lines: { id: string; label: string; qty: number; productId: string | null }[] };

export function PosScreen({ register, perms, recent, initialCatalog }: { initialCatalog: Product[]; register: Register; perms: { discountAny: boolean; discountLimited: boolean; refund: boolean; register: boolean }; recent: RecentSale[] }) {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [catalog, setCatalog] = useState<Product[]>(initialCatalog);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<{ id: string; label: string } | null>(null);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [unitPick, setUnitPick] = useState<Product | null>(null);
  const [registerDialog, setRegisterDialog] = useState<"open" | "close" | null>(null);
  const [pending, start] = useTransition();
  const idem = useRef(newIdempotencyKey());
  const searchRef = useRef<HTMLInputElement>(null);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; } // catalogue initial déjà rendu côté serveur
    const h = setTimeout(() => start(async () => { const r = await posCatalogAction(q); if (r.ok) setCatalog(r.data); else toast.error(r.error); }), 120);
    return () => clearTimeout(h);
  }, [q]);

  const totals = useMemo(() => computeTotals(cart.map((l) => ({ qty: l.qty, unitCents: l.unitCents, discountCents: l.discountCents, taxRateBp: l.product.taxRateBp })), globalDiscount), [cart, globalDiscount]);
  const catalogTotal = cart.reduce((s, l) => s + l.qty * l.product.priceCents, 0);
  const discountBp = catalogTotal ? Math.round(((catalogTotal - totals.totalCents) * 10_000) / catalogTotal) : 0;
  const discountTooHigh = !perms.discountAny && discountBp > LIMITED_DISCOUNT_MAX_BP;

  const add = (p: Product, unit?: Product["units"][number]) => {
    if (p.serialized && !unit) return setUnitPick(p);
    if (p.available <= 0) return toast.error(`${p.name} : ${t("pos.outOfStock")}`);
    setCart((c) => {
      const key = unit ? `${p.id}:${unit.id}` : p.id;
      const ex = c.find((l) => l.key === key);
      if (ex && !p.serialized) return ex.qty + 1 > p.available ? (toast.error(t("pos.outOfStock")), c) : c.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
      if (ex) return c;
      return [...c, { key, product: p, qty: 1, unitCents: p.priceCents, discountCents: 0, serializedUnitId: unit?.id, unitLabel: unit ? `${unit.imei || unit.serial}${unit.grade ? " · " + unit.grade : ""}` : undefined }];
    });
    setUnitPick(null);
  };
  const onScan = (code: string) => {
    const p = catalog.find((x) => x.barcode === code || x.sku === code.toUpperCase());
    if (p) { add(p); toast.success(p.name); } else { setQ(code); toast.message(`Code ${code} : aucun produit, recherche…`); }
    setScanOpen(false);
  };
  const reset = () => { setCart([]); setCustomer(null); setGlobalDiscount(0); idem.current = newIdempotencyKey(); };

  return (
    <div className="mx-auto grid max-w-[1500px] gap-4 anim-in lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="min-w-0 space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="display text-[24px]">{t("pos.title")}</h1>
          <RegisterStatus register={register} canManage={perms.register} onOpen={() => setRegisterDialog("open")} onClose={() => setRegisterDialog("close")} />
        </header>
        <div className="flex gap-2">
          <div className="relative flex-1"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-subtle" /><Input ref={searchRef} autoFocus className="ps-9" placeholder={`${t("common.search")} · SKU · code-barres`} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { const exact = catalog.find((x) => x.barcode === q || x.sku === q.toUpperCase()); if (exact) { add(exact); setQ(""); } } }} aria-label={t("common.search")} /></div>
          <Button onClick={() => setScanOpen(true)} aria-label={t("inventory.scan")}><ScanLine /> <span className="hidden sm:inline">{t("inventory.scan")}</span></Button>
        </div>
        {catalog.length === 0 ? <EmptyState title={t("inventory.empty")} /> : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {catalog.map((p) => (
              <button key={p.id} type="button" onClick={() => add(p)} disabled={p.available <= 0} className={cn("surface group flex min-h-[104px] flex-col justify-between p-3 text-start transition-[border-color,transform] hover:border-accent/50 active:scale-[0.99] disabled:opacity-50", cart.some((l) => l.product.id === p.id) && "border-accent/60")}>
                <div><div className="truncate-2 text-[13px] font-medium leading-tight">{p.name}</div><div className="mono mt-1 text-[11px] text-subtle">{p.sku}</div></div>
                <div className="mt-2 flex items-end justify-between"><span className="tnum text-[15px] font-semibold">{fmtMoney(p.priceCents, t.locale)}</span><span className={cn("tnum text-[11.5px]", p.available <= 0 ? "text-danger" : p.available <= 2 ? "text-warning" : "text-muted")}>{p.available <= 0 ? t("pos.outOfStock") : `×${p.available}`}</span></div>
              </button>
            ))}
          </div>
        )}
        <RecentSales recent={recent} canRefund={perms.refund} />
      </section>

      <aside className="surface-raised flex h-fit flex-col lg:sticky lg:top-[72px]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="text-[15px] font-semibold">{t("pos.cart")}</h2>{cart.length ? <Button size="sm" variant="ghost" onClick={reset}><Trash2 /> {t("common.reset")}</Button> : null}</div>
        <div className="border-b border-border px-4 py-2"><CustomerPicker value={customer} onChange={setCustomer} /></div>
        <ul className="max-h-[38vh] divide-y divide-border overflow-y-auto scroll-thin">
          {cart.length === 0 ? <li className="px-4 py-8 text-center text-[13px] text-muted">{t("pos.emptyCart")}</li> : null}
          {cart.map((l) => (
            <li key={l.key} className="px-4 py-2.5 text-[13px]">
              <div className="flex items-start justify-between gap-2"><span className="min-w-0"><span className="block truncate font-medium">{l.product.name}</span>{l.unitLabel ? <span className="mono block text-[11px] text-muted">{l.unitLabel}</span> : null}</span><button type="button" aria-label="Retirer" className="text-subtle hover:text-danger" onClick={() => setCart(cart.filter((x) => x.key !== l.key))}><X className="size-4" /></button></div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center rounded-[var(--radius-xs)] border border-border"><button type="button" aria-label="−" className="px-2 py-0.5" disabled={l.product.serialized} onClick={() => setCart(cart.map((x) => (x.key === l.key ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}><Minus className="size-3" /></button><span className="tnum w-6 text-center">{l.qty}</span><button type="button" aria-label="+" className="px-2 py-0.5" disabled={l.product.serialized || l.qty >= l.product.available} onClick={() => setCart(cart.map((x) => (x.key === l.key ? { ...x, qty: x.qty + 1 } : x)))}><Plus className="size-3" /></button></div>
                {perms.discountLimited || perms.discountAny ? <div className="w-24"><MoneyInput valueCents={l.unitCents} onChangeCents={(c) => setCart(cart.map((x) => (x.key === l.key ? { ...x, unitCents: c } : x)))} aria-label={t("common.price")} /></div> : <span className="tnum">{fmtMoney(l.unitCents, t.locale)}</span>}
                <span className="tnum w-20 text-end font-medium">{fmtMoney(l.qty * l.unitCents - l.discountCents, t.locale)}</span>
              </div>
            </li>
          ))}
        </ul>
        <div className="space-y-1.5 border-t border-border px-4 py-3 text-[13px]">
          <div className="flex justify-between text-muted"><span>{t("pos.subtotal")}</span><span className="tnum">{fmtMoney(totals.subtotalCents, t.locale)}</span></div>
          {perms.discountLimited || perms.discountAny ? <div className="flex items-center justify-between gap-3"><span className="text-muted">{t("pos.discount")}</span><div className="w-28"><MoneyInput valueCents={globalDiscount} onChangeCents={setGlobalDiscount} aria-label={t("pos.discount")} /></div></div> : null}
          {discountTooHigh ? <p className="text-[11.5px] text-danger">Remise limitée à {LIMITED_DISCOUNT_MAX_BP / 100} % pour votre rôle.</p> : null}
          <div className="flex justify-between text-[11.5px] text-subtle"><span>{t("pos.tax")}</span><span className="tnum">{fmtMoney(totals.taxCents, t.locale)}</span></div>
          <div className="flex items-baseline justify-between pt-1"><span className="font-semibold">{t("pos.total")}</span><span className="display tnum text-[24px] font-semibold">{fmtMoney(totals.totalCents, t.locale)}</span></div>
        </div>
        <div className="p-4 pt-0"><Button variant="primary" size="lg" className="w-full" disabled={cart.length === 0 || discountTooHigh} onClick={() => setPayOpen(true)}><Wallet /> {t("pos.pay")}</Button><p className="mt-2 text-center text-[10.5px] text-subtle">{t("pos.fiscalNotice")}</p></div>
      </aside>

      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} totalCents={totals.totalCents} registerOpen={Boolean(register)} customerId={customer?.id ?? null} onSubmit={(payments) => start(async () => {
        const r = await createSaleAction({ customerId: customer?.id ?? null, lines: cart.map((l) => ({ productId: l.product.id, serializedUnitId: l.serializedUnitId, qty: l.qty, unitCents: l.unitCents, discountCents: l.discountCents })), globalDiscountCents: globalDiscount, payments, notes: "", idempotencyKey: idem.current });
        if (!r.ok) { toast.error(r.error); return; }
        setPayOpen(false);
        toast.success(t("pos.completed", { number: r.data.number }), { action: { label: t("pos.receipt"), onClick: () => window.open(`/api/receipts/${r.data.id}`, "_blank") } });
        reset();
        router.refresh();
        searchRef.current?.focus();
      })} pending={pending} />
      <Dialog open={Boolean(unitPick)} onOpenChange={(o) => !o && setUnitPick(null)}>
        <DialogContent title={t("pos.pickUnit")} size="sm" description={unitPick?.name}>
          <ul className="divide-y divide-border">{unitPick?.units.map((u) => <li key={u.id}><button type="button" className="flex w-full items-center justify-between px-2 py-2 text-[13px] hover:bg-hover" onClick={() => add(unitPick, u)}><span className="mono">{u.imei || u.serial}</span><span className="text-muted">{[u.grade && `Grade ${u.grade}`, u.capacity, u.color].filter(Boolean).join(" · ")}</span></button></li>)}{unitPick?.units.length === 0 ? <li className="py-4 text-center text-[13px] text-muted">{t("pos.outOfStock")}</li> : null}</ul>
        </DialogContent>
      </Dialog>
      <Dialog open={scanOpen} onOpenChange={setScanOpen}><DialogContent title={t("inventory.scan")} size="sm" description={t("inventory.scanHint")}><BarcodeScanner onDetected={onScan} manualLabel={t("inventory.scanManual")} /></DialogContent></Dialog>
      <RegisterDialog mode={registerDialog} onClose={() => setRegisterDialog(null)} register={register} />
    </div>
  );
}

function RegisterStatus({ register, canManage, onOpen, onClose }: { register: Register; canManage: boolean; onOpen: () => void; onClose: () => void }) {
  const t = useT();
  return register ? (
    <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-success/30 bg-success-soft/40 px-3 py-1.5 text-[12.5px]"><Unlock className="size-4 text-success" /><span>{t("pos.registerOpenSince", { time: fmtDateTime(register.openedAt, t.locale) })}</span><span className="tnum text-muted">· {t("pos.methods.CASH")} {fmtMoney(register.expectedCashCents, t.locale)}</span>{canManage ? <Button size="sm" variant="ghost" onClick={onClose}>{t("pos.closeRegister")}</Button> : null}</div>
  ) : (
    <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-warning/30 bg-warning-soft/40 px-3 py-1.5 text-[12.5px]"><Lock className="size-4 text-warning" /><span>{t("pos.registerClosed")}</span>{canManage ? <Button size="sm" variant="primary" onClick={onOpen}>{t("pos.openRegister")}</Button> : null}</div>
  );
}

function RegisterDialog({ mode, onClose, register }: { mode: "open" | "close" | null; onClose: () => void; register: Register }) {
  const t = useT();
  const router = useRouter();
  const [amount, setAmount] = useState(15000);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const diff = register ? amount - register.expectedCashCents : 0;
  useEffect(() => { if (mode === "close" && register) setAmount(register.expectedCashCents); if (mode === "open") setAmount(15000); }, [mode, register]);
  return (
    <Dialog open={Boolean(mode)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={mode === "open" ? t("pos.openRegister") : t("pos.closeRegister")} size="sm">
        {mode === "open" ? <Field label={t("pos.openingCash")}><MoneyInput valueCents={amount} onChangeCents={setAmount} /></Field> : register ? (
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-y-1 text-[13px]"><dt className="text-muted">{t("pos.openingCash")}</dt><dd className="tnum text-end">{fmtMoney(register.openingCashCents, t.locale)}</dd>{Object.entries(register.byMethod).map(([m, v]) => <div key={m} className="contents"><dt className="text-muted">{t(`pos.methods.${m}` as never)}</dt><dd className="tnum text-end">{fmtMoney(v, t.locale)}</dd></div>)}<dt className="font-medium">{t("pos.expectedCash")}</dt><dd className="tnum text-end font-medium">{fmtMoney(register.expectedCashCents, t.locale)}</dd></dl>
            <Field label={t("pos.countedCash")}><MoneyInput valueCents={amount} onChangeCents={setAmount} /></Field>
            <div className={cn("flex justify-between rounded-[var(--radius-sm)] px-3 py-2 text-[13px]", diff === 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}><span>{t("pos.difference")}</span><span className="tnum font-medium">{diff > 0 ? "+" : ""}{fmtMoney(diff, t.locale)}</span></div>
            {diff !== 0 ? <Field label={t("pos.differenceReason")}><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field> : null}
          </div>
        ) : null}
        <DialogFooter><Button onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" loading={pending} disabled={mode === "close" && diff !== 0 && reason.trim().length < 3} onClick={() => start(async () => { const r = mode === "open" ? await openRegisterAction(amount) : await closeRegisterAction(amount, reason); if (!r.ok) toast.error(r.error); else { toast.success(t("common.confirm")); onClose(); router.refresh(); } })}>{t("common.confirm")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomerPicker({ value, onChange }: { value: { id: string; label: string } | null; onChange: (v: { id: string; label: string } | null) => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<{ id: string; label: string; sub: string }[]>([]);
  const [, start] = useTransition();
  useEffect(() => { if (q.trim().length < 2) return setRows([]); const h = setTimeout(() => start(async () => { const r = await searchCustomersAction(q); if (r.ok) setRows(r.data); }), 150); return () => clearTimeout(h); }, [q]);
  if (value) return <div className="flex items-center justify-between text-[13px]"><span className="flex items-center gap-2"><User className="size-4 text-accent" /> {value.label}</span><button type="button" className="text-subtle hover:text-fg" onClick={() => onChange(null)} aria-label="Retirer"><X className="size-4" /></button></div>;
  return (
    <div className="relative">
      <div className="flex items-center gap-2"><User className="size-4 text-subtle" /><input className="h-8 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle" placeholder={t("pos.walkIn")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("pos.customer")} /></div>
      {rows.length ? <ul className="glass absolute inset-x-0 top-full z-20 mt-1 rounded-[var(--radius-sm)] p-1 shadow-[var(--shadow-3)]">{rows.map((r) => <li key={r.id}><button type="button" className="flex w-full justify-between rounded px-2 py-1.5 text-[13px] hover:bg-hover" onClick={() => { onChange({ id: r.id, label: r.label }); setQ(""); setRows([]); }}><span>{r.label}</span><span className="text-muted">{r.sub}</span></button></li>)}</ul> : null}
    </div>
  );
}

function PaymentDialog({ open, onOpenChange, totalCents, registerOpen, customerId, onSubmit, pending }: { open: boolean; onOpenChange: (o: boolean) => void; totalCents: number; registerOpen: boolean; customerId: string | null; onSubmit: (p: { method: "CASH" | "CARD" | "TRANSFER" | "CREDIT_NOTE"; amountCents: number; creditNoteId?: string }[]) => void; pending: boolean }) {
  const t = useT();
  const [parts, setParts] = useState<{ method: "CASH" | "CARD" | "TRANSFER" | "CREDIT_NOTE"; amountCents: number; creditNoteId?: string }[]>([]);
  const [given, setGiven] = useState(0);
  const [credits, setCredits] = useState<{ id: string; number: string; remainingCents: number }[]>([]);
  const [, start] = useTransition();
  useEffect(() => { if (open) { setParts([{ method: registerOpen ? "CASH" : "CARD", amountCents: totalCents }]); setGiven(totalCents); if (customerId) start(async () => { const r = await customerCreditsAction(customerId); if (r.ok) setCredits(r.data); }); else setCredits([]); } }, [open, totalCents, registerOpen, customerId]);
  const paid = parts.reduce((s, p) => s + p.amountCents, 0);
  const remaining = totalCents - paid;
  const cash = parts.find((p) => p.method === "CASH")?.amountCents ?? 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("pos.pay")} size="sm">
        <div className="display tnum mb-3 text-center text-[30px] font-semibold">{fmtMoney(totalCents, t.locale)}</div>
        <div className="space-y-2">
          {parts.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_32px] items-center gap-2">
              <Select value={p.method} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, method: e.target.value as never, creditNoteId: undefined } : x)))} aria-label="Mode">
                <option value="CASH" disabled={!registerOpen}>{t("pos.methods.CASH")}</option><option value="CARD">{t("pos.methods.CARD")}</option><option value="TRANSFER">{t("pos.methods.TRANSFER")}</option>{credits.length ? <option value="CREDIT_NOTE">{t("pos.methods.CREDIT_NOTE")}</option> : null}
              </Select>
              <MoneyInput valueCents={p.amountCents} onChangeCents={(c) => setParts(parts.map((x, j) => (j === i ? { ...x, amountCents: c } : x)))} aria-label={t("common.total")} />
              <Button size="icon-sm" variant="ghost" aria-label="Retirer" disabled={parts.length === 1} onClick={() => setParts(parts.filter((_, j) => j !== i))}><X /></Button>
              {p.method === "CREDIT_NOTE" ? <Select className="col-span-3" value={p.creditNoteId ?? ""} onChange={(e) => { const cn = credits.find((c) => c.id === e.target.value); setParts(parts.map((x, j) => (j === i ? { ...x, creditNoteId: cn?.id, amountCents: Math.min(cn?.remainingCents ?? 0, totalCents) } : x))); }}><option value="">Avoir…</option>{credits.map((c) => <option key={c.id} value={c.id}>{c.number} · {fmtMoney(c.remainingCents, t.locale)}</option>)}</Select> : null}
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setParts([...parts, { method: "CARD", amountCents: Math.max(0, remaining) }])}><Plus /> {t("pos.mixed")}</Button>
          <div className={cn("flex justify-between rounded-[var(--radius-sm)] px-3 py-2 text-[13px]", remaining === 0 ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}><span>{t("pos.remaining")}</span><span className="tnum font-medium">{fmtMoney(remaining, t.locale)}</span></div>
          {cash > 0 ? <div className="grid grid-cols-2 items-center gap-2 text-[13px]"><Field label="Espèces reçues"><MoneyInput valueCents={given} onChangeCents={setGiven} /></Field><div className="pt-5"><span className="text-muted">{t("pos.change")} : </span><span className="tnum font-semibold">{fmtMoney(Math.max(0, given - cash), t.locale)}</span></div></div> : null}
          {parts.some((p) => p.method === "CARD" || p.method === "TRANSFER") ? <p className="text-[11.5px] text-muted">{t("pos.recordedHint")}</p> : null}
        </div>
        <DialogFooter><Button onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button><Button variant="primary" size="lg" disabled={remaining !== 0 || parts.some((p) => p.amountCents <= 0)} loading={pending} onClick={() => onSubmit(parts)}><CheckCircle2 /> {t("pos.complete")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecentSales({ recent, canRefund }: { recent: RecentSale[]; canRefund: boolean }) {
  const t = useT();
  const router = useRouter();
  const [refund, setRefund] = useState<RecentSale | null>(null);
  const [sel, setSel] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<"CASH" | "CARD" | "TRANSFER" | "CREDIT_NOTE">("CREDIT_NOTE");
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [pending, start] = useTransition();
  return (
    <section className="surface">
      <div className="flex items-center justify-between px-4 py-2.5"><h2 className="text-[14px] font-semibold">{t("pos.sales")}</h2><Link href="/pos/sales" className="text-[12px] text-accent hover:underline">{t("common.all")}</Link></div>
      <ul className="divide-y divide-border">
        {recent.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-[13px]">
            <span className="mono w-[110px] text-accent">{s.number}</span>
            <span className="w-[120px] text-muted">{fmtDateTime(s.createdAt, t.locale)}</span>
            <span className="min-w-0 flex-1 truncate">{s.customer ?? t("pos.walkIn")}{s.kind === "RETURN" ? <Badge tone="danger" className="ms-2">{t("pos.refund")}</Badge> : s.kind === "REPAIR_SETTLEMENT" ? <Badge tone="iris" className="ms-2">{t("pos.repairSettlement")}</Badge> : null}</span>
            {s.payments.filter((p) => p.status === "RECORDED").map((p) => <span key={p.id} className="flex items-center gap-1 text-[11.5px] text-warning">⏳ {t(`pos.methods.${p.method}` as never)}<Button size="sm" variant="ghost" loading={pending} onClick={() => start(async () => { const r = await settlePaymentAction(p.id, true); if (!r.ok) toast.error(r.error); else router.refresh(); })}>{t("pos.settle")}</Button></span>)}
            <span className="tnum w-24 text-end font-medium">{fmtMoney(s.totalCents, t.locale)}</span>
            <a href={`/api/receipts/${s.id}`} target="_blank" rel="noreferrer" className="text-muted hover:text-fg" aria-label={t("pos.receipt")}><Receipt className="size-4" /></a>
            <a href={`/api/receipts/${s.id}?format=thermal`} target="_blank" rel="noreferrer" className="text-[11px] text-subtle hover:text-fg">80mm</a>
            {canRefund && s.kind === "SALE" && s.status === "COMPLETED" ? <Button size="icon-sm" variant="ghost" aria-label={t("pos.refund")} onClick={() => { setRefund(s); setSel({}); }}><Undo2 /></Button> : null}
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(refund)} onOpenChange={(o) => !o && setRefund(null)}>
        <DialogContent title={`${t("pos.refund")} · ${refund?.number ?? ""}`} size="sm">
          <div className="space-y-3">
            <ul className="divide-y divide-border rounded-[var(--radius-sm)] border border-border text-[13px]">{refund?.lines.map((l) => <li key={l.id} className="flex items-center justify-between px-3 py-2"><label className="flex items-center gap-2"><Checkbox checked={Boolean(sel[l.id])} onCheckedChange={(v) => setSel({ ...sel, [l.id]: v ? 1 : 0 })} /> {l.label}</label>{sel[l.id] ? <Input type="number" min={1} max={l.qty} className="w-16" value={sel[l.id]} onChange={(e) => setSel({ ...sel, [l.id]: Math.min(l.qty, Math.max(1, Number(e.target.value))) })} /> : <span className="text-muted">×{l.qty}</span>}</li>)}</ul>
            <Field label={t("pos.pay")}><Select value={method} onChange={(e) => setMethod(e.target.value as never)}><option value="CREDIT_NOTE">{t("pos.methods.CREDIT_NOTE")}</option><option value="CASH">{t("pos.methods.CASH")}</option><option value="CARD">{t("pos.methods.CARD")}</option><option value="TRANSFER">{t("pos.methods.TRANSFER")}</option></Select></Field>
            <Field label={t("common.reason")}><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <label className="flex items-center gap-2 text-[13px]"><Checkbox checked={restock} onCheckedChange={(v) => setRestock(v === true)} /> {t("pos.restock")}</label>
          </div>
          <DialogFooter><Button onClick={() => setRefund(null)}>{t("common.cancel")}</Button><Button variant="danger" loading={pending} disabled={!Object.values(sel).some(Boolean) || reason.trim().length < 3} onClick={() => start(async () => { const r = await refundSaleAction(refund!.id, { lines: Object.entries(sel).filter(([, q]) => q > 0).map(([saleLineId, qty]) => ({ saleLineId, qty })), method, reason, restock }); if (!r.ok) toast.error(r.error); else { toast.success(`${r.data.number} · ${fmtMoney(r.data.total, t.locale)}`); setRefund(null); router.refresh(); } })}>{t("pos.refund")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
