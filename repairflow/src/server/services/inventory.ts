import { z } from "zod";
import { prisma } from "@/server/db";
import type { Ctx } from "@/server/auth/guard";
import { audit } from "@/server/audit";
import { ConflictError, DomainError, NotFoundError } from "@/server/errors";
import { PART_QUALITIES, PRODUCT_TYPES } from "@/lib/domain/inventory";
import { applyMovement } from "./stock";
import { nextNumber } from "./counters";
import { emitEvent } from "./notifications";

export const productSchema = z.object({
  sku: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9._-]+$/, "SKU : lettres, chiffres, . _ -"),
  barcode: z.string().trim().max(40).default(""),
  name: z.string().trim().min(2).max(160),
  type: z.enum(PRODUCT_TYPES),
  brand: z.string().trim().max(60).default(""),
  category: z.string().trim().max(60).default(""),
  quality: z.enum(PART_QUALITIES).nullable().default(null),
  supplierId: z.string().nullable().default(null),
  supplierRef: z.string().trim().max(60).default(""),
  costCents: z.number().int().min(0).default(0),
  priceCents: z.number().int().min(0).default(0),
  taxRateBp: z.number().int().min(0).max(5000).default(2000),
  alertThreshold: z.number().int().min(0).default(2),
  compatibilities: z.array(z.string().trim().min(1).max(80)).default([]),
  serialized: z.boolean().default(false),
  active: z.boolean().default(true),
  description: z.string().max(2000).default(""),
  location: z.string().trim().max(60).default(""),
});
export type ProductInput = z.infer<typeof productSchema>;

export interface ProductFilters {
  q?: string;
  type?: string;
  category?: string;
  supplierId?: string;
  low?: boolean;
  inactive?: boolean;
  sort?: "name" | "sku" | "stock" | "margin" | "price";
}

export async function listProducts(ctx: Ctx, f: ProductFilters = {}) {
  const rows = await prisma.product.findMany({
    where: {
      orgId: ctx.orgId,
      active: f.inactive ? undefined : true,
      ...(f.type ? { type: f.type } : {}),
      ...(f.category ? { category: f.category } : {}),
      ...(f.supplierId ? { supplierId: f.supplierId } : {}),
      ...(f.q ? { OR: [{ name: { contains: f.q } }, { sku: { contains: f.q.toUpperCase() } }, { barcode: { contains: f.q } }, { brand: { contains: f.q } }, { compatibilitiesJson: { contains: f.q } }] } : {}),
    },
    include: { stockLevels: { where: { shopId: ctx.shopId } }, supplier: { select: { name: true } } },
    orderBy: f.sort === "sku" ? { sku: "asc" } : f.sort === "price" ? { priceCents: "desc" } : { name: "asc" },
    take: 1000,
  });
  const mapped = rows.map((p) => {
    const lvl = p.stockLevels[0];
    const onHand = lvl?.onHand ?? 0;
    const reserved = lvl?.reserved ?? 0;
    return { ...p, onHand, reserved, expected: lvl?.expected ?? 0, available: onHand - reserved, location: lvl?.location ?? "", low: onHand - reserved <= p.alertThreshold };
  });
  const filtered = f.low ? mapped.filter((p) => p.low && p.type !== "USED_DEVICE" && p.type !== "NEW_DEVICE") : mapped;
  if (f.sort === "stock") filtered.sort((a, b) => a.available - b.available);
  if (f.sort === "margin") filtered.sort((a, b) => b.priceCents - b.costCents - (a.priceCents - a.costCents));
  return filtered;
}

export async function getProduct(ctx: Ctx, id: string) {
  const p = await prisma.product.findFirst({
    where: { id, orgId: ctx.orgId },
    include: { stockLevels: { include: { shop: true } }, supplier: true, movements: { orderBy: { createdAt: "desc" }, take: 50 }, units: { orderBy: { createdAt: "desc" } }, attachments: true },
  });
  if (!p) throw new NotFoundError("Produit introuvable");
  return p;
}

