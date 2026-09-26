"use server";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/auth/guard";
import { createCustomer, updateCustomer, searchCustomers, mergeCustomers, previewMerge, type CustomerInput } from "@/server/services/customers";
import { prisma } from "@/server/db";
import { safeAction } from "./util";

export async function searchCustomersAction(q: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("customers.view");
    const rows = await searchCustomers(ctx, q, 8);
    const devices = await prisma.device.findMany({ where: { customerId: { in: rows.map((r) => r.id) } } });
    return rows.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`, sub: c.phone || c.email, devices: devices.filter((d) => d.customerId === c.id).map((d) => ({ id: d.id, kind: d.kind, brand: d.brand, model: d.model, color: d.color, imei: d.imei, serial: d.serial })) }));
  });
}

export async function createCustomerAction(input: CustomerInput) {
  return safeAction(async () => {
    const ctx = await requireCtx("customers.edit");
    const c = await createCustomer(ctx, input);
    revalidatePath("/customers");
    return { id: c.id };
  });
}

export async function updateCustomerAction(id: string, input: Partial<CustomerInput>) {
  return safeAction(async () => {
    const ctx = await requireCtx("customers.edit");
    await updateCustomer(ctx, id, input);
    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
  });
}

export async function previewMergeAction(keepId: string, mergeId: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("customers.merge");
    const p = await previewMerge(ctx, keepId, mergeId);
    return { counts: p.counts, merged: p.merged, keep: `${p.keep.firstName} ${p.keep.lastName}`, merge: `${p.merge.firstName} ${p.merge.lastName}` };
  });
}

export async function mergeCustomersAction(keepId: string, mergeId: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("customers.merge");
    await mergeCustomers(ctx, keepId, mergeId);
    revalidatePath("/customers");
  });
}
