"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { saveCountLineAction, startCountAction, validateCountAction } from "@/app/actions/inventory";
import { PRODUCT_TYPES } from "@/lib/domain/inventory";

type Count = { id: string; label: string; status: string; createdAt: string; validatedAt: string | null; lines: number };
type Current = { id: string; label: string; status: string; lines: { productId: string; name: string; sku: string; expected: number; counted: number | null; note: string }[] };

export function CountsView({ counts, current }: { counts: Count[]; current: Current | null }) {
  const t = useT();
  const router = useRouter();
  const [label, setLabel] = useState(`Inventaire ${new Date().toLocaleDateString()}`);
  const [type, setType] = useState("");
  const [pending, start] = useTransition();
  const [local, setLocal] = useState<Record<string, { counted: string; note: string }>>({});
  const diffs = current?.lines.filter((l) => l.counted !== null && l.counted !== l.expected).length ?? 0;
  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-3">
        <div className="surface space-y-2 p-4"><Input value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Libellé" /><Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type"><option value="">{t("common.all")}</option>{PRODUCT_TYPES.map((x) => <option key={x} value={x}>{t(`inventory.types.${x}`)}</option>)}</Select><Button variant="primary" className="w-full" loading={pending} onClick={() => start(async () => { const r = await startCountAction(label, type); if (r.ok) router.push(`/inventory/counts?id=${r.data.id}`); else toast.error(r.error); })}><Plus /> {t("inventory.newCount")}</Button></div>
        <ul className="surface divide-y divide-border">{counts.map((c) => <li key={c.id}><Link href={`/inventory/counts?id=${c.id}`} className={cn("flex items-center justify-between px-3 py-2 text-[13px] hover:bg-hover", current?.id === c.id && "bg-active")}><span><span className="block font-medium">{c.label}</span><span className="text-[11.5px] text-muted">{fmtDateTime(c.createdAt, t.locale)} · {c.lines} réf.</span></span><Badge tone={c.status === "VALIDATED" ? "success" : "accent"}>{c.status === "VALIDATED" ? "Validé" : "Ouvert"}</Badge></Link></li>)}</ul>
      </aside>
      {current ? (
        <section className="surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3"><div><h2 className="font-semibold">{current.label}</h2><p className="text-[12.5px] text-muted">{current.lines.filter((l) => l.counted !== null).length}/{current.lines.length} comptés · {diffs} écart(s)</p></div>{current.status === "OPEN" ? <Button variant="primary" loading={pending} onClick={() => { if (!confirm("Valider ? Les écarts deviennent des mouvements de stock immuables.")) return; start(async () => { const r = await validateCountAction(current.id); if (r.ok) { toast.success(`${r.data.adjustments} ajustement(s)`); router.refresh(); } else toast.error(r.error); }); }}>{t("inventory.validateCount")}</Button> : <Badge tone="success">Validé</Badge>}</div>
          <Table><THead><TR><TH>Produit</TH><TH className="text-end">Théorique</TH><TH className="text-end">Compté</TH><TH className="text-end">Écart</TH><TH>Note</TH></TR></THead>
            <TBody>{current.lines.map((l) => { const v = local[l.productId]?.counted ?? (l.counted === null ? "" : String(l.counted)); const n = local[l.productId]?.note ?? l.note; const d = v === "" ? null : Number(v) - l.expected; return <TR key={l.productId}><TD>{l.name}<span className="mono ms-2 text-subtle">{l.sku}</span></TD><TD className="tnum text-end">{l.expected}</TD><TD className="text-end"><Input type="number" className="ms-auto w-24 text-end" value={v} disabled={current.status !== "OPEN"} onChange={(e) => setLocal({ ...local, [l.productId]: { counted: e.target.value, note: n } })} onBlur={() => start(async () => { await saveCountLineAction(current.id, l.productId, v === "" ? null : Number(v), n); })} /></TD><TD className={cn("tnum text-end font-medium", d && d !== 0 ? "text-danger" : "text-muted")}>{d === null ? "—" : d > 0 ? `+${d}` : d}</TD><TD><Input value={n} placeholder="—" disabled={current.status !== "OPEN"} onChange={(e) => setLocal({ ...local, [l.productId]: { counted: v, note: e.target.value } })} onBlur={() => start(async () => { await saveCountLineAction(current.id, l.productId, v === "" ? null : Number(v), n); })} /></TD></TR>; })}</TBody></Table>
        </section>
      ) : <section className="surface flex items-center justify-center p-10 text-[13px] text-muted">{t("common.empty")}</section>}
    </div>
  );
}
