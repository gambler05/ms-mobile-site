"use server";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/auth/guard";
import { archive, markRead, retryJob } from "@/server/services/notifications";
import { safeAction } from "./util";

export async function markReadAction(ids: string[], read = true) {
  return safeAction(async () => {
    const ctx = await requireCtx();
    await markRead(ctx.orgId, ids, read);
    revalidatePath("/notifications");
  });
}

export async function archiveAction(ids: string[]) {
  return safeAction(async () => {
    const ctx = await requireCtx();
    await archive(ctx.orgId, ids);
    revalidatePath("/notifications");
  });
}

export async function retryJobAction(jobId: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("notifications.manage");
    await retryJob(ctx.orgId, jobId);
    revalidatePath("/notifications");
  });
}
