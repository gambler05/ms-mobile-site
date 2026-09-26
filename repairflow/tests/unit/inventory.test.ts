import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { makeOrg, makeProduct } from "./helpers";
import { applyImport, createPurchaseOrder, previewImport, receivePurchaseOrder, startInventoryCount, saveCountLine, validateInventoryCount, upsertSupplier } from "@/server/services/inventory";
import { transferStock } from "@/server/services/stock";
import { findDuplicates, mergeCustomers, previewMerge } from "@/server/services/customers";
import { makeCustomer } from "./helpers";

describe("stock", () => {
  it("import CSV : prévisualisation avec erreurs par ligne, application des lignes valides seulement", async () => {
    const { ctx } = await makeOrg();
    await makeProduct(ctx, "EXIST-1", 1);
    const rows = [
      { ref: "NEW-1", nom: "Écran X", type: "PART", achat: "45,00", vente: "129,00", qty: "3" },
      { ref: "EXIST-1", nom: "Produit mis à jour", type: "PART", achat: "10", vente: "20", qty: "0" },
      { ref: "", nom: "Sans SKU", type: "PART", achat: "1", vente: "2", qty: "1" },
      { ref: "BAD-TYPE", nom: "Type inconnu", type: "GADGET", achat: "1", vente: "2", qty: "1" },
      { ref: "BAD-PRICE", nom: "Prix invalide", type: "PART", achat: "abc", vente: "2", qty: "1" },
      { ref: "NEW-1", nom: "Doublon", type: "PART", achat: "1", vente: "2", qty: "1" },
    ];
    const preview = await previewImport(ctx, rows, { sku: "ref", name: "nom", type: "type", costCents: "achat", priceCents: "vente", qty: "qty" });
    expect(preview.map((p) => p.ok)).toEqual([true, true, false, false, false, false]);
    expect(preview[1]!.action).toBe("update");
    expect(preview[3]!.errors[0]).toMatch(/Type inconnu/);
    const r = await applyImport(ctx, preview);
    expect(r).toEqual({ created: 1, updated: 1 });
    const created = await prisma.product.findFirstOrThrow({ where: { orgId: ctx.orgId, sku: "NEW-1" }, include: { stockLevels: true } });
    expect(created.priceCents).toBe(12900);
    expect(created.stockLevels[0]!.onHand).toBe(3);
  });
  it("commande fournisseur : réception partielle, stock attendu, puis complète", async () => {
    const { ctx } = await makeOrg();
    const sup = await upsertSupplier(ctx, { name: "Four", email: "", phone: "", address: "", notes: "", leadDays: 3 });
    const p = await makeProduct(ctx, "PO-1", 0);
    const po = await createPurchaseOrder(ctx, { supplierId: sup.id, lines: [{ productId: p.id, qty: 5, unitCostCents: 900 }] });
    expect((await prisma.stockLevel.findFirstOrThrow({ where: { productId: p.id } })).expected).toBe(5);
    const line = await prisma.purchaseOrderLine.findFirstOrThrow({ where: { poId: po.id } });
    await receivePurchaseOrder(ctx, po.id, [{ lineId: line.id, qty: 2 }]);
    let lvl = await prisma.stockLevel.findFirstOrThrow({ where: { productId: p.id } });
    expect([lvl.onHand, lvl.expected]).toEqual([2, 3]);
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("PARTIAL");
    await expect(receivePurchaseOrder(ctx, po.id, [{ lineId: line.id, qty: 9 }])).rejects.toThrow(/reliquat/);
    await receivePurchaseOrder(ctx, po.id, [{ lineId: line.id, qty: 3 }]);
    lvl = await prisma.stockLevel.findFirstOrThrow({ where: { productId: p.id } });
    expect([lvl.onHand, lvl.expected]).toEqual([5, 0]);
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("RECEIVED");
  });
  it("inventaire physique : les écarts deviennent des mouvements COUNT", async () => {
    const { ctx } = await makeOrg();
    const p = await makeProduct(ctx, "CNT-1", 4);
    const c = await startInventoryCount(ctx, "Test");
    await saveCountLine(ctx, c.id, p.id, 2, "casse");
    expect(await validateInventoryCount(ctx, c.id)).toBe(1);
    expect((await prisma.stockLevel.findFirstOrThrow({ where: { productId: p.id } })).onHand).toBe(2);
    const mv = await prisma.stockMovement.findFirstOrThrow({ where: { productId: p.id, type: "COUNT" } });
    expect(mv.qty).toBe(-2);
    await expect(saveCountLine(ctx, c.id, p.id, 1)).rejects.toThrow();
  });
  it("transfert entre boutiques : deux mouvements liés, refus si stock insuffisant", async () => {
    const { ctx, org } = await makeOrg();
    const shop2 = await prisma.shop.create({ data: { orgId: org.id, code: "S2", name: "Deux", slug: `deux-${Date.now()}` } });
    const p = await makeProduct(ctx, "TR-1", 2);
    await transferStock(ctx, { productId: p.id, toShopId: shop2.id, qty: 1, reason: "réassort" });
    expect((await prisma.stockLevel.findUniqueOrThrow({ where: { productId_shopId: { productId: p.id, shopId: shop2.id } } })).onHand).toBe(1);
    await expect(transferStock(ctx, { productId: p.id, toShopId: shop2.id, qty: 5, reason: "trop" })).rejects.toThrow(/insuffisant/);
  });
});

describe("clients", () => {
  it("détecte les doublons par téléphone et fusionne avec prévisualisation", async () => {
    const { ctx } = await makeOrg();
    const a = await makeCustomer(ctx, { firstName: "Camille", lastName: "Rousseau", phone: "06 11 22 33 44", email: "a@example.test" });
    const b = await makeCustomer(ctx, { firstName: "Camile", lastName: "Rousseau", phone: "+33611223344", email: "" });
    const dups = await findDuplicates(ctx);
    expect(dups.some((d) => d.reason === "phone" && d.customers.length === 2)).toBe(true);
    const preview = await previewMerge(ctx, a.id, b.id);
    expect(preview.merged.email).toBe("a@example.test");
    await mergeCustomers(ctx, a.id, b.id);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: b.id } })).mergedIntoId).toBe(a.id);
    expect(await findDuplicates(ctx)).toHaveLength(0);
  });
});
