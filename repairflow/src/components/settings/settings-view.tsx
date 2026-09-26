"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Plus, Eye } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch, Checkbox } from "@/components/ui/menu";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Sheet, Dialog, DialogContent } from "@/components/ui/dialog";
import { ROLES } from "@/lib/domain/roles";
import { NOTIFICATION_EVENTS, TEMPLATE_VARIABLES, renderTemplate, type NotificationEvent } from "@/lib/domain/notifications";
import { runJobsAction, setSettingAction, updateShopAction, upsertTemplateAction, upsertUserAction } from "@/app/actions/settings";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = Record<string, any>;

export function SettingsView(props: { tab: string; canManage: boolean; canUsers: boolean; canAudit: boolean; settings: AnyRec; shops: AnyRec[]; users: AnyRec[]; templates: AnyRec[]; integrations: AnyRec; audit: AnyRec[]; jobRuns: AnyRec[]; currentUserId: string }) {
  const t = useT();
  const tabs = ["general", "shops", ...(props.canUsers ? ["users"] : []), "notifications", "integrations", "retention", ...(props.canAudit ? ["audit"] : []), "jobs"] as const;
  return (
    <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
      <nav className="flex gap-1 overflow-x-auto no-scrollbar lg:flex-col" aria-label={t("settings.title")}>{tabs.map((k) => <Link key={k} href={`/settings?tab=${k}`} className={cn("whitespace-nowrap rounded-[var(--radius-sm)] px-3 py-2 text-[13px] text-muted hover:bg-hover hover:text-fg", props.tab === k && "bg-active font-medium text-fg")}>{t(`settings.tabs.${k}` as never)}</Link>)}</nav>
      <div className="min-w-0 space-y-4">
        {props.tab === "general" && <General {...props} />}
        {props.tab === "shops" && <Shops {...props} />}
        {props.tab === "users" && props.canUsers && <Users {...props} />}
        {props.tab === "notifications" && <Notifs {...props} />}
        {props.tab === "integrations" && <Integrations {...props} />}
        {props.tab === "retention" && <Retention {...props} />}
        {props.tab === "audit" && props.canAudit && <Audit {...props} />}
        {props.tab === "jobs" && <Jobs {...props} />}
      </div>
    </div>
  );
}

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const save = (key: string, value: unknown) => start(async () => { const r = await setSettingAction(key, value); if (!r.ok) toast.error(r.error); else { toast.success("Enregistré"); router.refresh(); } });
  return { save, pending };
}

function General({ settings, canManage }: { settings: AnyRec; canManage: boolean }) {
  const t = useT();
  const { save, pending } = useSave();
  const [loy, setLoy] = useState(settings.loyalty as { enabled: boolean; pointsPerEuro: number; vipThresholdCents: number });
  const [assistant, setAssistant] = useState(Boolean(settings["assistant.enabled"]));
  const [external, setExternal] = useState(Boolean(settings["assistant.allowExternal"]));
  return (
    <>
      <Card><CardHeader title={t("settings.loyalty")} /><CardBody className="space-y-3">
        <label className="flex items-center justify-between text-[13px]"><span>Activer</span><Switch checked={loy.enabled} disabled={!canManage} onCheckedChange={(v) => setLoy({ ...loy, enabled: v })} /></label>
        <div className="grid gap-3 sm:grid-cols-2"><Field label={t("settings.pointsPerEuro")}><Input type="number" min={0} step="0.5" value={loy.pointsPerEuro} disabled={!canManage} onChange={(e) => setLoy({ ...loy, pointsPerEuro: Number(e.target.value) })} /></Field><Field label={`${t("settings.vipThreshold")} (€)`}><Input type="number" min={0} value={loy.vipThresholdCents / 100} disabled={!canManage} onChange={(e) => setLoy({ ...loy, vipThresholdCents: Math.round(Number(e.target.value) * 100) })} /></Field></div>
        {canManage ? <Button variant="primary" loading={pending} onClick={() => save("loyalty", loy)}>{t("common.save")}</Button> : null}
      </CardBody></Card>
      <Card><CardHeader title={t("settings.assistant")} /><CardBody className="space-y-3">
        <label className="flex items-center justify-between text-[13px]"><span>Activer l'assistant (règles locales)</span><Switch checked={assistant} disabled={!canManage} onCheckedChange={(v) => { setAssistant(v); save("assistant.enabled", v); }} /></label>
        <label className="flex items-center justify-between gap-4 text-[13px]"><span>{t("settings.assistantExternal")}<span className="block text-[11.5px] text-muted">Sans cette autorisation explicite, aucune donnée ne quitte le serveur.</span></span><Switch checked={external} disabled={!canManage} onCheckedChange={(v) => { setExternal(v); save("assistant.allowExternal", v); }} /></label>
      </CardBody></Card>
    </>
  );
}

