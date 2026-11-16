import { BookImage, Clapperboard, Repeat, Save, Send, UserRound, WandSparkles } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PromptCard } from "../components/PromptCard";
import { Chip, CopyButton, EngineSelect, ErrorBox, NarrowNoEngine, NoEngine, PageHeader, ProgressCard, Segmented, Spinner, Switch } from "../components/ui";
import { api, type EnhanceResult, errorText, type SeriesResult, type StyleId } from "../lib/api";
import { ACCEPT_ATTR, loadImageFile } from "../lib/image";
import { useStudio } from "../state/studio";
import { STYLE_LABELS } from "../../../server/src/shared/types";
import type { GenerateHandoff } from "./Generate";

const LIGHTING: Record<string, string> = {
  conserver: "Ne pas imposer",
  "heure-doree": "Heure dorée",
  "heure-bleue": "Heure bleue",
  studio: "Studio",
  dramatique: "Dramatique (clair-obscur)",
  neon: "Néon",
  volumetrique: "Volumétrique",
  naturel: "Naturelle douce",
  nuit: "Nuit",
};
const MOOD: Record<string, string> = {
  conserver: "Ne pas imposer",
  serein: "Sereine",
  mysterieux: "Mystérieuse",
  epique: "Épique",
  joyeux: "Joyeuse",
  melancolique: "Mélancolique",
  inquietant: "Inquiétante",
  luxueux: "Luxueuse",
  onirique: "Onirique",
};
const DETAIL_LABELS = ["", "Très concis", "Concis", "Équilibré", "Riche", "Très détaillé"];

