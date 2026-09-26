import { requirePage } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { getT } from "@/i18n/server";
import { PurchasingView } from "@/components/inventory/purchasing-view";
import { lowStock } from "@/server/services/stock";

export const metadata = { title: "Commandes fournisseurs" };
export const dynamic = "force-dynamic";

export default async function PurchasingPage() {
  const ctx = await requirePage("purchasing.manage");
  const t = await getT();
  const [pos, suppliers, products, low] = await Promise.all([
    prisma.purchaseOrder.findMany({ where: { shopId: ctx.shopId }, include: { supplier: true, lines: { include: { product: { select: { name: true, sku: true } } } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.supplier.findMany({ where: { orgId: ctx.orgId }, include: { _count: { select: { products: true } } }, orderBy: { name: "asc" } }),
    prisma.product.findMany({ where: { orgId: ctx.orgId, active: true }, select: { id: true, name: true, sku: true, costCents: true, supplierId: true }, orderBy: { name: "asc" } }),
    lowStock(ctx.orgId, ctx.shopId),
  ]);
  return (
    <div className="mx-auto max-w-6xl space-y-4 anim-in">
      <h1 className="display text-[24px]">{t("inventory.purchaseOrders")}</h1>
      <PurchasingView
        orders={pos.map((p) => ({ id: p.id, number: p.number, status: p.status, supplier: p.supplier.name, expectedAt: p.expectedAt?.toISOString() ?? null, createdAt: p.createdAt.toISOString(), notes: p.notes, lines: p.lines.map((l) => ({ id: l.id, product: l.product.name, sku: l.product.sku, ordered: l.qtyOrdered, received: l.qtyReceived, unitCostCents: l.unitCostCents })) }))}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, email: s.email, phone: s.phone, leadDays: s.leadDays, products: s._count.products, notes: s.notes, address: s.address }))}
        products={products}
        suggestions={low.map((l) => ({ productId: l.productId, name: l.product.name, sku: l.product.sku, missing: l.missing, supplierId: l.product.supplierId, costCents: l.product.costCents }))}
      />
    </div>
  );
}