export async function createProduct(ctx: Ctx, raw: ProductInput, initialQty = 0) {
  const input = productSchema.parse(raw);
  const { compatibilities, location, ...data } = input;
  const dup = await prisma.product.findUnique({ where: { orgId_sku: { orgId: ctx.orgId, sku: input.sku.toUpperCase() } } });
  if (dup) throw new ConflictError(`Le SKU ${input.sku} existe déjà`);
  const product = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({ data: { ...data, sku: input.sku.toUpperCase(), orgId: ctx.orgId, compatibilitiesJson: JSON.stringify(compatibilities) } });
    await tx.stockLevel.create({ data: { productId: p.id, shopId: ctx.shopId, location } });
    if (initialQty > 0) await applyMovement(tx, { orgId: ctx.orgId, shopId: ctx.shopId, productId: p.id, type: "IN", qty: initialQty, reason: "Stock initial", unitCostCents: p.costCents, authorId: ctx.user.id });
    return p;
  });
  await audit(ctx, "product.create", "Product", product.id, {}, input);
  return product;
}

export async function updateProduct(ctx: Ctx, id: string, raw: Partial<ProductInput>) {
  const existing = await prisma.product.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!existing) throw new NotFoundError("Produit introuvable");
  const input = productSchema.partial().parse(raw);
  const { compatibilities, location, ...data } = input;
  await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data: { ...data, ...(data.sku ? { sku: data.sku.toUpperCase() } : {}), ...(compatibilities ? { compatibilitiesJson: JSON.stringify(compatibilities) } : {}) } });
    if (location !== undefined) {
      await tx.stockLevel.upsert({ where: { productId_shopId: { productId: id, shopId: ctx.shopId } }, create: { productId: id, shopId: ctx.shopId, location }, update: { location } });
    }
  });
  await audit(ctx, "product.update", "Product", id, existing, input);
}

// ---------------------------------------------------------------------------
// Fournisseurs et commandes
// ---------------------------------------------------------------------------

export const supplierSchema = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().max(160).default(""), phone: z.string().trim().max(30).default(""), address: z.string().max(200).default(""), notes: z.string().max(1000).default(""), leadDays: z.number().int().min(0).max(120).default(5) });

export async function upsertSupplier(ctx: Ctx, raw: z.infer<typeof supplierSchema>, id?: string) {
  const data = supplierSchema.parse(raw);
  if (id) {
    const s = await prisma.supplier.findFirst({ where: { id, orgId: ctx.orgId } });
    if (!s) throw new NotFoundError();
    return prisma.supplier.update({ where: { id }, data });
  }
  return prisma.supplier.create({ data: { ...data, orgId: ctx.orgId } });
}

export async function createPurchaseOrder(ctx: Ctx, input: { supplierId: string; expectedAt?: string | null; notes?: string; lines: { productId: string; qty: number; unitCostCents: number }[] }) {
  const parsed = z.object({ supplierId: z.string(), expectedAt: z.string().datetime().nullable().optional(), notes: z.string().max(1000).default(""), lines: z.array(z.object({ productId: z.string(), qty: z.number().int().positive(), unitCostCents: z.number().int().min(0) })).min(1) }).parse(input);
  const supplier = await prisma.supplier.findFirst({ where: { id: parsed.supplierId, orgId: ctx.orgId } });
  if (!supplier) throw new NotFoundError("Fournisseur introuvable");
  const po = await prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, ctx.shopId, "PO", "CMD");
    const p = await tx.purchaseOrder.create({
      data: { orgId: ctx.orgId, shopId: ctx.shopId, supplierId: parsed.supplierId, number, status: "ORDERED", expectedAt: parsed.expectedAt ? new Date(parsed.expectedAt) : null, notes: parsed.notes, createdById: ctx.user.id, lines: { create: parsed.lines.map((l) => ({ productId: l.productId, qtyOrdered: l.qty, unitCostCents: l.unitCostCents })) } },
    });
    for (const l of parsed.lines) {
      await tx.stockLevel.upsert({ where: { productId_shopId: { productId: l.productId, shopId: ctx.shopId } }, create: { productId: l.productId, shopId: ctx.shopId, expected: l.qty }, update: { expected: { increment: l.qty } } });
    }
    return p;
  });
  await audit(ctx, "po.create", "PurchaseOrder", po.id, {}, parsed);
  return po;
}

