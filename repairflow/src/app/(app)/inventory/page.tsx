import Link from "next/link";
import { requirePage, ctxHas } from "@/server/auth/guard";
import { getT } from "@/i18n/server";
import { listProducts } from "@/server/services/inventory";
import { prisma } from "@/server/db";
import { InventoryView } from "@/components/inventory/inventory-view";

export const metadata = { title: "Stock" };
export const dynamic = "force-dynamic";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePage("inventory.view");
  const t = await getT();
  const sp = await searchParams;
  const [rows, suppliers, filters, categories] = await Promise.all([
    listProducts(ctx, { q: sp.q, type: sp.type, category: sp.category, supplierId: sp.supplier, low: sp.low === "1", inactive: sp.inactive === "1", sort: sp.sort as never }),
    prisma.supplier.findMany({ where: { orgId: ctx.orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.savedFilter.findMany({ where: { userId: ctx.user.id, module: "inventory" } }),
    prisma.product.findMany({ where: { orgId: ctx.orgId }, select: { category: true }, distinct: ["category"] }),
  ]);
  return (
    <div className="mx-auto max-w-[1500px] space-y-4 anim-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="display text-[24px]">{t("inventory.title")}</h1><p className="text-[13px] text-muted">{rows.length} {t("common.of").toLowerCase()} {ctx.user.shops.find((s) => s.id === ctx.shopId)?.name}</p></div>
        <nav className="flex flex-wrap gap-1 text-[13px]">
          {[["/inventory/purchasing", t("inventory.purchaseOrders")], ["/inventory/counts", t("inventory.counts")], ["/inventory/import", t("common.import")]].map(([h, l]) => <Link key={h} href={h!} className="rounded-[var(--radius-sm)] border border-border px-3 py-1.5 text-muted hover:bg-hover hover:text-fg">{l}</Link>)}
        </nav>
      </header>
      <InventoryView
        rows={rows.map((p) => ({ id: p.id, sku: p.sku, barcode: p.barcode, name: p.name, type: p.type, brand: p.brand, category: p.category, quality: p.quality, supplier: p.supplier?.name ?? "", costCents: p.costCents, priceCents: p.priceCents, onHand: p.onHand, reserved: p.reserved, expected: p.expected, available: p.available, alertThreshold: p.alertThreshold, location: p.location, low: p.low, serialized: p.serialized, active: p.active, compat: JSON.parse(p.compatibilitiesJson) as string[] }))}
        suppliers={suppliers}
        categories={categories.map((c) => c.category).filter(Boolean)}
        savedFilters={filters.map((f) => ({ id: f.id, name: f.name, query: f.query }))}
        shops={ctx.user.shops.filter((s) => s.id !== ctx.shopId).map((s) => ({ id: s.id, name: s.name }))}
        perms={{ edit: ctxHas(ctx, "inventory.edit"), adjust: ctxHas(ctx, "inventory.adjust") }}
      />
    </div>
  );
}
