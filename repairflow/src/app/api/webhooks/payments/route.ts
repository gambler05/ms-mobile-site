import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/server/db";
import { settlePayment } from "@/server/services/payments";

/**
 * Webhook de confirmation d'encaissement (terminal / prestataire de paiement).
 * Signature HMAC-SHA256 du corps avec PAYMENT_WEBHOOK_SECRET, déduplication par identifiant externe.
 * Sans secret configuré, l'endpoint refuse tout appel (état « non configuré » dans Réglages › Intégrations).
 */
export async function POST(req: Request) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  const raw = await req.text();
  const sig = req.headers.get("x-signature") ?? "";
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const verified = sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  const parsed = z.object({ id: z.string(), paymentId: z.string(), status: z.enum(["settled", "failed"]), providerRef: z.string().default("") }).safeParse(JSON.parse(raw || "{}"));
  if (!parsed.success) return NextResponse.json({ error: "bad payload" }, { status: 400 });
  const existing = await prisma.webhookEvent.findUnique({ where: { provider_externalId: { provider: "payments", externalId: parsed.data.id } } });
  if (existing) return NextResponse.json({ ok: true, duplicate: true });
  await prisma.webhookEvent.create({ data: { provider: "payments", externalId: parsed.data.id, verified, payloadJson: raw.slice(0, 4000) } });
  if (!verified) return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  if (parsed.data.status === "settled") await settlePayment(null, parsed.data.paymentId, parsed.data.providerRef);
  else await prisma.payment.updateMany({ where: { id: parsed.data.paymentId, status: "RECORDED" }, data: { status: "FAILED", providerRef: parsed.data.providerRef } });
  await prisma.webhookEvent.update({ where: { provider_externalId: { provider: "payments", externalId: parsed.data.id } }, data: { processedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
