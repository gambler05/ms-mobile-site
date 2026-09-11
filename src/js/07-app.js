/* ============================================================
   07 — Coquille applicative : routage, navigation, garde d'acces
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { S, A, O, esc } = MS.util;
  const store = MS.store;
  const ui = MS.ui;

  MS.screens = MS.screens || {};

  const NAV = [
    { section: 'Pilotage', items: [
      { id: 'dashboard', label: 'Tableau de bord', icon: 'dashboard', mobile: true },
      { id: 'cash', label: 'Caisse', icon: 'cash', mobile: true },
    ] },
    { section: 'Boutique', items: [
      { id: 'stock', label: 'Stock', icon: 'box', mobile: true },
      { id: 'alerts', label: 'Ruptures', icon: 'alert', mobile: false },
      { id: 'repairs', label: 'Réparations', icon: 'wrench', mobile: true },
      { id: 'clients', label: 'Clients', icon: 'users', mobile: false },
      { id: 'pricing', label: 'Grilles tarifaires', icon: 'tags', mobile: false },
    ] },
    { section: 'Gestion', items: [
      { id: 'settings', label: 'Paramètres', icon: 'settings', mobile: false },
      { id: 'logs', label: 'Journal', icon: 'list', mobile: false },
    ] },
  ];

  const ALL_ITEMS = NAV.reduce((acc, g) => acc.concat(g.items), []);
  const KNOWN = ALL_ITEMS.map((i) => i.id).concat(['repair', 'client']);

  const route = { screen: 'dashboard', param: '' };

  function parseHash(hash) {
    const raw = S(hash).replace(/^#\/?/, '').trim();
    const parts = raw.split('/').filter(Boolean);
    const screen = parts[0] || 'dashboard';
    if (!KNOWN.includes(screen)) return { screen: 'dashboard', param: '' };
    if ((screen === 'repair' || screen === 'client') && !parts[1]) {
      return { screen: screen === 'repair' ? 'repairs' : 'clients', param: '' };
    }
    return { screen, param: S(parts[1]) };
  }

  function go(path) {
    const next = '#/' + S(path).replace(/^#\/?/, '');
    if (location.hash === next) render();
    else location.hash = next;
  }

  function currentRoute() { return { screen: route.screen, param: route.param }; }

  /* -------------------- Navigation -------------------- */

  function navHtml() {
    const admin = MS.auth.isAdmin();
    return NAV.map((group) => {
      const items = group.items.filter((it) => admin || !MS.model.ADMIN_SCREENS.includes(it.id));
      if (!items.length) return '';
      return '<div class="nav-group"><span class="nav-section">' + esc(group.section) + '</span>'
        + items.map((it) => navLink(it)).join('') + '</div>';
    }).join('');
  }

  function navLink(item) {
    const active = route.screen === item.id
      || (item.id === 'repairs' && route.screen === 'repair')
      || (item.id === 'clients' && route.screen === 'client');
    const alerts = item.id === 'alerts' ? alertCount() : 0;
    return '<a class="nav-link' + (active ? ' active' : '') + '" href="#/' + esc(item.id) + '">'
      + ui.icon(item.icon) + '<span>' + esc(item.label) + '</span>'
      + (alerts ? '<em class="pill">' + alerts + '</em>' : '') + '</a>';
  }

  function alertCount() {
    const settings = O(store.state.settings);
    return A(store.state.products).filter((p) => MS.model.stockLevel(p, settings) !== 'ok').length;
  }

  function mobileBarHtml() {
    const admin = MS.auth.isAdmin();
    const items = ALL_ITEMS.filter((i) => i.mobile);
    const links = items.map((it) => {
      const active = route.screen === it.id
        || (it.id === 'repairs' && route.screen === 'repair');
      return '<a class="mob-link' + (active ? ' active' : '') + '" href="#/' + esc(it.id) + '">'
        + ui.icon(it.icon) + '<span>' + esc(it.label.split(' ')[0]) + '</span></a>';
    }).join('');
    const rest = ALL_ITEMS.filter((i) => !i.mobile && (admin || !MS.model.ADMIN_SCREENS.includes(i.id)));
    const more = '<button type="button" class="mob-link" data-more aria-haspopup="menu">'
      + ui.icon('menu') + '<span>Plus</span></button>';
    return links + (rest.length ? more : '');
  }

  function openMore() {
    const admin = MS.auth.isAdmin();
    const rest = ALL_ITEMS.filter((i) => !i.mobile && (admin || !MS.model.ADMIN_SCREENS.includes(i.id)));
    const m = ui.modal({
      title: 'Plus',
      size: 'sm',
      body: '<nav class="more-nav">' + rest.map((it) =>
        '<a class="more-link" href="#/' + esc(it.id) + '">' + ui.icon(it.icon) + '<span>' + esc(it.label) + '</span></a>').join('') + '</nav>',
      footer: false,
    });
    if (m) ui.on(m.el, '.more-link', 'click', () => m.close());
  }

  /* -------------------- Bandeaux permanents -------------------- */

  function bannersHtml() {
    const out = [];
    if (store.lastError) {
      out.push('<div class="banner banner-danger">' + ui.icon('alert')
        + '<span>' + esc(store.lastError) + '</span>'
        + '<a class="btn small" href="#/settings">Exporter une sauvegarde</a></div>');
    }
    // Un appareil non connecte travaille en solo sans que personne ne s'en apercoive.
    if (MS.sync.shouldWarn()) {
      out.push('<div class="banner banner-warn" data-banner="sync">' + ui.icon('cloud')
        + '<span><b>Non connecté.</b> Cet appareil fonctionne en solo : ses saisies ne sont pas partagées avec l’autre poste.</span>'
        + '<button type="button" class="btn small" data-act="sync-login">Se connecter</button></div>');
    }
    const snap = store.getSnapshot();
    if (snap && MS.model.isEmptyState(store.state)) {
      out.push('<div class="banner banner-info">' + ui.icon('refresh')
        + '<span>Une copie de vos données prise le ' + esc(MS.util.fmtDateTime(snap.date)) + ' est disponible.</span>'
        + '<button type="button" class="btn small" data-act="restore-snapshot">Restaurer</button></div>');
    }
    return out.join('');
  }

  /* -------------------- Barre haute -------------------- */

  function topbarHtml() {
    const st = MS.sync.status();
    const user = MS.auth.currentUser();
    const settings = O(store.state.settings);
    return '<div class="top-left">'
      + '<button type="button" class="icon-btn only-mobile" data-act="more" aria-label="Menu">' + ui.icon('menu') + '</button>'
      + '<h1 class="screen-title">' + esc(screenTitle()) + '</h1></div>'
      + '<div class="top-right">'
      + '<button type="button" class="sync-pill sync-' + esc(st.code) + '" data-act="sync-panel" title="' + esc(st.help) + '">'
      + ui.icon('cloud') + '<span>' + esc(st.label) + '</span></button>'
      + '<button type="button" class="icon-btn" data-act="theme" aria-label="Changer le thème">'
      + ui.icon(settings.theme === 'dark' ? 'sun' : 'moon') + '</button>'
      + (MS.auth.enabled()
        ? '<button type="button" class="icon-btn user-btn" data-act="account" aria-label="Compte">'
          + ui.icon('user') + (user ? '<span class="only-desk">' + esc(user.name) + '</span>' : '') + '</button>'
        : '')
      + '</div>';
  }

  function screenTitle() {
    const item = ALL_ITEMS.find((i) => i.id === route.screen);
    if (item) return item.label;
    if (route.screen === 'repair') return 'Fiche de réparation';
    if (route.screen === 'client') return 'Fiche client';
    return 'MS MOBILE';
  }

  /* -------------------- Rendu -------------------- */

  let rendering = false;

  function render() {
    if (typeof document === 'undefined') return;
    if (rendering) return;
    rendering = true;
    try { renderInner(); } catch (e) {
      console.error(e);
      const host = ui.$('#screen');
      if (host) {
        host.innerHTML = '<div class="card"><h2>Écran indisponible</h2>'
          + '<p class="muted">Une donnée inattendue a empêché l’affichage de cet écran. Les autres écrans restent accessibles.</p>'
          + '<p class="mono small">' + esc(S(e && e.message)) + '</p></div>';
      }
    } finally { rendering = false; }
  }

  function renderInner() {
    const focus = ui.captureFocus();
    document.documentElement.dataset.theme = O(store.state.settings).theme === 'dark' ? 'dark' : 'light';

    const navHost = ui.$('#nav-links');
    if (navHost) navHost.innerHTML = navHtml();
    const mobHost = ui.$('#mobile-bar');
    if (mobHost) mobHost.innerHTML = mobileBarHtml();
    const topHost = ui.$('#topbar');
    if (topHost) topHost.innerHTML = topbarHtml();
    const bannerHost = ui.$('#banners');
    if (bannerHost) bannerHost.innerHTML = bannersHtml();
    const brand = ui.$('#brand-name');
    if (brand) brand.textContent = S(O(store.state.settings).shopName) || MS.config.shopName;

    const previous = ui.$('#screen');
    if (!previous) return;
    /*
     * Chaque écran rattache ses écouteurs à son conteneur à chaque rendu.
     * On repart d'un nœud vierge : sans cela, les écouteurs s'empilent et
     * un seul clic finit par déclencher plusieurs fois la même action.
     */
    const host = previous.cloneNode(false);
    previous.parentNode.replaceChild(host, previous);

    const guard = MS.auth.canView(route.screen);
    if (!guard.ok) {
      host.innerHTML = guard.reason === 'admin' ? adminOnlyHtml() : lockedHtml();
      if (guard.reason !== 'admin') mountLogin(host);
      return;
    }

    const screen = MS.screens[route.screen];
    if (!screen || typeof screen.render !== 'function') {
      host.innerHTML = '<div class="card"><h2>Écran inconnu</h2></div>';
      return;
    }
    host.dataset.screen = route.screen;
    screen.render(host, route.param);
    ui.restoreFocus(focus);
  }

  function adminOnlyHtml() {
    return '<div class="card locked"><h2>' + ui.icon('shield') + ' Réservé à l’administrateur</h2>'
      + '<p class="muted">Cet écran n’est accessible qu’avec un compte administrateur. '
      + 'Connectez-vous avec un autre compte depuis le bouton en haut à droite.</p></div>';
  }

  function lockedHtml() {
    return '<div class="card locked" id="login-card"><h2>' + ui.icon('key') + ' Connexion requise</h2>'
      + '<form class="login-form" id="login-form">'
      + '<label class="field"><span>Identifiant</span><input name="login" autocomplete="username" data-keep="login-user" autofocus></label>'
      + '<label class="field"><span>Mot de passe</span><input name="password" type="password" autocomplete="current-password" data-keep="login-pass"></label>'
      + '<p class="form-error" id="login-error" role="alert"></p>'
      + '<div class="row-end"><button type="button" class="btn ghost" data-act="recovery">Clé de secours</button>'
      + '<button type="submit" class="btn primary">Se connecter</button></div>'
      + '</form></div>';
  }

  function mountLogin(host) {
    const form = ui.$('#login-form', host);
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const res = await MS.auth.login(S(data.get('login')), S(data.get('password')));
      const err = ui.$('#login-error', host);
      if (!res.ok) { if (err) err.textContent = res.error; return; }
      render();
    });
    ui.on(host, '[data-act="recovery"]', 'click', askRecovery);
  }

  async function askRecovery() {
    const key = await ui.prompt({
      title: 'Clé de secours',
      label: 'Saisissez la clé de secours',
      help: 'La protection sera désactivée et vous reprendrez la main sur l’application.',
      confirmLabel: 'Reprendre la main',
    });
    if (key === null) return;
    const res = await MS.auth.useRecovery(key);
    if (!res.ok) { ui.toast(res.error, 'error'); return; }
    ui.toast('Protection désactivée. Reconfigurez les comptes dans Paramètres.', 'success');
    render();
  }

  /* -------------------- Panneaux du bandeau haut -------------------- */

  function accountPanel() {
    const user = MS.auth.currentUser();
    const body = user
      ? '<p class="lead">' + esc(user.name) + '</p><p class="muted">' + esc(user.role) + ' — identifiant ' + esc(user.login) + '</p>'
      : '<p class="lead">Aucun compte connecté.</p><p class="muted">La caisse reste accessible ; les écrans de gestion demandent une connexion.</p>';
    const m = ui.modal({
      title: 'Compte',
      size: 'sm',
      body,
      footer: (user
        ? '<button type="button" class="btn ghost" data-act="logout">Se déconnecter</button>'
        : '<button type="button" class="btn primary" data-act="dologin">Se connecter</button>'),
    });
    if (!m) return;
    ui.on(m.el, '[data-act="logout"]', 'click', () => { MS.auth.logout('manuelle'); m.close(); go('dashboard'); render(); });
    ui.on(m.el, '[data-act="dologin"]', 'click', () => { m.close(); openLoginModal(); });
  }

  function openLoginModal() {
    const m = ui.modal({
      title: 'Connexion',
      size: 'sm',
      body: '<form id="modal-login">'
        + '<label class="field"><span>Identifiant</span><input name="login" autocomplete="username" autofocus></label>'
        + '<label class="field"><span>Mot de passe</span><input name="password" type="password" autocomplete="current-password"></label>'
        + '<p class="form-error" id="modal-login-error" role="alert"></p></form>',
      footer: '<button type="button" class="btn ghost" data-close>Annuler</button>'
        + '<button type="button" class="btn primary" data-act="ok">Se connecter</button>',
    });
    if (!m) return;
    const submit = async () => {
      const form = ui.$('#modal-login', m.el);
      const data = new FormData(form);
      const res = await MS.auth.login(S(data.get('login')), S(data.get('password')));
      if (!res.ok) { ui.$('#modal-login-error', m.el).textContent = res.error; return; }
      m.close();
      ui.toast('Connecté.', 'success');
      render();
    };
    ui.on(m.el, '[data-act="ok"]', 'click', submit);
    ui.$('#modal-login', m.el).addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  }

  function syncPanel() {
    const st = MS.sync.status();
    const connected = MS.sync.connected;
    const body = '<p class="lead">' + esc(st.label) + '</p><p class="muted">' + esc(st.help) + '</p>'
      + (connected && st.email ? '<p class="muted">Compte : ' + esc(st.email) + '</p>' : '')
      + '<p class="muted small">L’état entier est envoyé à chaque enregistrement : si deux personnes enregistrent dans la même seconde sur deux appareils, la dernière écriture écrase l’autre.</p>';
    const footer = connected
      ? '<button type="button" class="btn ghost" data-act="signout">Se déconnecter</button>'
        + '<button type="button" class="btn primary" data-act="resync">Resynchroniser</button>'
      : '<a class="btn ghost" href="#/settings" data-close>Configurer</a>'
        + '<button type="button" class="btn primary" data-act="signin">Se connecter</button>';
    const m = ui.modal({ title: 'Synchronisation', size: 'sm', body, footer });
    if (!m) return;
    ui.on(m.el, '[data-act="signin"]', 'click', () => { m.close(); openSyncLogin(); });
    ui.on(m.el, '[data-act="signout"]', 'click', () => { MS.sync.signOut(); m.close(); ui.toast('Déconnecté de la synchronisation.', 'info'); render(); });
    ui.on(m.el, '[data-act="resync"]', 'click', async () => { await MS.sync.reconcile(); ui.toast('Synchronisation relancée.', 'success'); });
  }

  /** Aucun bouton muet : si la fenetre ne peut pas s'ouvrir, on dit pourquoi. */
  function openSyncLogin() {
    const blocked = MS.sync.loginBlockedReason();
    if (blocked) { ui.toast(blocked, 'info', 7000); return; }
    const m = ui.modal({
      title: 'Connexion à la synchronisation',
      size: 'sm',
      body: '<form id="sync-login">'
        + '<label class="field"><span>Adresse e-mail</span><input name="email" type="email" autocomplete="username" autofocus></label>'
        + '<label class="field"><span>Mot de passe</span><input name="password" type="password" autocomplete="current-password"></label>'
        + '<p class="muted small">Le mot de passe n’est jamais écrit dans le fichier : il ne sera pas redemandé sur cet appareil.</p>'
        + '<p class="form-error" id="sync-login-error" role="alert"></p></form>',
      footer: '<button type="button" class="btn ghost" data-close>Annuler</button>'
        + '<button type="button" class="btn primary" data-act="ok">Se connecter</button>',
    });
    if (!m) return;
    const submit = async () => {
      const form = ui.$('#sync-login', m.el);
      const data = new FormData(form);
      const btn = ui.$('[data-act="ok"]', m.el);
      if (btn) { btn.disabled = true; btn.textContent = 'Connexion…'; }
      const res = await MS.sync.signIn(S(data.get('email')), S(data.get('password')));
      if (btn) { btn.disabled = false; btn.textContent = 'Se connecter'; }
      if (!res.ok) { ui.$('#sync-login-error', m.el).textContent = res.error; return; }
      m.close();
      ui.toast('Synchronisation active.', 'success');
      render();
    };
    ui.on(m.el, '[data-act="ok"]', 'click', submit);
    ui.$('#sync-login', m.el).addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  }

  function toggleTheme() {
    const next = O(store.state.settings).theme === 'dark' ? 'light' : 'dark';
    store.state.settings.theme = next;
    store.save({ reason: 'theme' });
    render();
  }

  /* -------------------- Amorcage -------------------- */

  function bind() {
    const shell = ui.$('#shell');
    ui.on(shell, '[data-act="more"]', 'click', openMore);
    ui.on(shell, '[data-more]', 'click', openMore);
    ui.on(shell, '[data-act="theme"]', 'click', toggleTheme);
    ui.on(shell, '[data-act="account"]', 'click', accountPanel);
    ui.on(shell, '[data-act="sync-panel"]', 'click', syncPanel);
    ui.on(shell, '[data-act="sync-login"]', 'click', openSyncLogin);
    ui.on(shell, '[data-act="restore-snapshot"]', 'click', async () => {
      const ok = await ui.confirm({
        title: 'Restaurer la copie locale',
        message: 'Remplacer les données actuelles par la copie prise avant le dernier remplacement ?',
        confirmLabel: 'Restaurer',
      });
      if (!ok) return;
      store.restoreSnapshot();
      ui.toast('Copie restaurée.', 'success');
      render();
    });
    window.addEventListener('hashchange', () => {
      Object.assign(route, parseHash(location.hash));
      window.scrollTo({ top: 0 });
      render();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') ui.closeTopModal();
    });
    store.subscribe((state, reason) => {
      if (reason === 'sync' || reason === 'save-failed') {
        const bannerHost = ui.$('#banners');
        if (bannerHost) bannerHost.innerHTML = bannersHtml();
        const topHost = ui.$('#topbar');
        if (topHost) topHost.innerHTML = topbarHtml();
      }
    });
  }

  /**
   * Premier demarrage : l'identite gravee dans le fichier renseigne les
   * champs restes au reglage d'usine, sans jamais ecraser une personnalisation.
   */
  function applyConfigDefaults() {
    const defaults = O(MS.configDefaults);
    const factory = MS.model.normSettings({});
    let changed = false;
    Object.keys(defaults).forEach((field) => {
      const value = S(defaults[field]);
      if (!value) return;
      const current = S(O(store.state.settings)[field]);
      if (current === S(factory[field])) { store.state.settings[field] = value; changed = true; }
    });
    // touch:false — renseigner l'identite ne rend pas cet appareil plus recent que le serveur.
    if (changed) store.save({ reason: 'install', touch: false, silent: true, push: false });
  }

  function boot() {
    store.load();
    applyConfigDefaults();
    MS.auth.restoreSession();
    Object.assign(route, parseHash(location.hash));
    bind();
    MS.auth.startWatchdog();
    render();
    MS.sync.init();
    store.backupIfNeeded();
  }

  MS.app = { boot, render, go, currentRoute, parseHash, NAV, ALL_ITEMS, openSyncLogin, openLoginModal, alertCount, applyConfigDefaults };
})();