/** Réception partielle : chaque ligne reçue crée un mouvement RECEPTION ; le statut passe à PARTIAL ou RECEIVED. */
export async function receivePurchaseOrder(ctx: Ctx, poId: string, received: { lineId: string; qty: number }[]) {
  const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, orgId: ctx.orgId }, include: { lines: { include: { product: true } } } });
  if (!po) throw new NotFoundError("Commande introuvable");
  if (po.status === "RECEIVED" || po.status === "CANCELLED") throw new ConflictError("Commande déjà clôturée");
  const receivedLines: { productName: string; productId: string; qty: number }[] = [];
  await prisma.$transaction(async (tx) => {
    for (const r of received) {
      const line = po.lines.find((l) => l.id === r.lineId);
      if (!line || r.qty <= 0) continue;
      const remaining = line.qtyOrdered - line.qtyReceived;
      if (r.qty > remaining) throw new DomainError(`${line.product.name} : quantité reçue supérieure au reliquat (${remaining})`);
      await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { qtyReceived: { increment: r.qty } } });
      await applyMovement(tx, { orgId: ctx.orgId, shopId: po.shopId, productId: line.productId, type: "RECEPTION", qty: r.qty, refType: "PO", refId: po.id, unitCostCents: line.unitCostCents, authorId: ctx.user.id, reason: `Réception ${po.number}` });
      await tx.stockLevel.update({ where: { productId_shopId: { productId: line.productId, shopId: po.shopId } }, data: { expected: { decrement: Math.min(r.qty, remaining) } } });
      receivedLines.push({ productName: line.product.name, productId: line.productId, qty: r.qty });
    }
    const fresh = await tx.purchaseOrderLine.findMany({ where: { poId } });
    const complete = fresh.every((l) => l.qtyReceived >= l.qtyOrdered);
    await tx.purchaseOrder.update({ where: { id: poId }, data: { status: complete ? "RECEIVED" : "PARTIAL" } });
  });
  await audit(ctx, "po.receive", "PurchaseOrder", poId, {}, received);
  // Notifie les tickets bloqués « pièce attendue » utilisant ce produit.
  for (const r of receivedLines) {
    const waiting = await prisma.repairTicket.findMany({ where: { shopId: po.shopId, blockReason: "PART_AWAITED", parts: { some: { productId: r.productId, status: "RESERVED" } } }, select: { id: true, number: true, technicianId: true } });
    for (const t of waiting) {
      await emitEvent({ orgId: ctx.orgId, shopId: po.shopId, event: "PART_RECEIVED", occurrenceKey: `part:${po.id}:${r.productId}:${t.id}`, title: `Pièce reçue pour ${t.number}`, body: r.productName, link: `/repairs/${t.id}`, entityType: "RepairTicket", entityId: t.id, userId: t.technicianId ?? undefined, urgent: true });
    }
  }
}

// ---------------------------------------------------------------------------
// Inventaire physique
// ---------------------------------------------------------------------------

export async function startInventoryCount(ctx: Ctx, label: string, productType?: string) {
  const products = await prisma.product.findMany({ where: { orgId: ctx.orgId, active: true, serialized: false, ...(productType ? { type: productType } : {}) }, include: { stockLevels: { where: { shopId: ctx.shopId } } } });
  const count = await prisma.inventoryCount.create({
    data: { shopId: ctx.shopId, label, createdById: ctx.user.id, lines: { create: products.map((p) => ({ productId: p.id, expectedQty: p.stockLevels[0]?.onHand ?? 0 })) } },
  });
  await audit(ctx, "count.start", "InventoryCount", count.id, {}, { label, lines: products.length });
  return count;
}

export async function saveCountLine(ctx: Ctx, countId: string, productId: string, countedQty: number | null, note = "") {
  const c = await prisma.inventoryCount.findFirst({ where: { id: countId, shopId: ctx.shopId, status: "OPEN" } });
  if (!c) throw new ConflictError("Inventaire clos ou introuvable");
  await prisma.inventoryCountLine.update({ where: { countId_productId: { countId, productId } }, data: { countedQty, note } });
}

/** Validation : chaque écart devient un mouvement COUNT motivé ; l'inventaire devient immuable. */
export async function validateInventoryCount(ctx: Ctx, countId: string) {
  const c = await prisma.inventoryCount.findFirst({ where: { id: countId, shopId: ctx.shopId, status: "OPEN" }, include: { lines: { include: { product: true } } } });
  if (!c) throw new ConflictError("Inventaire clos ou introuvable");
  let adjustments = 0;
  await prisma.$transaction(async (tx) => {
    for (const l of c.lines) {
      if (l.countedQty === null) continue;
      const level = await tx.stockLevel.findUnique({ where: { productId_shopId: { productId: l.productId, shopId: ctx.shopId } } });
      const current = level?.onHand ?? 0;
      const delta = l.countedQty - current;
      if (delta === 0) continue;
      await applyMovement(tx, { orgId: ctx.orgId, shopId: ctx.shopId, productId: l.productId, type: "COUNT", qty: delta, allowNegative: true, refType: "COUNT", refId: countId, unitCostCents: l.product.costCents, authorId: ctx.user.id, reason: `Inventaire ${c.label}${l.note ? " : " + l.note : ""}` });
      adjustments++;
    }
    await tx.inventoryCount.update({ where: { id: countId }, data: { status: "VALIDATED", validatedAt: new Date() } });
  });
  await audit(ctx, "count.validate", "InventoryCount", countId, {}, { adjustments });
  return adjustments;
}

