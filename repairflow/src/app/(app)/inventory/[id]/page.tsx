import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePage, ctxHas } from "@/server/auth/guard";
import { getProduct } from "@/server/services/inventory";
import { NotFoundError } from "@/server/errors";
import { getT } from "@/i18n/server";
import { prisma } from "@/server/db";
import { fmtDateTime, fmtMoney, fmtPercentBp } from "@/lib/format";
import { marginBp } from "@/lib/domain/inventory";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ProductEdit } from "./product-edit";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("inventory.view");
  const t = await getT();
  const { id } = await params;
  let p;
  try { p = await getProduct(ctx, id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const suppliers = await prisma.supplier.findMany({ where: { orgId: ctx.orgId }, select: { id: true, name: true } });
  const users = await prisma.user.findMany({ where: { orgId: ctx.orgId }, select: { id: true, name: true } });
  const levels = p.stockLevels;
  return (
    <div className="mx-auto max-w-6xl space-y-4 anim-in">
      <Link href="/inventory" className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-fg"><ArrowLeft className="size-3.5 rtl:-scale-x-100" /> {t("inventory.title")}</Link>
      <header className="surface highlight-top flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="flex flex-wrap items-center gap-2"><h1 className="display text-[22px]">{p.name}</h1><Badge>{t(`inventory.types.${p.type}` as never)}</Badge>{p.quality ? <Badge tone="iris">{t(`inventory.quality.${p.quality}` as never)}</Badge> : null}{!p.active ? <Badge tone="danger">Inactif</Badge> : null}</div><p className="mono mt-1 text-[13px] text-muted">{p.sku}{p.barcode ? ` · ${p.barcode}` : ""}</p><p className="text-[13px] text-muted">{[p.brand, p.category, p.supplier?.name].filter(Boolean).join(" · ")}</p><div className="mt-2 flex flex-wrap gap-1">{(JSON.parse(p.compatibilitiesJson) as string[]).map((c) => <Badge key={c} tone="outline">{c}</Badge>)}</div></div>
        {ctxHas(ctx, "inventory.edit") ? <ProductEdit product={{ id: p.id, sku: p.sku, barcode: p.barcode, name: p.name, type: p.type as never, brand: p.brand, category: p.category, quality: p.quality ?? "", supplierId: p.supplierId ?? "", supplierRef: p.supplierRef, cost: (p.costCents / 100).toFixed(2), price: (p.priceCents / 100).toFixed(2), taxRate: String(p.taxRateBp / 100), alertThreshold: p.alertThreshold, compat: (JSON.parse(p.compatibilitiesJson) as string[]).join("; "), location: levels.find((l) => l.shopId === ctx.shopId)?.location ?? "", serialized: p.serialized, active: p.active, description: p.description, initialQty: 0 }} suppliers={suppliers} /> : null}
      </header>
      <div className="grid gap-3 sm:grid-cols-4">
        {[[t("inventory.cost"), fmtMoney(p.costCents, t.locale)], [t("inventory.priceLabel"), fmtMoney(p.priceCents, t.locale)], [t("inventory.margin"), p.priceCents ? `${fmtPercentBp(marginBp(p.priceCents, p.costCents), t.locale)} · ${fmtMoney(p.priceCents - p.costCents, t.locale)}` : "—"], [t("inventory.threshold"), String(p.alertThreshold)]].map(([k, v]) => <div key={k} className="surface p-4"><div className="text-[12px] text-muted">{k}</div><div className="display tnum mt-1 text-[18px] font-semibold">{v}</div></div>)}
      </div>
      <Card><CardHeader title="Stock par boutique" /><CardBody className="p-0 pb-1"><Table><THead><TR><TH>{t("common.shop")}</TH><TH>{t("inventory.location")}</TH><TH className="text-end">{t("inventory.onHand")}</TH><TH className="text-end">{t("inventory.reserved")}</TH><TH className="text-end">{t("inventory.available")}</TH><TH className="text-end">{t("inventory.expected")}</TH></TR></THead><TBody>{levels.map((l) => <TR key={l.id}><TD>{l.shop.name}</TD><TD className="text-muted">{l.location || "—"}</TD><TD className="tnum text-end">{l.onHand}</TD><TD className="tnum text-end">{l.reserved}</TD><TD className={cn("tnum text-end font-medium", l.onHand - l.reserved <= p.alertThreshold && "text-warning")}>{l.onHand - l.reserved}</TD><TD className="tnum text-end text-muted">{l.expected}</TD></TR>)}</TBody></Table></CardBody></Card>
      {p.serialized ? <Card><CardHeader title={t("inventory.units")} /><CardBody className="p-0 pb-1"><Table><THead><TR><TH>IMEI / S/N</TH><TH>Grade</TH><TH>Détails</TH><TH>{t("common.status")}</TH></TR></THead><TBody>{p.units.map((u) => <TR key={u.id}><TD className="mono">{u.imei || u.serial}</TD><TD>{u.grade || "Neuf"}</TD><TD className="text-muted">{[u.capacity, u.color, u.condition].filter(Boolean).join(" · ")}</TD><TD><Badge tone={u.status === "IN_STOCK" ? "success" : u.status === "SOLD" ? "neutral" : "warning"}>{u.status}</Badge></TD></TR>)}</TBody></Table></CardBody></Card> : null}
      <Card><CardHeader title={t("inventory.movements")} description="Historique immuable" /><CardBody className="p-0 pb-1"><Table><THead><TR><TH>{t("common.date")}</TH><TH>Type</TH><TH className="text-end">Qté</TH><TH className="text-end">Solde</TH><TH>{t("common.reason")}</TH><TH>Réf.</TH><TH>Par</TH></TR></THead><TBody>{p.movements.map((m) => <TR key={m.id}><TD className="tnum text-muted">{fmtDateTime(m.createdAt, t.locale)}</TD><TD><Badge tone={m.qty > 0 ? "success" : "neutral"}>{t(`inventory.movementTypes.${m.type}` as never)}</Badge></TD><TD className={cn("tnum text-end font-medium", m.qty < 0 && "text-danger")}>{m.qty > 0 ? "+" : ""}{m.qty}</TD><TD className="tnum text-end">{m.balanceAfter}</TD><TD className="max-w-[260px] truncate text-muted">{m.reason}</TD><TD className="text-[12px] text-subtle">{m.refType ? (m.refType === "TICKET" ? <Link className="text-accent hover:underline" href={`/repairs/${m.refId}`}>ticket</Link> : m.refType.toLowerCase()) : ""}</TD><TD className="text-muted">{users.find((u) => u.id === m.authorId)?.name ?? "—"}</TD></TR>)}</TBody></Table></CardBody></Card>
    </div>
  );
}
