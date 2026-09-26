"use server";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/auth/guard";
import * as T from "@/server/services/tickets";
import { recordTicketPayment } from "@/server/services/payments";
import { safeAction } from "./util";
import type { TicketStatus } from "@/lib/domain/tickets";
import type { PaymentMethod } from "@/lib/domain/sales";
import { storeBuffer } from "@/server/integrations/storage";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";

function refresh(id?: string) {
  revalidatePath("/repairs");
  revalidatePath("/");
  if (id) revalidatePath(`/repairs/${id}`);
}

export async function createTicketAction(input: T.TicketCreateInput, draftId?: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("tickets.create");
    const r = await T.createTicket(ctx, input, { draftId });
    refresh();
    return { id: r.ticket.id, number: r.ticket.number, trackingToken: r.trackingToken, pin: r.pin };
  });
}

export async function saveDraftAction(data: unknown, draftId?: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("tickets.create");
    const d = await T.saveDraft(ctx, data, draftId);
    return { id: d.id };
  });
}

export async function deleteDraftAction(id: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("tickets.create");
    await T.deleteDraft(ctx, id);
    refresh();
  });
}

export async function transitionAction(ticketId: string, to: TicketStatus, note?: string, blockReason?: string | null) {
  return safeAction(async () => {
    const ctx = await requireCtx("tickets.transition");
    await T.transitionTicket(ctx, ticketId, to, { note, blockReason });
    refresh(ticketId);
  });
}

export async function setBlockAction(ticketId: string, reason: string | null, note?: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("tickets.edit");
    await T.setBlockReason(ctx, ticketId, reason, note);
    refresh(ticketId);
  });
}

export async function assignAction(ticketId: string, technicianId: string | null) {
  return safeAction(async () => {
    const ctx = await requireCtx("tickets.assign");
    await T.assignTechnician(ctx, ticketId, technicianId);
    refresh(ticketId);
  });
}

export async function updateTicketAction(ticketId: string, data: Parameters<typeof T.updateTicketFields>[2]) {
  return safeAction(async () => {
    const ctx = await requireCtx("tickets.edit");
    await T.updateTicketFields(ctx, ticketId, data);
    refresh(ticketId);
  });
}

export async function addMessageAction(ticketId: string, message: string, visibleToCustomer: boolean) {
  return safeAction(async () => {
    const ctx = await requireCtx("tickets.edit");
    await T.addMessage(ctx, ticketId, message, visibleToCustomer);
    refresh(ticketId);
  });
}

export async function addInterventionAction(ticketId: string, data: { description: string; minutes: number; laborCents: number }) {
  return safeAction(async () => {
    const ctx = await requireCtx("tickets.edit");
    await T.addIntervention(ctx, ticketId, data);
    refresh(ticketId);
  });
}

export async function updateQcAction(ticketId: string, items: { label: string; done: boolean }[]) {
  return safeAction(async () => {
    const ctx = await requireCtx("tickets.edit");
    await T.updateQc(ctx, ticketId, items);
    refresh(ticketId);
  });
}

export async function createQuoteAction(ticketId: string, input: Parameters<typeof T.createQuote>[2], send: boolean) {
  return safeAction(async () => {
    const ctx = await requireCtx("quotes.manage");
    const q = await T.createQuote(ctx, ticketId, input, send);
    refresh(ticketId);
    return { id: q.id };
  });
}

export async function decideQuoteAction(ticketId: string, quoteId: string, accepted: boolean, note?: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("quotes.manage");
    await T.decideQuote(ctx, ticketId, quoteId, accepted, note);
    refresh(ticketId);
  });
}

