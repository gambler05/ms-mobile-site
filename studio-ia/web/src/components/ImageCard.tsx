import { ChevronLeft, ChevronRight, Copy, Download, Heart, ImagePlus, RefreshCw, Scaling, Shuffle, X } from "lucide-react";
import { useEffect } from "react";
import { downloadUrl, fileUrl, type LibraryItem } from "../lib/api";
import { copyText, formatDate } from "../lib/util";
import { STYLE_LABELS } from "../../../server/src/shared/types";
import { useStudio } from "../state/studio";
import { CopyButton, Spinner } from "./ui";

export interface ImageActions {
  onRegenerate?: (item: LibraryItem) => void;
  onVariants?: (item: LibraryItem) => void;
  onUpscale?: (item: LibraryItem) => void;
  onFavorite?: (item: LibraryItem) => void;
  onUseAsReference?: (item: LibraryItem) => void;
  canUpscale?: boolean;
  canVariants?: boolean;
  busyId?: string | null;
}

export function ImageCard({ item, onOpen, actions }: { item: LibraryItem; onOpen: () => void; actions: ImageActions }) {
  const { toast } = useStudio();
  if (!item.file) return null;
  const busy = actions.busyId === item.id;
  const ratio = `${item.file.width} / ${item.file.height}`;
  return (
    <figure className="image-card" style={{ margin: 0 }} data-testid="image-card">
      <div className="image-frame" style={{ aspectRatio: ratio }}>
        <img src={fileUrl(item.file.name)} alt={item.title || "Image générée"} loading="lazy" onClick={onOpen} />
        {busy && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(8,8,12,.55)" }}>
            <Spinner size={26} />
          </div>
        )}
        <div className="image-actions">
          <a className="icon-btn" href={downloadUrl(item.file.name, item.title)} download title="Télécharger" aria-label="Télécharger" data-testid="download">
            <Download size={16} />
          </a>
          <button
            className="icon-btn"
            title="Copier le prompt"
            aria-label="Copier le prompt"
            data-testid="copy-prompt"
            onClick={async () => {
              const ok = await copyText(item.prompt);
              toast(ok ? "success" : "error", ok ? "Prompt copié." : "Copie impossible : sélectionnez le texte manuellement.");
            }}
          >
            <Copy size={16} />
          </button>
          {actions.onRegenerate && item.generation && item.generation.operation !== "agrandissement" && (
            <button className="icon-btn" title="Régénérer avec les mêmes paramètres" aria-label="Régénérer" disabled={busy} onClick={() => actions.onRegenerate!(item)} data-testid="regenerate">
              <RefreshCw size={16} />
            </button>
          )}
          {actions.onVariants && (
            <button
              className="icon-btn"
              title={actions.canVariants ? "Créer des variantes" : "Variantes : le moteur choisi n'accepte pas d'image de référence"}
              aria-label="Créer des variantes"
              disabled={busy || !actions.canVariants}
              onClick={() => actions.onVariants!(item)}
              data-testid="variants"
            >
              <Shuffle size={16} />
            </button>
          )}
          {actions.onUpscale && (
            <button
              className="icon-btn"
              title={actions.canUpscale ? "Agrandir (upscale)" : "Agrandir : aucun moteur compatible connecté"}
              aria-label="Agrandir l'image"
              disabled={busy || !actions.canUpscale}
              onClick={() => actions.onUpscale!(item)}
              data-testid="upscale"
            >
              <Scaling size={16} />
            </button>
          )}
          {actions.onFavorite && (
            <button className={`icon-btn ${item.favorite ? "on" : ""}`} title={item.favorite ? "Retirer des favoris" : "Ajouter aux favoris"} aria-label="Favori" aria-pressed={item.favorite} onClick={() => actions.onFavorite!(item)} data-testid="favorite">
              <Heart size={16} fill={item.favorite ? "currentColor" : "none"} />
            </button>
          )}
        </div>
      </div>
      <figcaption className="image-meta">
        <span className="title" title={item.prompt}>
          {item.title || "Sans titre"}
        </span>
        <span className="tiny muted">
          {item.file.width}×{item.file.height}
          {item.generation ? ` · ${item.generation.engineName}` : ""}
          {item.generation?.operation === "variante" ? " · variante" : item.generation?.operation === "agrandissement" ? " · agrandie" : ""}
        </span>
      </figcaption>
    </figure>
  );
}

