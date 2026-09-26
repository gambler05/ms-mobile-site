/** Routeur par ancre, coquille de l'application (navigation, barre de commande, palette), connexion et démarrage. */
RF.router = (() => {
  const routes = [];
  const add = (pattern, handler) => routes.push({ re: new RegExp("^" + pattern.replace(/:(\w+)/g, "(?<$1>[^/?]+)") + "$"), handler });
  const parse = () => { const hash = location.hash.replace(/^#/, "") || "/"; const [path, qs] = hash.split("?"); const query = Object.fromEntries(new URLSearchParams(qs || "")); return { path, query, hash }; };
  const resolve = () => { const { path, query } = parse(); for (const r of routes) { const m = r.re.exec(path); if (m) return { handler: r.handler, params: m.groups || {}, query, path }; } return null; };
  const go = (hash) => { if (location.hash === "#" + hash) RF.app.refresh(); else location.hash = hash; };
  const setQuery = (patch) => { const { path, query } = parse(); const q = { ...query, ...patch }; for (const k of Object.keys(q)) if (q[k] === null || q[k] === "" || q[k] === undefined) delete q[k]; const qs = new URLSearchParams(q).toString(); location.replace("#" + path + (qs ? "?" + qs : "")); };
  return { add, parse, resolve, go, setQuery };
})();

RF.app = (() => {
  const { h, initials } = RF.util; const { icon, logo } = RF.icons; const { btn } = RF.ui;
  const NAV = [["/", "dashboard", "Tableau de bord"], ["/repairs", "wrench", "Réparations"], ["/customers", "users", "Clients"], ["/stock", "box", "Stock"], ["/pos", "cart", "Caisse"], ["/notifications", "bell", "Notifications"], ["/reports", "chart", "Rapports"], ["/settings", "settings", "Réglages"]];
  let collapsed = localStorage.getItem("rf.sidebar") === "1";
  let dirtyGuard = null; // fonction renvoyant true si des modifications non enregistrées existent
  const setDirty = (fn) => (dirtyGuard = fn);
  const applyPrefs = () => { const s = RF.store.get().settings; document.documentElement.dataset.theme = s.theme === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : s.theme; document.documentElement.dataset.density = s.density; };
  const unread = () => RF.store.get().notifications.filter((n) => !n.readAt && !n.archivedAt).length;
  const activePath = () => { const p = RF.router.parse().path; return p === "/" ? "/" : "/" + p.split("/")[1]; };
  const navLink = (path, ic, label, mobile) => { const a = h("a", { href: "#" + path, class: activePath() === path ? "active" : "", "aria-current": activePath() === path ? "page" : null, title: label }, icon(ic), h("span", mobile && path === "/" ? "Accueil" : mobile ? label.split(" ")[0] : label)); if (path === "/notifications" && unread()) a.append(h("span.count", unread() > 99 ? "99+" : unread())); return a; };
  const sidebar = () => h("aside.sidebar", { class: collapsed ? "collapsed" : "", "aria-label": "Navigation principale" },
    h("div.brand", h("a", { href: "#/", "aria-label": "RepairFlow", class: "row" }, logo(), h("span.brand-name", "Repair", h("b", "Flow")))),
    h("nav.nav", NAV.map(([p, i, l]) => navLink(p, i, l))),
    h("div.sidebar-foot", RF.store.get().isDemo ? h("div.demo-tag", "Données de démonstration") : null, h("button.collapse", { type: "button", "aria-label": collapsed ? "Déployer la navigation" : "Réduire la navigation", onclick: () => { collapsed = !collapsed; localStorage.setItem("rf.sidebar", collapsed ? "1" : "0"); render(); } }, icon("panel"), h("span", "Réduire la navigation"))));
  const mobileNav = () => h("nav.mobile-nav", { "aria-label": "Navigation mobile" }, NAV.filter(([p]) => ["/", "/repairs", "/pos", "/stock", "/notifications"].includes(p)).map(([p, i, l]) => navLink(p, i, l, true)));
  const topbar = () => { const u = RF.model.currentUser(); const s = RF.store.get(); return h("header.topbar", { role: "banner" },
    h("a.hide-desktop", { href: "#/", "aria-label": "RepairFlow" }, logo(26)),
    h("button.search-btn.glass", { type: "button", onclick: () => palette(), "aria-keyshortcuts": "Control+K" }, icon("search"), h("span.truncate", "Rechercher un ticket, un client, un produit…"), h("kbd", "⌘K")),
    h("button.btn.primary.sm", { type: "button", onclick: (e) => RF.ui.menu(e.currentTarget, [{ label: "Nouvelle réparation", icon: "wrench", kbd: "N", onclick: () => RF.router.go("/repairs/new") }, { label: "Nouvelle vente", icon: "cart", onclick: () => RF.router.go("/pos") }, { label: "Nouveau client", icon: "user", onclick: () => RF.router.go("/customers?new=1") }, { label: "Réception de stock", icon: "truck", onclick: () => RF.router.go("/stock?tab=po") }]) }, icon("plus"), h("span.hide-mobile", "Créer"), icon("chevron")),
    h("span.hide-mobile.muted", { style: { fontSize: "13px", display: "inline-flex", gap: "6px", alignItems: "center", padding: "0 8px" } }, icon("store"), s.shop.name),
    h("button.btn.ghost.icon", { type: "button", "aria-label": `Notifications${unread() ? " (" + unread() + " non lues)" : ""}`, onclick: () => RF.router.go("/notifications"), style: { position: "relative" } }, icon("bell"), unread() ? h("span", { style: { position: "absolute", top: "6px", insetInlineEnd: "6px", width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)" } }) : null),
    h("button.avatar", { type: "button", "aria-label": `${u ? u.name : ""} · Profil`, onclick: (e) => RF.ui.menu(e.currentTarget, [{ lbl: u ? `${u.name} · ${RF.model.ROLES[u.role]}` : "" }, { sep: true }, { lbl: "Thème" }, ...["dark", "light", "system"].map((t) => ({ label: { dark: "Sombre", light: "Clair", system: "Système" }[t], checked: s.settings.theme === t, onclick: () => RF.store.update((st) => (st.settings.theme = t)) })), { sep: true }, { lbl: "Densité" }, ...["comfortable", "compact"].map((d) => ({ label: d === "compact" ? "Compacte" : "Confortable", checked: s.settings.density === d, onclick: () => RF.store.update((st) => (st.settings.density = d)) })), { sep: true }, { label: "Raccourcis clavier", icon: "keyboard", kbd: "?", onclick: shortcuts }, { label: "Se déconnecter", icon: "logout", danger: true, onclick: () => { RF.model.logout(); RF.router.go("/login"); } }]) }, u ? initials(u.name) : "?")); };
  const shortcuts = () => RF.ui.dialog({ title: "Raccourcis clavier", body: h("dl.dl", [["⌘ / Ctrl + K", "Palette de commandes"], ["N", "Nouveau ticket"], ["G puis D / R / C / S / P", "Tableau de bord, Réparations, Clients, Stock, Caisse"], ["Échap", "Fermer le panneau"], ["?", "Cette aide"]].map(([k, v]) => [h("dt", v), h("dd", h("kbd.kbd", k))])), actions: (d) => [btn({ label: "Fermer", onclick: d.close })] });

  const palette = () => {
    const s = RF.store.get(); const res = h("div.res"); let focus = 0; let items = [];
    const inp = h("input", { type: "search", placeholder: "Rechercher un ticket, un client, un produit…", "aria-label": "Recherche", autofocus: true });
    const node = h("div.palette.glass", { role: "dialog", "aria-label": "Palette de commandes" }, h("div", { style: { position: "relative" } }, icon("search", "muted"), inp), res);
    const draw = () => { res.replaceChildren(); items = []; const q = inp.value.trim().toLowerCase(); const add = (g, list) => { if (!list.length) return; res.append(h("div.g", g)); list.forEach((it) => { const el = h("div.it", { onclick: () => it.go(), onmouseenter: () => { focus = items.indexOf(it); mark(); } }, it.node); it.el = el; items.push(it); res.append(el); }); };
      if (q.length < 2) { add("Actions", [{ node: [icon("plus", "accent"), "Nouvelle réparation"], go: () => { close(); RF.router.go("/repairs/new"); } }, { node: [icon("cart", "accent"), "Nouvelle vente"], go: () => { close(); RF.router.go("/pos"); } }]); add("Navigation", NAV.map(([p, i, l]) => ({ node: [icon(i, "muted"), l], go: () => { close(); RF.router.go(p); } }))); }
      else {
        const digits = q.replace(/\D/g, "");
        const T = s.tickets.filter((t) => { const c = s.customers.find((x) => x.id === t.customerId) || {}, d = s.devices.find((x) => x.id === t.deviceId) || {}; return t.number.toLowerCase().includes(q) || (c.lastName || "").toLowerCase().includes(q) || `${d.brand} ${d.model}`.toLowerCase().includes(q) || (d.imei && d.imei.includes(q)); }).slice(0, 6);
        add("Réparations", T.map((t) => { const c = s.customers.find((x) => x.id === t.customerId) || {}, d = s.devices.find((x) => x.id === t.deviceId) || {}; return { node: [icon("wrench", "muted"), h("span.mono.accent", t.number), h("span.truncate.grow", `${d.brand} ${d.model} — ${c.firstName} ${c.lastName}`), RF.ui.statusBadge(t.status, true)], go: () => { close(); RF.router.go("/repairs/" + t.id); } }; }));
        const C = s.customers.filter((c) => !c.mergedIntoId && (`${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || c.email.includes(q) || (digits.length >= 4 && c.phone.replace(/\D/g, "").includes(digits)))).slice(0, 6);
        add("Clients", C.map((c) => ({ node: [icon("users", "muted"), `${c.firstName} ${c.lastName}`, h("span.muted", { style: { marginInlineStart: "auto" } }, c.phone || c.email)], go: () => { close(); RF.router.go("/customers/" + c.id); } })));
        const P = s.products.filter((p) => p.active && (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode === q)).slice(0, 6);
        add("Stock", P.map((p) => ({ node: [icon("box", "muted"), h("span.truncate", p.name), h("span.mono.subtle", p.sku), h("span.tnum.muted", { style: { marginInlineStart: "auto" } }, p.onHand - p.reserved)], go: () => { close(); RF.router.go("/stock/" + p.id); } })));
        if (!items.length) res.append(h("div.g", { style: { textAlign: "center", padding: "24px" } }, "Aucun résultat"));
      }
      focus = 0; mark(); };
    const mark = () => items.forEach((it, i) => it.el.classList.toggle("focus", i === focus));
    inp.addEventListener("input", draw); inp.addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { e.preventDefault(); focus = Math.min(items.length - 1, focus + 1); mark(); } if (e.key === "ArrowUp") { e.preventDefault(); focus = Math.max(0, focus - 1); mark(); } if (e.key === "Enter" && items[focus]) items[focus].go(); });
    const ov = h("div.overlay.anim-fade", { onclick: () => close() }); const lay = document.getElementById("layer"); lay.append(ov, node); const esc = (e) => { if (e.key === "Escape") close(); }; document.addEventListener("keydown", esc); const close = () => { ov.remove(); node.remove(); document.removeEventListener("keydown", esc); }; draw(); inp.focus();
  };

  const loginPage = () => { const s = RF.store.get(); const email = RF.ui.input({ type: "email", id: "email", autocomplete: "username", required: true }), pwd = RF.ui.input({ type: "password", id: "password", autocomplete: "current-password", required: true }); const err = h("div"); const form = h("form", { onsubmit: async (e) => { e.preventDefault(); const ok = await RF.model.login(email.value, pwd.value); if (!ok) { err.replaceChildren(RF.ui.errorBox("Identifiants incorrects")); return; } RF.router.go("/"); } }, RF.ui.field("Adresse e-mail", email), RF.ui.field("Mot de passe", pwd), err, btn({ label: "Se connecter", variant: "primary", size: "lg", type: "submit", cls: "w" }));
    return h("main.login", h("div.box", h("div.row", { style: { marginBottom: "28px" } }, logo(32), h("span.brand-name", { style: { fontSize: "17px" } }, "Repair", h("b", "Flow"))), h("h1", "Connexion"), h("p.muted", { style: { margin: "4px 0 20px" } }, s.org.name + " · accédez à votre atelier"), form, s.isDemo ? h("div.note", { style: { marginTop: "28px", borderColor: "rgba(216,191,138,.3)", background: "var(--champagne-soft)" } }, h("div", { style: { fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--champagne)" } }, "Comptes de démonstration"), h("ul", { style: { margin: "8px 0 0", padding: 0, listStyle: "none", fontSize: "13px" } }, s.users.map((u) => h("li.row.between", h("button", { type: "button", class: "mono", style: { background: "none", border: 0, padding: 0, color: "var(--fg)" }, onclick: () => { email.value = u.email; pwd.value = "demo1234"; } }, u.email), h("span.muted", { style: { fontSize: "11.5px" } }, RF.model.ROLES[u.role])))), h("div.muted", { style: { marginTop: "8px", fontSize: "12px" } }, "Mot de passe : demo1234 (cliquer sur un compte pré-remplit)")) : null, h("p.subtle", { style: { marginTop: "24px", fontSize: "12px" } }, "Édition autonome : les données restent dans ce navigateur. Les comptes servent à identifier l'opérateur ; ce n'est pas un contrôle d'accès fort (voir Réglages › Données).")));
  };
  document.head.append(h("style", ".btn.w{width:100%}"));

  let current = null;
  const render = () => {
    applyPrefs();
    const r = RF.router.resolve(); const root = document.getElementById("app"); RF.ui.closeAll();
    if (!r) { root.replaceChildren(h("main.login", h("div.box", h("h1", "Page introuvable"), h("p.muted", "L'adresse demandée n'existe pas."), h("a.btn.primary", { href: "#/", style: { marginTop: "16px" } }, "Tableau de bord")))); return; }
    if (r.path.startsWith("/suivi/")) { document.title = "Suivi de réparation"; root.replaceChildren(r.handler(r.params, r.query)); return; }
    const u = RF.model.currentUser();
    if (!u) { document.title = "Connexion · RepairFlow"; root.replaceChildren(loginPage()); return; }
    if (r.path === "/login") { RF.router.go("/"); return; }
    dirtyGuard = null; current = r;
    let page; try { page = r.handler(r.params, r.query); } catch (e) { console.error(e); page = RF.ui.empty({ title: "Une erreur est survenue", desc: e.message, action: btn({ label: "Tableau de bord", variant: "primary", onclick: () => RF.router.go("/") }) }); }
    const title = (page && page.dataset && page.dataset.title) || "RepairFlow"; document.title = title + " · RepairFlow";
    root.replaceChildren(sidebar(), h("div.main", topbar(), h("main.content", { id: "main" }, h("div.page.anim-in", page))), mobileNav());
  };
  const refresh = () => { if (RF.model.currentUser() || RF.router.parse().path.startsWith("/suivi/")) render(); else render(); };
  const start = async () => {
    RF.store.load(); await RF.seed.ensureHashes(); applyPrefs();
    RF.model.runJobs(); setInterval(() => { RF.model.runJobs(); }, 10 * 60 * 1000);
    window.addEventListener("hashchange", () => { if (dirtyGuard && dirtyGuard() && !window.__rfSkipGuard) { RF.ui.confirm({ title: "Modifications non enregistrées", message: "Des modifications non enregistrées seront perdues. Quitter quand même ?", ok: "Quitter", danger: true }).then((ok) => { if (ok) { dirtyGuard = null; render(); } else { window.__rfSkipGuard = true; history.back(); setTimeout(() => (window.__rfSkipGuard = false), 100); } }); return; } render(); });
    window.addEventListener("beforeunload", (e) => { if (dirtyGuard && dirtyGuard()) e.preventDefault(); });
    RF.store.subscribe(RF.util.debounce(() => { if (!RF.ui.isOpen()) render(); }, 30));
    document.addEventListener("keydown", (e) => { const t = e.target; const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable); if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (RF.model.currentUser()) palette(); return; } if (typing || e.metaKey || e.ctrlKey || e.altKey || RF.ui.isOpen() || !RF.model.currentUser()) return; if (e.key === "?") shortcuts(); if (e.key === "n") RF.router.go("/repairs/new"); if (e.key === "g") { const next = (e2) => { const map = { d: "/", r: "/repairs", c: "/customers", s: "/stock", p: "/pos" }; if (map[e2.key]) RF.router.go(map[e2.key]); }; document.addEventListener("keydown", next, { once: true }); } });
    matchMedia("(prefers-color-scheme: light)").addEventListener("change", applyPrefs);
    render();
  };
  const pageTitle = (node, t) => { node.dataset.title = t; return node; };
  return { render, refresh, start, setDirty, palette, pageTitle, current: () => current };
})();
