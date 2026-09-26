"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/menu";
import { PART_QUALITIES, PRODUCT_TYPES } from "@/lib/domain/inventory";
import { createProductAction, updateProductAction } from "@/app/actions/inventory";
import { parseAmountToCents } from "@/lib/money";

const schema = z.object({
  sku: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9._-]+$/, "Lettres, chiffres, . _ -"),
  barcode: z.string().max(40),
  name: z.string().trim().min(2).max(160),
  type: z.enum(PRODUCT_TYPES),
  brand: z.string().max(60),
  category: z.string().max(60),
  quality: z.string(),
  supplierId: z.string(),
  supplierRef: z.string().max(60),
  cost: z.string().refine((v) => parseAmountToCents(v) !== null, "Montant invalide"),
  price: z.string().refine((v) => parseAmountToCents(v) !== null, "Montant invalide"),
  taxRate: z.string(),
  alertThreshold: z.coerce.number<number>().int().min(0),
  compat: z.string(),
  location: z.string().max(60),
  serialized: z.boolean(),
  active: z.boolean(),
  description: z.string().max(2000),
  initialQty: z.coerce.number<number>().int().min(0),
});
type F = z.infer<typeof schema>;

export function ProductForm({ suppliers, initial, id, onDone }: { suppliers: { id: string; name: string }[]; initial?: Partial<F>; id?: string; onDone: (id: string) => void }) {
  const t = useT();
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<F>({ resolver: zodResolver(schema), defaultValues: { sku: "", barcode: "", name: "", type: "PART", brand: "", category: "", quality: "", supplierId: "", supplierRef: "", cost: "0,00", price: "0,00", taxRate: "20", alertThreshold: 2, compat: "", location: "", serialized: false, active: true, description: "", initialQty: 0, ...initial } });
  const submit = handleSubmit(async (v) => {
    const payload = { sku: v.sku, barcode: v.barcode, name: v.name, type: v.type, brand: v.brand, category: v.category, quality: (v.quality || null) as never, supplierId: v.supplierId || null, supplierRef: v.supplierRef, costCents: parseAmountToCents(v.cost)!, priceCents: parseAmountToCents(v.price)!, taxRateBp: Math.round(Number(v.taxRate.replace(",", ".")) * 100), alertThreshold: v.alertThreshold, compatibilities: v.compat.split(/[;,|]/).map((x: string) => x.trim()).filter(Boolean), serialized: v.serialized, active: v.active, description: v.description, location: v.location };
    const r = id ? await updateProductAction(id, payload) : await createProductAction(payload, v.initialQty);
    if (!r.ok) return toast.error(r.error);
    toast.success(t("common.save"));
    onDone(id ?? (r.data as { id: string }).id);
  });
  const type = watch("type");
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <Field label="Nom" id="name" className="col-span-2" error={errors.name?.message}><Input id="name" {...register("name")} /></Field>
      <Field label={t("inventory.sku")} id="sku" error={errors.sku?.message}><Input id="sku" className="mono" {...register("sku")} /></Field>
      <Field label={t("inventory.barcode")} id="barcode"><Input id="barcode" className="mono" {...register("barcode")} /></Field>
      <Field label="Type" id="type"><Select id="type" {...register("type")}>{PRODUCT_TYPES.map((x) => <option key={x} value={x}>{t(`inventory.types.${x}`)}</option>)}</Select></Field>
      {type === "PART" ? <Field label="Qualité" id="quality"><Select id="quality" {...register("quality")}><option value="">—</option>{PART_QUALITIES.map((q) => <option key={q} value={q}>{t(`inventory.quality.${q}`)}</option>)}</Select></Field> : <div />}
      <Field label="Marque" id="brand"><Input id="brand" {...register("brand")} /></Field>
      <Field label="Catégorie" id="category"><Input id="category" {...register("category")} /></Field>
      <Field label={t("inventory.supplier")} id="supplierId"><Select id="supplierId" {...register("supplierId")}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
      <Field label={t("inventory.supplierRef")} id="supplierRef"><Input id="supplierRef" className="mono" {...register("supplierRef")} /></Field>
      <Field label={`${t("inventory.cost")} (€)`} id="cost" error={errors.cost?.message}><Input id="cost" inputMode="decimal" className="tnum" {...register("cost")} /></Field>
      <Field label={`${t("inventory.priceLabel")} TTC (€)`} id="price" error={errors.price?.message}><Input id="price" inputMode="decimal" className="tnum" {...register("price")} /></Field>
      <Field label="TVA (%)" id="taxRate"><Input id="taxRate" inputMode="decimal" {...register("taxRate")} /></Field>
      <Field label={t("inventory.threshold")} id="alertThreshold"><Input id="alertThreshold" type="number" min={0} {...register("alertThreshold")} /></Field>
      <Field label={t("inventory.compatibilities")} id="compat" className="col-span-2" hint="séparées par ; ou ,"><Input id="compat" placeholder="iPhone 13; iPhone 13 mini" {...register("compat")} /></Field>
      <Field label={t("inventory.location")} id="location"><Input id="location" placeholder="Tiroir A1" {...register("location")} /></Field>
      {!id ? <Field label="Stock initial" id="initialQty"><Input id="initialQty" type="number" min={0} {...register("initialQty")} disabled={watch("serialized")} /></Field> : <div />}
      <label className="flex items-center justify-between gap-2 text-[13px]"><span>{t("inventory.serialized")}</span><Switch checked={watch("serialized")} onCheckedChange={(v) => setValue("serialized", v)} /></label>
      <label className="flex items-center justify-between gap-2 text-[13px]"><span>Actif</span><Switch checked={watch("active")} onCheckedChange={(v) => setValue("active", v)} /></label>
      <Field label="Description" id="description" className="col-span-2"><Textarea id="description" rows={3} {...register("description")} /></Field>
      <Button type="submit" variant="primary" className="col-span-2" loading={isSubmitting}>{t("common.save")}</Button>
    </form>
  );
}
