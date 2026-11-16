import { Languages, Pencil, RotateCcw, Save, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStudio } from "../state/studio";
import { CopyButton, Spinner } from "./ui";

/**
 * Carte d'un prompt : copier, modifier, traduire, envoyer au générateur, enregistrer.
 */
export function PromptCard({
  title,
  description,
  text,
  language,
  onSend,
  onSave,
  testId,
}: {
  title: string;
  description?: string;
  text: string;
  language: "en" | "fr";
  onSend?: (text: string) => void;
  onSave?: (text: string) => void;
  testId: string;
}) {
  const { defaultEngine, prefs, toastError, toast } = useStudio();
  const textEngine = defaultEngine("text", prefs.textEngine);
  const [value, setValue] = useState(text);
  const [lang, setLang] = useState(language);
  const [editing, setEditing] = useState(false);
  const [translating, setTranslating] = useState(false);
  const modified = value !== text;

  useEffect(() => {
    setValue(text);
    setLang(language);
  }, [text, language]);

  async function translate() {
    const target = lang === "en" ? "fr" : "en";
    setTranslating(true);
    try {
      const r = await api.translate(value, target, textEngine?.id);
      setValue(r.text);
      setLang(target);
      toast("success", target === "fr" ? "Traduit en français." : "Traduit en anglais.");
    } catch (err) {
      toastError(err);
    } finally {
      setTranslating(false);
    }
  }

  return (
    <article className="prompt-card" data-testid={testId}>
      <div className="prompt-card-head">
        <div>
          <h3 style={{ fontSize: 15 }}>{title}</h3>
          {description && <div className="hint">{description}</div>}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <span className="badge">{lang === "en" ? "Anglais" : "Français"}</span>
          {modified && <span className="badge badge-violet">Modifié</span>}
        </div>
      </div>
      {editing ? (
        <textarea className="textarea" value={value} onChange={(e) => setValue(e.target.value)} rows={6} autoFocus data-testid={`${testId}-editor`} />
      ) : (
        <p className="prompt-text" data-testid={`${testId}-text`}>
          {value || <span className="muted">—</span>}
        </p>
      )}
      <div className="prompt-actions">
        <CopyButton text={value} testId={`${testId}-copy`} />
        <button className="btn btn-sm" onClick={() => setEditing((e) => !e)} data-testid={`${testId}-edit`}>
          <Pencil size={14} /> {editing ? "Terminer" : "Modifier"}
        </button>
        <button className="btn btn-sm" onClick={() => void translate()} disabled={!textEngine || translating || !value.trim()} title={textEngine ? undefined : "Nécessite un moteur de texte"} data-testid={`${testId}-translate`}>
          {translating ? <Spinner size={14} /> : <Languages size={14} />}
          {lang === "en" ? "Traduire en français" : "Traduire en anglais"}
        </button>
        {onSend && (
          <button className="btn btn-sm btn-primary" onClick={() => onSend(value)} disabled={!value.trim()} data-testid={`${testId}-send`}>
            <Send size={14} /> Envoyer au générateur
          </button>
        )}
        {onSave && (
          <button className="btn btn-sm btn-ghost" onClick={() => onSave(value)} disabled={!value.trim()} title="Enregistrer dans les prompts favoris">
            <Save size={14} /> Enregistrer
          </button>
        )}
        {modified && (
          <button className="btn btn-sm btn-ghost" onClick={() => { setValue(text); setLang(language); }}>
            <RotateCcw size={14} /> Rétablir
          </button>
        )}
      </div>
    </article>
  );
}