function Shops({ shops, canManage }: { shops: AnyRec[]; canManage: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      {shops.map((s) => (
        <Card key={s.id}><CardHeader title={<span>{s.name} <span className="mono text-[12px] text-muted">{s.code}</span></span>} /><CardBody>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const hours = ["Lun–Ven", "Sam", "Dim"].map((day) => ({ day, open: String(fd.get(`open-${day}`)), close: String(fd.get(`close-${day}`)) })).filter((h) => h.open && h.close); start(async () => { const r = await updateShopAction(s.id, { name: String(fd.get("name")), address: String(fd.get("address")), phone: String(fd.get("phone")), email: String(fd.get("email")), taxRateBp: Math.round(Number(fd.get("tax")) * 100), hours }); if (!r.ok) toast.error(r.error); else { toast.success(t("common.save")); router.refresh(); } }); }}>
            <Field label="Nom"><Input name="name" defaultValue={s.name} disabled={!canManage} /></Field><Field label="Téléphone"><Input name="phone" defaultValue={s.phone} disabled={!canManage} /></Field>
            <Field label="Adresse" className="sm:col-span-2"><Input name="address" defaultValue={s.address} disabled={!canManage} /></Field>
            <Field label="E-mail"><Input name="email" defaultValue={s.email} disabled={!canManage} /></Field><Field label="TVA par défaut (%)"><Input name="tax" defaultValue={s.taxRateBp / 100} disabled={!canManage} /></Field>
            <fieldset className="sm:col-span-2"><legend className="mb-1 text-[12.5px] font-medium text-muted">Horaires</legend><div className="grid gap-2 sm:grid-cols-3">{["Lun–Ven", "Sam", "Dim"].map((day) => { const h = (s.hours as { day: string; open: string; close: string }[]).find((x) => x.day === day); return <div key={day} className="flex items-center gap-1 text-[12.5px]"><span className="w-16">{day}</span><Input name={`open-${day}`} type="time" defaultValue={h?.open ?? ""} disabled={!canManage} /><Input name={`close-${day}`} type="time" defaultValue={h?.close ?? ""} disabled={!canManage} /></div>; })}</div></fieldset>
            {canManage ? <Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button> : null}
          </form>
        </CardBody></Card>
      ))}
      <p className="text-[12.5px] text-muted">Les transferts de stock entre boutiques se font depuis la fiche produit. L'ajout d'une boutique se fait par un administrateur via le seed ou la base (limite documentée).</p>
    </div>
  );
}

