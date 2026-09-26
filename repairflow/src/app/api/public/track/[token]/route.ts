import { NextResponse } from "next/server";
import { z } from "zod";
import { decideQuote, getPublicTicket, verifyDocPin } from "@/server/services/tickets";
import { prisma } from "@/server/db";
import { signedFileUrl } from "@/server/crypto";
import { publicRateLimit } from "@/server/ratelimit";

/** Actions du portail client : décision de devis et accès aux documents (avec PIN). */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
  if (!publicRateLimit(`track:${ip}`, 30, 60_000)) return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  const pub = await getPublicTicket(token);
  if (!pub) return NextResponse.json({ error: "invalid" }, { status: 404 });
  const body = z.discriminatedUnion("action", [
    z.object({ action: z.literal("decide"), quoteId: z.string(), accepted: z.boolean(), note: z.string().max(300).default("") }),
    z.object({ action: z.literal("documents"), pin: z.string().regex(/^\d{4}$/) }),
  ]).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (body.data.action === "decide") {
    try {
      await decideQuote(null, pub.id, body.data.quoteId, body.data.accepted, body.data.note);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 409 });
    }
  }
  if (!publicRateLimit(`pin:${token.slice(0, 16)}`, 5, 10 * 60_000)) return NextResponse.json({ error: "Trop de tentatives" }, { status: 429 });
  if (!(await verifyDocPin(token, body.data.pin))) return NextResponse.json({ error: "Code incorrect" }, { status: 403 });
  const docs = await prisma.attachment.findMany({ where: { ticketId: pub.id, visibleToCustomer: true } });
  return NextResponse.json({ ok: true, documents: docs.map((d) => ({ id: d.id, filename: d.filename, kind: d.kind, url: signedFileUrl(d.storageKey, 900) })) });
}
