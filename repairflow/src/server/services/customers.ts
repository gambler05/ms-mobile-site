import { z } from "zod";
import { prisma } from "@/server/db";
import type { Ctx } from "@/server/auth/guard";
import { audit } from "@/server/audit";
import { DomainError, NotFoundError } from "@/server/errors";

export const customerSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  company: z.string().trim().max(120).default(""),
  email: z.string().trim().toLowerCase().max(160).refine((v) => v === "" || z.email().safeParse(v).success, "E-mail invalide").default(""),
  phone: z.string().trim().max(30).default(""),
  address: z.string().trim().max(200).default(""),
  postalCode: z.string().trim().max(12).default(""),
  city: z.string().trim().max(80).default(""),
  notes: z.string().max(2000).default(""),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  segment: z.enum(["NEW", "LOYAL", "VIP"]).default("NEW"),
  consentEmail: z.boolean().default(false),
  consentSms: z.boolean().default(false),
  consentWhatsapp: z.boolean().default(false),
  consentMarketing: z.boolean().default(false),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith("0")) return `+33${digits.slice(1)}`;
  return digits;
}

export async function createCustomer(ctx: Ctx, input: CustomerInput) {
  const data = customerSchema.parse(input);
  const customer = await prisma.customer.create({
    data: {
      orgId: ctx.orgId,
      ...data,
      tagsJson: JSON.stringify(data.tags),
      phoneNormalized: normalizePhone(data.phone),
      tags: undefined,
    } as never,
  });
  await audit(ctx, "customer.create", "Customer", customer.id, {}, data);
  return customer;
}

export async function updateCustomer(ctx: Ctx, id: string, input: Partial<CustomerInput>) {
  const existing = await prisma.customer.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!existing) throw new NotFoundError("Client introuvable");
  const data = customerSchema.partial().parse(input);
  const { tags, ...rest } = data;
  const customer = await prisma.customer.update({
    where: { id },
    data: {
      ...rest,
      ...(tags ? { tagsJson: JSON.stringify(tags) } : {}),
      ...(rest.phone !== undefined ? { phoneNormalized: normalizePhone(rest.phone) } : {}),
    },
  });
  await audit(ctx, "customer.update", "Customer", id, existing, data);
  return customer;
}

export async function searchCustomers(ctx: Ctx, q: string, limit = 10) {
  const term = q.trim();
  if (!term) return [];
  const digits = normalizePhone(term);
  return prisma.customer.findMany({
    where: {
      orgId: ctx.orgId,
      mergedIntoId: null,
      OR: [
        { firstName: { contains: term } },
        { lastName: { contains: term } },
        { email: { contains: term.toLowerCase() } },
        { company: { contains: term } },
        ...(digits.length >= 4 ? [{ phoneNormalized: { contains: digits.replace("+33", "") } }] : []),
      ],
    },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });
}

/** Détection de doublons : même téléphone normalisé, même e-mail, ou même nom+prénom. */
export async function findDuplicates(ctx: Ctx, customerId?: string) {
  const all = await prisma.customer.findMany({ where: { orgId: ctx.orgId, mergedIntoId: null }, orderBy: { createdAt: "asc" } });
  const groups = new Map<string, typeof all>();
  for (const c of all) {
    const keys: string[] = [];
    if (c.phoneNormalized.length >= 8) keys.push(`p:${c.phoneNormalized}`);
    if (c.email) keys.push(`e:${c.email}`);
    keys.push(`n:${c.firstName.toLowerCase()}|${c.lastName.toLowerCase()}`);
    for (const k of keys) groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const result: { key: string; reason: "phone" | "email" | "name"; customers: typeof all }[] = [];
  const seen = new Set<string>();
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const ids = list.map((c) => c.id).sort().join(",");
    if (seen.has(ids)) continue;
    seen.add(ids);
    if (customerId && !list.some((c) => c.id === customerId)) continue;
    result.push({ key, reason: key.startsWith("p:") ? "phone" : key.startsWith("e:") ? "email" : "name", customers: list });
  }
  return result;
}

