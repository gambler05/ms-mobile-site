"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Search, LayoutGrid, LayoutList, Plus, Download, Bookmark, X, ScanLine, SlidersHorizontal } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtPercentBp } from "@/lib/format";
import { marginBp, PRODUCT_TYPES } from "@/lib/domain/inventory";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { Sheet, Dialog, DialogContent } from "@/components/ui/dialog";
import { Segmented, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/menu";
import { ProductForm } from "./product-form";
import { StockActions } from "./stock-actions";
import { BarcodeScanner } from "@/components/shared/barcode-scanner";
import { deleteFilterAction, saveFilterAction } from "@/app/actions/inventory";

export type ProductRow = { id: string; sku: string; barcode: string; name: string; type: string; brand: string; category: string; quality: string | null; supplier: string; costCents: number; priceCents: number; onHand: number; reserved: number; expected: number; available: number; alertThreshold: number; location: string; low: boolean; serialized: boolean; active: boolean; compat: string[] };

export function InventoryView({ rows, suppliers, categories, savedFilters, shops, perms }: { rows: ProductRow[]; suppliers: { id: string; name: string }[]; categories: string[]; savedFilters: { id: string; name: string; query: string }[]; shops: { id: string; name: string }[]; perms: { edit: boolean; adjust: boolean } }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const view = sp.get("view") ?? "table";
  const [selected, setSelected] = useState<ProductRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [scan, setScan] = useState(false);
  const [, start] = useTransition();
  const setParam = (k: string, v: string | null) => { const p = new URLSearchParams(sp.toString()); if (v) p.set(k, v); else p.delete(k); router.replace(`${pathname}?${p}`); };
  const exportUrl = `/api/export/inventory?${sp.toString()}`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Vue" value={view} onChange={(v) => setParam("view", v === "table" ? null : v)} options={[{ value: "table", label: <><LayoutList className="size-4" /> {t("inventory.views.table")}</> }, { value: "catalog", label: <><LayoutGrid className="size-4" /> {t("inventory.views.catalog")}</> }]} />
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" /><Input className="ps-8" defaultValue={sp.get("q") ?? ""} placeholder={`${t("common.search")} · SKU · code-barres · compatibilité`} onKeyDown={(e) => { if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value); }} aria-label={t("common.search")} /></div>
        <Button variant="ghost" size="icon" aria-label={t("inventory.scan")} onClick={() => setScan(true)}><ScanLine /></Button>
        <Select className="w-auto" value={sp.get("type") ?? ""} onChange={(e) => setParam("type", e.target.value || null)} aria-label="Type"><option value="">Type : {t("common.all")}</option>{PRODUCT_TYPES.map((x) => <option key={x} value={x}>{t(`inventory.types.${x}`)}</option>)}</Select>
        <Select className="w-auto" value={sp.get("category") ?? ""} onChange={(e) => setParam("category", e.target.value || null)} aria-label="Catégorie"><option value="">Catégorie : {t("common.all")}</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
        <Select className="w-auto" value={sp.get("supplier") ?? ""} onChange={(e) => setParam("supplier", e.target.value || null)} aria-label={t("inventory.supplier")}><option value="">{t("inventory.supplier")} : {t("common.all")}</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <Select className="w-auto" value={sp.get("sort") ?? ""} onChange={(e) => setParam("sort", e.target.value || null)} aria-label="Tri"><option value="">Tri : nom</option><option value="sku">SKU</option><option value="stock">{t("inventory.available")}</option><option value="margin">{t("inventory.margin")}</option><option value="price">{t("common.price")}</option></Select>
        <Button variant={sp.get("low") ? "danger" : "outline"} onClick={() => setParam("low", sp.get("low") ? null : "1")} aria-pressed={Boolean(sp.get("low"))}>{t("inventory.lowOnly")}</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost"><Bookmark className="size-4" /> {t("inventory.savedFilters")}</Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            {savedFilters.map((f) => <DropdownMenuItem key={f.id} onSelect={() => router.replace(`${pathname}?${f.query}`)}><SlidersHorizontal /> {f.name}<button type="button" className="ms-auto text-subtle hover:text-danger" aria-label="Supprimer" onClick={(e) => { e.stopPropagation(); start(async () => { await deleteFilterAction(f.id); router.refresh(); }); }}><X className="size-3.5" /></button></DropdownMenuItem>)}
            <DropdownMenuItem disabled={!sp.toString()} onSelect={() => { const name = prompt(t("inventory.saveFilter")); if (name) start(async () => { await saveFilterAction("inventory", name, sp.toString()); router.refresh(); }); }}><Plus /> {t("inventory.saveFilter")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {sp.toString() ? <Button variant="ghost" onClick={() => router.replace(pathname)}><X className="size-4" /> {t("common.reset")}</Button> : null}
        <div className="ms-auto flex gap-2"><Button asChild variant="ghost"><a href={exportUrl}><Download /> CSV</a></Button><Button asChild variant="ghost"><a href={`${exportUrl}&format=xlsx`}><Download /> Excel</a></Button>{perms.edit ? <Button variant="primary" onClick={() => setCreating(true)}><Plus /> {t("inventory.new")}</Button> : null}</div>
      </div>

      {rows.length === 0 ? <EmptyState title={t("inventory.empty")} action={perms.edit ? <Button variant="primary" onClick={() => setCreating(true)}>{t("inventory.new")}</Button> : undefined} /> : view === "catalog" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {rows.map((p) => <button key={p.id} type="button" onClick={() => setSelected(p)} className="surface flex flex-col p-3 text-start hover:border-accent/50"><div className="mb-2 flex h-20 items-center justify-center rounded-[var(--radius-sm)] bg-hover text-[11px] uppercase tracking-wide text-subtle">{t(`inventory.types.${p.type}` as never)}</div><div className="truncate-2 text-[13px] font-medium leading-tight">{p.name}</div><div className="mono mt-1 text-[11px] text-subtle">{p.sku}</div><div className="mt-2 flex items-center justify-between"><span className="tnum font-semibold">{fmtMoney(p.priceCents, t.locale)}</span><span className={cn("tnum text-[12px]", p.low ? "text-warning" : "text-muted")}>×{p.available}</span></div></button>)}
        </div>
      ) : (
        <>
          <div className="surface hidden overflow-hidden md:block">
            <Table>
              <THead><TR><TH>{t("inventory.sku")}</TH><TH>Produit</TH><TH>Type</TH><TH>{t("inventory.location")}</TH><TH className="text-end">{t("inventory.onHand")}</TH><TH className="text-end">{t("inventory.reserved")}</TH><TH className="text-end">{t("inventory.available")}</TH><TH className="text-end">{t("inventory.expected")}</TH><TH className="text-end">{t("inventory.cost")}</TH><TH className="text-end">{t("inventory.priceLabel")}</TH><TH className="text-end">{t("inventory.margin")}</TH></TR></THead>
              <TBody>{rows.map((p) => <TR key={p.id} interactive data-selected={selected?.id === p.id} onClick={() => setSelected(p)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setSelected(p); }}><TD><span className="mono">{p.sku}</span></TD><TD><div className="font-medium">{p.name}</div><div className="truncate text-[11.5px] text-muted">{[p.brand, p.category, p.quality && t(`inventory.quality.${p.quality}` as never)].filter(Boolean).join(" · ")}</div></TD><TD><Badge>{t(`inventory.types.${p.type}` as never)}</Badge></TD><TD className="text-muted">{p.location || "—"}</TD><TD className="tnum text-end">{p.onHand}</TD><TD className="tnum text-end text-muted">{p.reserved || "—"}</TD><TD className={cn("tnum text-end font-medium", p.low && "text-warning", p.available <= 0 && "text-danger")}>{p.available}{p.low ? " ⚠" : ""}</TD><TD className="tnum text-end text-muted">{p.expected || "—"}</TD><TD className="tnum text-end text-muted">{fmtMoney(p.costCents, t.locale)}</TD><TD className="tnum text-end">{fmtMoney(p.priceCents, t.locale)}</TD><TD className="tnum text-end text-muted">{p.priceCents ? fmtPercentBp(marginBp(p.priceCents, p.costCents), t.locale) : "—"}</TD></TR>)}</TBody>
            </Table>
          </div>
          <ul className="space-y-2 md:hidden">{rows.map((p) => <li key={p.id}><button type="button" onClick={() => setSelected(p)} className="surface block w-full p-3 text-start"><div className="flex justify-between"><span className="font-medium">{p.name}</span><span className={cn("tnum", p.low && "text-warning")}>×{p.available}</span></div><div className="mono text-[11.5px] text-muted">{p.sku} · {fmtMoney(p.priceCents, t.locale)}</div></button></li>)}</ul>
        </>
      )}

      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)} title={selected?.name ?? ""} description={selected ? <span className="mono">{selected.sku}</span> : undefined}>
        {selected ? <div className="space-y-4 text-[13.5px]">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <dt className="text-muted">{t("inventory.available")}</dt><dd className={cn("tnum font-semibold", selected.low && "text-warning")}>{selected.available} <span className="text-[11.5px] font-normal text-muted">({selected.onHand} − {selected.reserved})</span></dd>
            <dt className="text-muted">{t("inventory.expected")}</dt><dd className="tnum">{selected.expected}</dd>
            <dt className="text-muted">{t("inventory.threshold")}</dt><dd className="tnum">{selected.alertThreshold}</dd>
            <dt className="text-muted">{t("inventory.location")}</dt><dd>{selected.location || "—"}</dd>
            <dt className="text-muted">{t("inventory.cost")}</dt><dd className="tnum">{fmtMoney(selected.costCents, t.locale)}</dd>
            <dt className="text-muted">{t("inventory.priceLabel")}</dt><dd className="tnum">{fmtMoney(selected.priceCents, t.locale)} <span className="text-[11.5px] text-muted">({fmtPercentBp(marginBp(selected.priceCents, selected.costCents), t.locale)})</span></dd>
            <dt className="text-muted">{t("inventory.supplier")}</dt><dd>{selected.supplier || "—"}</dd>
            <dt className="text-muted">{t("inventory.compatibilities")}</dt><dd className="flex flex-wrap gap-1">{selected.compat.length ? selected.compat.map((c) => <Badge key={c} tone="outline">{c}</Badge>) : "—"}</dd>
          </dl>
          {perms.adjust ? <StockActions product={selected} shops={shops} onDone={() => { setSelected(null); router.refresh(); }} /> : null}
          <Button asChild variant="primary" className="w-full"><Link href={`/inventory/${selected.id}`}>{t("common.openFull")}</Link></Button>
        </div> : null}
      </Sheet>
      <Sheet open={creating} onOpenChange={setCreating} title={t("inventory.new")} wide><ProductForm suppliers={suppliers} onDone={(id) => { setCreating(false); router.push(`/inventory/${id}`); }} /></Sheet>
      <Dialog open={scan} onOpenChange={setScan}><DialogContent title={t("inventory.scan")} size="sm" description={t("inventory.scanHint")}><BarcodeScanner manualLabel={t("inventory.scanManual")} onDetected={(code) => { setScan(false); const hit = rows.find((r) => r.barcode === code || r.sku === code.toUpperCase()); if (hit) setSelected(hit); else { setParam("q", code); toast.message(code); } }} /></DialogContent></Dialog>
    </div>
  );
}
