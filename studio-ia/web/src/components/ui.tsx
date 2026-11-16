import { Check, Copy, LoaderCircle, PlugZap, TriangleExclamationPoint, Info } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Capability, EngineInfo } from "../lib/api";
import { copyText } from "../lib/util";
import { useStudio } from "../state/studio";

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <LoaderCircle size={size} className="spin" aria-hidden />;
}

/** Durée écoulée depuis `active` = true, en secondes. */
export function useElapsed(active: boolean): number {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!active) return;
    setS(0);
    const start = Date.now();
    const t = setInterval(() => setS(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(t);
  }, [active]);
  return s;
}

export function ProgressCard({ title, detail, active }: { title: string; detail?: string; active: boolean }) {
  const elapsed = useElapsed(active);
  if (!active) return null;
  return (
    <div className="progress-card" role="status" aria-live="polite" data-testid="progress">
      <div className="row-between">
        <div className="row">
          <Spinner />
          <strong>{title}</strong>
        </div>
        <span className="muted small mono">{elapsed} s</span>
      </div>
      <div className="progress" />
      {detail && <div className="hint">{detail}</div>}
    </div>
  );
}

export function CopyButton({ text, label = "Copier", small = true, testId }: { text: string; label?: string; small?: boolean; testId?: string }) {
  const [done, setDone] = useState(false);
  const { toast } = useStudio();
  return (
    <button
      type="button"
      className={`btn ${small ? "btn-sm" : ""}`}
      data-testid={testId}
      disabled={!text}
      onClick={async () => {
        const ok = await copyText(text);
        if (ok) {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } else {
          toast("error", "Copie impossible : sélectionnez le texte et utilisez Ctrl+C.");
        }
      }}
    >
      {done ? <Check size={15} /> : <Copy size={15} />}
      {done ? "Copié" : label}
    </button>
  );
}

export function AlertBox({ kind = "info", title, children }: { kind?: "info" | "warning" | "danger"; title?: string; children?: ReactNode }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === "danger" ? "alert" : undefined}>
      {kind === "info" ? <Info size={18} /> : <TriangleExclamationPoint size={18} />}
      <div className="stack-sm">
        {title && <div className="alert-title">{title}</div>}
        {children && <div className="small">{children}</div>}
      </div>
    </div>
  );
}

export function ErrorBox({ error }: { error: { message: string; hint?: string } | null }) {
  if (!error) return null;
  return (
    <div data-testid="error-box">
      <AlertBox kind="danger" title={error.message}>
        {error.hint}
      </AlertBox>
    </div>
  );
}

const CAP_TEXT: Record<string, { what: string; how: string }> = {
  generate: {
    what: "Aucun moteur de génération d'images n'est connecté.",
    how: "Le studio ne simule jamais de résultat. Connectez un moteur : OpenAI Images ou Stability AI (API, payants), ou Stable Diffusion WebUI (local, gratuit).",
  },
  vision: {
    what: "Aucun moteur d'analyse d'image n'est connecté.",
    how: "Le studio ne simule jamais d'analyse. Connectez Claude (API, payant) ou installez Ollama avec un modèle de vision (local, gratuit).",
  },
  text: {
    what: "Aucun moteur de texte n'est connecté.",
    how: "Connectez Claude (API, payant) ou installez Ollama (local, gratuit) pour améliorer, réécrire et traduire les prompts.",
  },
  upscale: {
    what: "Aucun moteur d'agrandissement n'est connecté.",
    how: "L'agrandissement est proposé par Stability AI (API) et Stable Diffusion WebUI (local).",
  },
};

export function NoEngine({ cap }: { cap: Capability }) {
  const { prefs, status } = useStudio();
  const t = CAP_TEXT[cap] ?? CAP_TEXT.text;
  const hiddenByMode = prefs.mode !== "auto" && (status?.engines ?? []).some((e) => e.capabilities.includes(cap) && e.available && e.kind !== prefs.mode);
  return (
    <div className="empty" data-testid={`no-engine-${cap}`}>
      <div className="empty-icon">
        <PlugZap size={24} />
      </div>
      <h3>{t.what}</h3>
      <p className="small" style={{ maxWidth: 520 }}>
        {t.how}
        {hiddenByMode && ` Un moteur compatible est disponible, mais il est masqué par le mode « ${prefs.mode === "api" ? "API" : "Local"} ».`}
      </p>
      <Link to="/parametres" className="btn btn-primary">
        Configurer un moteur
      </Link>
    </div>
  );
}

/** Rappel compact (petits écrans) quand aucun moteur n'est disponible : le détail est plus bas. */
export function NarrowNoEngine({ show, what }: { show: boolean; what: string }) {
  if (!show) return null;
  return (
    <div className="only-narrow">
      <AlertBox kind="warning" title={what}>
        Aucun résultat ne sera simulé. <Link to="/parametres">Configurer un moteur</Link>
      </AlertBox>
    </div>
  );
}

/** Sélecteur de moteur, limité aux moteurs compatibles avec la tâche et le mode choisi. */
export function EngineSelect({
  cap,
  value,
  onChange,
  label = "Moteur",
  testId,
}: {
  cap: Capability;
  value: string;
  onChange: (id: string) => void;
  label?: string;
  testId?: string;
}) {
  const { enginesFor } = useStudio();
  const engines = enginesFor(cap);
  const current = engines.find((e) => e.id === value);
  return (
    <div className="field">
      <label className="label" htmlFor={`engine-${cap}`}>
        {label}
        {current && <EngineBadge engine={current} />}
      </label>
      <select id={`engine-${cap}`} className="select" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}>
        {engines.map((e) => (
          <option key={e.id} value={e.id} disabled={!e.available}>
            {e.name}
            {e.model ? ` · ${e.model}` : ""} — {e.kind === "api" ? "API" : "local"}
            {e.available ? "" : " (indisponible)"}
          </option>
        ))}
      </select>
      {current && <div className="hint">{current.statusMessage}</div>}
    </div>
  );
}

export function EngineBadge({ engine }: { engine: EngineInfo }) {
  return engine.kind === "api" ? (
    <span className="badge badge-blue" title={engine.pricing.summary}>
      API · payant
    </span>
  ) : (
    <span className="badge badge-success" title={engine.pricing.summary}>
      Local · gratuit
    </span>
  );
}

export function StatusDot({ engine }: { engine: EngineInfo }) {
  return <span className={`dot ${engine.available ? "dot-ok" : engine.configured ? "dot-ko" : "dot-off"}`} aria-hidden />;
}

export function Chip({ selected, onClick, children, testId, title }: { selected: boolean; onClick: () => void; children: ReactNode; testId?: string; title?: string }) {
  return (
    <button type="button" className="chip" aria-pressed={selected} onClick={onClick} data-testid={testId} title={title}>
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: ReactNode }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, children, testId }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; testId?: string }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      <span>{children}</span>
    </label>
  );
}

export function RatioIcon({ ratio }: { ratio: string }) {
  const [w, h] = ratio.split(":").map(Number);
  const scale = 16 / Math.max(w, h);
  return <span className="ratio-shape" style={{ width: w * scale, height: h * scale }} aria-hidden />;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <>
      <div className="overlay" onClick={onCancel} />
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        <div className="muted small">{message}</div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn" onClick={onCancel}>
            Annuler
          </button>
          <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm} data-testid="confirm">
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {children && <div className="small">{children}</div>}
    </div>
  );
}
