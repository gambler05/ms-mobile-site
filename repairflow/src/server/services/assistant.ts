import { prisma } from "@/server/db";
import type { Ctx } from "@/server/auth/guard";
import { getSetting } from "./settings";
import { lowStock } from "./stock";
import { ACTIVE_STATUSES } from "@/lib/domain/tickets";
import { differenceInDays, differenceInHours } from "date-fns";
import { audit } from "@/server/audit";
import { completeWithExternalModel } from "@/server/integrations/assistant-external";

/**
 * Assistant métier. Deux moteurs :
 * - « règles locales » : déterministes, toujours disponibles, aucune donnée ne quitte le serveur ;
 * - « modèle externe » (Anthropic) : uniquement si ANTHROPIC_API_KEY est définie ET que l'organisation
 *   a explicitement autorisé l'envoi de données (réglage assistant.allowExternal). Les données envoyées
 *   sont minimisées (pas de coordonnées client, pas de codes, pas de prix d'achat).
 * Chaque suggestion est identifiée par sa source et doit être validée par l'utilisateur avant toute action.
 */
export interface Suggestion {
  id: string;
  kind: "anomaly" | "restock" | "text";
  source: "local" | "external";
  title: string;
  body: string;
  link?: string;
  severity?: "info" | "warning" | "danger";
}

export function assistantStatus() {
  return { externalConfigured: Boolean(process.env.ANTHROPIC_API_KEY), model: process.env.ASSISTANT_MODEL ?? "claude-sonnet-5" };
}

export async function canUseExternal(orgId: string): Promise<boolean> {
  return assistantStatus().externalConfigured && (await getSetting(orgId, "assistant.allowExternal"));
}

/** Anomalies à vérifier : règles métier explicites, chacune expliquée. */
export async function detectAnomalies(ctx: Ctx): Promise<Suggestion[]> {
  const now = new Date();
  const out: Suggestion[] = [];
  const tickets = await prisma.repairTicket.findMany({ where: { shopId: ctx.shopId, isDraft: false, status: { in: [...ACTIVE_STATUSES, "READY"] } }, include: { parts: true, quotes: true, payments: true, device: true } });
  for (const t of tickets) {
    const label = `${t.number} · ${t.device.brand} ${t.device.model}`;
    if (t.status === "IN_REPAIR" && !t.blockReason && differenceInHours(now, t.updatedAt) > 72) out.push({ id: `stale:${t.id}`, kind: "anomaly", source: "local", severity: "warning", title: `Sans activité depuis ${differenceInDays(now, t.updatedAt)} j`, body: `${label} est « en réparation » sans événement récent. Vérifier l'avancement ou signaler un blocage.`, link: `/repairs/${t.id}` });
    if (t.status === "QUALITY_CHECK" && t.parts.some((p) => p.status === "RESERVED")) out.push({ id: `qc-parts:${t.id}`, kind: "anomaly", source: "local", severity: "warning", title: "Pièce réservée non consommée", body: `${label} est en contrôle qualité mais une pièce est encore réservée : consommer ou libérer.`, link: `/repairs/${t.id}` });
    if (t.quotes.some((q) => q.status === "ACCEPTED") && t.status === "IN_REPAIR" && t.parts.length === 0 && t.laborCents === 0 && differenceInHours(now, t.updatedAt) > 48) out.push({ id: `accepted-idle:${t.id}`, kind: "anomaly", source: "local", severity: "info", title: "Devis accepté, aucune pièce ni intervention", body: `${label} : le devis est accepté depuis plus de 48 h sans pièce réservée ni intervention saisie.`, link: `/repairs/${t.id}` });
    if (t.status === "READY" && t.readyAt && differenceInDays(now, t.readyAt) >= 14) out.push({ id: `ready-long:${t.id}`, kind: "anomaly", source: "local", severity: "danger", title: `Prêt depuis ${differenceInDays(now, t.readyAt)} j`, body: `${label} n'a pas été récupéré. Relancer le client ou appliquer la procédure d'appareil non réclamé.`, link: `/repairs/${t.id}` });
    if (!t.technicianId && t.status !== "RECEIVED") out.push({ id: `no-tech:${t.id}`, kind: "anomaly", source: "local", severity: "info", title: "Aucun technicien assigné", body: `${label} progresse sans technicien responsable.`, link: `/repairs/${t.id}` });
    const acc = t.quotes.find((q) => q.status === "ACCEPTED");
    const paid = t.payments.filter((p) => p.status !== "FAILED").reduce((s, p) => s + p.amountCents, 0);
    if (acc && paid > acc.totalCents) out.push({ id: `overpaid:${t.id}`, kind: "anomaly", source: "local", severity: "danger", title: "Trop-perçu", body: `${label} : encaissé ${(paid / 100).toFixed(2)} € pour un devis de ${(acc.totalCents / 100).toFixed(2)} €.`, link: `/repairs/${t.id}` });
  }
  const pendingPayments = await prisma.payment.count({ where: { shopId: ctx.shopId, status: "RECORDED", createdAt: { lt: new Date(now.getTime() - 48 * 3600_000) } } });
  if (pendingPayments) out.push({ id: "pending-payments", kind: "anomaly", source: "local", severity: "warning", title: `${pendingPayments} paiement(s) non confirmés > 48 h`, body: "Des paiements carte/virement sont enregistrés mais jamais confirmés comme encaissés.", link: "/pos" });
  const negative = await prisma.stockLevel.count({ where: { shopId: ctx.shopId, onHand: { lt: 0 } } });
  if (negative) out.push({ id: "negative-stock", kind: "anomaly", source: "local", severity: "danger", title: `${negative} référence(s) en stock négatif`, body: "Un inventaire validé a produit un stock négatif : vérifier les comptages.", link: "/inventory?sort=stock" });
  return out.sort((a, b) => ({ danger: 0, warning: 1, info: 2 }[a.severity ?? "info"] - { danger: 0, warning: 1, info: 2 }[b.severity ?? "info"]));
}

