import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ctxFor, makeCustomer, makeOrg, makeProduct, openRegister } from "./helpers";
import { closeRegister, createSale, refundSale } from "@/server/services/payments";
import { ConflictError } from "@/server/errors";

describe("caisse", () => {
  it("refuse la vente concurrente de la dernière unité et les stocks négatifs", async () => {
    const { ctx } = await makeOrg();
    await openRegister(ctx);
    const p = await makeProduct(ctx, "LAST-1", 1, { priceCents: 1000, type: "ACCESSORY" });
    const mk = (k: string) => createSale(ctx, { customerId: null, lines: [{ productId: p.id, qty: 1, unitCents: 1000, discountCents: 0 }], globalDiscountCents: 0, payments: [{ method: "CASH", amountCents: 1000 }], notes: "", idempotencyKey: `k-${k}-${p.id}` });
    const results = await Promise.allSettled([mk("a"), mk("b")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(ConflictError);
    expect((await prisma.stockLevel.findFirstOrThrow({ where: { productId: p.id } })).onHand).toBe(0);
  });
  it("empêche deux ventes de la même unité sérialisée", async () => {
    const { ctx, shop } = await makeOrg();
    await openRegister(ctx);
    const p = await makeProduct(ctx, "DEV-1", 0, { priceCents: 50000, serialized: true, type: "USED_DEVICE" });
    const unit = await prisma.serializedUnit.create({ data: { productId: p.id, shopId: shop.id, imei: "35X" } });
    await prisma.stockLevel.update({ where: { productId_shopId: { productId: p.id, shopId: shop.id } }, data: { onHand: 1 } });
    const mk = (k: string) => createSale(ctx, { customerId: null, lines: [{ productId: p.id, serializedUnitId: unit.id, qty: 1, unitCents: 50000, discountCents: 0 }], globalDiscountCents: 0, payments: [{ method: "CARD", amountCents: 50000 }], notes: "", idempotencyKey: `u-${k}-${p.id}` });
    const results = await Promise.allSettled([mk("a"), mk("b")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await prisma.serializedUnit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("SOLD");
  });
  it("rejoue une vente idempotente sans doublon, paiement mixte, remise contrôlée, retour avec avoir, clôture avec écart", async () => {
    const { ctx, org, shop, user } = await makeOrg();
    await openRegister(ctx);
    const customer = await makeCustomer(ctx);
    const p = await makeProduct(ctx, "ACC-1", 10, { priceCents: 2000, costCents: 500, type: "ACCESSORY" });
    const input = { customerId: customer.id, lines: [{ productId: p.id, qty: 3, unitCents: 2000, discountCents: 0 }], globalDiscountCents: 0, payments: [{ method: "CASH" as const, amountCents: 2000 }, { method: "CARD" as const, amountCents: 4000 }], notes: "", idempotencyKey: `idem-${p.id}` };
    const s1 = await createSale(ctx, input);
    const s2 = await createSale(ctx, input);
    expect(s2.id).toBe(s1.id);
    expect(await prisma.sale.count({ where: { shopId: shop.id, kind: "SALE" } })).toBe(1);
    expect(s1.taxCents).toBe(1000);
    // Remise > 10 % refusée à un vendeur
    const seller = ctxFor(user, org.id, shop, "SELLER");
    await expect(createSale(seller, { ...input, idempotencyKey: `disc-${p.id}`, globalDiscountCents: 1000, payments: [{ method: "CASH", amountCents: 5000 }] })).rejects.toThrow(/Remise/);
    // Retour partiel avec avoir et remise en stock
    const r = await refundSale(ctx, s1.id, { lines: [{ saleLineId: (await prisma.saleLine.findFirstOrThrow({ where: { saleId: s1.id } })).id, qty: 1 }], method: "CREDIT_NOTE", reason: "Défectueux", restock: true });
    expect(r.total).toBe(2000);
    expect((await prisma.creditNote.findFirstOrThrow({ where: { customerId: customer.id } })).remainingCents).toBe(2000);
    expect((await prisma.stockLevel.findFirstOrThrow({ where: { productId: p.id } })).onHand).toBe(8);
    // Paiement carte enregistré mais non encaissé tant que non confirmé
    const card = await prisma.payment.findFirstOrThrow({ where: { saleId: s1.id, method: "CARD" } });
    expect(card.status).toBe("RECORDED");
    // Clôture : espèces attendues = fond 100 € + 20 € − 20 € remboursés en avoir (0 cash) = 120 €
    await expect(closeRegister(ctx, 11000, "")).rejects.toThrow(/justifié/);
    const closed = await closeRegister(ctx, 11000, "Erreur de rendu");
    expect(closed.expectedCashCents).toBe(12000);
    expect(closed.differenceCents).toBe(-1000);
  });
});
