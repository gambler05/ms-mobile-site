"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Sparkles, Copy, AlertTriangle, PackageSearch } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { assistantGenerateAction } from "@/app/actions/assistant";
import type { Suggestion } from "@/server/services/assistant";

export function AssistantView({ enabled, external, status, anomalies, restock, tickets }: { enabled: boolean; external: boolean; status: { externalConfigured: boolean; model: string }; anomalies: Suggestion[]; restock: Suggestion[]; tickets: { id: string; label: string }[] }) {
  const t = useT();
  const [ticketId, setTicketId] = useState(tickets[0]?.id ?? "");
  const [result, setResult] = useState<Suggestion | null>(null);
  const [pending, start] = useTransition();
  const gen = (task: "rephrase" | "draftMessage" | "summarize") => start(async () => { const r = await assistantGenerateAction(task, ticketId); if (r.ok) setResult(r.data); else toast.error(r.error); });
  const sev = (s?: string) => (s === "danger" ? "danger" : s === "warning" ? "warning" : "accent");
  if (!enabled) return <p className="surface p-6 text-[13px] text-muted">Assistant désactivé dans Réglages › Général.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]"><Badge tone="success">{t("assistant.local")} ✓</Badge><Badge tone={external ? "success" : "neutral"}>{t("assistant.external")} {external ? `✓ ${status.model}` : "—"}</Badge>{!external ? <span className="text-muted">{status.externalConfigured ? "Autorisation d'envoi externe désactivée (Réglages › Général)." : t("assistant.notConfigured")}</span> : null}</div>
      <Card><CardHeader title="Rédaction assistée" description="Reformulation, brouillon client, résumé — à partir des faits du ticket uniquement." /><CardBody className="space-y-3">
        <div className="flex flex-wrap gap-2"><Select className="w-auto min-w-[280px]" value={ticketId} onChange={(e) => setTicketId(e.target.value)} aria-label="Ticket">{tickets.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select><Button loading={pending} disabled={!ticketId} onClick={() => gen("rephrase")}><Sparkles /> {t("assistant.rephrase")}</Button><Button loading={pending} disabled={!ticketId} onClick={() => gen("draftMessage")}>{t("assistant.draftMessage")}</Button><Button loading={pending} disabled={!ticketId} onClick={() => gen("summarize")}>{t("assistant.summarize")}</Button></div>
        {result ? <div className="rounded-[var(--radius-md)] border border-border bg-hover/40 p-4"><div className="mb-2 flex items-center justify-between"><Badge tone={result.source === "external" ? "iris" : "success"}>{result.source === "external" ? t("assistant.external") : t("assistant.local")}</Badge><div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard.writeText(result.body); toast.success(t("common.copied")); }}><Copy /> {t("assistant.apply")}</Button><Button asChild size="sm" variant="ghost"><Link href={`/repairs/${ticketId}`}>Ouvrir le ticket</Link></Button></div></div><pre className="whitespace-pre-wrap font-sans text-[13.5px]">{result.body}</pre><p className="mt-2 text-[11.5px] text-subtle">Suggestion à relire et à coller manuellement : l'assistant n'écrit jamais dans le dossier.</p></div> : null}
      </CardBody></Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title={<span className="flex items-center gap-2"><AlertTriangle className="size-4 text-warning" /> {t("assistant.anomalies")} ({anomalies.length})</span>} /><CardBody className="p-0 pb-1"><ul className="divide-y divide-border">{anomalies.length === 0 ? <li className="px-5 py-4 text-[13px] text-muted">{t("dashboard.queueEmpty")}</li> : null}{anomalies.map((a) => <li key={a.id} className="px-5 py-2.5 text-[13px]"><div className="flex items-center gap-2"><Badge tone={sev(a.severity)}>{a.severity}</Badge><span className="font-medium">{a.title}</span></div><p className="mt-0.5 text-muted">{a.body}</p>{a.link ? <Link href={a.link} className="text-[12px] text-accent hover:underline">Vérifier →</Link> : null}</li>)}</ul></CardBody></Card>
        <Card><CardHeader title={<span className="flex items-center gap-2"><PackageSearch className="size-4 text-accent" /> {t("assistant.restock")} ({restock.length})</span>} action={<Button asChild size="sm"><Link href="/inventory/purchasing">{t("inventory.newPo")}</Link></Button>} /><CardBody className="p-0 pb-1"><ul className="divide-y divide-border">{restock.length === 0 ? <li className="px-5 py-4 text-[13px] text-muted">{t("dashboard.partsEmpty")}</li> : null}{restock.map((a) => <li key={a.id} className={cn("px-5 py-2.5 text-[13px]")}><div className="flex items-center gap-2"><Badge tone={sev(a.severity)}>{a.severity === "danger" ? "rupture" : "bas"}</Badge><span className="font-medium">{a.title}</span></div><p className="mt-0.5 text-muted">{a.body}</p></li>)}</ul></CardBody></Card>
      </div>
    </div>
  );
}
