import { requirePage, ctxHas } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { getT } from "@/i18n/server";
import { findDuplicates } from "@/server/services/customers";
import { CustomersView } from "@/components/customers/customers-view";

export const metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; segment?: string; new?: string }> }) {
  const ctx = await requirePage("customers.view");
  const t = await getT();
  const sp = await searchParams;
  const customers = await prisma.customer.findMany({
    where: { orgId: ctx.orgId, mergedIntoId: null, ...(sp.segment ? { segment: sp.segment } : {}), ...(sp.q ? { OR: [{ firstName: { contains: sp.q } }, { lastName: { contains: sp.q } }, { email: { contains: sp.q.toLowerCase() } }, { phone: { contains: sp.q } }, { company: { contains: sp.q } }] } : {}) },
    include: { _count: { select: { tickets: true, sales: true } }, tickets: { where: { status: "READY" }, select: { id: true } } },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  const dups = ctxHas(ctx, "customers.merge") ? await findDuplicates(ctx) : [];
  return (
    <div className="mx-auto max-w-6xl space-y-4 anim-in">
      <header><h1 className="display text-[24px]">{t("customers.title")}</h1><p className="text-[13px] text-muted">{customers.length}</p></header>
      <CustomersView
        rows={customers.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, company: c.company, phone: c.phone, email: c.email, segment: c.segment, tags: JSON.parse(c.tagsJson) as string[], tickets: c._count.tickets, sales: c._count.sales, toPickup: c.tickets.length, loyaltyPoints: c.loyaltyPoints, updatedAt: c.updatedAt.toISOString() }))}
        duplicates={dups.map((d) => ({ reason: d.reason, customers: d.customers.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, phone: c.phone, email: c.email, createdAt: c.createdAt.toISOString() })) }))}
        canEdit={ctxHas(ctx, "customers.edit")}
        canMerge={ctxHas(ctx, "customers.merge")}
        openNew={sp.new === "1"}
      />
    </div>
  );
}
