import { Cloud, HardDrive, ImagePlus, LayoutDashboard, Library, Layers, ScanSearch, Settings, WandSparkles } from "lucide-react";
import { NavLink, Outlet, Link } from "react-router-dom";
import { useStudio } from "../state/studio";

const NAV = [
  { to: "/", label: "Tableau de bord", short: "Accueil", icon: LayoutDashboard, end: true },
  { to: "/generer", label: "Générer une image", short: "Générer", icon: ImagePlus },
  { to: "/analyser", label: "Analyser une image", short: "Analyser", icon: ScanSearch },
  { to: "/ameliorer", label: "Améliorer un prompt", short: "Prompts", icon: WandSparkles },
  { to: "/bibliotheque", label: "Bibliothèque", short: "Biblio.", icon: Library },
];

function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <div className="brand-mark" aria-hidden>
      <Layers size={size} color="#fff" />
    </div>
  );
}

export function Layout() {
  const { prefs, status } = useStudio();
  const ready = (status?.engines ?? []).filter((e) => e.available && (prefs.mode === "auto" || e.kind === prefs.mode)).length;
  const modeLabel = prefs.mode === "auto" ? "Mode auto" : prefs.mode === "api" ? "Mode API" : "Mode local";
  return (
    <div className="app">
      <aside className="sidebar" aria-label="Navigation principale">
        <Link to="/" className="brand" style={{ color: "inherit", textDecoration: "none" }}>
          <BrandMark />
          <div className="brand-text">
            <div className="brand-name">Studio IA</div>
            <div className="brand-sub">Création d'images</div>
          </div>
        </Link>
        <nav className="stack-sm" style={{ gap: 4, width: "100%", alignItems: "inherit" }}>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} title={label}>
              <Icon size={19} />
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="nav-spacer" />
        <NavLink to="/parametres" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} title="Paramètres">
          <Settings size={19} />
          <span className="nav-label">Paramètres</span>
        </NavLink>
        <Link to="/parametres" className="mode-pill" title={`${modeLabel} — ${ready} moteur(s) prêt(s)`} style={{ textDecoration: "none" }}>
          {prefs.mode === "local" ? <HardDrive size={15} /> : <Cloud size={15} />}
          <span>
            {modeLabel} · {ready} moteur{ready > 1 ? "s" : ""} prêt{ready > 1 ? "s" : ""}
          </span>
        </Link>
      </aside>

      <header className="topbar">
        <Link to="/" className="brand" style={{ color: "inherit", textDecoration: "none" }}>
          <BrandMark size={16} />
          <div className="brand-name">Studio IA</div>
        </Link>
        <NavLink to="/parametres" className="btn btn-ghost btn-icon" aria-label="Paramètres">
          <Settings size={19} />
        </NavLink>
      </header>

      <main className="main" id="contenu">
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Navigation">
        {NAV.map(({ to, short, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab-link${isActive ? " active" : ""}`}>
            <Icon size={20} />
            <span>{short}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