export async function reservePartAction(ticketId: string, productId: string, qty: number) {
  return safeAction(async () => {
    const ctx = await requireCtx("parts.manage");
    await T.reservePart(ctx, ticketId, productId, qty);
    refresh(ticketId);
    revalidatePath("/inventory");
  });
}
export async function consumePartAction(ticketId: string, partId: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("parts.manage");
    await T.consumePart(ctx, ticketId, partId);
    refresh(ticketId);
    revalidatePath("/inventory");
  });
}
export async function releasePartAction(ticketId: string, partId: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("parts.manage");
    await T.releasePart(ctx, ticketId, partId);
    refresh(ticketId);
    revalidatePath("/inventory");
  });
}
export async function returnPartAction(ticketId: string, partId: string, reason: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("parts.manage");
    await T.returnConsumedPart(ctx, ticketId, partId, reason);
    refresh(ticketId);
    revalidatePath("/inventory");
  });
}

export async function recordTicketPaymentAction(ticketId: string, input: { amountCents: number; method: PaymentMethod; kind: "DEPOSIT" | "PAYMENT"; idempotencyKey?: string }) {
  return safeAction(async () => {
    const ctx = await requireCtx("payments.record");
    await recordTicketPayment(ctx, ticketId, input);
    refresh(ticketId);
    revalidatePath("/pos");
  });
}

export async function revealUnlockCodeAction(ticketId: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("tickets.unlock_code.view");
    return T.revealUnlockCode(ctx, ticketId);
  });
}
export async function setUnlockCodeAction(ticketId: string, code: string | null) {
  return safeAction(async () => {
    const ctx = await requireCtx("tickets.edit");
    await T.setUnlockCode(ctx, ticketId, code);
    refresh(ticketId);
  });
}

export async function regenerateTrackingAction(ticketId: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("tickets.edit");
    const r = await T.regenerateTracking(ctx, ticketId);
    refresh(ticketId);
    return r;
  });
}
export async function revokeTrackingAction(ticketId: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("tickets.edit");
    await T.revokeTracking(ctx, ticketId);
    refresh(ticketId);
  });
}

export async function warrantyReturnAction(ticketId: string, issue: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("tickets.create");
    const r = await T.createWarrantyReturn(ctx, ticketId, issue);
    refresh(ticketId);
    return { id: r.ticket.id, number: r.ticket.number, inWarranty: r.inWarranty };
  });
}

export async function uploadPhotoAction(ticketId: string, formData: FormData) {
  return safeAction(async () => {
    const ctx = await requireCtx("tickets.edit");
    await T.getTicket(ctx, ticketId);
    const file = formData.get("file");
    const kind = String(formData.get("kind") ?? "PHOTO_BEFORE");
    if (!(file instanceof File)) throw new Error("Fichier manquant");
    const stored = await storeBuffer(ctx.orgId, Buffer.from(await file.arrayBuffer()), file.type, file.name);
    const a = await prisma.attachment.create({ data: { orgId: ctx.orgId, ticketId, kind: kind === "PHOTO_AFTER" ? "PHOTO_AFTER" : kind === "DOCUMENT" ? "DOCUMENT" : "PHOTO_BEFORE", ...stored, visibleToCustomer: kind !== "DOCUMENT", createdById: ctx.user.id } });
    await prisma.ticketEvent.create({ data: { ticketId, type: "PHOTO", message: kind === "PHOTO_AFTER" ? "Photo après intervention" : "Photo avant intervention", payloadJson: JSON.stringify({ attachmentId: a.id }), visibleToCustomer: true, authorId: ctx.user.id, authorName: ctx.user.name } });
    await audit(ctx, "attachment.create", "Attachment", a.id, {}, { ticketId, kind });
    refresh(ticketId);
    return { id: a.id };
  });
}

export async function toggleAttachmentVisibilityAction(ticketId: string, attachmentId: string, visible: boolean) {
  return safeAction(async () => {
    const ctx = await requireCtx("tickets.edit");
    await T.getTicket(ctx, ticketId);
    await prisma.attachment.updateMany({ where: { id: attachmentId, ticketId }, data: { visibleToCustomer: visible } });
    refresh(ticketId);
  });
}
