"use server";
import { requireCtx } from "@/server/auth/guard";
import { detectAnomalies, generateText, restockSuggestions } from "@/server/services/assistant";
import { getSetting } from "@/server/services/settings";
import { DomainError } from "@/server/errors";
import { safeAction } from "./util";

export async function assistantGenerateAction(task: "rephrase" | "draftMessage" | "summarize", ticketId: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("assistant.use");
    if (!(await getSetting(ctx.orgId, "assistant.enabled"))) throw new DomainError("Assistant désactivé dans les réglages");
    return generateText(ctx, task, ticketId);
  });
}
export async function assistantScanAction() {
  return safeAction(async () => {
    const ctx = await requireCtx("assistant.use");
    const [anomalies, restock] = await Promise.all([detectAnomalies(ctx), restockSuggestions(ctx)]);
    return { anomalies, restock };
  });
}