export function EnhancePage() {
  const { enginesFor, defaultEngine, prefs, setPrefs, toast, toastError } = useStudio();
  const navigate = useNavigate();
  const engines = enginesFor("text");
  const chosen = engines.find((e) => e.id === prefs.textEngine);
  const engine = chosen?.available ? chosen : (defaultEngine("text", prefs.textEngine) ?? chosen ?? null);
  const visionReady = !!defaultEngine("vision", prefs.visionEngine);

  const [tab, setTab] = useState<"ameliorer" | "serie">("ameliorer");
  const [idea, setIdea] = useState("");
  const [detail, setDetail] = useState(4);
  const [style, setStyle] = useState<StyleId>("aucun");
  const [lighting, setLighting] = useState("conserver");
  const [mood, setMood] = useState("conserver");
  const [vertical, setVertical] = useState(false);
  const [character, setCharacter] = useState("");
  const [busy, setBusy] = useState<null | "enhance" | "series" | "character">(null);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [result, setResult] = useState<(EnhanceResult & { engineName: string }) | null>(null);

  const [story, setStory] = useState("");
  const [sceneCount, setSceneCount] = useState(4);
  const [series, setSeries] = useState<(SeriesResult & { engineName: string }) | null>(null);
  const charFile = useRef<HTMLInputElement>(null);

  const lang = prefs.promptLanguage;

  async function enhance() {
    setBusy("enhance");
    setError(null);
    setPrefs({ textEngine: engine?.id ?? "" });
    try {
      setResult(await api.enhance(idea, { detail, style, lighting, mood, vertical, character, language: lang }, engine?.id));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function makeSeries() {
    setBusy("series");
    setError(null);
    try {
      setSeries(await api.series({ story, count: sceneCount, character, style, vertical, language: lang, engineId: engine?.id }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function characterFromImage(file: File) {
    setBusy("character");
    setError(null);
    try {
      const img = await loadImageFile(file);
      const r = await api.character(img.analysisDataUrl, lang);
      setCharacter(`${r.description}${r.invariants.length ? `\nÀ conserver : ${r.invariants.join(", ")}.` : ""}`);
      toast("success", "Fiche du personnage créée à partir de l’image.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  const send = (prompt: string, negativePrompt: string) => {
    const state: GenerateHandoff = { prompt, negativePrompt, aspectRatio: vertical ? "9:16" : undefined };
    navigate("/generer", { state });
  };

  const saveOne = async (title: string, prompt: string, negativePrompt: string, tags: string[]) => {
    await api.savePrompt({ title, prompt, negativePrompt, tags });
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Ingénierie de prompts"
        title="Améliorer un prompt"
        subtitle="Transformez une idée simple en instructions visuelles professionnelles, ou créez une série d’images cohérentes autour d’une même histoire."
      />

      <div className="tabs" role="tablist">
        <button className="tab" role="tab" aria-selected={tab === "ameliorer"} onClick={() => setTab("ameliorer")} data-testid="tab-enhance">
          <WandSparkles size={16} /> Améliorer un prompt
        </button>
        <button className="tab" role="tab" aria-selected={tab === "serie"} onClick={() => setTab("serie")} data-testid="tab-series">
          <Clapperboard size={16} /> Série cohérente
        </button>
      </div>

      <div className="workspace">
        <div className="workspace-aside stack">
          <section className="panel stack">
            <NarrowNoEngine show={!engines.some((e) => e.available)} what="Aucun moteur de texte n’est connecté." />
            {engines.some((e) => e.available) && <EngineSelect cap="text" label="Moteur de texte" value={engine?.id ?? ""} onChange={(id) => setPrefs({ textEngine: id })} testId="text-engine" />}

            {tab === "ameliorer" ? (
              <div className="field">
                <label className="label" htmlFor="idea">
                  Votre idée ou votre prompt
                </label>
                <textarea id="idea" className="textarea" data-testid="idea" value={idea} onChange={(e) => setIdea(e.target.value)} maxLength={8000} placeholder="Ex. : Un renard dans une forêt." style={{ minHeight: 110 }} />
              </div>
            ) : (
              <>
                <div className="field">
                  <label className="label" htmlFor="story">
                    Histoire ou scène à décliner
                  </label>
                  <textarea id="story" className="textarea" data-testid="story" value={story} onChange={(e) => setStory(e.target.value)} maxLength={6000} placeholder="Ex. : Une jeune exploratrice découvre un phare abandonné, y passe la nuit pendant une tempête, puis repart au lever du soleil." style={{ minHeight: 110 }} />
                </div>
                <div className="field">
                  <span className="label">Nombre d’images</span>
                  <Segmented label="Nombre d'images" value={String(sceneCount)} onChange={(v) => setSceneCount(Number(v))} options={[2, 3, 4, 5, 6, 8].map((n) => ({ value: String(n), label: String(n) }))} />
                </div>
              </>
            )}

            {tab === "ameliorer" && (
              <div className="field">
                <label className="label" htmlFor="detail">
                  Niveau de détail <span className="hint">{DETAIL_LABELS[detail]}</span>
                </label>
                <input id="detail" type="range" min={1} max={5} step={1} value={detail} onChange={(e) => setDetail(Number(e.target.value))} />
              </div>
            )}

            <div className="field">
              <span className="label">Style artistique</span>
              <div className="chips">
                {(Object.keys(STYLE_LABELS) as StyleId[]).map((s) => (
                  <Chip key={s} selected={style === s} onClick={() => setStyle(s)}>
                    {s === "aucun" ? "Libre" : STYLE_LABELS[s]}
                  </Chip>
                ))}
              </div>
            </div>

            {tab === "ameliorer" && (
              <div className="grid-2">
                <div className="field">
                  <label className="label" htmlFor="lighting">
                    Éclairage
                  </label>
                  <select id="lighting" className="select" value={lighting} onChange={(e) => setLighting(e.target.value)}>
                    {Object.entries(LIGHTING).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label" htmlFor="mood">
                    Ambiance
                  </label>
                  <select id="mood" className="select" value={mood} onChange={(e) => setMood(e.target.value)}>
                    {Object.entries(MOOD).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <Switch checked={vertical} onChange={setVertical} testId="vertical">
              Format vertical TikTok / Instagram Reels (9:16)
            </Switch>

            <div className="field">
              <label className="label" htmlFor="character">
                <span className="row" style={{ gap: 6 }}>
                  <UserRound size={14} /> Personnage de référence <span className="hint">facultatif</span>
                </span>
                <button type="button" className="btn btn-sm btn-ghost" disabled={!visionReady || busy !== null} title={visionReady ? "Créer la fiche à partir d’une image" : "Nécessite un moteur d’analyse d’image"} onClick={() => charFile.current?.click()}>
                  {busy === "character" ? <Spinner size={14} /> : <BookImage size={14} />} Depuis une image
                </button>
              </label>
              <input ref={charFile} type="file" accept={ACCEPT_ATTR} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void characterFromImage(f); e.target.value = ""; }} />
              <textarea id="character" className="textarea" style={{ minHeight: 70 }} maxLength={3000} value={character} onChange={(e) => setCharacter(e.target.value)} placeholder="Décrivez l’apparence à préserver : visage, coiffure, tenue, couleurs, accessoires…" />
            </div>

            <div className="field">
              <span className="label">Langue du résultat</span>
              <Segmented label="Langue" value={lang} onChange={(v) => setPrefs({ promptLanguage: v })} options={[{ value: "en", label: "Anglais (recommandé)" }, { value: "fr", label: "Français" }]} />
            </div>

            {tab === "ameliorer" ? (
              <button className="btn btn-primary btn-lg btn-block" disabled={!engine?.available || !idea.trim() || busy !== null} onClick={() => void enhance()} data-testid="enhance">
                {busy === "enhance" ? <Spinner /> : <WandSparkles size={18} />} Améliorer le prompt
              </button>
            ) : (
              <button className="btn btn-primary btn-lg btn-block" disabled={!engine?.available || !story.trim() || busy !== null} onClick={() => void makeSeries()} data-testid="make-series">
                {busy === "series" ? <Spinner /> : <Clapperboard size={18} />} Créer la série de prompts
              </button>
            )}
          </section>
        </div>

        <section className="stack">
          {engines.every((e) => !e.available) && <NoEngine cap="text" />}
          <ProgressCard active={busy === "enhance" || busy === "series"} title={busy === "series" ? "Conception de la série…" : "Amélioration du prompt…"} />
          <ErrorBox error={error} />

          {tab === "ameliorer" && result && (
            <div className="stack" data-testid="enhance-result">
              <PromptCard
                testId="enhanced"
                title="Prompt amélioré"
                description={`Proposé par ${result.engineName}`}
                text={result.prompt}
                language={lang}
                onSend={(t) => send(t, result.negativePrompt)}
                onSave={async (t) => {
                  try {
                    await saveOne(idea.slice(0, 60) || "Prompt amélioré", t, result.negativePrompt, ["éditeur"]);
                    toast("success", "Prompt enregistré dans la bibliothèque.");
                  } catch (err) {
                    toastError(err);
                  }
                }}
              />
              {result.negativePrompt && <PromptCard testId="enhanced-negative" title="Prompt négatif" text={result.negativePrompt} language={lang} />}
              {result.changes.length > 0 && (
                <div className="panel">
                  <h3 className="panel-title" style={{ marginBottom: 8 }}>
                    Ce qui a été amélioré
                  </h3>
                  <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                    {result.changes.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              <button className="btn" onClick={() => { setIdea(result.prompt); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                <Repeat size={15} /> Repartir de ce résultat pour l’affiner
              </button>
            </div>
          )}

          {tab === "ameliorer" && !result && !busy && engines.some((e) => e.available) && (
            <div className="empty">
              <div className="empty-icon">
                <WandSparkles size={24} />
              </div>
              <h3>Exemple</h3>
              <p className="small" style={{ maxWidth: 560 }}>
                « Un renard dans une forêt. » devient : « Un renard roux au pelage détaillé se tient au milieu d’une forêt dense à l’aube, rayons de soleil traversant les arbres,
                brume légère au ras du sol, composition cinématographique, profondeur de champ naturelle, textures réalistes, éclairage volumétrique… »
              </p>
              <button className="btn btn-sm" onClick={() => setIdea("Un renard dans une forêt.")}>
                Essayer cet exemple
              </button>
            </div>
          )}

          {tab === "serie" && series && (
            <div className="stack" data-testid="series-result">
              <div className="panel stack-sm">
                <div className="row-between">
                  <h3 className="panel-title">Fiche personnage et guide de style</h3>
                  <div className="row">
                    <CopyButton text={series.scenes.map((s, i) => `${i + 1}. ${s.title}\n${s.prompt}`).join("\n\n")} label="Tout copier" />
                    <button
                      className="btn btn-sm"
                      onClick={async () => {
                        try {
                          const tag = `série ${new Date().toLocaleDateString("fr-FR")}`;
                          for (const [i, s] of series.scenes.entries()) await saveOne(`${i + 1}. ${s.title}`, s.prompt, series.negativePrompt, ["série", tag]);
                          toast("success", `${series.scenes.length} prompts enregistrés (étiquette « ${tag} »).`);
                        } catch (err) {
                          toastError(err);
                        }
                      }}
                    >
                      <Save size={14} /> Enregistrer la série
                    </button>
                  </div>
                </div>
                <p className="small">
                  <strong>Personnage : </strong>
                  {series.characterSheet}
                </p>
                <p className="small">
                  <strong>Style : </strong>
                  {series.styleGuide}
                </p>
                {series.negativePrompt && (
                  <p className="small muted">
                    <strong>Négatif : </strong>
                    {series.negativePrompt}
                  </p>
                )}
              </div>
              {series.scenes.map((s, i) => (
                <PromptCard key={i} testId={`scene-${i}`} title={`${i + 1}. ${s.title}`} text={s.prompt} language={lang} onSend={(t) => send(t, series.negativePrompt)} />
              ))}
            </div>
          )}
          {tab === "serie" && !series && !busy && engines.some((e) => e.available) && (
            <div className="empty">
              <div className="empty-icon">
                <Send size={22} />
              </div>
              <h3>Des images qui se suivent</h3>
              <p className="small" style={{ maxWidth: 560 }}>
                Décrivez une histoire : vous obtiendrez un prompt par image, chacun reprenant la même fiche de personnage et le même guide de style pour garder une apparence cohérente.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
