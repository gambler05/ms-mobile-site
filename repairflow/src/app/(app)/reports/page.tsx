import Link from "next/link";
import { requirePage, ctxHas } from "@/server/auth/guard";
import { getT } from "@/i18n/server";
import { categoryProfitability, financeReport, periodFromKey, shopComparison, stockReport, workshopReport } from "@/server/services/reports";
import { fmtMoney, fmtPercentBp } from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { KindBars } from "@/components/reports/kind-bars";

export const metadata = { title: "Rapports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string; tab?: string }> }) {
  const ctx = await requirePage("reports.view");
  const t = await getT();
  const { period = "30d", tab = "finance" } = await searchParams;
  const p = periodFromKey(period);
  const finance = ctxHas(ctx, "reports.finance") ? await financeReport(ctx, p) : null;
  const workshop = await workshopReport(ctx, p);
  const stock = await stockReport(ctx);
  const cats = await categoryProfitability(ctx, p);
  const shops = ctx.user.shops.length > 1 ? await shopComparison(ctx, p) : null;
  const tabs = [["finance", t("reports.finance")], ["workshop", t("reports.workshop")], ["stock", t("reports.stock")], ["categories", t("reports.categories")], ...(shops ? [["shops", t("reports.shops")]] : [])];
  const L = t.locale;
  return (
    <div className="mx-auto max-w-6xl space-y-4 anim-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="display text-[24px]">{t("reports.title")}</h1><p className="text-[13px] text-muted">{ctx.user.shops.find((s) => s.id === ctx.shopId)?.name}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex gap-1 rounded-[var(--radius-sm)] border border-border p-0.5 text-[12px]">{["7d", "30d", "90d", "365d"].map((k) => <Link key={k} href={`/reports?tab=${tab}&period=${k}`} className={cn("rounded px-2 py-1", k === period ? "bg-active" : "text-muted")}>{k.replace("d", " j")}</Link>)}</nav>
          <Button asChild variant="ghost"><a href={`/api/export/report?tab=${tab}&period=${period}&format=xlsx`}><Download /> {t("reports.exportXlsx")}</a></Button>
          <Button asChild variant="ghost"><a href={`/api/export/report?tab=${tab}&period=${period}&format=pdf`} target="_blank" rel="noreferrer"><Download /> {t("reports.exportPdf")}</a></Button>
        </div>
      </header>
      <nav className="flex flex-wrap gap-1 border-b border-border">{tabs.map(([k, l]) => <Link key={k} href={`/reports?tab=${k}&period=${period}`} className={cn("border-b-2 px-3 py-2 text-[13px]", k === tab ? "border-accent font-medium" : "border-transparent text-muted hover:text-fg")}>{l}</Link>)}</nav>

      {tab === "finance" && (finance ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[["Ventes TTC", finance.salesTotalCents], ["Réparations facturées TTC", finance.repairsTotalCents], ["Encaissé (réel)", finance.settledTotalCents], ["Marge brute ventes", finance.salesMarginCents], ["Marge brute réparations", finance.repairsMarginCents], ["Coût pièces consommées", finance.partsCostCents], ["Main-d'œuvre", finance.laborCents], ["Ventes HT", finance.salesNetCents]].map(([k, v]) => <div key={k as string} className="surface p-4"><div className="text-[12px] text-muted">{k}</div><div className="display tnum mt-1 text-[20px] font-semibold">{fmtMoney(v as number, L)}</div></div>)}
          </div>
          <Card><CardHeader title="Encaissements par mode" /><CardBody><Table><THead><TR><TH>Mode</TH><TH className="text-end">Montant</TH></TR></THead><TBody>{finance.settledByMethod.map((m) => <TR key={m.method}><TD>{t(`pos.methods.${m.method}` as never)}</TD><TD className="tnum text-end">{fmtMoney(m.amountCents, L)}</TD></TR>)}</TBody></Table></CardBody></Card>
          <Methodology items={["Ventes TTC : total des ventes en caisse (retours déduits) sur la période, par date de vente.", "Réparations facturées : règlements de réparation enregistrés (hors acomptes non soldés).", "Encaissé : paiements au statut « encaissé » (SETTLED) par date d'encaissement ; les paiements carte/virement en attente ne sont pas comptés.", "Marge brute ventes = ventes HT − coût d'achat figé sur chaque ligne au moment de la vente.", "Marge brute réparations = devis acceptés HT des tickets prêts/livrés sur la période − coût des pièces consommées sur la période."]} />
        </div>
      ) : <p className="surface p-6 text-[13px] text-muted">{t("common.forbidden")}</p>)}

      {tab === "workshop" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[["Réparations terminées", String(workshop.completed)], ["Livrées", String(workshop.delivered)], [t("reports.avgDuration"), t("reports.hours", { n: workshop.avgHours })], [t("reports.onTime"), fmtPercentBp(workshop.onTimeRateBp, L)], [t("reports.warrantyRate"), `${fmtPercentBp(workshop.warrantyReturnRateBp, L)} (${workshop.warrantyReturns})`]].map(([k, v]) => <div key={k} className="surface p-4"><div className="text-[12px] text-muted">{k}</div><div className="display tnum mt-1 text-[20px] font-semibold">{v}</div></div>)}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader title={t("reports.perTech")} /><CardBody className="p-0 pb-1"><Table><THead><TR><TH>{t("common.technician")}</TH><TH className="text-end">Terminées</TH><TH className="text-end">CA</TH><TH className="text-end">Durée moy.</TH><TH className="text-end">À l'heure</TH></TR></THead><TBody>{workshop.perTech.map((u) => <TR key={u.id}><TD>{u.name}</TD><TD className="tnum text-end">{u.completed}</TD><TD className="tnum text-end">{fmtMoney(u.revenueCents, L)}</TD><TD className="tnum text-end">{u.avgHours} h</TD><TD className="tnum text-end">{u.onTime}/{u.completed}</TD></TR>)}</TBody></Table></CardBody></Card>
            <Card><CardHeader title="Tickets par type d'appareil" /><CardBody><KindBars data={Object.entries(workshop.kindCounts).map(([k, v]) => ({ label: t(`deviceKind.${k}` as never), value: v }))} /></CardBody></Card>
          </div>
          <Methodology items={["Durée moyenne : de la réception à l'état « Prêt », en heures, pour les tickets prêts/livrés sur la période.", "Respect des délais : part des tickets prêts au plus tard à la date promise (tickets sans date promise comptés comme à l'heure).", "Taux de retour garantie : tickets ouverts en retour garantie sur la période / tickets livrés sur la période."]} />
        </div>
      )}

      {tab === "stock" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">{[[t("reports.stockValue"), fmtMoney(stock.valueCents, L)], [t("reports.immobilized"), fmtMoney(stock.immobilizedCents, L)], ["Références", String(stock.rows.length)]].map(([k, v]) => <div key={k} className="surface p-4"><div className="text-[12px] text-muted">{k}</div><div className="display tnum mt-1 text-[20px] font-semibold">{v}</div></div>)}</div>
          <Card><CardHeader title="Par catégorie" /><CardBody className="p-0 pb-1"><Table><THead><TR><TH>Catégorie</TH><TH className="text-end">Unités</TH><TH className="text-end">Valeur (coût)</TH><TH className="text-end">Sorties 90 j</TH></TR></THead><TBody>{Object.entries(stock.byCategory).sort((a, b) => b[1].valueCents - a[1].valueCents).map(([k, v]) => <TR key={k}><TD>{k}</TD><TD className="tnum text-end">{v.items}</TD><TD className="tnum text-end">{fmtMoney(v.valueCents, L)}</TD><TD className="tnum text-end">{v.sold90}</TD></TR>)}</TBody></Table></CardBody></Card>
          <Card><CardHeader title={`${t("reports.rotation")} · top 25 en valeur`} /><CardBody className="p-0 pb-1"><Table><THead><TR><TH>Produit</TH><TH className="text-end">Stock</TH><TH className="text-end">Valeur</TH><TH className="text-end">Sorties 90 j</TH><TH className="text-end">Rotation</TH></TR></THead><TBody>{stock.rows.slice(0, 25).map((r) => <TR key={r.product.id}><TD><Link href={`/inventory/${r.product.id}`} className="hover:underline">{r.product.name}</Link></TD><TD className="tnum text-end">{r.onHand}</TD><TD className="tnum text-end">{fmtMoney(r.valueCents, L)}</TD><TD className="tnum text-end">{r.sold90}</TD><TD className={cn("tnum text-end", r.onHand > 0 && r.sold90 === 0 && "text-warning")}>{r.rotation.toFixed(2)}</TD></TR>)}</TBody></Table></CardBody></Card>
          <Methodology items={["Valeur du stock = quantité physique × prix d'achat courant.", "Stock immobilisé : valeur des références en stock sans aucune sortie (vente ou consommation) depuis 90 jours.", "Rotation = sorties sur 90 jours / stock actuel."]} />
        </div>
      )}

      {tab === "categories" && <Card><CardHeader title={t("reports.categories")} description="Ventes en caisse, retours déduits" /><CardBody className="p-0 pb-1"><Table><THead><TR><TH>Catégorie</TH><TH className="text-end">Qté</TH><TH className="text-end">CA TTC</TH><TH className="text-end">Coût</TH><TH className="text-end">Marge</TH><TH className="text-end">Taux</TH></TR></THead><TBody>{cats.map((c) => <TR key={c.category}><TD>{c.category}</TD><TD className="tnum text-end">{c.qty}</TD><TD className="tnum text-end">{fmtMoney(c.revenueCents, L)}</TD><TD className="tnum text-end">{fmtMoney(c.costCents, L)}</TD><TD className="tnum text-end font-medium">{fmtMoney(c.marginCents, L)}</TD><TD className="tnum text-end">{c.revenueCents ? fmtPercentBp(Math.round((c.marginCents * 10_000) / c.revenueCents), L) : "—"}</TD></TR>)}</TBody></Table></CardBody></Card>}

      {tab === "shops" && shops && <Card><CardHeader title={t("reports.shops")} /><CardBody className="p-0 pb-1"><Table><THead><TR><TH>{t("common.shop")}</TH><TH className="text-end">Ventes TTC</TH><TH className="text-end">Réparations</TH><TH className="text-end">Encaissé</TH><TH className="text-end">Terminées</TH><TH className="text-end">À l'heure</TH></TR></THead><TBody>{shops.map((s) => <TR key={s.shop.id}><TD>{s.shop.name}</TD><TD className="tnum text-end">{fmtMoney(s.finance.salesTotalCents, L)}</TD><TD className="tnum text-end">{fmtMoney(s.finance.repairsTotalCents, L)}</TD><TD className="tnum text-end">{fmtMoney(s.finance.settledTotalCents, L)}</TD><TD className="tnum text-end">{s.workshop.completed}</TD><TD className="tnum text-end">{fmtPercentBp(s.workshop.onTimeRateBp, L)}</TD></TR>)}</TBody></Table></CardBody></Card>}
    </div>
  );
}

function Methodology({ items }: { items: string[] }) {
  return <details className="surface p-4 text-[13px]"><summary className="cursor-default font-medium">Méthode de calcul</summary><ul className="mt-2 list-disc space-y-1 ps-5 text-muted">{items.map((i) => <li key={i}>{i}</li>)}</ul></details>;
}
