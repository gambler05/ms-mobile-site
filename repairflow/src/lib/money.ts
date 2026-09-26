/**
 * Arithmétique monétaire en centimes entiers. Aucun flottant n'intervient dans un calcul
 * financier : les taux sont exprimés en points de base (2000 = 20,00 %) et les divisions
 * sont arrondies au centime le plus proche (demi vers le haut), de façon déterministe.
 */
export type Cents = number;

export function assertCents(value: unknown, label = "montant"): Cents {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${label} doit être un entier en centimes (reçu ${String(value)})`);
  }
  return value;
}

/** Arrondi demi vers le haut d'un rationnel num/den, en préservant le signe. */
export function divRound(num: number, den: number): number {
  if (den === 0) throw new Error("division par zéro");
  const sign = Math.sign(num) * Math.sign(den) || 1;
  const n = Math.abs(num);
  const d = Math.abs(den);
  return sign * Math.floor((2 * n + d) / (2 * d));
}

/** Applique un taux en points de base : 12345 × 2000 bp → 2469 (20 %). */
export function applyBp(amount: Cents, bp: number): Cents {
  return divRound(amount * bp, 10_000);
}

/** TVA incluse : extrait la part de taxe d'un montant TTC. */
export function taxFromGross(gross: Cents, rateBp: number): Cents {
  return gross - divRound(gross * 10_000, 10_000 + rateBp);
}

/** TVA ajoutée à un montant HT. */
export function taxFromNet(net: Cents, rateBp: number): Cents {
  return applyBp(net, rateBp);
}

export interface LineInput {
  qty: number;
  unitCents: Cents; // prix unitaire TTC
  discountCents?: Cents;
  taxRateBp: number;
}

export interface Totals {
  subtotalCents: Cents; // TTC avant remise
  discountCents: Cents;
  taxCents: Cents; // TVA contenue dans le total
  totalCents: Cents; // TTC net
}

/** Prix TTC en vigueur en boutique : les totaux sont TTC, la TVA est extraite ligne par ligne. */
export function computeTotals(lines: LineInput[], globalDiscountCents: Cents = 0): Totals {
  let subtotal = 0;
  let lineDiscounts = 0;
  let tax = 0;
  for (const l of lines) {
    const gross = l.qty * l.unitCents;
    const disc = Math.min(l.discountCents ?? 0, gross);
    subtotal += gross;
    lineDiscounts += disc;
    tax += taxFromGross(gross - disc, l.taxRateBp);
  }
  const afterLines = subtotal - lineDiscounts;
  const globalDiscount = Math.min(Math.max(globalDiscountCents, 0), afterLines);
  // La remise globale réduit la TVA au prorata (même taux moyen).
  if (globalDiscount > 0 && afterLines > 0) {
    tax = tax - divRound(tax * globalDiscount, afterLines);
  }
  return {
    subtotalCents: subtotal,
    discountCents: lineDiscounts + globalDiscount,
    taxCents: tax,
    totalCents: afterLines - globalDiscount,
  };
}

/** Répartit un montant sur plusieurs parts sans perdre de centime (méthode du plus grand reste). */
export function allocate(total: Cents, weights: number[]): Cents[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    remainder -= 1;
  }
  return floors;
}

export function formatCents(cents: Cents, locale = "fr-FR", currency = "EUR"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(cents / 100);
}

/** Convertit une saisie utilisateur ("12,50", "12.5", "1 250") en centimes, sans flottant intermédiaire imprécis. */
export function parseAmountToCents(input: string): Cents | null {
  const cleaned = input.replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith("-");
  const [intPart, fracPart = ""] = cleaned.replace("-", "").split(".");
  const cents = Number(intPart) * 100 + Number((fracPart + "00").slice(0, 2));
  return negative ? -cents : cents;
}

export function bpToPercentLabel(bp: number, locale = "fr-FR"): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(bp / 10_000);
}
