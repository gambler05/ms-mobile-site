import { describe, expect, it } from "vitest";
import { allocate, applyBp, computeTotals, divRound, parseAmountToCents, taxFromGross } from "@/lib/money";

describe("arithmétique monétaire", () => {
  it("arrondit demi vers le haut sans flottant", () => {
    expect(divRound(5, 2)).toBe(3);
    expect(divRound(-5, 2)).toBe(-3);
    expect(applyBp(12345, 2000)).toBe(2469);
  });
  it("extrait la TVA d'un montant TTC", () => {
    expect(taxFromGross(12000, 2000)).toBe(2000);
    expect(taxFromGross(999, 2000)).toBe(166); // 999 / 1,2 = 832,5 → 833 HT (demi vers le haut)
  });
  it("calcule des totaux avec remises ligne et globale", () => {
    const t = computeTotals([{ qty: 2, unitCents: 1000, taxRateBp: 2000 }, { qty: 1, unitCents: 500, discountCents: 100, taxRateBp: 2000 }], 300);
    expect(t.subtotalCents).toBe(2500);
    expect(t.discountCents).toBe(400);
    expect(t.totalCents).toBe(2100);
    expect(t.taxCents).toBe(350);
  });
  it("répartit sans perdre de centime", () => {
    const parts = allocate(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
  });
  it("parse la saisie utilisateur", () => {
    expect(parseAmountToCents("12,50")).toBe(1250);
    expect(parseAmountToCents("1 250.5")).toBe(125050);
    expect(parseAmountToCents("abc")).toBeNull();
  });
});
