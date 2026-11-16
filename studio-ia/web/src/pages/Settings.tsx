import { Archive, Check, Cloud, Cpu, ExternalLink, HardDrive, KeyRound, RefreshCw, ShieldCheck, Upload, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { AlertBox, ConfirmDialog, CopyButton, EngineBadge, PageHeader, Segmented, Spinner, StatusDot } from "../components/ui";
import { api, type Capability, type EngineInfo, errorText, type ServerInfo, type SettingView, saveBlob } from "../lib/api";
import { cx } from "../lib/util";
import { useStudio } from "../state/studio";

const FIELD_LABELS: Record<string, { label: string; help?: string; options?: string[] }> = {
  anthropicApiKey: { label: "Clé API Anthropic", help: "Commence par sk-ant-… — console.anthropic.com › API Keys." },
  anthropicModel: { label: "Modèle Claude", help: "Par défaut : claude-opus-5-5. Autres choix : claude-sonnet-5-5, claude-haiku-5-5." },
  anthropicEffort: { label: "Effort de réflexion", help: "Plus l’effort est élevé, plus l’analyse est poussée (et coûteuse).", options: ["low", "medium", "high", "xhigh", "max"] },
  ollamaUrl: { label: "Adresse d’Ollama" },
  ollamaVisionModel: { label: "Modèle de vision", help: "Ex. : qwen2.5vl:7b, gemma3:12b, llama3.2-vision:11b." },
  ollamaTextModel: { label: "Modèle de texte", help: "Vide = utiliser le modèle de vision." },
  openaiApiKey: { label: "Clé API OpenAI", help: "platform.openai.com › API keys." },
  openaiImageModel: { label: "Modèle d’image", help: "Par défaut : gpt-image-2. Le studio vérifie que le modèle est disponible pour votre compte." },
  openaiFlexibleSizes: { label: "Tailles exactes par format", help: "Désactivez si le modèle refuse les tailles 16:9 / 4:5 exactes.", options: ["true", "false"] },
  stabilityApiKey: { label: "Clé API Stability AI", help: "platform.stability.ai › Account › API Keys." },
  stabilityModel: { label: "Modèle", options: ["core", "ultra", "sd3.5-large", "sd3.5-large-turbo", "sd3.5-medium"] },
  sdwebuiUrl: { label: "Adresse de WebUI" },
  sdwebuiUpscaler: { label: "Agrandisseur", help: "Nom exact d’un agrandisseur installé dans WebUI (ex. R-ESRGAN 4x+)." },
  sdwebuiBaseSize: { label: "Taille de base (px)", help: "1024 pour SDXL, 512 pour SD 1.5." },
  timeoutApiMs: { label: "Délai maximal API (ms)" },
  timeoutLocalMs: { label: "Délai maximal local (ms)" },
};

const ENGINE_FIELDS: Record<string, string[]> = {
  claude: ["anthropicApiKey", "anthropicModel", "anthropicEffort"],
  ollama: ["ollamaUrl", "ollamaVisionModel", "ollamaTextModel"],
  openai: ["openaiApiKey", "openaiImageModel", "openaiFlexibleSizes"],
  stability: ["stabilityApiKey", "stabilityModel"],
  sdwebui: ["sdwebuiUrl", "sdwebuiUpscaler", "sdwebuiBaseSize"],
};

const CAP_LABEL: Record<Capability, string> = {
  generate: "Texte → image",
  reference: "Image de référence",
  negative: "Prompt négatif",
  seed: "Graine",
  upscale: "Agrandissement",
  vision: "Analyse d’image",
  text: "Prompts (texte)",
};

const FEATURES: Array<{ cap: Capability; label: string }> = [
  { cap: "generate", label: "Générer une image (texte → image)" },
  { cap: "vision", label: "Analyser une image (image → prompt)" },
  { cap: "text", label: "Améliorer, réécrire, traduire un prompt" },
  { cap: "reference", label: "Image de référence et variantes" },
  { cap: "upscale", label: "Agrandir une image" },
];

export function SettingsPage() {
  const { status, prefs, setPrefs, refreshStatus, loadingStatus, toastError } = useStudio();
  const [settings, setSettings] = useState<SettingView[]>([]);
  const [server, setServer] = useState<ServerInfo | null>(null);

  const loadSettings = () =>
    api
      .settings()
      .then((r) => {
        setSettings(r.settings);
        setServer(r.server);
      })
      .catch(toastError);
  useEffect(() => {
    void loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const engines = status?.engines ?? [];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Configuration"
        title="Paramètres"
        subtitle="Choisissez votre mode de fonctionnement, connectez vos moteurs d’IA et sauvegardez vos créations."
        actions={
          <button className="btn" onClick={() => void refreshStatus(true)} data-testid="recheck">
            {loadingStatus ? <Spinner /> : <RefreshCw size={16} />} Revérifier les moteurs
          </button>
        }
      />

      <section className="panel stack">
        <div className="panel-head" style={{ marginBottom: 0 }}>
          <h2 className="panel-title">
            <Cpu size={18} /> Mode de fonctionnement
          </h2>
          <Segmented
            label="Mode"
            value={prefs.mode}
            onChange={(mode) => setPrefs({ mode })}
            options={[
              { value: "auto", label: "Auto" },
              { value: "api", label: <><Cloud size={14} /> API</> },
              { value: "local", label: <><HardDrive size={14} /> Local</> },
            ]}
          />
        </div>
        <p className="small muted">
          {prefs.mode === "auto" && "Auto : tous les moteurs connectés sont proposés, en ligne comme locaux."}
          {prefs.mode === "api" && "API : seuls les services en ligne sont proposés (connexion Internet requise, services payants)."}
          {prefs.mode === "local" && "Local : seuls les moteurs installés sur votre ordinateur sont proposés. Aucune donnée ne quitte votre machine et tout fonctionne hors ligne une fois les modèles téléchargés."}
        </p>
        <div className="table-wrap">
          <table className="table" data-testid="capability-matrix">
            <thead>
              <tr>
                <th>Fonctionnalité</th>
                <th>Mode API</th>
                <th>Mode local</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f) => (
                <tr key={f.cap}>
                  <td>{f.label}</td>
                  <MatrixCell engines={engines.filter((e) => e.kind === "api" && e.capabilities.includes(f.cap))} />
                  <MatrixCell engines={engines.filter((e) => e.kind === "local" && e.capabilities.includes(f.cap))} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">✔ = moteur connecté et vérifié. Le studio ne simule jamais un résultat : sans moteur, la fonctionnalité reste indisponible.</p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Moteurs d’IA</h2>
        <div className="grid-2" style={{ alignItems: "start" }}>
          {engines.map((e) => (
            <EngineCard
              key={e.id}
              engine={e}
              fields={(ENGINE_FIELDS[e.id] ?? []).map((k) => settings.find((s) => s.key === k)).filter((s): s is SettingView => !!s)}
              onSaved={async () => {
                await loadSettings();
                await refreshStatus(true);
              }}
            />
          ))}
        </div>
      </section>

      <LocalGuide />

      <BackupPanel dataDir={server?.dataDir} onRestored={() => void refreshStatus()} />

      <section className="panel" style={{ marginTop: 16 }}>
        <h2 className="panel-title" style={{ marginBottom: 12 }}>
          <ShieldCheck size={18} /> Sécurité et usage
        </h2>
        <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
          <li>Les clés API restent sur le serveur local (fichier .env ou data/settings.json, lisible par vous seul) : elles ne sont jamais renvoyées au navigateur.</li>
          <li>Le serveur n’écoute que sur votre ordinateur ({server ? `${server.host}:${server.port}` : "127.0.0.1"}) et refuse les requêtes venant d’autres sites.</li>
          <li>
            Images générées aujourd’hui : <strong data-testid="usage-today">{status?.usage.images ?? 0}</strong>
            {status?.usage.maxImagesPerDay ? ` sur ${status.usage.maxImagesPerDay} autorisées (MAX_IMAGES_PER_DAY)` : " (aucun plafond — réglez MAX_IMAGES_PER_DAY dans .env pour en fixer un)"}.
          </li>
        </ul>
      </section>
    </div>
  );

}

function MatrixCell({ engines: list }: { engines: EngineInfo[] }) {
  const ok = list.filter((e) => e.available);
  if (ok.length) return <td style={{ color: "var(--success)" }}>✔ {ok.map((e) => e.name).join(", ")}</td>;
  if (!list.length) return <td className="muted">Non proposé</td>;
  return <td className="muted">Aucun moteur connecté ({list.map((e) => e.name).join(", ")})</td>;
}

function EngineCard({ engine, fields, onSaved }: { engine: EngineInfo; fields: SettingView[]; onSaved: () => Promise<void> }) {
  const { toast, toastError } = useStudio();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    try {
      await api.saveSettings(patch);
      setDraft({});
      await onSaved();
      toast("success", `${engine.name} : réglages enregistrés.`);
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  }

  const changes = Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== ""));

  return (
    <article className={cx("engine-card", engine.available && "ok")} data-testid={`engine-${engine.id}`}>
      <div className="row-between">
        <div className="row">
          <StatusDot engine={engine} />
          <h3 style={{ fontSize: 16 }}>{engine.name}</h3>
        </div>
        <EngineBadge engine={engine} />
      </div>
      <div className="small" data-testid={`engine-${engine.id}-status`}>
        {engine.available ? <span style={{ color: "var(--success)" }}>{engine.statusMessage}</span> : <span className="muted">{engine.statusMessage}</span>}
      </div>
      <div className="tag-list">
        {engine.capabilities.map((c) => (
          <span key={c} className="tag">
            {CAP_LABEL[c]}
          </span>
        ))}
      </div>
      <div className="small muted">{engine.pricing.summary}</div>
      {!engine.available && <div className="hint">→ {engine.setupHint}</div>}
      <div className="row">
        <button className="btn btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid={`configure-${engine.id}`}>
          <KeyRound size={14} /> {open ? "Fermer" : "Configurer"}
        </button>
        {engine.pricing.url && (
          <a className="btn btn-sm btn-ghost" href={engine.pricing.url} target="_blank" rel="noreferrer noopener">
            {engine.kind === "api" ? "Tarifs" : "Modèles"} <ExternalLink size={13} />
          </a>
        )}
        {engine.docsUrl && (
          <a className="btn btn-sm btn-ghost" href={engine.docsUrl} target="_blank" rel="noreferrer noopener">
            Documentation <ExternalLink size={13} />
          </a>
        )}
      </div>
      {open && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (Object.keys(changes).length) void save(changes);
          }}
        >
          {fields.map((f) => {
            const meta = FIELD_LABELS[f.key] ?? { label: f.key };
            const id = `f-${f.key}`;
            return (
              <div className="field" key={f.key}>
                <label className="label" htmlFor={id}>
                  {meta.label}
                  {f.source === "env" ? <span className="badge">défini dans .env</span> : f.source === "ui" ? <span className="badge badge-violet">personnalisé</span> : null}
                </label>
                {f.secret ? (
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <input
                      id={id}
                      className="input"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={!f.editable}
                      placeholder={f.isSet ? `Clé enregistrée ${String(f.value)} — saisir pour remplacer` : "Collez votre clé ici"}
                      value={draft[f.key] ?? ""}
                      onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value.trim() })}
                      data-testid={`input-${f.key}`}
                    />
                    {f.isSet && f.editable && (
                      <button type="button" className="btn btn-icon" aria-label="Effacer la clé" title="Effacer la clé" onClick={() => void save({ [f.key]: "" })}>
                        <X size={15} />
                      </button>
                    )}
                  </div>
                ) : meta.options ? (
                  <select id={id} className="select" disabled={!f.editable} value={draft[f.key] ?? String(f.value)} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}>
                    {meta.options.map((o) => (
                      <option key={o} value={o}>
                        {o === "true" ? "Oui" : o === "false" ? "Non" : o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input id={id} className="input" disabled={!f.editable} value={draft[f.key] ?? String(f.value)} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} data-testid={`input-${f.key}`} />
                )}
                {meta.help && <div className="hint">{meta.help}</div>}
                {!f.editable && <div className="hint">Modifiable uniquement dans le fichier .env (variable {f.env}), puis redémarrage.</div>}
              </div>
            );
          })}
          <div className="row">
            <button className="btn btn-primary btn-sm" type="submit" disabled={saving || !Object.keys(changes).length} data-testid={`save-${engine.id}`}>
              {saving ? <Spinner size={14} /> : <Check size={14} />} Enregistrer et vérifier
            </button>
            <span className="hint">Les clés sont stockées sur le serveur local, jamais dans le navigateur.</span>
          </div>
        </form>
      )}
    </article>
  );
}

