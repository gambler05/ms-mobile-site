import { requirePage } from "@/server/auth/guard";
import { getT } from "@/i18n/server";
import { assistantStatus, canUseExternal, detectAnomalies, restockSuggestions } from "@/server/services/assistant";
import { getSetting } from "@/server/services/settings";
import { prisma } from "@/server/db";
import { AssistantView } from "./assistant-view";
import { ACTIVE_STATUSES } from "@/lib/domain/tickets";

export const metadata = { title: "Assistant" };
export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const ctx = await requirePage("assistant.use");
  const t = await getT();
  const enabled = await getSetting(ctx.orgId, "assistant.enabled");
  const [anomalies, restock, tickets] = enabled ? await Promise.all([detectAnomalies(ctx), restockSuggestions(ctx), prisma.repairTicket.findMany({ where: { shopId: ctx.shopId, isDraft: false, status: { in: [...ACTIVE_STATUSES, "READY"] } }, include: { device: true }, orderBy: { updatedAt: "desc" }, take: 60 })]) : [[], [], []];
  return (
    <div className="mx-auto max-w-5xl space-y-4 anim-in">
      <header><h1 className="display text-[24px]">{t("assistant.title")}</h1><p className="text-[13px] text-muted">{t("assistant.disclaimer")}</p></header>
      <AssistantView enabled={enabled} external={await canUseExternal(ctx.orgId)} status={assistantStatus()} anomalies={anomalies} restock={restock} tickets={tickets.map((x) => ({ id: x.id, label: `${x.number} · ${x.device.brand} ${x.device.model}` }))} />
    </div>
  );
}
