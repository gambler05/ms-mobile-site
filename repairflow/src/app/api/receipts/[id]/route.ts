import { NextResponse } from "next/server";
import { requireCtx, AuthError } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { receiptPdf } from "@/server/documents/pdf";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ctx = await requireCtx("pos.sell");
    const sale = await prisma.sale.findFirst({ where: { id, orgId: ctx.orgId }, include: { lines: true, payments: true, shop: true, customer: true } });
    if (!sale) return NextResponse.json({ error: "not found" }, { status: 404 });
    const thermal = new URL(req.url).searchParams.get("format") === "thermal";
    const bytes = await receiptPdf(sale, thermal);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${sale.number}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.code }, { status: 401 });
    throw e;
  }
}
