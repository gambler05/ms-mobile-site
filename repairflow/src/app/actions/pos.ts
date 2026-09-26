"use server";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/auth/guard";
import { closeRegister, createSale, openRegister, refundSale, registerSummary, currentRegister, settlePayment, failPayment, posCatalog, type SaleInput } from "@/server/services/payments";
import { prisma } from "@/server/db";
import { safeAction } from "./util";

export async function createSaleAction(input: SaleInput) {
  return safeAction(async () => {
    const ctx = await requireCtx("pos.sell");
    const s = await createSale(ctx, input);
    revalidatePath("/pos");
    revalidatePath("/inventory");
    revalidatePath("/");
    return { id: s.id, number: s.number, totalCents: s.totalCents };
  });
}

export async function openRegisterAction(openingCashCents: number) {
  return safeAction(async () => {
    const ctx = await requireCtx("register.open_close");
    await openRegister(ctx, openingCashCents);
    revalidatePath("/pos");
  });
}

export async function closeRegisterAction(countedCashCents: number, reason: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("register.open_close");
    const r = await closeRegister(ctx, countedCashCents, reason);
    revalidatePath("/pos");
    return { differenceCents: r.differenceCents ?? 0 };
  });
}

export async function registerSummaryAction() {
  return safeAction(async () => {
    const ctx = await requireCtx("pos.sell");
    const open = await currentRegister(ctx.shopId);
    if (!open) return null;
    return registerSummary(open.id);
  });
}

export async function refundSaleAction(saleId: string, input: Parameters<typeof refundSale>[2]) {
  return safeAction(async () => {
    const ctx = await requireCtx("pos.refund");
    const r = await refundSale(ctx, saleId, input);
    revalidatePath("/pos");
    return { number: r.ret.number, total: r.total };
  });
}

export async function settlePaymentAction(paymentId: string, ok: boolean) {
  return safeAction(async () => {
    const ctx = await requireCtx("payments.record");
    if (ok) await settlePayment(ctx, paymentId, "manuel");
    else await failPayment(ctx, paymentId, "échec confirmé manuellement");
    revalidatePath("/pos");
    revalidatePath("/repairs");
  });
}

export async function posCatalogAction(q: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("pos.sell");
    return posCatalog(ctx, q);
  });
}

export async function customerCreditsAction(customerId: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("pos.sell");
    return prisma.creditNote.findMany({ where: { orgId: ctx.orgId, customerId, remainingCents: { gt: 0 } }, select: { id: true, number: true, remainingCents: true } });
  });
}
