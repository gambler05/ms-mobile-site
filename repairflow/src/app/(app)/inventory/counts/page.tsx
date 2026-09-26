import { requirePage } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { getT } from "@/i18n/server";
import { CountsView } from "@/components/inventory/counts-view";

export const metadata = { title: "Inventaires" };
export const dynamic = "force-dynamic";

export default async function CountsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const ctx = await requirePage("inventory.count");
  const t = await getT();
  const { id } = await searchParams;
  const counts = await prisma.inventoryCount.findMany({ where: { shopId: ctx.shopId }, include: { _count: { select: { lines: true } } }, orderBy: { createdAt: "desc" }, take: 30 });
  const current = id ? await prisma.inventoryCount.findFirst({ where: { id, shopId: ctx.shopId }, include: { lines: { include: { product: { select: { name: true, sku: true } } }, orderBy: { product: { name: "asc" } } } } }) : null;
  return (
    <div className="mx-auto max-w-5xl space-y-4 anim-in">
      <h1 className="display text-[24px]">{t("inventory.counts")}</h1>
      <CountsView counts={counts.map((c) => ({ id: c.id, label: c.label, status: c.status, createdAt: c.createdAt.toISOString(), validatedAt: c.validatedAt?.toISOString() ?? null, lines: c._count.lines }))} current={current ? { id: current.id, label: current.label, status: current.status, lines: current.lines.map((l) => ({ productId: l.productId, name: l.product.name, sku: l.product.sku, expected: l.expectedQty, counted: l.countedQty, note: l.note })) } : null} />
    </div>
  );
}