export function Lightbox({
  items,
  index,
  onIndex,
  onClose,
  actions,
}: {
  items: LibraryItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  actions: ImageActions;
}) {
  const item = items[index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < items.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose, onIndex]);
  if (!item?.file) return null;
  const g = item.generation;
  const busy = actions.busyId === item.id;
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="lightbox" role="dialog" aria-modal="true" aria-label="Aperçu de l'image" data-testid="lightbox">
        <div className="lightbox-stage" onClick={(e) => e.target === e.currentTarget && onClose()}>
          <img src={fileUrl(item.file.name)} alt={item.title} />
          {index > 0 && (
            <button className="btn btn-icon lightbox-nav prev" aria-label="Image précédente" onClick={() => onIndex(index - 1)}>
              <ChevronLeft size={18} />
            </button>
          )}
          {index < items.length - 1 && (
            <button className="btn btn-icon lightbox-nav next" aria-label="Image suivante" onClick={() => onIndex(index + 1)}>
              <ChevronRight size={18} />
            </button>
          )}
        </div>
        <aside className="lightbox-side">
          <div className="row-between">
            <span className="badge badge-violet">
              {index + 1} / {items.length}
            </span>
            <button className="btn btn-ghost btn-icon" aria-label="Fermer l'aperçu" onClick={onClose} data-testid="lightbox-close">
              <X size={18} />
            </button>
          </div>
          <div>
            <div className="label">Prompt</div>
            <p className="prompt-text" style={{ marginTop: 6 }}>
              {item.prompt}
            </p>
          </div>
          {item.negativePrompt && (
            <div>
              <div className="label">Prompt négatif</div>
              <p className="small muted" style={{ marginTop: 6 }}>
                {item.negativePrompt}
              </p>
            </div>
          )}
          <div className="row">
            <a className="btn btn-sm btn-primary" href={downloadUrl(item.file.name, item.title)} download>
              <Download size={15} /> Télécharger
            </a>
            <CopyButton text={item.prompt} label="Copier le prompt" />
          </div>
          <div className="row">
            {actions.onRegenerate && g && g.operation !== "agrandissement" && (
              <button className="btn btn-sm" disabled={busy} onClick={() => actions.onRegenerate!(item)}>
                <RefreshCw size={15} /> Régénérer
              </button>
            )}
            {actions.onVariants && (
              <button className="btn btn-sm" disabled={busy || !actions.canVariants} onClick={() => actions.onVariants!(item)}>
                <Shuffle size={15} /> Variantes
              </button>
            )}
            {actions.onUpscale && (
              <button className="btn btn-sm" disabled={busy || !actions.canUpscale} onClick={() => actions.onUpscale!(item)}>
                <Scaling size={15} /> Agrandir
              </button>
            )}
            {actions.onUseAsReference && (
              <button className="btn btn-sm" onClick={() => actions.onUseAsReference!(item)}>
                <ImagePlus size={15} /> Utiliser comme référence
              </button>
            )}
          </div>
          <dl className="kv">
            <dt>Dimensions</dt>
            <dd>
              {item.file.width} × {item.file.height} px
            </dd>
            {g && (
              <>
                <dt>Moteur</dt>
                <dd>
                  {g.engineName} · {g.model}
                </dd>
                <dt>Format</dt>
                <dd>{g.aspectRatio}</dd>
                <dt>Style</dt>
                <dd>{STYLE_LABELS[g.style] ?? g.style}</dd>
                {g.seed !== null && (
                  <>
                    <dt>Graine</dt>
                    <dd className="mono">{g.seed}</dd>
                  </>
                )}
                <dt>Opération</dt>
                <dd>{g.operation === "generation" ? "Génération" : g.operation === "variante" ? "Variante" : "Agrandissement"}</dd>
              </>
            )}
            <dt>Créée le</dt>
            <dd>{formatDate(item.createdAt)}</dd>
          </dl>
          {g && g.finalPrompt !== item.prompt && (
            <details className="advanced">
              <summary>Prompt exact envoyé au moteur</summary>
              <div className="advanced-body">
                <p className="small mono" style={{ whiteSpace: "pre-wrap" }}>
                  {g.finalPrompt}
                </p>
              </div>
            </details>
          )}
        </aside>
      </div>
    </>
  );
}