function Cmd({ children }: { children: string }) {
  return (
    <div className="code">
      <code>{children}</code>
      <CopyButton text={children} label="" />
    </div>
  );
}

function LocalGuide() {
  return (
    <section className="panel" style={{ marginTop: 24 }}>
      <h2 className="panel-title" style={{ marginBottom: 6 }}>
        <HardDrive size={18} /> Installer le mode local (gratuit, hors ligne)
      </h2>
      <p className="small muted" style={{ marginBottom: 16 }}>
        Les moteurs locaux s’exécutent sur votre ordinateur. Une connexion Internet n’est nécessaire que pour les télécharger.
      </p>
      <div className="grid-2" style={{ alignItems: "start" }}>
        <Guide title="Analyse et prompts : Ollama" need="≈ 6 Go d’espace disque, 8 Go de mémoire vive (16 Go conseillés). Carte graphique conseillée.">
          <ol className="steps small">
            <li>
              Installez Ollama depuis <a href="https://ollama.com/download" target="_blank" rel="noreferrer noopener">ollama.com/download</a> (Windows, macOS, Linux).
            </li>
            <li>Téléchargez un modèle de vision (une seule fois) :</li>
          </ol>
          <Cmd>ollama pull qwen2.5vl:7b</Cmd>
          <p className="hint">Ordinateur modeste : qwen2.5vl:3b (≈ 3 Go). Plus précis : gemma3:12b (≈ 8 Go).</p>
          <ol className="steps small" start={3}>
            <li>Ollama tourne ensuite en arrière-plan à l’adresse http://127.0.0.1:11434 : cliquez sur « Revérifier les moteurs ».</li>
          </ol>
        </Guide>
        <Guide title="Génération : Stable Diffusion WebUI Forge" need="Carte graphique NVIDIA 8 Go+ (SDXL) ou Mac Apple Silicon, 16 Go de mémoire vive, ≈ 15 Go d’espace disque.">
          <ol className="steps small">
            <li>
              Téléchargez <a href="https://github.com/lllyasviel/stable-diffusion-webui-forge" target="_blank" rel="noreferrer noopener">SD WebUI Forge</a> (paquet
              Windows en un clic) ou AUTOMATIC1111.
            </li>
            <li>Placez un modèle .safetensors (ex. SDXL 1.0) dans le dossier models/Stable-diffusion.</li>
            <li>Lancez-le avec l’API activée :</li>
          </ol>
          <Cmd>./webui.sh --api</Cmd>
          <p className="hint">Sous Windows : dans webui-user.bat, écrivez « set COMMANDLINE_ARGS=--api », puis lancez run.bat.</p>
          <ol className="steps small" start={4}>
            <li>Adresse par défaut : http://127.0.0.1:7860. Cliquez sur « Revérifier les moteurs ».</li>
          </ol>
        </Guide>
      </div>
    </section>
  );
}

