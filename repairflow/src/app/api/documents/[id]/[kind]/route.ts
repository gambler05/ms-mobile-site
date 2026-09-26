import { NextResponse } from "next/server";
import { requireCtx, AuthError } from "@/server/auth/guard";
import { getTicket, getTrackingUrl } from "@/server/services/tickets";
import { depositSlipPdf, labelPdf, quotePdf, returnSlipPdf } from "@/server/documents/pdf";
import { audit } from "@/server/audit";
import { DomainError } from "@/server/errors";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  try {
    const ctx = await requireCtx("tickets.view");
    const t = await getTicket(ctx, id);
    let bytes: Uint8Array;
    if (kind === "label") bytes = await labelPdf(t);
    else if (kind === "quote") bytes = await quotePdf(t);
    else if (kind === "return") bytes = await returnSlipPdf(t);
    else if (kind === "deposit") {
      const url = (await getTrackingUrl(ctx, id)) ?? `${process.env.APP_URL ?? ""}/t/revoque`;
      bytes = await depositSlipPdf(t, url);
    } else return NextResponse.json({ error: "unknown document" }, { status: 404 });
    await audit(ctx, `document.${kind}`, "RepairTicket", id);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${t.number}-${kind}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.code }, { status: e.code === "unauthenticated" ? 401 : 403 });
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