function Users({ users, shops, currentUserId }: { users: AnyRec[]; shops: AnyRec[]; currentUserId: string }) {
  const t = useT();
  const router = useRouter();
  const [edit, setEdit] = useState<AnyRec | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card><CardHeader title={t("settings.tabs.users")} action={<Button size="sm" variant="primary" onClick={() => setEdit({})}><Plus /> Utilisateur</Button>} /><CardBody className="p-0 pb-1">
      <Table><THead><TR><TH>Nom</TH><TH>E-mail</TH><TH>Rôle</TH><TH>Boutiques</TH><TH>Dernière connexion</TH><TH>MFA</TH><TH /></TR></THead><TBody>{users.map((u) => <TR key={u.id}><TD className="font-medium">{u.name}{!u.active ? <Badge tone="danger" className="ms-2">inactif</Badge> : null}</TD><TD className="mono text-muted">{u.email}</TD><TD><Badge tone="accent">{t(`roles.${u.role}` as never)}</Badge></TD><TD className="text-muted">{(u.shopIds as string[]).map((id) => shops.find((s) => s.id === id)?.code).join(", ")}</TD><TD className="text-muted">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt, t.locale) : "—"}</TD><TD>{u.mfaEnabled ? "✓" : <span className="text-subtle">non disponible</span>}</TD><TD><Button size="sm" variant="ghost" onClick={() => setEdit(u)}>{t("common.edit")}</Button></TD></TR>)}</TBody></Table>
      <Sheet open={Boolean(edit)} onOpenChange={(o) => !o && setEdit(null)} title={edit?.id ? t("common.edit") : "Nouvel utilisateur"}>
        {edit ? <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(async () => { const r = await upsertUserAction({ email: String(fd.get("email")), name: String(fd.get("name")), role: fd.get("role") as never, shopIds: shops.filter((s) => fd.get(`shop-${s.id}`)).map((s) => s.id), password: String(fd.get("password")) || undefined, active: fd.get("active") === "on" }, edit.id); if (!r.ok) toast.error(r.error); else { toast.success(t("common.save")); setEdit(null); router.refresh(); } }); }}>
          <Field label="Nom"><Input name="name" defaultValue={edit.name ?? ""} required /></Field><Field label="E-mail"><Input name="email" type="email" defaultValue={edit.email ?? ""} required /></Field>
          <Field label="Rôle"><Select name="role" defaultValue={edit.role ?? "SELLER"} disabled={edit.id === currentUserId}>{ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}</Select></Field>
          <fieldset><legend className="mb-1 text-[12.5px] font-medium text-muted">Boutiques</legend>{shops.map((s) => <label key={s.id} className="flex items-center gap-2 py-1 text-[13px]"><input type="checkbox" name={`shop-${s.id}`} defaultChecked={(edit.shopIds ?? [shops[0]?.id]).includes(s.id)} /> {s.name}</label>)}</fieldset>
          <Field label={edit.id ? "Nouveau mot de passe (facultatif)" : "Mot de passe"} hint="8 caractères min."><Input name="password" type="password" autoComplete="new-password" minLength={8} required={!edit.id} /></Field>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="active" defaultChecked={edit.active ?? true} disabled={edit.id === currentUserId} /> Actif</label>
          <p className="text-[11.5px] text-muted">MFA : non disponible dans cette version (voir docs/SECURITE.md). Les sessions sont révoquées à la désactivation ou au changement de mot de passe.</p>
          <Button type="submit" variant="primary" className="w-full" loading={pending}>{t("common.save")}</Button>
        </form> : null}
      </Sheet>
    </CardBody></Card>
  );
}

