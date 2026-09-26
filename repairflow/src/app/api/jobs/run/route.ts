import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runAllJobs } from "@/server/jobs/scheduled";

/**
 * Endpoint appelé par le planificateur (Vercel Cron, cron système, ou `npm run worker`).
 * Protégé par CRON_SECRET (en-tête Authorization: Bearer <secret>).
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await runAllJobs();
  return NextResponse.json({ ok: true, results });
}
export const GET = POST;
