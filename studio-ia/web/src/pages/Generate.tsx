import { ChevronDown, Dice5, Eraser, ImagePlus, Languages, PenLine, Sparkles, Undo2, WandSparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Dropzone } from "../components/Dropzone";
import { type ImageActions, ImageCard, Lightbox } from "../components/ImageCard";
import { AlertBox, Chip, EngineSelect, ErrorBox, NarrowNoEngine, NoEngine, PageHeader, ProgressCard, RatioIcon, Segmented, Spinner } from "../components/ui";
import { api, type AspectRatio, errorText, fileUrl, type LibraryItem, type QualityId, type StyleId } from "../lib/api";
import { type LoadedImage, loadImageFile } from "../lib/image";
import { plural } from "../lib/util";
import { useStudio } from "../state/studio";
import { ASPECT_RATIOS, QUALITY_LABELS, STYLE_LABELS } from "../../../server/src/shared/types";

export interface GenerateHandoff {
  prompt?: string;
  negativePrompt?: string;
  referenceItemId?: string;
  referenceFile?: string;
  aspectRatio?: AspectRatio;
}

type Reference = { kind: "upload"; image: LoadedImage } | { kind: "item"; itemId: string; fileName: string } | null;
type TextTool = "ameliorer" | "reecrire" | "enrichir" | "en" | "fr";

const RATIO_HINT: Record<AspectRatio, string> = {
  "1:1": "Carré",
  "9:16": "Vertical · Reels, TikTok",
  "16:9": "Paysage · vidéo",
  "4:5": "Portrait · Instagram",
  "3:2": "Photo",
};

