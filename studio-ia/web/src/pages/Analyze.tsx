import {
  Brush,
  Camera,
  CircleQuestionMark,
  Layers,
  LayoutGrid,
  ListChecks,
  Mountain,
  Palette,
  ScanSearch,
  Sun,
  Target,
  Type,
  Users,
  X,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Dropzone } from "../components/Dropzone";
import { PromptCard } from "../components/PromptCard";
import { EngineSelect, ErrorBox, NarrowNoEngine, NoEngine, PageHeader, ProgressCard, Segmented, Spinner } from "../components/ui";
import { type Analysis, api, type AspectRatio, errorText, fileUrl, type LibraryItem } from "../lib/api";
import { aspectInfo, type LoadedImage, loadImageFile } from "../lib/image";
import { formatBytes, formatDate } from "../lib/util";
import { useStudio } from "../state/studio";
import type { GenerateHandoff } from "./Generate";

const PROMPTS: Array<{ key: keyof Analysis["prompts"]; title: string; description: string }> = [
  { key: "detailed", title: "1. Prompt détaillé", description: "Description complète de l’image." },
  { key: "professional", title: "2. Prompt professionnel", description: "Formulation optimisée pour les générateurs d’images." },
  { key: "short", title: "3. Prompt court", description: "Version concise et efficace." },
  { key: "cinematic", title: "4. Prompt cinématographique", description: "Accent sur la lumière, la caméra et l’atmosphère." },
  { key: "negative", title: "5. Prompt négatif", description: "Éléments à éviter (pour les moteurs qui le prennent en charge)." },
  { key: "structured", title: "6. Prompt structuré", description: "Sujet, décor, composition, éclairage, couleurs, style et détails techniques." },
];

const STRUCT_LABELS: Record<keyof Analysis["prompts"]["structured"], string> = {
  subject: "Sujet",
  setting: "Décor",
  composition: "Composition",
  lighting: "Éclairage",
  colors: "Couleurs",
  style: "Style",
  technical: "Détails techniques",
};

/** Format de génération le plus proche du format de l'image analysée. */
function nearestSupported(width: number, height: number): AspectRatio {
  const options: Array<[AspectRatio, number]> = [
    ["1:1", 1],
    ["9:16", 9 / 16],
    ["16:9", 16 / 9],
    ["4:5", 0.8],
    ["3:2", 1.5],
  ];
  const r = width / height;
  return options.reduce((best, o) => (Math.abs(Math.log(r / o[1])) < Math.abs(Math.log(r / best[1])) ? o : best))[0];
}

export function structuredText(s: Analysis["prompts"]["structured"]): string {
  return (Object.keys(STRUCT_LABELS) as Array<keyof typeof STRUCT_LABELS>).map((k) => `${STRUCT_LABELS[k]} : ${s[k]}`).join("\n");
}

function structuredAsPrompt(s: Analysis["prompts"]["structured"]): string {
  return [s.subject, s.setting, s.composition, s.lighting, s.colors, s.style, s.technical]
    .map((x) => x.trim().replace(/[.\s]+$/, ""))
    .filter(Boolean)
    .join(". ");
}