function Notifs({ settings, templates, canManage }: { settings: AnyRec; templates: AnyRec[]; canManage: boolean }) {
  const t = useT();
  const router = useRouter();
  const { save, pending } = useSave();
  const [win, setWin] = useState(settings["notif.window"] as { start: number; end: number });
  const [reminder, setReminder] = useState(Number(settings["notif.pickupReminderDays"]));
  const [editing, setEditing] = useState<AnyRec | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const channelsFor = (ev: string) => (settings.channels?.[ev] as string[] | undefined) ?? ["EMAIL", "SMS"];
  const sample: Record<string, string> = { customerName: "Camille Rousseau", ticketNumber: "REP-2026-00042", device: "iPhone 13", shopName: "MS MOBILE République", trackingUrl: "https://exemple.test/t/…", promisedDate: "12 octobre", quoteTotal: "159,00 €", balanceDue: "109,00 €", shopHours: "Lun–Ven 9h30–19h", daysReady: "5", productName: "Écran iPhone 13", sku: "SCR-IP13", onHand: "1", threshold: "2", technicianName: "Lucas" };
  return (
    <>
      <Card><CardHeader title="Canaux par événement" description="Le canal in-app est toujours actif pour l'équipe. Les canaux client dépendent des consentements." /><CardBody className="p-0 pb-1">
        <Table><THead><TR><TH>Événement</TH>{["EMAIL", "SMS", "WHATSAPP", "PUSH"].map((c) => <TH key={c}>{c}</TH>)}</TR></THead><TBody>{NOTIFICATION_EVENTS.map((ev) => <TR key={ev}><TD>{t(`notifications.types.${ev}`)}</TD>{["EMAIL", "SMS", "WHATSAPP", "PUSH"].map((c) => <TD key={c}><Checkbox disabled={!canManage} checked={channelsFor(ev).includes(c)} onCheckedChange={(v) => { const cur = channelsFor(ev); save(`notif.channels.${ev}`, v ? [...cur, c] : cur.filter((x) => x !== c)); }} aria-label={`${ev} ${c}`} /></TD>)}</TR>)}</TBody></Table>
      </CardBody></Card>
      <Card><CardHeader title={t("settings.window")} /><CardBody className="flex flex-wrap items-end gap-3"><Field label="Début (h)"><Input type="number" min={0} max={23} value={win.start} disabled={!canManage} onChange={(e) => setWin({ ...win, start: Number(e.target.value) })} /></Field><Field label="Fin (h)"><Input type="number" min={1} max={24} value={win.end} disabled={!canManage} onChange={(e) => setWin({ ...win, end: Number(e.target.value) })} /></Field><Field label={t("settings.reminderDays")}><Input type="number" min={1} max={60} value={reminder} disabled={!canManage} onChange={(e) => setReminder(Number(e.target.value))} /></Field>{canManage ? <Button variant="primary" loading={pending} onClick={() => { save("notif.window", win); save("notif.pickupReminderDays", reminder); }}>{t("common.save")}</Button> : null}</CardBody></Card>
      <Card><CardHeader title={t("notifications.templates")} action={canManage ? <Button size="sm" onClick={() => setEditing({ key: "TICKET_RECEIVED", channel: "EMAIL", locale: "fr", subject: "", body: "", active: true })}><Plus /> Modèle</Button> : undefined} /><CardBody className="p-0 pb-1">
        <Table><THead><TR><TH>Événement</TH><TH>Canal</TH><TH>Langue</TH><TH>Sujet / début</TH><TH>Actif</TH><TH /></TR></THead><TBody>{templates.map((x) => <TR key={x.id}><TD>{t(`notifications.types.${x.key}` as never)}</TD><TD><Badge>{x.channel}</Badge></TD><TD>{x.locale}</TD><TD className="max-w-[320px] truncate text-muted">{x.subject || x.body}</TD><TD>{x.active ? "✓" : "—"}</TD><TD className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setPreview(`${x.subject ? renderTemplate(x.subject, sample) + "\n\n" : ""}${renderTemplate(x.body, sample)}`)}><Eye /> {t("notifications.preview")}</Button>{canManage ? <Button size="sm" variant="ghost" onClick={() => setEditing(x)}>{t("common.edit")}</Button> : null}</TD></TR>)}</TBody></Table>
      </CardBody></Card>
      <Dialog open={Boolean(preview)} onOpenChange={(o) => !o && setPreview(null)}><DialogContent title={t("notifications.preview")} size="sm"><pre className="whitespace-pre-wrap rounded-[var(--radius-sm)] bg-hover p-3 font-sans text-[13px]">{preview}</pre></DialogContent></Dialog>
      <Sheet open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)} title={t("notifications.templates")} wide>
        {editing ? <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(async () => { const r = await upsertTemplateAction({ key: fd.get("key") as NotificationEvent, channel: String(fd.get("channel")), locale: String(fd.get("locale")), subject: String(fd.get("subject")), body: String(fd.get("body")), active: fd.get("active") === "on" }); if (!r.ok) toast.error(r.error); else { toast.success(t("common.save")); setEditing(null); router.refresh(); } }); }}>
          <div className="grid grid-cols-3 gap-2"><Field label="Événement"><Select name="key" defaultValue={editing.key} onChange={(e) => setEditing({ ...editing, key: e.target.value })}>{NOTIFICATION_EVENTS.map((ev) => <option key={ev} value={ev}>{t(`notifications.types.${ev}`)}</option>)}</Select></Field><Field label="Canal"><Select name="channel" defaultValue={editing.channel}>{["EMAIL", "SMS", "WHATSAPP", "PUSH"].map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field><Field label="Langue"><Select name="locale" defaultValue={editing.locale}>{["fr", "en", "ar"].map((l) => <option key={l} value={l}>{l}</option>)}</Select></Field></div>
          <Field label="Sujet (e-mail)"><Input name="subject" defaultValue={editing.subject} /></Field>
          <Field label="Corps"><Textarea name="body" rows={7} defaultValue={editing.body} required /></Field>
          <p className="text-[12px] text-muted">{t("notifications.variables")} : {TEMPLATE_VARIABLES[(editing.key as NotificationEvent) ?? "TICKET_RECEIVED"].map((v) => <code key={v} className="mono me-1 rounded bg-hover px-1">{`{{${v}}}`}</code>)}</p>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="active" defaultChecked={editing.active} /> Actif</label>
          <Button type="submit" variant="primary" className="w-full" loading={saving}>{t("common.save")}</Button>
        </form> : null}
      </Sheet>
    </>
  );
}