function Guide({ title, need, children }: { title: string; need: string; children: ReactNode }) {
  return (
    <div className="stack-sm" style={{ background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 14, padding: 16 }}>
      <h3 style={{ fontSize: 15 }}>{title}</h3>
      <div className="hint">Matériel : {need}</div>
      {children}
    </div>
  );
}

function BackupPanel({ dataDir, onRestored }: { dataDir?: string; onRestored: () => void }) {
  const { toast, toastError } = useStudio();
  const [exporting, setExporting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"fusion" | "remplacement">("fusion");
  const [restoring, setRestoring] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function exportBackup() {
    setExporting(true);
    try {
      const blob = await api.backup();
      saveBlob(blob, `studio-ia-sauvegarde-${new Date().toISOString().slice(0, 10)}.zip`);
      toast("success", "Sauvegarde téléchargée.");
    } catch (err) {
      toastError(err);
    } finally {
      setExporting(false);
    }
  }

  async function restore() {
    if (!file) return;
    setRestoring(true);
    setResult(null);
    setConfirm(false);
    try {
      const r = await api.restore(file, mode);
      setResult(
        `Restauration (${r.mode}) terminée : ${r.itemsAdded} élément(s) ajouté(s)${r.itemsSkipped ? `, ${r.itemsSkipped} déjà présent(s)` : ""}, ${r.projectsAdded} projet(s), ${r.filesRestored} image(s).`,
      );
      setFile(null);
      onRestored();
    } catch (err) {
      setResult(null);
      toast("error", errorText(err).message, errorText(err).hint);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <h2 className="panel-title" style={{ marginBottom: 6 }}>
        <Archive size={18} /> Sauvegarde et restauration
      </h2>
      <p className="small muted" style={{ marginBottom: 16 }}>
        La sauvegarde est une archive ZIP contenant toute la bibliothèque (images, analyses, prompts, projets). Elle n’inclut jamais vos clés API.
        {dataDir && (
          <>
            {" "}
            Dossier des données : <span className="mono">{dataDir}</span>
          </>
        )}
      </p>
      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="stack-sm">
          <h3 style={{ fontSize: 14 }}>Exporter</h3>
          <button className="btn btn-primary" onClick={() => void exportBackup()} disabled={exporting} data-testid="export-backup">
            {exporting ? <Spinner /> : <Archive size={16} />} Télécharger une sauvegarde
          </button>
          <p className="hint">Aussi en ligne de commande : npm run backup</p>
        </div>
        <div className="stack-sm">
          <h3 style={{ fontSize: 14 }}>Restaurer</h3>
          <input ref={input} type="file" accept=".zip,application/zip" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="restore-input" />
          <button className="btn" onClick={() => input.current?.click()}>
            <Upload size={16} /> {file ? file.name : "Choisir une sauvegarde (.zip)"}
          </button>
          <Segmented
            label="Mode de restauration"
            value={mode}
            onChange={setMode}
            options={[
              { value: "fusion", label: "Fusionner" },
              { value: "remplacement", label: "Remplacer tout" },
            ]}
          />
          <p className="hint">{mode === "fusion" ? "Ajoute les éléments absents, sans rien supprimer." : "Remplace toute la bibliothèque actuelle par la sauvegarde."}</p>
          <button className={cx("btn", mode === "remplacement" ? "btn-danger" : "btn-primary")} disabled={!file || restoring} onClick={() => (mode === "remplacement" ? setConfirm(true) : void restore())} data-testid="restore">
            {restoring ? <Spinner /> : <Upload size={16} />} Restaurer
          </button>
          {result && (
            <div data-testid="restore-result">
              <AlertBox kind="info" title={result} />
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        title="Remplacer toute la bibliothèque ?"
        message="Tous les éléments actuels seront remplacés par ceux de la sauvegarde. Exportez d’abord une sauvegarde si vous avez un doute."
        confirmLabel="Remplacer"
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={() => void restore()}
      />
    </section>
  );
}
