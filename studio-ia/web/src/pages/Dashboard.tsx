import { ArrowRight, ImagePlus, Library, RefreshCw, ScanSearch, Settings, WandSparkles } from "lucide-react";
import { type ComponentType, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Capability, fileUrl, type LibraryItem } from "../lib/api";
import { useStudio } from "../state/studio";
import { EngineBadge, Spinner, StatusDot } from "../components/ui";

const CARDS: Array<{ to: string; title: string; text: string; cap: Capability; icon: ComponentType<{ size?: number; color?: string }>; testId: string }> = [
  {
    to: "/generer",
    title: "GÉNÉRER UNE IMAGE",
    text: "Décris ton idée et transforme-la en image grâce à l’IA.",
    cap: "generate",
    icon: ImagePlus,
    testId: "card-generate",
  },
  {
    to: "/analyser",
    title: "ANALYSER UNE IMAGE",
    text: "Importe une image et obtiens un prompt détaillé pour recréer son style et sa composition.",
    cap: "vision",
    icon: ScanSearch,
    testId: "card-analyze",
  },
  {
    to: "/ameliorer",
    title: "AMÉLIORER UN PROMPT",
    text: "Transforme tes idées en instructions visuelles professionnelles.",
    cap: "text",
    icon: WandSparkles,
    testId: "card-enhance",
  },
];

export function DashboardPage() {
  const { status, enginesFor, refreshStatus, loadingStatus, statusError } = useStudio();
  const [recent, setRecent] = useState<LibraryItem[] | null>(null);

  useEffect(() => {
    api
      .library({ limit: 8 })
      .then((r) => setRecent(r.items.filter((i) => i.file)))
      .catch(() => setRecent([]));
  }, []);

  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">Studio de création assisté par IA</div>
        <h1 style={{ marginTop: 8 }}>Que voulez-vous créer aujourd’hui ?</h1>
        <p>
          Générez des images à partir d’un texte, transformez n’importe quelle image en prompt précis, et organisez vos créations
          dans votre bibliothèque. Tout reste sur votre ordinateur.
        </p>
      </section>

      <div className="grid-3" style={{ marginBottom: 28 }}>
        {CARDS.map(({ to, title, text, cap, icon: Icon, testId }) => {
          const ready = enginesFor(cap).filter((e) => e.available);
          return (
            <Link key={to} to={to} className="action-card" data-testid={testId}>
              <div className="action-icon">
                <Icon size={24} color="#fff" />
              </div>
              <h2>{title}</h2>
              <p>{text}</p>
              <div className="action-foot">
                {status === null ? (
                  <span className="badge">Vérification…</span>
                ) : ready.length ? (
                  <span className="badge badge-success">Prêt · {ready.map((e) => e.name).join(", ")}</span>
                ) : (
                  <span className="badge badge-warning">Aucun moteur connecté</span>
                )}
                <ArrowRight size={18} />
              </div>
            </Link>
          );
        })}
      </div>

      <div className="split">
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">
              <Library size={18} /> Créations récentes
            </h2>
            <Link to="/bibliotheque" className="btn btn-sm btn-ghost">
              Tout voir <ArrowRight size={15} />
            </Link>
          </div>
          {recent === null ? (
            <Spinner />
          ) : recent.length === 0 ? (
            <p className="muted small">Vos images générées et analysées apparaîtront ici.</p>
          ) : (
            <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
              {recent.map((it) => (
                <Link key={it.id} to={it.type === "analysis" ? `/analyser?item=${it.id}` : `/bibliotheque?item=${it.id}`} className="lib-card" title={it.title}>
                  <div className="lib-thumb">
                    <img src={fileUrl(it.file!.name)} alt={it.title} loading="lazy" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">
              <Settings size={18} /> Moteurs d’IA
            </h2>
            <button className="btn btn-sm btn-ghost btn-icon" aria-label="Revérifier les moteurs" onClick={() => void refreshStatus(true)}>
              {loadingStatus ? <Spinner /> : <RefreshCw size={15} />}
            </button>
          </div>
          {statusError && <p className="small" style={{ color: "var(--danger)" }}>{statusError}</p>}
          <div className="stack-sm">
            {(status?.engines ?? []).map((e) => (
              <div key={e.id} className="row-between" style={{ padding: "6px 0" }}>
                <div className="row" style={{ minWidth: 0 }}>
                  <StatusDot engine={e} />
                  <span className="small" style={{ fontWeight: 550 }}>
                    {e.name}
                  </span>
                </div>
                <EngineBadge engine={e} />
              </div>
            ))}
          </div>
          <Link to="/parametres" className="btn btn-sm btn-block" style={{ marginTop: 12 }}>
            Gérer les moteurs
          </Link>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2 className="panel-title" style={{ marginBottom: 12 }}>
          Bien démarrer
        </h2>
        <ol className="steps small">
          <li>
            Ouvrez <Link to="/parametres">Paramètres</Link> et connectez au moins un moteur : une clé API (Claude, OpenAI, Stability AI) ou un logiciel local
            (Ollama, Stable Diffusion WebUI).
          </li>
          <li>
            Décrivez votre idée dans <Link to="/generer">Générer</Link>, ou commencez par la rendre plus précise dans <Link to="/ameliorer">Améliorer un prompt</Link>.
          </li>
          <li>
            Importez une image qui vous inspire dans <Link to="/analyser">Analyser</Link> : vous obtiendrez six versions de prompt prêtes à l’emploi.
          </li>
        </ol>
      </section>
    </div>
  );
}