/** Réapprovisionnement : seuil, consommation 60 j, délai fournisseur, commandes déjà attendues. */
export async function restockSuggestions(ctx: Ctx): Promise<Suggestion[]> {
  const low = await lowStock(ctx.orgId, ctx.shopId);
  const since = new Date(Date.now() - 60 * 86_400_000);
  const usage = await prisma.stockMovement.groupBy({ by: ["productId"], where: { shopId: ctx.shopId, type: { in: ["SALE", "CONSUMPTION"] }, createdAt: { gte: since } }, _sum: { qty: true } });
  const use = new Map(usage.map((u) => [u.productId, -(u._sum.qty ?? 0)]));
  return low.map((l) => {
    const perWeek = ((use.get(l.productId) ?? 0) / 60) * 7;
    const lead = l.product.supplier?.leadDays ?? 5;
    const target = Math.max(l.product.alertThreshold + 1, Math.ceil(perWeek * ((lead / 7) + 2)));
    const qty = Math.max(0, target - l.available - l.expected);
    return { id: `restock:${l.productId}`, kind: "restock" as const, source: "local" as const, severity: l.available <= 0 ? ("danger" as const) : ("warning" as const), title: `${l.product.name} : commander ${qty}`, body: `Disponible ${l.available}, attendu ${l.expected}, seuil ${l.product.alertThreshold}. Consommation ≈ ${perWeek.toFixed(1)}/sem, délai ${lead} j${l.product.supplier ? " (" + l.product.supplier.name + ")" : ""}. Cible ${target}.`, link: `/inventory/purchasing` };
  }).filter((s) => !s.title.endsWith("commander 0"));
}

