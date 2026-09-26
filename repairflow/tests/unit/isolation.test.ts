import { describe, expect, it } from "vitest";
import { makeCustomer, makeOrg, makeProduct, ctxFor } from "./helpers";
import { createTicket, getTicket } from "@/server/services/tickets";
import { getProduct } from "@/server/services/inventory";
import { searchCustomers } from "@/server/services/customers";
import { NotFoundError } from "@/server/errors";
import { roleHas } from "@/lib/domain/roles";
import { AuthError, requireCtx } from "@/server/auth/guard";
import { transitionTicket, revealUnlockCode } from "@/server/services/tickets";

describe("isolation entre organisations", () => {
  it("une organisation ne voit ni tickets, ni produits, ni clients d'une autre", async () => {
    const a = await makeOrg();
    const b = await makeOrg();
    const customer = await makeCustomer(a.ctx, { lastName: "Isolé" });
    const product = await makeProduct(a.ctx, "ISO-1", 1);
    const { ticket } = await createTicket(a.ctx, { customerId: customer.id, device: { kind: "PHONE", brand: "A", model: "B", color: "", imei: "", serial: "" }, reportedIssue: "test", cosmeticState: "", reception: {}, accessories: [], technicianId: null, promisedAt: null, priority: "NORMAL", estimateCents: 0, depositCents: 0, depositMethod: "CASH", warrantyMonths: 3, consentAccepted: true, internalNotes: "" });
    await expect(getTicket(b.ctx, ticket.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getProduct(b.ctx, product.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await searchCustomers(b.ctx, "Isolé")).toHaveLength(0);
    expect(await searchCustomers(a.ctx, "Isolé")).toHaveLength(1);
    await expect(transitionTicket(b.ctx, ticket.id, "DIAGNOSIS")).rejects.toBeInstanceOf(NotFoundError);
  });
  it("les permissions par rôle sont appliquées côté service", async () => {
    const { org, shop, user, ctx } = await makeOrg("ADMIN");
    const seller = ctxFor(user, org.id, shop, "SELLER");
    expect(roleHas("SELLER", "tickets.unlock_code.view")).toBe(false);
    expect(roleHas("TECH", "pos.refund")).toBe(false);
    expect(roleHas("MANAGER", "users.manage")).toBe(false);
    const customer = await makeCustomer(ctx);
    const { ticket } = await createTicket(ctx, { customerId: customer.id, device: { kind: "PHONE", brand: "A", model: "B", color: "", imei: "", serial: "" }, reportedIssue: "test", cosmeticState: "", reception: {}, accessories: [], technicianId: null, promisedAt: null, priority: "NORMAL", estimateCents: 0, depositCents: 0, depositMethod: "CASH", unlockCode: "9999", warrantyMonths: 3, consentAccepted: true, internalNotes: "" });
    await expect(revealUnlockCode(seller, ticket.id)).rejects.toThrow(/refusé/);
    expect(await revealUnlockCode(ctx, ticket.id)).toBe("9999");
  });
  it("requireCtx refuse sans session", async () => {
    // Hors requête Next, cookies() lève : l'erreur doit rester une erreur (jamais un contexte fantôme).
    await expect(requireCtx()).rejects.toBeDefined();
    expect(new AuthError("forbidden").code).toBe("forbidden");
  });
});