// ---------------------------------------------------------------------------
// Import CSV : prévisualisation, mapping, rapport d'erreurs, puis application
// ---------------------------------------------------------------------------

import { type ImportField, type ImportRowResult as GenericImportRowResult } from "@/lib/domain/import";
export type { ImportField } from "@/lib/domain/import";
export type ImportRowResult = GenericImportRowResult<ProductInput & { qty: number }>;

function toCents(v: string): number | null {
  const cleaned = v.replace(/\s|€/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [i, f = ""] = cleaned.split(".");
  return Number(i) * 100 + Number((f + "00").slice(0, 2));
}

export async function previewImport(ctx: Ctx, rows: Record<string, string>[], mapping: Partial<Record<ImportField, string>>): Promise<ImportRowResult[]> {
  const existing = new Set((await prisma.product.findMany({ where: { orgId: ctx.orgId }, select: { sku: true } })).map((p) => p.sku));
  const seen = new Set<string>();
  return rows.map((r, idx) => {
    const get = (f: ImportField) => (mapping[f] ? (r[mapping[f]!] ?? "").trim() : "");
    const errors: string[] = [];
    const sku = get("sku").toUpperCase();
    if (!sku) errors.push("SKU manquant");
    if (seen.has(sku)) errors.push("SKU en double dans le fichier");
    seen.add(sku);
    const type = get("type").toUpperCase();
    if (!PRODUCT_TYPES.includes(type as never)) errors.push(`Type inconnu « ${get("type")} » (attendu : ${PRODUCT_TYPES.join(", ")})`);
    const cost = get("costCents") ? toCents(get("costCents")) : 0;
    const price = get("priceCents") ? toCents(get("priceCents")) : 0;
    if (cost === null) errors.push("Prix d'achat invalide");
    if (price === null) errors.push("Prix de vente invalide");
    const qty = get("qty") ? Number(get("qty")) : 0;
    if (!Number.isInteger(qty) || qty < 0) errors.push("Quantité invalide");
    const quality = get("quality").toUpperCase();
    const parsed = productSchema.safeParse({
      sku,
      name: get("name"),
      type,
      brand: get("brand"),
      category: get("category"),
      quality: PART_QUALITIES.includes(quality as never) ? quality : null,
      barcode: get("barcode"),
      costCents: cost ?? 0,
      priceCents: price ?? 0,
      taxRateBp: get("taxRateBp") ? Math.round(Number(get("taxRateBp").replace(",", ".")) * 100) : 2000,
      alertThreshold: get("alertThreshold") ? Number(get("alertThreshold")) : 2,
      compatibilities: get("compatibilities") ? get("compatibilities").split(/[;|]/).map((s) => s.trim()).filter(Boolean) : [],
      supplierRef: get("supplierRef"),
      location: get("location"),
    });
    if (!parsed.success) errors.push(...parsed.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`));
    return { row: idx + 2, ok: errors.length === 0, errors, data: parsed.success ? { ...parsed.data, qty } : undefined, action: existing.has(sku) ? "update" : "create" };
  });
}

export async function applyImport(ctx: Ctx, results: ImportRowResult[]) {
  let created = 0;
  let updated = 0;
  for (const r of results) {
    if (!r.ok || !r.data) continue;
    const { qty, ...data } = r.data;
    const existing = await prisma.product.findUnique({ where: { orgId_sku: { orgId: ctx.orgId, sku: data.sku } } });
    if (existing) {
      await updateProduct(ctx, existing.id, data);
      updated++;
    } else {
      await createProduct(ctx, data, qty);
      created++;
    }
  }
  await audit(ctx, "inventory.import", "Product", "batch", {}, { created, updated, rejected: results.filter((r) => !r.ok).length });
  return { created, updated };
}
