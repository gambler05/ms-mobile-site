"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { adjustStockAction, transferStockAction } from "@/app/actions/inventory";

export function StockActions({ product, shops, onDone }: { product: { id: string; available: number }; shops: { id: string; name: string }[]; onDone: () => void }) {
  const t = useT();
  const [mode, setMode] = useState<"adjust" | "transfer">("adjust");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const [toShop, setToShop] = useState(shops[0]?.id ?? "");
  const [pending, start] = useTransition();
  return (
    <div className="rounded-[var(--radius-md)] border border-border p-3">
      <div className="mb-2 flex gap-1">{(["adjust", "transfer"] as const).map((m) => <Button key={m} size="sm" variant={mode === m ? "primary" : "ghost"} onClick={() => setMode(m)} disabled={m === "transfer" && shops.length === 0}>{m === "adjust" ? t("inventory.adjust") : t("inventory.transfer")}</Button>)}</div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={mode === "adjust" ? "Quantité (±)" : t("common.quantity")}><Input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} /></Field>
        {mode === "transfer" ? <Field label={t("common.shop")}><Select value={toShop} onChange={(e) => setToShop(e.target.value)}>{shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field> : <div />}
        <Field label={t("common.reason")} className="col-span-2"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Casse, erreur de saisie, réassort…" /></Field>
      </div>
      <Button className="mt-2 w-full" loading={pending} disabled={!reason.trim() || qty === 0} onClick={() => start(async () => { const r = mode === "adjust" ? await adjustStockAction(product.id, qty, reason) : await transferStockAction(product.id, toShop, Math.abs(qty), reason); if (!r.ok) toast.error(r.error); else { toast.success(t("common.save")); onDone(); } })}>{t("common.confirm")}</Button>
    </div>
  );
}