export function AnalyzePage() {
  const { enginesFor, defaultEngine, prefs, setPrefs, toast, toastError } = useStudio();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const engines = enginesFor("vision");
  const chosen = engines.find((e) => e.id === prefs.visionEngine);
  const engine = chosen?.available ? chosen : (defaultEngine("vision", prefs.visionEngine) ?? chosen ?? null);

  const [image, setImage] = useState<LoadedImage | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [recent, setRecent] = useState<LibraryItem[]>([]);

  const loadRecent = useCallback(() => {
    api
      .library({ type: "analysis", limit: 12 })
      .then((r) => setRecent(r.items))
      .catch(() => undefined);
  }, []);
  useEffect(loadRecent, [loadRecent]);

  // Ouverture d'une analyse existante (?item=…).
  const itemParam = params.get("item");
  useEffect(() => {
    if (!itemParam || itemParam === item?.id) return;
    api
      .item(itemParam)
      .then(({ item }) => {
        if (item.type === "analysis") {
          setItem(item);
          setImage(null);
        }
      })
      .catch((err) => setError(errorText(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemParam]);

  const onFile = useCallback(
    async (file: File) => {
      setError(null);
      setLoadingFile(true);
      try {
        const loaded = await loadImageFile(file);
        setImage(loaded);
        setItem(null);
        if (params.get("item")) setParams({}, { replace: true });
      } catch (err) {
        setError({ message: errorText(err).message, hint: "Formats acceptés : PNG, JPG, JPEG, WEBP jusqu’à 20 Mo." });
      } finally {
        setLoadingFile(false);
      }
    },
    [params, setParams],
  );

  async function analyze() {
    if (!image || !engine) return;
    setBusy(true);
    setError(null);
    setPrefs({ visionEngine: engine.id });
    try {
      const { item } = await api.analyze({
        engineId: engine.id,
        image: image.dataUrl,
        analysisImage: image.analysisDataUrl,
        palette: image.palette,
        promptLanguage: prefs.promptLanguage,
        notes,
      });
      setItem(item);
      setParams({ item: item.id }, { replace: true });
      loadRecent();
      toast("success", "Analyse terminée et enregistrée dans la bibliothèque.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const a = item?.analysis ?? null;
  const meta = item?.analysisMeta ?? null;
  const ratio: AspectRatio = item?.file ? nearestSupported(item.file.width, item.file.height) : "1:1";

  const send = (prompt: string, negative?: string) => {
    const state: GenerateHandoff = { prompt, negativePrompt: negative ?? a?.prompts.negative ?? "", aspectRatio: ratio };
    navigate("/generer", { state });
  };
  const save = async (label: string, text: string) => {
    if (!item) return;
    try {
      await api.savePrompt({ title: `${item.title} — ${label}`, prompt: text, negativePrompt: a?.prompts.negative ?? "", tags: ["analyse"], projectId: item.projectId });
      toast("success", "Prompt enregistré dans la bibliothèque (favoris).");
    } catch (err) {
      toastError(err);
    }
  };

  const previewSrc = image?.dataUrl ?? (item?.file ? fileUrl(item.file.name) : null);
  const dims = image ? { w: image.width, h: image.height } : item?.file ? { w: item.file.width, h: item.file.height } : null;
  const aspect = dims ? aspectInfo(dims.w, dims.h) : null;
  const palette = image?.palette ?? meta?.palette ?? [];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Image → prompt"
        title="Analyser une image"
        subtitle="Importez une image : l’IA décrit ce qui est réellement visible et rédige six versions de prompt pour recréer une image proche."
      />

      <div className="workspace">
        <div className="workspace-aside stack">
          <section className="panel stack">
            <NarrowNoEngine show={!engines.some((e) => e.available)} what="Aucun moteur d’analyse n’est connecté." />
            {engines.some((e) => e.available) && <EngineSelect cap="vision" label="Moteur d’analyse" value={engine?.id ?? ""} onChange={(id) => setPrefs({ visionEngine: id })} testId="vision-engine" />}

            {previewSrc && dims ? (
              <div className="stack-sm" data-testid="analyze-preview">
                <div style={{ position: "relative" }}>
                  <img className="preview-img" src={previewSrc} alt="Image à analyser" />
                  <button
                    className="icon-btn"
                    style={{ position: "absolute", top: 8, right: 8 }}
                    aria-label="Retirer l’image"
                    onClick={() => {
                      setImage(null);
                      setItem(null);
                      setParams({}, { replace: true });
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
                <dl className="kv small">
                  {image && (
                    <>
                      <dt>Fichier</dt>
                      <dd style={{ overflowWrap: "anywhere" }}>
                        {image.name} · {formatBytes(image.bytes)}
                      </dd>
                    </>
                  )}
                  <dt>Dimensions</dt>
                  <dd data-testid="dims">
                    {dims.w} × {dims.h} px
                  </dd>
                  <dt>Format</dt>
                  <dd data-testid="ratio">
                    {aspect!.exact} · proche de {aspect!.nearest} ({aspect!.orientation})
                  </dd>
                </dl>
                {palette.length > 0 && (
                  <div className="swatches" aria-label="Palette mesurée" data-testid="palette">
                    {palette.map((c) => (
                      <span key={c} className="swatch">
                        <i style={{ background: c }} />
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                <Dropzone compact onFile={(f) => void onFile(f)} testId="replace-dropzone" title={image ? "Changer d’image" : "Analyser une autre image"} subtitle="Glisser-déposer ou cliquer" />
              </div>
            ) : (
              <Dropzone onFile={(f) => void onFile(f)} paste />
            )}
            {loadingFile && (
              <div className="row small muted">
                <Spinner /> Lecture de l’image…
              </div>
            )}

            {image && (
              <>
                <div className="field">
                  <span className="label">Langue des prompts</span>
                  <Segmented
                    label="Langue des prompts"
                    value={prefs.promptLanguage}
                    onChange={(v) => setPrefs({ promptLanguage: v })}
                    options={[
                      { value: "en", label: "Anglais (recommandé)" },
                      { value: "fr", label: "Français" },
                    ]}
                  />
                  <div className="hint">L’analyse est toujours rédigée en français ; les générateurs comprennent mieux les prompts en anglais.</div>
                </div>
                <div className="field">
                  <label className="label" htmlFor="notes">
                    Précisions <span className="hint">facultatif</span>
                  </label>
                  <textarea id="notes" className="textarea" style={{ minHeight: 64 }} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex. : je veux surtout reproduire l’éclairage et la palette." />
                </div>
                <button className="btn btn-primary btn-lg btn-block" disabled={!engine?.available || busy} onClick={() => void analyze()} data-testid="analyze">
                  {busy ? <Spinner /> : <ScanSearch size={18} />}
                  {busy ? "Analyse en cours…" : "Analyser l’image"}
                </button>
                {engine?.pricing.paid && <div className="hint" style={{ textAlign: "center" }}>Service payant : l’analyse est facturée par {engine.vendor}.</div>}
              </>
            )}
          </section>

          {recent.length > 0 && (
            <section className="panel">
              <h2 className="panel-title" style={{ marginBottom: 12 }}>
                Analyses récentes
              </h2>
              <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(76px, 1fr))", gap: 8 }}>
                {recent.map((r) => (
                  <button key={r.id} className="lib-card" style={{ padding: 0 }} title={`${r.title} — ${formatDate(r.createdAt)}`} onClick={() => setParams({ item: r.id })}>
                    <div className="lib-thumb">{r.file && <img src={fileUrl(r.file.name)} alt={r.title} loading="lazy" />}</div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <section className="stack" aria-label="Résultat de l’analyse">
          {engines.every((e) => !e.available) && <NoEngine cap="vision" />}
          <ProgressCard active={busy} title={`Analyse avec ${engine?.name ?? "le moteur"}…`} detail="L’IA examine le sujet, la composition, la lumière, les couleurs et le style. Comptez 10 à 60 secondes (plus en local sans carte graphique)." />
          <ErrorBox error={error} />

          {!a && !busy && engines.some((e) => e.available) && (
            <div className="empty">
              <div className="empty-icon">
                <ScanSearch size={24} />
              </div>
              <h3>Importez une image pour commencer</h3>
              <p className="small">Vous obtiendrez une analyse détaillée et six prompts : détaillé, professionnel, court, cinématographique, négatif et structuré.</p>
            </div>
          )}

          {a && item && (
            <>
              <div className="row-between">
                <div>
                  <h2 style={{ fontSize: 20 }} data-testid="analysis-title">
                    {item.title}
                  </h2>
                  <div className="hint">
                    Analysé par {meta?.engineName} · {meta?.model} · {formatDate(item.createdAt)}
                  </div>
                </div>
              </div>

              <div className="stack" data-testid="prompts">
                {PROMPTS.map(({ key, title, description }) =>
                  key === "structured" ? (
                    <PromptCard
                      key={key}
                      testId="prompt-structured"
                      title={title}
                      description={description}
                      text={structuredText(a.prompts.structured)}
                      language={meta?.promptLanguage ?? "en"}
                      onSend={() => send(structuredAsPrompt(a.prompts.structured))}
                      onSave={(t) => void save("structuré", t)}
                    />
                  ) : (
                    <PromptCard
                      key={key}
                      testId={`prompt-${key}`}
                      title={title}
                      description={description}
                      text={a.prompts[key] as string}
                      language={meta?.promptLanguage ?? "en"}
                      onSend={(t) => (key === "negative" ? send(a.prompts.professional, t) : send(t))}
                      onSave={(t) => void save(title.replace(/^\d\. /, "").toLowerCase(), t)}
                    />
                  ),
                )}
              </div>

              <h2 style={{ fontSize: 18, marginTop: 8 }}>Analyse détaillée</h2>
              <div className="grid-2" data-testid="analysis">
                <Section icon={<Target size={15} />} title="Sujets">
                  <p>{a.subjects.main}</p>
                  <List items={a.subjects.secondary} />
                </Section>
                {a.characters.length > 0 && (
                  <Section icon={<Users size={15} />} title="Personnages">
                    {a.characters.map((c, i) => (
                      <dl key={i} className="kv small" style={{ gridTemplateColumns: "100px minmax(0,1fr)" }}>
                        <dt>Description</dt>
                        <dd>{c.description}</dd>
                        <dt>Vêtements</dt>
                        <dd>{c.clothing}</dd>
                        <dt>Expression</dt>
                        <dd>{c.expression}</dd>
                        <dt>Pose</dt>
                        <dd>{c.pose}</dd>
                      </dl>
                    ))}
                  </Section>
                )}
                <Section icon={<Mountain size={15} />} title="Environnement et objets">
                  <p>{a.environment.setting}</p>
                  <List items={a.environment.objects} />
                </Section>
                <Section icon={<LayoutGrid size={15} />} title="Composition et cadrage">
                  <p>{a.composition.framing}</p>
                  <p className="muted" style={{ marginTop: 6 }}>
                    {a.composition.layout}
                  </p>
                </Section>
                <Section icon={<Camera size={15} />} title="Caméra">
                  <dl className="kv small" style={{ gridTemplateColumns: "120px minmax(0,1fr)" }}>
                    <dt>Angle</dt>
                    <dd>{a.camera.angle}</dd>
                    <dt>Perspective</dt>
                    <dd>{a.camera.perspective}</dd>
                    <dt>Profondeur de champ</dt>
                    <dd>{a.camera.depthOfField}</dd>
                    <dt>Optique</dt>
                    <dd>{a.camera.lens}</dd>
                  </dl>
                </Section>
                <Section icon={<Sun size={15} />} title="Éclairage">
                  <dl className="kv small" style={{ gridTemplateColumns: "100px minmax(0,1fr)" }}>
                    <dt>Type</dt>
                    <dd>{a.lighting.type}</dd>
                    <dt>Direction</dt>
                    <dd>{a.lighting.direction}</dd>
                    <dt>Ombres</dt>
                    <dd>{a.lighting.shadows}</dd>
                    <dt>Reflets</dt>
                    <dd>{a.lighting.reflections}</dd>
                  </dl>
                </Section>
                <Section icon={<Palette size={15} />} title="Couleurs et ambiance">
                  <List items={a.colors.dominant} />
                  <p style={{ marginTop: 6 }}>{a.colors.mood}</p>
                  {palette.length > 0 && (
                    <div className="swatches" style={{ marginTop: 10 }}>
                      {palette.map((c) => (
                        <span key={c} className="swatch" title="Couleur mesurée sur les pixels">
                          <i style={{ background: c }} />
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </Section>
                <Section icon={<Brush size={15} />} title="Style">
                  <dl className="kv small" style={{ gridTemplateColumns: "100px minmax(0,1fr)" }}>
                    <dt>Style</dt>
                    <dd>{a.style.artStyle}</dd>
                    <dt>Réalisme</dt>
                    <dd>{a.style.realism}</dd>
                    <dt>Médium</dt>
                    <dd>{a.style.medium}</dd>
                  </dl>
                </Section>
                <Section icon={<Layers size={15} />} title="Textures et détails">
                  <List items={a.textures} />
                </Section>
                <Section icon={<ListChecks size={15} />} title="À préserver pour une image proche">
                  <List items={a.keyElements} />
                </Section>
                {a.visibleText && (
                  <Section icon={<Type size={15} />} title="Texte visible">
                    <p>{a.visibleText}</p>
                  </Section>
                )}
                {a.uncertainties.length > 0 && (
                  <Section icon={<CircleQuestionMark size={15} />} title="Points incertains">
                    <List items={a.uncertainties} />
                  </Section>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="analysis-card">
      <h3>
        {icon}
        {title}
      </h3>
      <div className="small" style={{ lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul>
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}