function Integrations({ integrations }: { integrations: AnyRec }) {
  const t = useT();
  const steps: Record<string, string[]> = { EMAIL: ["Renseigner SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM", "Passer DEMO_MODE=false", "Redémarrer et vérifier la file d'envoi"], SMS: ["Créer un compte Twilio (ou équivalent) et un numéro émetteur", "Renseigner TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER", "Configurer le webhook de statut (docs/INTEGRATIONS.md)"], WHATSAPP: ["Créer une app Meta et un numéro WhatsApp Business", "Faire approuver les modèles de message (obligatoire pour les notifications sortantes)", "Renseigner WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN"], PUSH: ["Générer une paire de clés VAPID", "Renseigner WEB_PUSH_PUBLIC_KEY / WEB_PUSH_PRIVATE_KEY", "Activer l'abonnement dans le profil utilisateur (à venir)"] };
  return (
    <div className="space-y-4">
      <Card><CardHeader title={t("settings.integrationStatus")} /><CardBody className="space-y-3">
        {(integrations.channels as AnyRec[]).filter((c) => c.channel !== "INAPP").map((c) => <div key={c.channel} className="rounded-[var(--radius-md)] border border-border p-3 text-[13px]"><div className="flex items-center justify-between"><span className="font-medium">{c.channel}</span><span className="flex gap-1">{c.demoMode ? <Badge tone="champagne">Démo</Badge> : null}<Badge tone={c.configured ? "success" : "warning"}>{c.configured ? t("notifications.channelStatus.configured") : t("notifications.channelStatus.missing")}</Badge></span></div>{!c.configured ? <ol className="mt-2 list-decimal space-y-0.5 ps-5 text-muted">{steps[c.channel]?.map((s) => <li key={s}>{s}</li>)}</ol> : null}{c.missing?.length ? <div className="mono mt-1 text-[11px] text-subtle">{c.missing.join(", ")}</div> : null}</div>)}
        {[["Stockage objet", integrations.storage.configured, `Pilote : ${integrations.storage.driver}${integrations.storage.missing.length ? " · manquant : " + integrations.storage.missing.join(", ") : ""}`], ["Assistant (modèle externe)", integrations.assistant.externalConfigured, integrations.assistant.externalConfigured ? `Modèle ${integrations.assistant.model}` : "ANTHROPIC_API_KEY absente : règles locales uniquement"], ["Webhook paiements", integrations.paymentsWebhook, integrations.paymentsWebhook ? "Signature HMAC active" : "PAYMENT_WEBHOOK_SECRET absent : endpoint désactivé"], ["Planificateur (cron)", integrations.cronSecret, integrations.cronSecret ? "POST /api/jobs/run protégé par CRON_SECRET" : "CRON_SECRET absent"], ["Base de données", true, integrations.database === "postgresql" ? "PostgreSQL" : "SQLite (démonstration locale, mono-instance)"]].map(([k, ok, d]) => <div key={k as string} className="flex items-center justify-between rounded-[var(--radius-md)] border border-border p-3 text-[13px]"><span><span className="font-medium">{k as string}</span><span className="block text-muted">{d as string}</span></span><Badge tone={ok ? "success" : "warning"}>{ok ? "OK" : "À configurer"}</Badge></div>)}
        <p className="text-[12px] text-muted">Aucune certification fiscale n'est revendiquée. Voir docs/CONFORMITE.md pour les vérifications selon le pays.</p>
      </CardBody></Card>
    </div>
  );
}

