"use server";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/auth/guard";
import * as I from "@/server/services/inventory";
import { adjustStock, transferStock } from "@/server/services/stock";
import { prisma } from "@/server/db";
import { safeAction } from "./util";

const refresh = () => { revalidatePath("/inventory"); revalidatePath("/"); };

export async function createProductAction(input: I.ProductInput, initialQty: number) {
  return safeAction(async () => { const ctx = await requireCtx("inventory.edit"); const p = await I.createProduct(ctx, input, initialQty); refresh(); return { id: p.id }; });
}
export async function updateProductAction(id: string, input: Partial<I.ProductInput>) {
  return safeAction(async () => { const ctx = await requireCtx("inventory.edit"); await I.updateProduct(ctx, id, input); refresh(); revalidatePath(`/inventory/${id}`); });
}
export async function adjustStockAction(productId: string, qty: number, reason: string) {
  return safeAction(async () => { const ctx = await requireCtx("inventory.adjust"); await adjustStock(ctx, { productId, qty, reason }); refresh(); revalidatePath(`/inventory/${productId}`); });
}
export async function transferStockAction(productId: string, toShopId: string, qty: number, reason: string) {
  return safeAction(async () => { const ctx = await requireCtx("inventory.adjust"); await transferStock(ctx, { productId, toShopId, qty, reason }); refresh(); revalidatePath(`/inventory/${productId}`); });
}
export async function upsertSupplierAction(input: Parameters<typeof I.upsertSupplier>[1], id?: string) {
  return safeAction(async () => { const ctx = await requireCtx("purchasing.manage"); const s = await I.upsertSupplier(ctx, input, id); revalidatePath("/inventory/purchasing"); return { id: s.id }; });
}
export async function createPoAction(input: Parameters<typeof I.createPurchaseOrder>[1]) {
  return safeAction(async () => { const ctx = await requireCtx("purchasing.manage"); const po = await I.createPurchaseOrder(ctx, input); revalidatePath("/inventory/purchasing"); refresh(); return { id: po.id, number: po.number }; });
}
export async function receivePoAction(poId: string, lines: { lineId: string; qty: number }[]) {
  return safeAction(async () => { const ctx = await requireCtx("purchasing.manage"); await I.receivePurchaseOrder(ctx, poId, lines); revalidatePath("/inventory/purchasing"); refresh(); });
}
export async function startCountAction(label: string, type?: string) {
  return safeAction(async () => { const ctx = await requireCtx("inventory.count"); const c = await I.startInventoryCount(ctx, label, type || undefined); revalidatePath("/inventory/counts"); return { id: c.id }; });
}
export async function saveCountLineAction(countId: string, productId: string, counted: number | null, note: string) {
  return safeAction(async () => { const ctx = await requireCtx("inventory.count"); await I.saveCountLine(ctx, countId, productId, counted, note); });
}
export async function validateCountAction(countId: string) {
  return safeAction(async () => { const ctx = await requireCtx("inventory.count"); const n = await I.validateInventoryCount(ctx, countId); revalidatePath("/inventory/counts"); refresh(); return { adjustments: n }; });
}
export async function previewImportAction(rows: Record<string, string>[], mapping: Partial<Record<I.ImportField, string>>) {
  return safeAction(async () => { const ctx = await requireCtx("inventory.import"); return I.previewImport(ctx, rows.slice(0, 2000), mapping); });
}
export async function applyImportAction(results: I.ImportRowResult[]) {
  return safeAction(async () => { const ctx = await requireCtx("inventory.import"); const r = await I.applyImport(ctx, results); refresh(); return r; });
}
export async function saveFilterAction(module: string, name: string, query: string) {
  return safeAction(async () => { const ctx = await requireCtx(); await prisma.savedFilter.create({ data: { userId: ctx.user.id, module, name, query } }); revalidatePath("/inventory"); });
}
export async function deleteFilterAction(id: string) {
  return safeAction(async () => { const ctx = await requireCtx(); await prisma.savedFilter.deleteMany({ where: { id, userId: ctx.user.id } }); revalidatePath("/inventory"); });
}
