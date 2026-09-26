"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, PackageCheck, Truck } from "lucide-react";
import { useT } from "@/i18n/client";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, Sheet } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/menu";
import { createPoAction, receivePoAction, upsertSupplierAction } from "@/app/actions/inventory";

type Order = { id: string; number: string; status: string; supplier: string; expectedAt: string | null; createdAt: string; notes: string; lines: { id: string; product: string; sku: string; ordered: number; received: number; unitCostCents: number }[] };
type Supplier = { id: string; name: string; email: string; phone: string; leadDays: number; products: number; notes: string; address: string };
type Prod = { id: string; name: string; sku: string; costCents: number; supplierId: string | null };

export function PurchasingView({ orders, suppliers, products, suggestions }: { orders: Order[]; suppliers: Supplier[]; products: Prod[]; suggestions: { productId: string; name: string; sku: string; missing: number; supplierId: string | null; costCents: number }[] }) {
  const t = useT();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState<Order | null>(null);
  const [supplierForm, setSupplierForm] = useState<Partial<Supplier> | null>(null);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [lines, setLines] = useState<{ productId: string; qty: number; unitCostCents: number }[]>([]);
  const [notes, setNotes] = useState("");
  const [expected, setExpected] = useState("");
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [pending, start] = useTransition();
  const tone = (s: string) => (s === "RECEIVED" ? "success" : s === "PARTIAL" ? "warning" : s === "CANCELLED" ? "danger" : "accent");
  const openFromSuggestions = () => { const first = suggestions[0]; const sid = first?.supplierId ?? suppliers[0]?.id ?? ""; setSupplierId(sid); setLines(suggestions.filter((s) => (s.supplierId ?? sid) === sid).map((s) => ({ productId: s.productId, qty: Math.max(1, s.missing), unitCostCents: s.costCents }))); setCreating(true); };
  return (
    <Tabs defaultValue="orders">
      <div className="flex flex-wrap items-center justify-between gap-2"><TabsList><TabsTrigger value="orders">{t("inventory.purchaseOrders")}</TabsTrigger><TabsTrigger value="suppliers">{t("inventory.suppliers")}</TabsTrigger></TabsList><div className="flex gap-2">{suggestions.length ? <Button onClick={openFromSuggestions}><Truck /> {t("dashboard.partsToOrder")} ({suggestions.length})</Button> : null}<Button variant="primary" onClick={() => { setLines([]); setCreating(true); }}><Plus /> {t("inventory.newPo")}</Button></div></div>
      <TabsContent value="orders" className="mt-3 space-y-2">
        {orders.length === 0 ? <p className="surface p-6 text-center text-[13px] text-muted">{t("common.empty")}</p> : null}
        {orders.map((o) => (
          <div key={o.id} className="surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="mono text-accent">{o.number}</span><span className="font-medium">{o.supplier}</span><Badge tone={tone(o.status)}>{t(`inventory.poStatus.${o.status}` as never)}</Badge></div><div className="flex items-center gap-2 text-[12.5px] text-muted"><span>{fmtDate(o.createdAt, t.locale)}</span>{o.expectedAt ? <span>→ {fmtDate(o.expectedAt, t.locale)}</span> : null}{o.status !== "RECEIVED" && o.status !== "CANCELLED" ? <Button size="sm" variant="primary" onClick={() => { setReceiving(o); setQtys(Object.fromEntries(o.lines.map((l) => [l.id, l.ordered - l.received]))); }}><PackageCheck /> {t("inventory.receive")}</Button> : null}</div></div>
            <ul className="mt-2 grid gap-1 text-[13px] sm:grid-cols-2">{o.lines.map((l) => <li key={l.id} className="flex justify-between rounded bg-hover px-2 py-1"><span>{l.product} <span className="mono text-subtle">{l.sku}</span></span><span className="tnum">{l.received}/{l.ordered} · {fmtMoney(l.unitCostCents, t.locale)}</span></li>)}</ul>
          </div>
        ))}
      </TabsContent>
      <TabsContent value="suppliers" className="mt-3">
        <div className="mb-2 flex justify-end"><Button onClick={() => setSupplierForm({})}><Plus /> {t("inventory.supplier")}</Button></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{suppliers.map((s) => <button key={s.id} type="button" onClick={() => setSupplierForm(s)} className="surface p-4 text-start hover:border-accent/50"><div className="font-medium">{s.name}</div><div className="text-[12.5px] text-muted">{s.email}<br />{s.phone}</div><div className="mt-2 text-[12px] text-subtle">{s.products} produits · délai {s.leadDays} j</div></button>)}</div>
      </TabsContent>

      <Sheet open={creating} onOpenChange={setCreating} title={t("inventory.newPo")} wide>
        <div className="space-y-3">
          <Field label={t("inventory.supplier")}><Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Livraison prévue"><Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} /></Field>
          {lines.map((l, i) => <div key={i} className="grid grid-cols-[1fr_70px_110px] gap-2"><Select value={l.productId} onChange={(e) => { const p = products.find((x) => x.id === e.target.value); setLines(lines.map((x, j) => (j === i ? { ...x, productId: e.target.value, unitCostCents: p?.costCents ?? x.unitCostCents } : x))); }}><option value="">—</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</Select><Input type="number" min={1} value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} /><MoneyInput valueCents={l.unitCostCents} onChangeCents={(c) => setLines(lines.map((x, j) => (j === i ? { ...x, unitCostCents: c } : x)))} /></div>)}
          <Button size="sm" onClick={() => setLines([...lines, { productId: "", qty: 1, unitCostCents: 0 }])}><Plus /> {t("tickets.detail.addLine")}</Button>
          <Field label={t("common.notes")}><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <div className="flex justify-between text-[13px]"><span className="text-muted">{t("common.total")} HT</span><span className="tnum font-semibold">{fmtMoney(lines.reduce((s, l) => s + l.qty * l.unitCostCents, 0), t.locale)}</span></div>
          <Button variant="primary" className="w-full" loading={pending} disabled={!supplierId || lines.length === 0 || lines.some((l) => !l.productId || l.qty < 1)} onClick={() => start(async () => { const r = await createPoAction({ supplierId, expectedAt: expected ? new Date(expected).toISOString() : null, notes, lines }); if (!r.ok) toast.error(r.error); else { toast.success(r.data.number); setCreating(false); setLines([]); router.refresh(); } })}>{t("common.confirm")}</Button>
        </div>
      </Sheet>
      <Dialog open={Boolean(receiving)} onOpenChange={(o) => !o && setReceiving(null)}>
        <DialogContent title={`${t("inventory.receive")} · ${receiving?.number ?? ""}`} size="md" description="Réception partielle possible : le reliquat reste attendu.">
          <ul className="space-y-2">{receiving?.lines.map((l) => <li key={l.id} className="grid grid-cols-[1fr_120px] items-center gap-2 text-[13px]"><span>{l.product}<span className="block text-[11.5px] text-muted">reliquat {l.ordered - l.received}</span></span><Input type="number" min={0} max={l.ordered - l.received} value={qtys[l.id] ?? 0} onChange={(e) => setQtys({ ...qtys, [l.id]: Number(e.target.value) })} /></li>)}</ul>
          <DialogFooter><Button onClick={() => setReceiving(null)}>{t("common.cancel")}</Button><Button variant="primary" loading={pending} onClick={() => start(async () => { const r = await receivePoAction(receiving!.id, Object.entries(qtys).map(([lineId, qty]) => ({ lineId, qty }))); if (!r.ok) toast.error(r.error); else { toast.success(t("inventory.receive")); setReceiving(null); router.refresh(); } })}>{t("common.confirm")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(supplierForm)} onOpenChange={(o) => !o && setSupplierForm(null)}>
        <DialogContent title={t("inventory.supplier")} size="sm">
          {supplierForm ? <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(async () => { const r = await upsertSupplierAction({ name: String(fd.get("name")), email: String(fd.get("email")), phone: String(fd.get("phone")), address: String(fd.get("address")), notes: String(fd.get("notes")), leadDays: Number(fd.get("leadDays")) }, supplierForm.id); if (!r.ok) toast.error(r.error); else { setSupplierForm(null); router.refresh(); } }); }}>
            <Field label="Nom"><Input name="name" defaultValue={supplierForm.name ?? ""} required /></Field><Field label="E-mail"><Input name="email" type="email" defaultValue={supplierForm.email ?? ""} /></Field><Field label="Téléphone"><Input name="phone" defaultValue={supplierForm.phone ?? ""} /></Field><Field label="Adresse"><Input name="address" defaultValue={supplierForm.address ?? ""} /></Field><Field label="Délai (jours)"><Input name="leadDays" type="number" defaultValue={supplierForm.leadDays ?? 5} /></Field><Field label={t("common.notes")}><Textarea name="notes" rows={2} defaultValue={supplierForm.notes ?? ""} /></Field>
            <Button type="submit" variant="primary" className="w-full" loading={pending}>{t("common.save")}</Button>
          </form> : null}
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