/** Prévisualisation de fusion : quelles données seraient conservées et combien d'objets seraient réattribués. */
export async function previewMerge(ctx: Ctx, keepId: string, mergeId: string) {
  const [keep, merge] = await Promise.all([
    prisma.customer.findFirst({ where: { id: keepId, orgId: ctx.orgId } }),
    prisma.customer.findFirst({ where: { id: mergeId, orgId: ctx.orgId } }),
  ]);
  if (!keep || !merge || keepId === mergeId) throw new DomainError("Sélection de fusion invalide");
  const [tickets, sales, devices, credits] = await Promise.all([
    prisma.repairTicket.count({ where: { customerId: mergeId } }),
    prisma.sale.count({ where: { customerId: mergeId } }),
    prisma.device.count({ where: { customerId: mergeId } }),
    prisma.creditNote.count({ where: { customerId: mergeId } }),
  ]);
  const fields = ["email", "phone", "address", "postalCode", "city", "company", "notes"] as const;
  const merged: Record<string, string> = {};
  for (const f of fields) merged[f] = keep[f] || merge[f];
  return { keep, merge, counts: { tickets, sales, devices, credits }, merged };
}

export async function mergeCustomers(ctx: Ctx, keepId: string, mergeId: string) {
  const preview = await previewMerge(ctx, keepId, mergeId);
  await prisma.$transaction(async (tx) => {
    await tx.repairTicket.updateMany({ where: { customerId: mergeId }, data: { customerId: keepId } });
    await tx.sale.updateMany({ where: { customerId: mergeId }, data: { customerId: keepId } });
    await tx.device.updateMany({ where: { customerId: mergeId }, data: { customerId: keepId } });
    await tx.creditNote.updateMany({ where: { customerId: mergeId }, data: { customerId: keepId } });
    await tx.attachment.updateMany({ where: { customerId: mergeId }, data: { customerId: keepId } });
    const tags = Array.from(new Set([...JSON.parse(preview.keep.tagsJson), ...JSON.parse(preview.merge.tagsJson)]));
    await tx.customer.update({
      where: { id: keepId },
      data: {
        ...preview.merged,
        phoneNormalized: normalizePhone(preview.merged.phone ?? ""),
        tagsJson: JSON.stringify(tags),
        loyaltyPoints: preview.keep.loyaltyPoints + preview.merge.loyaltyPoints,
        consentEmail: preview.keep.consentEmail || preview.merge.consentEmail,
        consentSms: preview.keep.consentSms || preview.merge.consentSms,
        consentWhatsapp: preview.keep.consentWhatsapp || preview.merge.consentWhatsapp,
        consentMarketing: preview.keep.consentMarketing || preview.merge.consentMarketing,
        segment: preview.keep.segment === "VIP" || preview.merge.segment === "VIP" ? "VIP" : preview.keep.segment,
      },
    });
    await tx.customer.update({ where: { id: mergeId }, data: { mergedIntoId: keepId } });
  });
  await audit(ctx, "customer.merge", "Customer", keepId, { mergedFrom: mergeId }, preview.counts);
}

/** Segmentation automatique : VIP au-delà d'un seuil de CA, fidèle à partir de 3 opérations. */
export async function recomputeSegment(customerId: string, vipThresholdCents = 100_000) {
  const [sales, tickets] = await Promise.all([
    prisma.sale.aggregate({ where: { customerId, status: "COMPLETED" }, _sum: { totalCents: true }, _count: true }),
    prisma.repairTicket.count({ where: { customerId, status: "DELIVERED" } }),
  ]);
  const revenue = sales._sum.totalCents ?? 0;
  const ops = sales._count + tickets;
  const current = await prisma.customer.findUnique({ where: { id: customerId }, select: { segment: true } });
  if (!current || current.segment === "VIP") return; // VIP manuel jamais rétrogradé automatiquement
  const segment = revenue >= vipThresholdCents ? "VIP" : ops >= 3 ? "LOYAL" : "NEW";
  if (segment !== current.segment) await prisma.customer.update({ where: { id: customerId }, data: { segment } });
}
