import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { makeCustomer, makeOrg, makeProduct, openRegister } from "./helpers";
import { canTransition, DEFAULT_QC_ITEMS, transitionGuard } from "@/lib/domain/tickets";
import { consumePart, createQuote, createTicket, decideQuote, getPublicTicket, releasePart, reservePart, returnConsumedPart, revealUnlockCode, transitionTicket, updateQc, verifyDocPin, revokeTracking, ticketFinancials, getTicket } from "@/server/services/tickets";
import { recordTicketPayment } from "@/server/services/payments";
import { ConflictError, DomainError } from "@/server/errors";

describe("machine à états", () => {
  it("n'autorise que les transitions déclarées", () => {
    expect(canTransition("RECEIVED", "DIAGNOSIS")).toBe(true);
    expect(canTransition("RECEIVED", "DELIVERED")).toBe(false);
    expect(canTransition("DELIVERED", "CANCELLED")).toBe(false);
    expect(canTransition("READY", "CANCELLED")).toBe(true);
  });
  it("bloque la restitution avec un solde dû et le prêt sans QC", () => {
    const base = { hasAcceptedQuote: true, hasPendingQuote: false, qcComplete: false, balanceDueCents: 0, hasConsumedParts: true };
    expect(transitionGuard("QUALITY_CHECK", "READY", base)).toMatch(/contrôle qualité/);
    expect(transitionGuard("READY", "DELIVERED", { ...base, qcComplete: true, balanceDueCents: 100 })).toMatch(/solde/);
    expect(transitionGuard("READY", "DELIVERED", { ...base, qcComplete: true })).toBeNull();
  });
});