function Retention({ settings, canManage }: { settings: AnyRec; canManage: boolean }) {
  const t = useT();
  const { save, pending } = useSave();
  const [unlock, setUnlock] = useState(Number(settings["retention.unlockCodeDays"]));
  const [years, setYears] = useState(Number(settings["retention.closedTicketYears"]));
  return (
    <Card><CardHeader title={t("settings.tabs.retention")} description="Politique de conservation et suppression des données personnelles" /><CardBody className="space-y-3">
      <Field label={t("settings.retentionUnlock")} hint="purge automatique quotidienne"><Input type="number" min={1} max={365} value={unlock} disabled={!canManage} onChange={(e) => setUnlock(Number(e.target.value))} /></Field>
      <Field label={t("settings.retentionTickets")} hint="anonymisation à planifier (voir docs)"><Input type="number" min={1} max={10} value={years} disabled={!canManage} onChange={(e) => setYears(Number(e.target.value))} /></Field>
      <ul className="list-disc space-y-1 ps-5 text-[12.5px] text-muted"><li>Les codes de déverrouillage sont chiffrés (AES-256-GCM), masqués par défaut, et supprimés à l'expiration ou 7 jours après clôture du ticket.</li><li>Les sessions expirées et les tentatives de connexion de plus de 30 jours sont purgées quotidiennement.</li><li>Le journal d'audit masque automatiquement les champs sensibles.</li></ul>
      {canManage ? <Button variant="primary" loading={pending} onClick={() => { save("retention.unlockCodeDays", unlock); save("retention.closedTicketYears", years); }}>{t("common.save")}</Button> : null}
    </CardBody></Card>
  );
}

function Audit({ audit }: { audit: AnyRec[] }) {
  const t = useT();
  return <Card><CardHeader title={t("settings.tabs.audit")} description="200 dernières entrées · données sensibles masquées" /><CardBody className="p-0 pb-1"><Table><THead><TR><TH>{t("common.date")}</TH><TH>Utilisateur</TH><TH>Action</TH><TH>Entité</TH><TH>Détail</TH></TR></THead><TBody>{audit.map((a) => <TR key={a.id}><TD className="tnum whitespace-nowrap text-muted">{fmtDateTime(a.createdAt, t.locale)}</TD><TD>{a.userName}</TD><TD className="mono">{a.action}</TD><TD className="text-muted">{a.entityType} <span className="mono text-[11px] text-subtle">{String(a.entityId).slice(0, 8)}</span></TD><TD className="mono max-w-[360px] truncate text-[11px] text-subtle" title={a.after}>{a.after}</TD></TR>)}</TBody></Table></CardBody></Card>;
}

function Jobs({ jobRuns, canManage }: { jobRuns: AnyRec[]; canManage: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Card><CardHeader title={t("settings.tabs.jobs")} description="Retards, rappels de retrait, stock critique, purge, file de notifications — planifiées chaque minute par le worker ou par appel de /api/jobs/run" action={canManage ? <Button size="sm" variant="primary" loading={pending} onClick={() => start(async () => { const r = await runJobsAction(); if (!r.ok) toast.error(r.error); else { toast.success("Tâches exécutées"); router.refresh(); } })}><Play /> {t("settings.runJobs")}</Button> : undefined} /><CardBody className="p-0 pb-1">
      <Table><THead><TR><TH>Tâche</TH><TH>Début</TH><TH>Durée</TH><TH>{t("common.status")}</TH><TH>Résumé</TH></TR></THead><TBody>{jobRuns.map((j) => <TR key={j.id}><TD className="mono">{j.jobName}</TD><TD className="tnum text-muted">{fmtDateTime(j.startedAt, t.locale)}</TD><TD className="tnum text-muted">{j.finishedAt ? `${new Date(j.finishedAt).getTime() - new Date(j.startedAt).getTime()} ms` : "—"}</TD><TD><Badge tone={j.status === "OK" ? "success" : j.status === "FAILED" ? "danger" : "accent"}>{j.status}</Badge></TD><TD className="mono max-w-[360px] truncate text-[11px] text-subtle">{j.summary}</TD></TR>)}</TBody></Table>
    </CardBody></Card>
  );
}
