import Link from "next/link";
import { requirePage } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { getT } from "@/i18n/server";
import { periodFromKey } from "@/server/services/reports";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Ventes" };
export const dynamic = "force-dynamic";

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const ctx = await requirePage("pos.sell");
  const t = await getT();
  const { period = "30d" } = await searchParams;
  const p = periodFromKey(period);
  const sales = await prisma.sale.findMany({ where: { shopId: ctx.shopId, createdAt: { gte: p.from, lte: p.to } }, include: { payments: true, customer: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: "desc" }, take: 300 });
  const total = sales.filter((s) => s.kind !== "RETURN").reduce((a, s) => a + s.totalCents, 0) + sales.filter((s) => s.kind === "RETURN").reduce((a, s) => a + s.totalCents, 0);
  return (
    <div className="mx-auto max-w-6xl space-y-4 anim-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="display text-[24px]">{t("pos.sales")}</h1><p className="text-[13px] text-muted">{sales.length} · {fmtMoney(total, t.locale)}</p></div>
        <nav className="flex gap-1 rounded-[var(--radius-sm)] border border-border p-0.5 text-[12px]">{["1d", "7d", "30d", "90d"].map((k) => <Link key={k} href={`/pos/sales?period=${k}`} className={`rounded px-2 py-1 ${k === period ? "bg-active" : "text-muted"}`}>{k.replace("d", " j")}</Link>)}</nav>
      </header>
      <div className="surface overflow-hidden">
        <Table>
          <THead><TR><TH>N°</TH><TH>{t("common.date")}</TH><TH>Type</TH><TH>{t("common.customer")}</TH><TH>{t("pos.methods.CASH")} / {t("pos.methods.CARD")}</TH><TH className="text-end">{t("common.total")}</TH></TR></THead>
          <TBody>
            {sales.map((s) => (
              <TR key={s.id}>
                <TD><span className="mono">{s.number}</span></TD>
                <TD className="tnum text-muted">{fmtDateTime(s.createdAt, t.locale)}</TD>
                <TD><Badge tone={s.kind === "RETURN" ? "danger" : s.kind === "REPAIR_SETTLEMENT" ? "iris" : "neutral"}>{s.kind === "RETURN" ? t("pos.refund") : s.kind === "REPAIR_SETTLEMENT" ? t("pos.repairSettlement") : t("pos.sales")}</Badge>{s.status !== "COMPLETED" ? <Badge tone="warning" className="ms-1">{s.status}</Badge> : null}</TD>
                <TD>{s.customer ? `${s.customer.firstName} ${s.customer.lastName}` : <span className="text-subtle">{t("pos.walkIn")}</span>}</TD>
                <TD className="text-[12px] text-muted">{s.payments.map((p) => `${t(`pos.methods.${p.method}` as never)} ${fmtMoney(p.amountCents, t.locale)}${p.status === "RECORDED" ? " ⏳" : ""}`).join(" · ")}</TD>
                <TD className="tnum text-end font-medium">{fmtMoney(s.totalCents, t.locale)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