describe("parcours complet de réparation", () => {
  it("client → dépôt → devis → accord → pièce → QC → prêt → règlement → restitution", async () => {
    const { ctx } = await makeOrg();
    await openRegister(ctx);
    const customer = await makeCustomer(ctx);
    const part = await makeProduct(ctx, "SCR-TEST", 2, { priceCents: 12900, costCents: 4500 });
    const { ticket, trackingToken, pin } = await createTicket(ctx, { customerId: customer.id, device: { kind: "PHONE", brand: "Apple", model: "iPhone 13", color: "", imei: "", serial: "" }, reportedIssue: "Écran cassé", cosmeticState: "", reception: {}, accessories: [], technicianId: null, promisedAt: null, priority: "NORMAL", estimateCents: 15900, depositCents: 5000, depositMethod: "CASH", unlockCode: "1234", warrantyMonths: 3, consentAccepted: true, internalNotes: "" });
    expect(ticket.number).toMatch(/-2026-00001$/);
    // Notification in-app + jobs client dédupliqués
    expect(await prisma.notificationJob.count({ where: { entityId: ticket.id } })).toBe(2);

    const quote = await createQuote(ctx, ticket.id, { lines: [{ kind: "PART", productId: part.id, label: "Écran", qty: 1, unitCents: 12900, taxRateBp: 2000 }, { kind: "LABOR", label: "MO", qty: 1, unitCents: 3000, taxRateBp: 2000 }], discountCents: 0, note: "" }, true);
    expect(quote.totalCents).toBe(15900);
    expect((await getTicket(ctx, ticket.id)).status).toBe("QUOTE_SENT");

    // Accord via le portail public
    const pub = await getPublicTicket(trackingToken);
    expect(pub?.quotes[0]?.status).toBe("SENT");
    expect(JSON.stringify(pub)).not.toMatch(/unlock|costCents|internalNotes/);
    await decideQuote(null, ticket.id, quote.id, true);
    expect((await getTicket(ctx, ticket.id)).status).toBe("IN_REPAIR");
    await expect(decideQuote(null, ticket.id, quote.id, true)).rejects.toBeInstanceOf(ConflictError);

    // Réservation puis consommation : mouvement de stock atomique
    const reserved = await reservePart(ctx, ticket.id, part.id, 1);
    let level = await prisma.stockLevel.findFirstOrThrow({ where: { productId: part.id } });
    expect([level.onHand, level.reserved]).toEqual([2, 1]);
    await consumePart(ctx, ticket.id, reserved.id);
    level = await prisma.stockLevel.findFirstOrThrow({ where: { productId: part.id } });
    expect([level.onHand, level.reserved]).toEqual([1, 0]);
    expect(await prisma.stockMovement.count({ where: { productId: part.id, type: "CONSUMPTION", refId: ticket.id } })).toBe(1);

    await transitionTicket(ctx, ticket.id, "QUALITY_CHECK");
    await expect(transitionTicket(ctx, ticket.id, "READY")).rejects.toBeInstanceOf(DomainError);
    await updateQc(ctx, ticket.id, DEFAULT_QC_ITEMS.map((label) => ({ label, done: true })));
    await transitionTicket(ctx, ticket.id, "READY");
    expect(await prisma.notificationJob.count({ where: { entityId: ticket.id, eventType: "DEVICE_READY" } })).toBe(2);

    // Solde : 15900 − 5000 acompte
    let fin = ticketFinancials(await getTicket(ctx, ticket.id));
    expect(fin.balanceDueCents).toBe(10900);
    await expect(transitionTicket(ctx, ticket.id, "DELIVERED")).rejects.toThrow(/solde/);
    await expect(recordTicketPayment(ctx, ticket.id, { amountCents: 20000, method: "CARD", kind: "PAYMENT" })).rejects.toThrow(/dépasse/);
    await recordTicketPayment(ctx, ticket.id, { amountCents: 10900, method: "CASH", kind: "PAYMENT", idempotencyKey: "pay-1" });
    // Rejeu idempotent : pas de second paiement
    await expect(recordTicketPayment(ctx, ticket.id, { amountCents: 10900, method: "CASH", kind: "PAYMENT", idempotencyKey: "pay-1" })).rejects.toThrow();
    fin = ticketFinancials(await getTicket(ctx, ticket.id));
    expect(fin.balanceDueCents).toBe(0);
    await transitionTicket(ctx, ticket.id, "DELIVERED");
    expect((await getTicket(ctx, ticket.id)).status).toBe("DELIVERED");

    // Code de déverrouillage : chiffré, lisible par rôle autorisé, jamais en clair en base ni en audit
    const row = await prisma.repairTicket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.unlockCodeEnc).not.toContain("1234");
    expect(await revealUnlockCode(ctx, ticket.id)).toBe("1234");
    const logs = await prisma.auditLog.findMany({ where: { entityId: ticket.id } });
    expect(logs.some((l) => l.action === "ticket.unlock_code.reveal")).toBe(true);
    expect(logs.every((l) => !l.afterJson.includes("1234"))).toBe(true);

    // PIN documents et révocation du lien
    expect(await verifyDocPin(trackingToken, pin)).toBe(true);
    expect(await verifyDocPin(trackingToken, "0000")).toBe(pin === "0000");
    await revokeTracking(ctx, ticket.id);
    expect(await getPublicTicket(trackingToken)).toBeNull();
  });

  it("annulation : libère les réservations, ne recrée jamais le stock consommé sans règle explicite", async () => {
    const { ctx } = await makeOrg();
    const customer = await makeCustomer(ctx);
    const part = await makeProduct(ctx, "BAT-TEST", 3);
    const { ticket } = await createTicket(ctx, { customerId: customer.id, device: { kind: "PHONE", brand: "A", model: "B", color: "", imei: "", serial: "" }, reportedIssue: "Batterie", cosmeticState: "", reception: {}, accessories: [], technicianId: null, promisedAt: null, priority: "NORMAL", estimateCents: 0, depositCents: 0, depositMethod: "CASH", warrantyMonths: 3, consentAccepted: true, internalNotes: "" });
    const a = await reservePart(ctx, ticket.id, part.id, 1);
    const b = await reservePart(ctx, ticket.id, part.id, 1);
    await consumePart(ctx, ticket.id, a.id);
    await releasePart(ctx, ticket.id, b.id);
    await expect(reservePart(ctx, ticket.id, part.id, 5)).rejects.toBeInstanceOf(ConflictError);
    await transitionTicket(ctx, ticket.id, "CANCELLED");
    const level = await prisma.stockLevel.findFirstOrThrow({ where: { productId: part.id } });
    expect([level.onHand, level.reserved]).toEqual([2, 0]);
    // Retour explicite, motivé, audité
    await expect(returnConsumedPart(ctx, ticket.id, a.id, "x")).rejects.toThrow(/Motif/);
    await returnConsumedPart(ctx, ticket.id, a.id, "Pièce non montée finalement");
    expect((await prisma.stockLevel.findFirstOrThrow({ where: { productId: part.id } })).onHand).toBe(3);
    expect(await prisma.stockMovement.count({ where: { productId: part.id, type: "RETURN" } })).toBe(1);
  });
});
