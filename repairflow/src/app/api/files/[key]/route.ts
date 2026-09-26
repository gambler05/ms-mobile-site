import { NextResponse } from "next/server";
import { verifyFileUrl } from "@/server/crypto";
import { readStored } from "@/server/integrations/storage";
import { prisma } from "@/server/db";

/** Fichiers privés : accès uniquement via URL signée et non expirée. */
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const storageKey = decodeURIComponent(key);
  const url = new URL(req.url);
  const exp = url.searchParams.get("exp") ?? "";
  const sig = url.searchParams.get("sig") ?? "";
  if (!verifyFileUrl(storageKey, exp, sig)) return NextResponse.json({ error: "invalid or expired signature" }, { status: 403 });
  const att = await prisma.attachment.findFirst({ where: { storageKey } });
  const file = await readStored(storageKey);
  if (!att || !file) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(file.buffer), { headers: { "Content-Type": att.mime, "Content-Length": String(file.size), "Cache-Control": "private, max-age=300", "Content-Disposition": `inline; filename="${att.filename.replace(/"/g, "")}"`, "X-Content-Type-Options": "nosniff" } });
}
