"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCtx } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { setSetting, upsertTemplate } from "@/server/services/settings";
import { hashPassword } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { runAllJobs } from "@/server/jobs/scheduled";
import { ROLES } from "@/lib/domain/roles";
import { DomainError } from "@/server/errors";
import { safeAction } from "./util";
import type { NotificationEvent } from "@/lib/domain/notifications";

export async function setSettingAction(key: string, value: unknown) {
  return safeAction(async () => { const ctx = await requireCtx("settings.manage"); await setSetting(ctx, key, value); revalidatePath("/settings"); });
}

export async function upsertTemplateAction(input: { key: NotificationEvent; channel: string; locale: string; subject: string; body: string; active: boolean }) {
  return safeAction(async () => { const ctx = await requireCtx("settings.manage"); await upsertTemplate(ctx, input); revalidatePath("/settings"); });
}

const userSchema = z.object({ email: z.email().max(160), name: z.string().trim().min(2).max(80), role: z.enum(ROLES), shopIds: z.array(z.string()).min(1), password: z.string().min(8).max(100).optional(), active: z.boolean().default(true) });

export async function upsertUserAction(input: z.infer<typeof userSchema>, id?: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("users.manage");
    const data = userSchema.parse(input);
    const shops = await prisma.shop.findMany({ where: { id: { in: data.shopIds }, orgId: ctx.orgId } });
    if (shops.length !== data.shopIds.length) throw new DomainError("Boutique inconnue");
    if (id) {
      const existing = await prisma.user.findFirst({ where: { id, orgId: ctx.orgId } });
      if (!existing) throw new DomainError("Utilisateur introuvable");
      if (id === ctx.user.id && (data.role !== "ADMIN" || !data.active)) throw new DomainError("Vous ne pouvez pas retirer vos propres droits");
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id }, data: { email: data.email.toLowerCase(), name: data.name, role: data.role, active: data.active, ...(data.password ? { passwordHash: await hashPassword(data.password) } : {}) } });
        await tx.userShop.deleteMany({ where: { userId: id } });
        await tx.userShop.createMany({ data: data.shopIds.map((shopId) => ({ userId: id, shopId })) });
        if (!data.active || data.password) await tx.session.deleteMany({ where: { userId: id } });
      });
      await audit(ctx, "user.update", "User", id, { role: existing.role, active: existing.active }, { role: data.role, active: data.active, shopIds: data.shopIds });
      return { id };
    }
    if (!data.password) throw new DomainError("Mot de passe requis");
    const u = await prisma.user.create({ data: { orgId: ctx.orgId, email: data.email.toLowerCase(), name: data.name, role: data.role, active: data.active, passwordHash: await hashPassword(data.password), memberships: { create: data.shopIds.map((shopId) => ({ shopId })) } } });
    await audit(ctx, "user.create", "User", u.id, {}, { email: data.email, role: data.role });
    revalidatePath("/settings");
    return { id: u.id };
  });
}

export async function updateShopAction(id: string, input: { name: string; address: string; phone: string; email: string; taxRateBp: number; hours: { day: string; open: string; close: string }[] }) {
  return safeAction(async () => {
    const ctx = await requireCtx("settings.manage");
    const data = z.object({ name: z.string().trim().min(2).max(80), address: z.string().max(200), phone: z.string().max(30), email: z.string().max(160), taxRateBp: z.number().int().min(0).max(5000), hours: z.array(z.object({ day: z.string().max(20), open: z.string().max(5), close: z.string().max(5) })).max(7) }).parse(input);
    const shop = await prisma.shop.findFirst({ where: { id, orgId: ctx.orgId } });
    if (!shop) throw new DomainError("Boutique introuvable");
    await prisma.shop.update({ where: { id }, data: { name: data.name, address: data.address, phone: data.phone, email: data.email, taxRateBp: data.taxRateBp, hoursJson: JSON.stringify(data.hours) } });
    await audit(ctx, "shop.update", "Shop", id, shop, data);
    revalidatePath("/", "layout");
  });
}

export async function runJobsAction() {
  return safeAction(async () => { const ctx = await requireCtx("settings.manage"); const r = await runAllJobs(); await audit(ctx, "jobs.run", "JobRun", "manual", {}, r); revalidatePath("/settings"); revalidatePath("/notifications"); return r; });
}