export function GeneratePage() {
  const { enginesFor, defaultEngine, prefs, setPrefs, toast, toastError, refreshStatus } = useStudio();
  const location = useLocation();
  const navigate = useNavigate();

  const engines = enginesFor("generate");
  const fallback = defaultEngine("generate", prefs.imageEngine);
  const [engineId, setEngineId] = useState(prefs.imageEngine);
  const chosen = engines.find((e) => e.id === engineId);
  const engine = chosen?.available ? chosen : (fallback ?? chosen ?? null);

  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [style, setStyle] = useState<StyleId>("aucun");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [quality, setQuality] = useState<QualityId>("standard");
  const [count, setCount] = useState(1);
  const [seed, setSeed] = useState<string>("");
  const [steps, setSteps] = useState<string>("");
  const [guidance, setGuidance] = useState<string>("");
  const [strength, setStrength] = useState(0.6);
  const [reference, setReference] = useState<Reference>(null);

  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingSlots, setPendingSlots] = useState(0);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [results, setResults] = useState<LibraryItem[]>([]);
  const [history, setHistory] = useState<LibraryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [lightbox, setLightbox] = useState<{ list: LibraryItem[]; index: number } | null>(null);

  const [textBusy, setTextBusy] = useState<TextTool | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const textEngine = defaultEngine("text", prefs.textEngine);
  const upscaleReady = enginesFor("upscale").some((e) => e.available);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Prompt transmis par un autre écran (analyse, éditeur, bibliothèque).
  useEffect(() => {
    const h = location.state as GenerateHandoff | null;
    if (!h) return;
    if (h.prompt) setPrompt(h.prompt);
    if (h.negativePrompt !== undefined) setNegativePrompt(h.negativePrompt);
    if (h.aspectRatio) setAspectRatio(h.aspectRatio);
    if (h.referenceItemId && h.referenceFile) setReference({ kind: "item", itemId: h.referenceItemId, fileName: h.referenceFile });
    navigate(location.pathname, { replace: true, state: null });
    promptRef.current?.focus();
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (engine && engine.id !== engineId) setEngineId(engine.id);
  }, [engine, engineId]);

  // Ajuste les options aux possibilités du moteur choisi.
  useEffect(() => {
    if (!engine?.limits) return;
    if (!engine.limits.qualities.includes(quality)) setQuality(engine.limits.qualities[0]);
    if (count > engine.limits.maxImages) setCount(engine.limits.maxImages);
  }, [engine, quality, count]);

  const loadHistory = useCallback(async (offset = 0) => {
    try {
      const res = await api.library({ type: "image", limit: 24, offset });
      setHistory((h) => (offset === 0 ? res.items : [...h, ...res.items]));
      setHistoryTotal(res.total);
    } catch {
      // l'historique est secondaire : on n'interrompt pas l'écran
    }
  }, []);
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const supports = (cap: "reference" | "negative" | "seed") => engine?.capabilities.includes(cap) ?? false;
  const advanced = engine?.limits?.advanced ?? [];

  async function runTextTool(tool: TextTool) {
    if (!prompt.trim()) {
      toast("info", "Écrivez d'abord une idée dans le champ de prompt.");
      return;
    }
    setTextBusy(tool);
    try {
      let next: string;
      if (tool === "ameliorer") {
        const r = await api.enhance(prompt, { detail: 3, style, lighting: "conserver", mood: "conserver", vertical: aspectRatio === "9:16", character: "", language: prefs.promptLanguage }, textEngine?.id);
        next = r.prompt;
        if (r.negativePrompt && !negativePrompt.trim()) setNegativePrompt(r.negativePrompt);
      } else if (tool === "reecrire" || tool === "enrichir") {
        next = (await api.rewrite(prompt, tool, textEngine?.id)).text;
      } else {
        next = (await api.translate(prompt, tool, textEngine?.id)).text;
      }
      setUndo(prompt);
      setPrompt(next);
      toast("success", tool === "en" || tool === "fr" ? "Prompt traduit." : "Prompt mis à jour.");
    } catch (err) {
      toastError(err);
    } finally {
      setTextBusy(null);
    }
  }

  async function onReferenceFile(file: File) {
    try {
      setReference({ kind: "upload", image: await loadImageFile(file) });
    } catch (err) {
      toast("error", errorText(err).message);
    }
  }

  function addResults(items: LibraryItem[], engineNotes: string[]) {
    setResults((r) => [...items, ...r]);
    setHistory((h) => [...items, ...h.filter((x) => !items.some((i) => i.id === x.id))]);
    setHistoryTotal((t) => t + items.length);
    setNotes(engineNotes);
  }

  async function generate() {
    if (!engine) return;
    setError(null);
    setNotes([]);
    setBusy(true);
    setBusyLabel(`Génération de ${plural(count, "image", "images")} avec ${engine.name}…`);
    setPendingSlots(count);
    setPrefs({ imageEngine: engine.id });
    try {
      const res = await api.generate({
        engineId: engine.id,
        prompt,
        negativePrompt,
        style,
        aspectRatio,
        quality,
        count,
        seed: seed.trim() ? Number(seed) : null,
        steps: steps.trim() ? Number(steps) : null,
        guidance: guidance.trim() ? Number(guidance) : null,
        strength: reference ? strength : null,
        reference: reference?.kind === "upload" ? reference.image.dataUrl : null,
        referenceItemId: reference?.kind === "item" ? reference.itemId : null,
      });
      addResults(res.items, res.notes);
      toast("success", `${plural(res.items.length, "image générée", "images générées")} et enregistrée${res.items.length > 1 ? "s" : ""} dans la bibliothèque.`);
      void refreshStatus();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
      setPendingSlots(0);
    }
  }

  const runItemOp = async (item: LibraryItem, label: string, slots: number, op: () => Promise<{ items: LibraryItem[]; notes: string[] }>) => {
    setBusyId(item.id);
    setBusy(true);
    setBusyLabel(label);
    setPendingSlots(slots);
    setError(null);
    setLightbox(null);
    try {
      const res = await op();
      addResults(res.items, res.notes);
      toast("success", "Terminé : résultat ajouté à la bibliothèque.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusyId(null);
      setBusy(false);
      setPendingSlots(0);
    }
  };

  const variantEngineFor = (item: LibraryItem) => {
    const own = engines.find((e) => e.id === item.generation?.engineId);
    if (own?.available && own.capabilities.includes("reference")) return own;
    return engine?.available && engine.capabilities.includes("reference") ? engine : null;
  };

  const actions: ImageActions = {
    busyId,
    canUpscale: upscaleReady,
    canVariants: !!engines.some((e) => e.available && e.capabilities.includes("reference")),
    onRegenerate: (item) => runItemOp(item, "Nouvelle génération avec les mêmes paramètres…", 1, () => api.regenerate(item.id)),
    onVariants: (item) => {
      const ve = variantEngineFor(item);
      if (!ve) return toast("error", "Aucun moteur connecté n'accepte d'image de référence pour créer des variantes.");
      void runItemOp(item, `Création de 2 variantes avec ${ve.name}…`, 2, () => api.variations(item.id, 2, ve.id));
    },
    onUpscale: (item) =>
      runItemOp(item, "Agrandissement de l'image…", 1, async () => {
        const r = await api.upscale(item.id);
        return { items: [r.item], notes: [] };
      }),
    onFavorite: async (item) => {
      try {
        const { item: updated } = await api.patchItem(item.id, { favorite: !item.favorite });
        const swap = (list: LibraryItem[]) => list.map((x) => (x.id === updated.id ? updated : x));
        setResults(swap);
        setHistory(swap);
        setLightbox((lb) => (lb ? { ...lb, list: swap(lb.list) } : lb));
      } catch (err) {
        toastError(err);
      }
    },
    onUseAsReference: (item) => {
      if (!item.file) return;
      setReference({ kind: "item", itemId: item.id, fileName: item.file.name });
      setLightbox(null);
      toast("info", "Image définie comme référence.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  };

  const historyOnly = useMemo(() => history.filter((h) => !results.some((r) => r.id === h.id)), [history, results]);
  const canGenerate = !!engine?.available && prompt.trim().length >= 3 && !busy;
  const [rw, rh] = aspectRatio.split(":").map(Number);

  return (
    <div className="page">
      <PageHeader eyebrow="Texte → image" title="Générer une image" subtitle="Décrivez précisément l’image souhaitée, choisissez un format et un style, puis lancez la génération." />

      <div className="workspace">
        <div className="workspace-aside stack">
          <section className="panel stack">
            <NarrowNoEngine show={!engines.some((e) => e.available)} what="Aucun moteur de génération n’est connecté." />
            {engines.some((e) => e.available) && <EngineSelect cap="generate" value={engine?.id ?? ""} onChange={(id) => { setEngineId(id); setPrefs({ imageEngine: id }); }} testId="engine-select" />}

            <div className="field">
              <label className="label" htmlFor="prompt">
                Description de l’image
              </label>
              <div className="prompt-box">
                <textarea
                  id="prompt"
                  ref={promptRef}
                  className="textarea"
                  data-testid="prompt"
                  placeholder="Ex. : Un renard roux dans une forêt brumeuse à l’aube, rayons de soleil entre les arbres…"
                  value={prompt}
                  maxLength={8000}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canGenerate) void generate();
                  }}
                />
                <div className="prompt-toolbar">
                  <ToolButton tool="ameliorer" icon={<WandSparkles size={14} />} label="Améliorer" busy={textBusy} disabled={!textEngine} onClick={runTextTool} />
                  <ToolButton tool="reecrire" icon={<PenLine size={14} />} label="Réécrire" busy={textBusy} disabled={!textEngine} onClick={runTextTool} />
                  <ToolButton tool="enrichir" icon={<Sparkles size={14} />} label="Enrichir" busy={textBusy} disabled={!textEngine} onClick={runTextTool} />
                  <ToolButton tool="en" icon={<Languages size={14} />} label="→ Anglais" busy={textBusy} disabled={!textEngine} onClick={runTextTool} />
                  <ToolButton tool="fr" icon={<Languages size={14} />} label="→ Français" busy={textBusy} disabled={!textEngine} onClick={runTextTool} />
                  {undo !== null && (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setPrompt(undo); setUndo(null); }}>
                      <Undo2 size={14} /> Annuler
                    </button>
                  )}
                  <span className="counter">{prompt.length} / 8000</span>
                </div>
              </div>
              {!textEngine && <div className="hint">Les outils d’écriture nécessitent un moteur de texte (Claude ou Ollama).</div>}
            </div>

            <div className="field">
              <label className="label" htmlFor="negative">
                Prompt négatif <span className="hint">facultatif</span>
              </label>
              <textarea id="negative" className="textarea" style={{ minHeight: 64 }} data-testid="negative" placeholder="Éléments à éviter : flou, texte, filigrane, mains déformées…" value={negativePrompt} maxLength={4000} onChange={(e) => setNegativePrompt(e.target.value)} />
              {engine && !supports("negative") && negativePrompt.trim() && (
                <div className="hint">{engine.name} n’a pas de prompt négatif natif : ces éléments seront ajoutés à la fin du prompt (« Avoid: … »).</div>
              )}
            </div>

            <div className="field">
              <span className="label">Format</span>
              <div className="chips" role="group" aria-label="Format">
                {ASPECT_RATIOS.map((r) => (
                  <Chip key={r} selected={aspectRatio === r} onClick={() => setAspectRatio(r)} testId={`ratio-${r}`} title={RATIO_HINT[r]}>
                    <RatioIcon ratio={r} /> {r}
                  </Chip>
                ))}
              </div>
              <div className="hint">{RATIO_HINT[aspectRatio]}</div>
            </div>

            <div className="field">
              <span className="label">Style</span>
              <div className="chips" role="group" aria-label="Style">
                {(Object.keys(STYLE_LABELS) as StyleId[]).map((s) => (
                  <Chip key={s} selected={style === s} onClick={() => setStyle(s)} testId={`style-${s}`}>
                    {STYLE_LABELS[s]}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="grid-2">
              <div className="field">
                <span className="label">Qualité</span>
                <select className="select" value={quality} onChange={(e) => setQuality(e.target.value as QualityId)} data-testid="quality">
                  {(engine?.limits?.qualities ?? (["standard"] as QualityId[])).map((q) => (
                    <option key={q} value={q}>
                      {QUALITY_LABELS[q]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <span className="label">Nombre d’images</span>
                <Segmented
                  label="Nombre d'images"
                  value={String(count)}
                  onChange={(v) => setCount(Number(v))}
                  options={Array.from({ length: engine?.limits?.maxImages ?? 4 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
                />
              </div>
            </div>

            <div className="field">
              <span className="label">
                Image de référence <span className="hint">facultatif</span>
              </span>
              {engine && !supports("reference") ? (
                <div className="hint">{engine.name} n’accepte pas d’image de référence.</div>
              ) : reference ? (
                <div className="row" style={{ alignItems: "flex-start" }} data-testid="reference-preview">
                  <img
                    src={reference.kind === "upload" ? reference.image.dataUrl : fileUrl(reference.fileName)}
                    alt="Référence"
                    style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)" }}
                  />
                  <div className="grow stack-sm">
                    <div className="small">{reference.kind === "upload" ? reference.image.name : "Image de la bibliothèque"}</div>
                    <label className="hint" htmlFor="strength">
                      Liberté par rapport à la référence : {Math.round(strength * 100)} %
                    </label>
                    <input id="strength" type="range" min={0.1} max={0.95} step={0.05} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
                  </div>
                  <button className="btn btn-sm btn-ghost btn-icon" aria-label="Retirer la référence" onClick={() => setReference(null)}>
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <Dropzone compact onFile={onReferenceFile} testId="reference-dropzone" title="Ajouter une image de référence" subtitle="Glisser-déposer ou cliquer · PNG, JPG, WEBP" />
              )}
            </div>

            {advanced.some((a) => a !== "strength") && (
              <details className="advanced">
                <summary>
                  Paramètres avancés <ChevronDown size={16} className="chev" />
                </summary>
                <div className="advanced-body">
                  {advanced.includes("seed") && (
                    <div className="field">
                      <label className="label" htmlFor="seed">
                        Graine (seed) <span className="hint">vide = aléatoire</span>
                      </label>
                      <div className="row" style={{ flexWrap: "nowrap" }}>
                        <input id="seed" className="input" inputMode="numeric" value={seed} onChange={(e) => setSeed(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Aléatoire" />
                        <button className="btn btn-icon" type="button" aria-label="Graine aléatoire" onClick={() => setSeed(String(Math.floor(Math.random() * 4_294_967_294)))}>
                          <Dice5 size={16} />
                        </button>
                        <button className="btn btn-icon" type="button" aria-label="Effacer la graine" onClick={() => setSeed("")}>
                          <Eraser size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                  {advanced.includes("steps") && (
                    <div className="field">
                      <label className="label" htmlFor="steps">
                        Étapes de calcul <span className="hint">vide = selon la qualité</span>
                      </label>
                      <input id="steps" className="input" inputMode="numeric" value={steps} onChange={(e) => setSteps(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="28" />
                    </div>
                  )}
                  {advanced.includes("guidance") && (
                    <div className="field">
                      <label className="label" htmlFor="guidance">
                        Fidélité au prompt (CFG) <span className="hint">vide = 7</span>
                      </label>
                      <input id="guidance" className="input" inputMode="decimal" value={guidance} onChange={(e) => setGuidance(e.target.value.replace(/[^\d.]/g, "").slice(0, 4))} placeholder="7" />
                    </div>
                  )}
                </div>
              </details>
            )}

            {engine?.limits?.notes.length ? (
              <ul className="hint" style={{ margin: 0, paddingLeft: 18 }}>
                {engine.limits.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}

            <button className="btn btn-primary btn-lg btn-block" disabled={!canGenerate} onClick={() => void generate()} data-testid="generate">
              {busy && !busyId ? <Spinner /> : <ImagePlus size={18} />}
              {busy && !busyId ? "Génération en cours…" : `Générer ${count > 1 ? `${count} images` : "l’image"}`}
            </button>
            {engine?.pricing.paid && (
              <div className="hint" style={{ textAlign: "center" }}>
                Service payant : {plural(count, "image sera facturée", "images seront facturées")} par {engine.vendor}.
              </div>
            )}
          </section>
        </div>

        <section className="stack" aria-label="Résultats">
          {engines.every((e) => !e.available) && <NoEngine cap="generate" />}
          <ProgressCard active={busy} title={busyLabel} detail="Selon le moteur, une génération prend de quelques secondes à plusieurs minutes (mode local sans carte graphique)." />
          <ErrorBox error={error} />
          {notes.length > 0 && (
            <AlertBox kind="info" title="Informations du moteur">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </AlertBox>
          )}

          {(pendingSlots > 0 || results.length > 0) && (
            <div className="panel">
              <div className="panel-head">
                <h2 className="panel-title">Résultats</h2>
                <span className="muted small">{plural(results.length, "image", "images")} cette session</span>
              </div>
              <div className="grid-cards" data-testid="results">
                {Array.from({ length: pendingSlots }, (_, i) => (
                  <div key={`s${i}`} className="skeleton" style={{ aspectRatio: `${rw} / ${rh}` }} aria-hidden />
                ))}
                {results.map((item, i) => (
                  <ImageCard key={item.id} item={item} actions={actions} onOpen={() => setLightbox({ list: results, index: i })} />
                ))}
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Historique des générations</h2>
              <span className="muted small">{plural(historyTotal, "image", "images")}</span>
            </div>
            {historyOnly.length === 0 ? (
              <p className="muted small">
                {historyTotal > 0 ? "Les images de cette session sont affichées ci-dessus." : "Les images générées s’enregistrent automatiquement ici et dans la bibliothèque."}
              </p>
            ) : (
              <div className="grid-cards" data-testid="history">
                {historyOnly.map((item, i) => (
                  <ImageCard key={item.id} item={item} actions={actions} onOpen={() => setLightbox({ list: historyOnly, index: i })} />
                ))}
              </div>
            )}
            {history.length < historyTotal && (
              <button className="btn btn-block" style={{ marginTop: 14 }} onClick={() => void loadHistory(history.length)}>
                Charger plus
              </button>
            )}
          </div>
        </section>
      </div>

      {lightbox && <Lightbox items={lightbox.list} index={lightbox.index} onIndex={(index) => setLightbox({ ...lightbox, index })} onClose={() => setLightbox(null)} actions={actions} />}
    </div>
  );
}

function ToolButton({ tool, icon, label, busy, disabled, onClick }: { tool: TextTool; icon: React.ReactNode; label: string; busy: TextTool | null; disabled: boolean; onClick: (t: TextTool) => void }) {
  return (
    <button
      type="button"
      className="btn btn-sm"
      disabled={disabled || busy !== null}
      title={disabled ? "Nécessite un moteur de texte (Claude ou Ollama)" : undefined}
      onClick={() => onClick(tool)}
      data-testid={`tool-${tool}`}
    >
      {busy === tool ? <Spinner size={14} /> : icon}
      {label}
    </button>
  );
}
