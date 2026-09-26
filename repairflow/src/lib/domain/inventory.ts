export const PRODUCT_TYPES = ["PART", "ACCESSORY", "NEW_DEVICE", "USED_DEVICE", "CONSUMABLE"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PART_QUALITIES = ["ORIGINAL", "REFURBISHED", "COMPATIBLE"] as const;
export type PartQuality = (typeof PART_QUALITIES)[number];

export const MOVEMENT_TYPES = [
  "IN",
  "OUT",
  "ADJUSTMENT",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "SALE",
  "RETURN",
  "CONSUMPTION",
  "RECEPTION",
  "COUNT",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const PO_STATUSES = ["DRAFT", "ORDERED", "PARTIAL", "RECEIVED", "CANCELLED"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const UNIT_STATUSES = ["IN_STOCK", "RESERVED", "SOLD", "RETURNED"] as const;

export function marginBp(priceCents: number, costCents: number): number {
  if (priceCents <= 0) return 0;
  return Math.round(((priceCents - costCents) * 10_000) / priceCents);
}
