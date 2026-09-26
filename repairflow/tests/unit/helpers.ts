import { prisma } from "@/server/db";
import type { Ctx } from "@/server/auth/guard";
import { hashPassword } from "@/server/auth/session";
import { ensureDefaultTemplates } from "@/server/services/settings";
import type { Role } from "@/lib/domain/roles";

let counter = 0;

/** Crée une organisation isolée avec une boutique et un utilisateur, et renvoie un contexte d'exécution. */
export async function makeOrg(role: Role = "ADMIN") {
  const n = ++counter + Date.now();
  const org = await prisma.organization.create({ data: { name: `Org ${n}`, slug: `org-${n}`, isDemo: true } });
  const shop = await prisma.shop.create({ data: { orgId: org.id, code: `S${n % 1000}`, name: `Shop ${n}`, slug: `shop-${n}` } });
  const user = await prisma.user.create({ data: { orgId: org.id, email: `u${n}@test.example`, passwordHash: await hashPassword("x"), name: `User ${n}`, role, memberships: { create: [{ shopId: shop.id }] } } });
  await ensureDefaultTemplates(org.id);
  return { org, shop, user, ctx: ctxFor(user, org.id, shop, role) };
}

export function ctxFor(user: { id: string; email: string; name: string }, orgId: string, shop: { id: string; name: string; code: string }, role: Role): Ctx {
  return { user: { id: user.id, orgId, email: user.email, name: user.name, role, locale: "fr", sessionId: "test", activeShopId: shop.id, isDemoOrg: true, shops: [{ id: shop.id, name: shop.name, code: shop.code, slug: "s", currency: "EUR", taxRateBp: 2000, role }] }, orgId, shopId: shop.id, role };
}

export async function makeCustomer(ctx: Ctx, over: Partial<{ firstName: string; lastName: string; phone: string; email: string }> = {}) {
  const { createCustomer } = await import("@/server/services/customers");
  return createCustomer(ctx, { firstName: "Test", lastName: "Client", company: "", email: "client@example.test", phone: "07 00 00 99 99", address: "", postalCode: "", city: "", notes: "", tags: [], segment: "NEW", consentEmail: true, consentSms: true, consentWhatsapp: false, consentMarketing: false, ...over });
}

export async function makeProduct(ctx: Ctx, sku: string, qty: number, over: Partial<{ priceCents: number; costCents: number; serialized: boolean; type: "PART" | "ACCESSORY" | "NEW_DEVICE" | "USED_DEVICE" | "CONSUMABLE" }> = {}) {
  const { createProduct } = await import("@/server/services/inventory");
  return createProduct(ctx, { sku, name: `Produit ${sku}`, type: over.type ?? "PART", brand: "", category: "Test", quality: null, supplierId: null, supplierRef: "", costCents: over.costCents ?? 1000, priceCents: over.priceCents ?? 2500, taxRateBp: 2000, alertThreshold: 1, compatibilities: [], serialized: over.serialized ?? false, active: true, description: "", location: "", barcode: "" }, qty);
}

export async function openRegister(ctx: Ctx) {
  const { openRegister } = await import("@/server/services/payments");
  return openRegister(ctx, 10000);
}
