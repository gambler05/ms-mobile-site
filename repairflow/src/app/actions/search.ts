"use server";
import { prisma } from "@/server/db";
import { requireCtx } from "@/server/auth/guard";
import { safeAction } from "./util";
import { normalizePhone } from "@/server/services/customers";

export interface SearchResults {
  tickets: { id: string; number: string; label: string; status: string }[];
  customers: { id: string; label: string; sub: string }[];
  products: { id: string; label: string; sku: string; available: number }[];
}

export async function globalSearchAction(q: string) {
  return safeAction<SearchResults>(async () => {
    const ctx = await requireCtx();
    const term = q.trim();
    if (term.length < 2) return { tickets: [], customers: [], products: [] };
    const digits = normalizePhone(term).replace("+33", "");
    const [tickets, customers, products] = await Promise.all([
      prisma.repairTicket.findMany({
        where: { orgId: ctx.orgId, isDraft: false, OR: [{ number: { contains: term.toUpperCase() } }, { customer: { lastName: { contains: term } } }, { device: { model: { contains: term } } }, { device: { imei: { contains: term } } }] },
        include: { customer: true, device: true },
        take: 6,
        orderBy: { createdAt: "desc" },
      }),
      prisma.customer.findMany({
        where: { orgId: ctx.orgId, mergedIntoId: null, OR: [{ lastName: { contains: term } }, { firstName: { contains: term } }, { email: { contains: term.toLowerCase() } }, ...(digits.length >= 4 ? [{ phoneNormalized: { contains: digits } }] : [])] },
        take: 6,
      }),
      prisma.product.findMany({ where: { orgId: ctx.orgId, active: true, OR: [{ name: { contains: term } }, { sku: { contains: term.toUpperCase() } }, { barcode: term }] }, include: { stockLevels: { where: { shopId: ctx.shopId } } }, take: 6 }),
    ]);
    return {
      tickets: tickets.map((t) => ({ id: t.id, number: t.number, label: `${t.device.brand} ${t.device.model} — ${t.customer.firstName} ${t.customer.lastName}`, status: t.status })),
      customers: customers.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`, sub: c.phone || c.email })),
      products: products.map((p) => ({ id: p.id, label: p.name, sku: p.sku, available: (p.stockLevels[0]?.onHand ?? 0) - (p.stockLevels[0]?.reserved ?? 0) })),
    };
  });
}
