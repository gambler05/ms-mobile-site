export const PAYMENT_METHODS = ["CASH", "CARD", "TRANSFER", "CREDIT_NOTE"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_KINDS = ["PAYMENT", "DEPOSIT", "REFUND"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

/** Les espèces et les avoirs sont encaissés immédiatement ; carte et virement attendent une confirmation. */
export function initialPaymentStatus(method: PaymentMethod): "SETTLED" | "RECORDED" {
  return method === "CASH" || method === "CREDIT_NOTE" ? "SETTLED" : "RECORDED";
}

export const SALE_KINDS = ["SALE", "REPAIR_SETTLEMENT", "RETURN"] as const;
