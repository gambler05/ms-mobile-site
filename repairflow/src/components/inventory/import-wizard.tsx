"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { toast } from "sonner";
import { Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { applyImportAction, previewImportAction } from "@/app/actions/inventory";
import { IMPORT_FIELDS, type ImportField } from "@/lib/domain/import";
import type { ImportRowResult } from "@/server/services/inventory";

const AUTO: Record<string, ImportField> = { sku: "sku", référence: "sku", reference: "sku", nom: "name", name: "name", désignation: "name", type: "type", marque: "brand", brand: "brand", catégorie: "category", category: "category", qualité: "quality", quality: "quality", "code-barres": "barcode", ean: "barcode", barcode: "barcode", "prix d'achat": "costCents", cost: "costCents", achat: "costCents", "prix de vente": "priceCents", price: "priceCents", vente: "priceCents", tva: "taxRateBp", seuil: "alertThreshold", compatibilités: "compatibilities", compat: "compatibilities", "réf fournisseur": "supplierRef", quantité: "qty", qty: "qty", stock: "qty", emplacement: "location", location: "location" };

export function ImportWizard() {
  const t = useT();
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<ImportField, string>>>({});
  const [preview, setPreview] = useState<ImportRowResult[] | null>(null);
  const [done, setDone] = useState<{ created: number; updated: number } | null>(null);
  const [pending, start] = useTransition();

  const load = async (file: File) => {
    let data: Record<string, string>[] = [];
    if (/\.xlsx?$/i.test(file.name)) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) return toast.error("Feuille vide");
      const header = (ws.getRow(1).values as unknown[]).slice(1).map((v) => String(v ?? "").trim());
      ws.eachRow((row, n) => { if (n === 1) return; const vals = (row.values as unknown[]).slice(1); const obj: Record<string, string> = {}; header.forEach((h, i) => { obj[h] = String(vals[i] ?? "").trim(); }); data.push(obj); });
    } else {
      const text = await file.text();
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, delimiter: text.includes(";") ? ";" : "," });
      data = parsed.data;
    }
    const cols = Object.keys(data[0] ?? {});
    setRows(data);
    setColumns(cols);
    const auto: Partial<Record<ImportField, string>> = {};
    for (const c of cols) { const f = AUTO[c.toLowerCase().trim()]; if (f && !auto[f]) auto[f] = c; }
    setMapping(auto);
    setPreview(null);
    setDone(null);
  };
  const valid = preview?.filter((r) => r.ok).length ?? 0;
  const invalid = preview?.filter((r) => !r.ok).length ?? 0;

  return (
    <div className="space-y-4">
      <section className="surface p-5">
        <h2 className="text-[14px] font-semibold">{t("inventory.importStep1")}</h2>
        <label className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-border-strong px-6 py-8 text-[13px] text-muted hover:border-accent hover:text-fg"><Upload className="size-6" />CSV (; ou ,) ou Excel .xlsx — colonnes libres, correspondance à l'étape 2<input type="file" accept=".csv,.xlsx,.xls,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])} /></label>
        {rows.length ? <p className="mt-2 text-[12.5px] text-muted">{rows.length} lignes · {columns.length} colonnes</p> : null}
        <a className="mt-2 inline-block text-[12px] text-accent hover:underline" download="modele-import-stock.csv" href={"data:text/csv;charset=utf-8," + encodeURIComponent("sku;name;type;brand;category;quality;barcode;cost;price;tva;seuil;compat;qty;location\nSCR-IP15;Écran iPhone 15;PART;Apple;Écrans;COMPATIBLE;3700000000999;62,00;179,00;20;2;iPhone 15;3;Tiroir A2")}>Télécharger un modèle</a>
      </section>
      {columns.length ? (
        <section className="surface p-5">
          <h2 className="text-[14px] font-semibold">{t("inventory.importStep2")}</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">{IMPORT_FIELDS.map((f) => <label key={f} className="text-[12.5px]"><span className={cn("mb-1 block text-muted", (f === "sku" || f === "name" || f === "type") && "font-medium text-fg")}>{f}{f === "sku" || f === "name" || f === "type" ? " *" : ""}</span><Select value={mapping[f] ?? ""} onChange={(e) => setMapping({ ...mapping, [f]: e.target.value || undefined })}><option value="">—</option>{columns.map((c) => <option key={c} value={c}>{c}</option>)}</Select></label>)}</div>
          <Button className="mt-4" variant="primary" loading={pending} disabled={!mapping.sku || !mapping.name || !mapping.type} onClick={() => start(async () => { const r = await previewImportAction(rows, mapping); if (r.ok) setPreview(r.data); else toast.error(r.error); })}>{t("inventory.importStep3")}</Button>
        </section>
      ) : null}
      {preview ? (
        <section className="surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-[14px] font-semibold">{t("inventory.importStep3")}</h2><div className="flex gap-3 text-[13px]"><span className="flex items-center gap-1 text-success"><CheckCircle2 className="size-4" /> {valid} valides</span><span className="flex items-center gap-1 text-danger"><AlertTriangle className="size-4" /> {t("inventory.importErrors", { n: invalid })}</span></div></div>
          <div className="mt-3 max-h-[420px] overflow-auto rounded-[var(--radius-sm)] border border-border scroll-thin">
            <Table><THead><TR><TH>Ligne</TH><TH>SKU</TH><TH>Nom</TH><TH>Action</TH><TH>Erreurs</TH></TR></THead><TBody>{preview.map((r) => <TR key={r.row} className={cn(!r.ok && "bg-danger-soft/30")}><TD className="tnum">{r.row}</TD><TD className="mono">{r.data?.sku ?? "—"}</TD><TD>{r.data?.name ?? "—"}</TD><TD>{r.ok ? <span className={r.action === "create" ? "text-success" : "text-accent"}>{r.action === "create" ? "création" : "mise à jour"}</span> : "rejetée"}</TD><TD className="text-[12px] text-danger">{r.errors.join(" · ")}</TD></TR>)}</TBody></Table>
          </div>
          {!done ? <Button className="mt-4" variant="primary" disabled={valid === 0} loading={pending} onClick={() => start(async () => { const r = await applyImportAction(preview); if (r.ok) { setDone(r.data); toast.success(`${r.data.created} créés, ${r.data.updated} mis à jour`); router.refresh(); } else toast.error(r.error); })}>{t("inventory.importApply", { n: valid })}</Button> : <p className="mt-4 rounded-[var(--radius-sm)] bg-success-soft px-3 py-2 text-[13px] text-success">✓ {done.created} créés · {done.updated} mis à jour · {invalid} rejetés (non importés)</p>}
        </section>
      ) : null}
    </div>
  );
}
