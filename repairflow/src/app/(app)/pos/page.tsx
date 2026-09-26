import { requirePage, ctxHas } from "@/server/auth/guard";
import { currentRegister, registerSummary } from "@/server/services/payments";
import { prisma } from "@/server/db";
import { PosScreen } from "@/components/pos/pos-screen";
import { roleHas } from "@/lib/domain/roles";
import { posCatalog } from "@/server/services/payments";

export const metadata = { title: "Caisse" };
export const dynamic = "force-dynamic";

export default async function PosPage() {
  const ctx = await requirePage("pos.sell");
  const open = await currentRegister(ctx.shopId);
  const summary = open ? await registerSummary(open.id) : null;
  const initialCatalog = await posCatalog(ctx, "");
  const recent = await prisma.sale.findMany({ where: { shopId: ctx.shopId }, include: { payments: true, customer: { select: { firstName: true, lastName: true } }, lines: true }, orderBy: { createdAt: "desc" }, take: 12 });
  return (
    <PosScreen
      initialCatalog={initialCatalog}
      register={open ? { id: open.id, openedAt: open.openedAt.toISOString(), openingCashCents: open.openingCashCents, expectedCashCents: summary!.expectedCashCents, byMethod: summary!.byMethod, count: summary!.count } : null}
      perms={{ discountAny: roleHas(ctx.role, "pos.discount.any"), discountLimited: roleHas(ctx.role, "pos.discount.limited"), refund: ctxHas(ctx, "pos.refund"), register: ctxHas(ctx, "register.open_close") }}
      recent={recent.map((s) => ({ id: s.id, number: s.number, kind: s.kind, status: s.status, totalCents: s.totalCents, createdAt: s.createdAt.toISOString(), customer: s.customer ? `${s.customer.firstName} ${s.customer.lastName}` : null, payments: s.payments.map((p) => ({ id: p.id, method: p.method, amountCents: p.amountCents, status: p.status })), lines: s.lines.map((l) => ({ id: l.id, label: l.label, qty: l.qty, productId: l.productId })) }))}
    />
  );
}