/** Génération de texte : reformulation, brouillon client, résumé. Local = gabarits ; externe = modèle si autorisé. */
export async function generateText(ctx: Ctx, task: "rephrase" | "draftMessage" | "summarize", ticketId: string): Promise<Suggestion> {
  const t = await prisma.repairTicket.findFirst({ where: { id: ticketId, orgId: ctx.orgId }, include: { device: true, events: { orderBy: { createdAt: "asc" } }, quotes: { where: { status: { in: ["SENT", "ACCEPTED"] } } }, interventions: true, parts: { include: { product: true }, where: { status: "CONSUMED" } } } });
  if (!t) throw new Error("Ticket introuvable");
  const device = `${t.device.brand} ${t.device.model}`;
  const facts = {
    device,
    reportedIssue: t.reportedIssue,
    diagnosis: t.diagnosis,
    status: t.status,
    interventions: t.interventions.map((i) => i.description),
    partsReplaced: t.parts.map((p) => `${p.qty} × ${p.product.name}`),
    quoteTotal: t.quotes[0] ? (t.quotes[0].totalCents / 100).toFixed(2) + " €" : null,
    timeline: t.events.filter((e) => e.type === "STATUS" || e.type === "QUOTE" || e.type === "PART").map((e) => `${e.createdAt.toISOString().slice(0, 10)} ${e.toStatus ?? e.message}`),
  };
  const useExternal = await canUseExternal(ctx.orgId);
  if (useExternal) {
    const prompts = {
      rephrase: `Reformule ce diagnostic technique en une ou deux phrases claires pour un client non technicien, sans ajouter d'information qui n'est pas dans les faits. Diagnostic : "${facts.diagnosis}". Panne déclarée : "${facts.reportedIssue}". Appareil : ${device}.`,
      draftMessage: `Rédige un court message (SMS, < 320 caractères, français, vouvoiement) au client à propos de son ${device}. Statut : ${facts.status}. ${facts.quoteTotal ? "Devis : " + facts.quoteTotal + "." : ""} Ne promets aucun délai ni intervention non listée. Faits : ${JSON.stringify({ diagnosis: facts.diagnosis, interventions: facts.interventions })}.`,
      summarize: `Résume en 3 à 5 puces l'historique de cette réparation (${device}) pour un technicien qui reprend le dossier. Utilise uniquement ces faits : ${JSON.stringify(facts)}. N'invente aucune intervention.`,
    };
    const text = await completeWithExternalModel(prompts[task]);
    await audit(ctx, "assistant.external", "RepairTicket", ticketId, {}, { task, model: assistantStatus().model });
    return { id: `${task}:${ticketId}`, kind: "text", source: "external", title: task, body: text };
  }
  // Gabarits locaux (déterministes)
  let body = "";
  if (task === "rephrase") body = facts.diagnosis ? `Après examen de votre ${device}, nous avons constaté : ${facts.diagnosis.replace(/\s+/g, " ").trim()}. ${facts.partsReplaced.length ? "Intervention prévue : remplacement de " + facts.partsReplaced.join(", ") + "." : ""}`.trim() : `Le diagnostic de votre ${device} est en cours ; nous vous tiendrons informé(e).`;
  if (task === "draftMessage") body = t.status === "READY" ? `Bonjour, votre ${device} est prêt. ${facts.quoteTotal ? "Montant : " + facts.quoteTotal + ". " : ""}Nous vous attendons en boutique aux horaires habituels. — ${ctx.user.shops.find((s) => s.id === ctx.shopId)?.name}` : t.status === "QUOTE_SENT" || t.status === "AWAITING_APPROVAL" ? `Bonjour, le devis de votre ${device} (${facts.quoteTotal ?? "montant en ligne"}) vous attend sur votre espace de suivi. Merci de nous indiquer votre décision. — ${ctx.user.shops.find((s) => s.id === ctx.shopId)?.name}` : `Bonjour, votre ${device} est actuellement « ${t.status} ». ${facts.diagnosis ? "Diagnostic : " + facts.diagnosis + ". " : ""}Nous revenons vers vous dès que possible.`;
  if (task === "summarize") body = [`• Appareil : ${device} — panne : ${facts.reportedIssue}`, facts.diagnosis ? `• Diagnostic : ${facts.diagnosis}` : "• Diagnostic : non renseigné", facts.partsReplaced.length ? `• Pièces consommées : ${facts.partsReplaced.join(", ")}` : "• Aucune pièce consommée", facts.interventions.length ? `• Interventions : ${facts.interventions.join(" ; ")}` : "• Aucune intervention saisie", `• Statut actuel : ${t.status}${facts.quoteTotal ? " — devis " + facts.quoteTotal : ""}`].join("\n");
  return { id: `${task}:${ticketId}`, kind: "text", source: "local", title: task, body };
}
