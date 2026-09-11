/* ============================================================
   05 — Synchronisation entre appareils (optionnelle)
   Le coeur du sujet : les regles anti-perte du chapitre 9.2.
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { S, O, A, I, D } = MS.util;
  const model = MS.model;
  const store = MS.store;

  const CFG_KEY = MS.config.storageKey + '.syncconfig';
  const TOKEN_KEY = MS.config.storageKey + '.synctoken';

  /* ---------------------------------------------------------
     9.2 — Decision anti-perte. Fonction pure, testable seule.
     --------------------------------------------------------- */

  /**
   * Compare l'etat local et l'etat distant et dit quoi faire.
   * @returns {{action:'pull'|'push'|'noop', reason:string}}
   */
  function decide(local, remote, opts) {
    const o = O(opts);
    const l = O(local);
    const r = remote === null || remote === undefined ? null : O(remote);

    const localTime = l.updatedAt ? new Date(D(l.updatedAt)).getTime() : 0;
    const remoteTime = r && r.updatedAt ? new Date(D(r.updatedAt)).getTime() : 0;
    const localErased = l.erased ? new Date(D(l.erased)).getTime() : 0;
    const remoteErased = r && r.erased ? new Date(D(r.erased)).getTime() : 0;
    const localEmpty = model.isEmptyState(l);
    const remoteEmpty = r ? model.isEmptyState(r) : true;

    // Regle 2 : un appareil qui n'a jamais rien enregistre n'ecrit pas, il ecoute.
    const neverWrote = !l.updatedAt;

    if (!r) {
      if (neverWrote || localEmpty) return { action: 'noop', reason: 'jamais-ecrit' };
      return { action: 'push', reason: 'serveur-vide' };
    }

    if (neverWrote) {
      // Rien a defendre : on prend ce qui vient, meme un serveur vide (base neuve partagee).
      return remoteEmpty ? { action: 'noop', reason: 'deux-bases-neuves' } : { action: 'pull', reason: 'appareil-neuf' };
    }

    // Regle 4 : un effacement volontaire se distingue d'une base neuve et se propage.
    if (localErased && localErased > remoteTime && localEmpty && !remoteEmpty) {
      return { action: 'push', reason: 'effacement-local-volontaire' };
    }
    if (remoteErased && remoteErased > localTime && remoteEmpty && !localEmpty) {
      return { action: 'pull', reason: 'effacement-distant-volontaire' };
    }

    // Regle 3 : le vide ne gagne jamais.
    if (localEmpty && !remoteEmpty) return { action: 'pull', reason: 'vide-local' };
    if (remoteEmpty && !localEmpty) return { action: 'push', reason: 'vide-distant' };

    if (localEmpty && remoteEmpty) {
      return remoteTime > localTime ? { action: 'pull', reason: 'distant-plus-recent' } : { action: 'noop', reason: 'rien-a-faire' };
    }

    // Regle 5 : si la version locale est reellement plus recente, elle repart au serveur.
    if (localTime > remoteTime) return { action: 'push', reason: 'local-plus-recent' };
    if (remoteTime > localTime) return { action: 'pull', reason: 'distant-plus-recent' };
    return { action: 'noop', reason: 'identique' };
  }

  /* -------------------- Configuration -------------------- */

  function readConfig() {
    let parsed = null;
    try { parsed = JSON.parse(store.LS.get(CFG_KEY)); } catch (e) { parsed = null; }
    const baked = O(MS.config.firebase);
    const saved = O(parsed);
    return {
      apiKey: S(saved.apiKey) || S(baked.apiKey),
      databaseURL: S(saved.databaseURL) || S(baked.databaseURL),
      doc: S(saved.doc) || S(MS.config.syncDoc) || ('shops/' + S(MS.config.shopId)),
    };
  }

  function writeConfig(cfg) {
    const c = O(cfg);
    store.LS.set(CFG_KEY, JSON.stringify({
      apiKey: S(c.apiKey).trim(),
      databaseURL: S(c.databaseURL).trim().replace(/\/+$/, ''),
      doc: S(c.doc).trim() || ('shops/' + S(MS.config.shopId)),
    }));
    state.status = 'off';
    stop();
    init();
  }

  function configured() {
    const c = readConfig();
    return !!(c.apiKey && c.databaseURL);
  }

  /* -------------------- Etat courant -------------------- */

  const state = {
    status: 'disabled',   // disabled | off | synced | offline | denied
    message: '',
    email: '',
    idToken: '',
    refreshToken: '',
    expiresAt: 0,
    es: null,
    pushing: false,
    pendingPush: false,
    lastPull: 0,
  };

  const STATUS_LABEL = {
    disabled: 'Sync désactivée',
    off: 'Non connecté',
    synced: 'Synchronisé',
    offline: 'Sync hors ligne',
    denied: 'Accès refusé',
  };

  const STATUS_HELP = {
    disabled: "La synchronisation n’est pas configurée : cet appareil travaille en local.",
    off: 'Cet appareil fonctionne en solo : vos saisies ne sont pas partagées. Connectez-vous pour les partager.',
    synced: 'Les données circulent entre les appareils.',
    offline: 'Pas de connexion internet. La synchronisation reprendra toute seule.',
    denied: "Accès refusé : les règles de sécurité de la base ne sont pas publiées.",
  };

  function status() {
    return { code: state.status, label: STATUS_LABEL[state.status] || state.status, help: state.message || STATUS_HELP[state.status] || '', email: state.email };
  }

  function setStatus(code, message) {
    state.status = code;
    state.message = S(message);
    store.emit('sync');
  }

  /** Un appareil non connecte est le risque principal : bandeau permanent. */
  function shouldWarn() {
    return state.status === 'off';
  }

  /* -------------------- Traduction des erreurs -------------------- */

  function humanError(code, fallback) {
    const c = S(code).toUpperCase();
    const map = {
      EMAIL_NOT_FOUND: 'Aucun compte avec cette adresse e-mail.',
      INVALID_PASSWORD: 'Mot de passe incorrect.',
      INVALID_LOGIN_CREDENTIALS: 'Adresse e-mail ou mot de passe incorrect.',
      USER_DISABLED: 'Ce compte a été désactivé.',
      TOO_MANY_ATTEMPTS_TRY_LATER: 'Trop de tentatives. Réessayez dans quelques minutes.',
      OPERATION_NOT_ALLOWED: "La connexion par e-mail n’est pas activée dans la console du projet cloud.",
      INVALID_EMAIL: "L’adresse e-mail n’est pas valide.",
      MISSING_PASSWORD: 'Saisissez votre mot de passe.',
      WEAK_PASSWORD: 'Mot de passe trop court (6 caractères minimum).',
      EMAIL_EXISTS: 'Un compte existe déjà avec cette adresse.',
      TOKEN_EXPIRED: 'Session expirée : reconnectez-vous.',
      INVALID_ID_TOKEN: 'Session expirée : reconnectez-vous.',
      PERMISSION_DENIED: 'Accès refusé : vérifiez les règles de sécurité de la base.',
      NETWORK: 'Pas de connexion internet.',
    };
    if (map[c]) return map[c];
    const key = Object.keys(map).find((k) => c.indexOf(k) === 0);
    if (key) return map[key];
    return S(fallback) || 'Erreur inattendue. Réessayez.';
  }

  /* -------------------- Jetons -------------------- */

  function saveToken() {
    store.LS.set(TOKEN_KEY, JSON.stringify({
      email: state.email, refreshToken: state.refreshToken,
      idToken: state.idToken, expiresAt: state.expiresAt,
    }));
  }

  function loadToken() {
    let parsed = null;
    try { parsed = JSON.parse(store.LS.get(TOKEN_KEY)); } catch (e) { parsed = null; }
    const t = O(parsed);
    state.email = S(t.email);
    state.refreshToken = S(t.refreshToken);
    state.idToken = S(t.idToken);
    state.expiresAt = I(t.expiresAt, 0, 0);
  }

  function clearToken() {
    store.LS.del(TOKEN_KEY);
    state.email = ''; state.refreshToken = ''; state.idToken = ''; state.expiresAt = 0;
  }

  async function jsonFetch(url, options) {
    const res = await fetch(url, options);
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    if (!res.ok) {
      const err = new Error(S(O(O(body).error).message) || ('HTTP ' + res.status));
      err.code = S(O(O(body).error).message) || ('HTTP_' + res.status);
      err.httpStatus = res.status;
      throw err;
    }
    return body;
  }

  /** Connexion par e-mail et mot de passe. Le mot de passe n'est jamais conserve. */
  async function signIn(email, password) {
    const cfg = readConfig();
    if (!cfg.apiKey) return { ok: false, error: "La synchronisation n’est pas configurée (clé du projet manquante)." };
    try {
      const body = await jsonFetch(
        'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(cfg.apiKey),
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: S(email).trim(), password: S(password), returnSecureToken: true }) }
      );
      state.email = S(body.email) || S(email).trim();
      state.idToken = S(body.idToken);
      state.refreshToken = S(body.refreshToken);
      state.expiresAt = Date.now() + I(body.expiresIn, 3600, 60) * 1000;
      saveToken();
      store.log('Synchronisation', 'Connexion de ' + state.email, 'cloud');
      store.save({ reason: 'sync', touch: false, push: false, silent: true });
      await start();
      return { ok: true };
    } catch (e) {
      if (isNetworkError(e)) { setStatus('offline'); return { ok: false, error: humanError('NETWORK') }; }
      return { ok: false, error: humanError(e.code, e.message) };
    }
  }

  function isNetworkError(e) {
    return !!e && (e.name === 'TypeError' || /network|failed to fetch|load failed/i.test(S(e.message)));
  }

  async function refresh() {
    const cfg = readConfig();
    if (!state.refreshToken || !cfg.apiKey) return false;
    try {
      const res = await fetch('https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(cfg.apiKey), {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(state.refreshToken),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 400) { clearToken(); setStatus('off'); }
        return false;
      }
      state.idToken = S(O(body).id_token);
      state.refreshToken = S(O(body).refresh_token) || state.refreshToken;
      state.expiresAt = Date.now() + I(O(body).expires_in, 3600, 60) * 1000;
      saveToken();
      return true;
    } catch (e) {
      if (isNetworkError(e)) setStatus('offline');
      return false;
    }
  }

  async function token() {
    if (!state.idToken) return '';
    if (Date.now() > state.expiresAt - 60000) { await refresh(); }
    return state.idToken;
  }

  function signOut() {
    stop();
    clearToken();
    setStatus('off');
  }

  /* -------------------- Transport -------------------- */

  function docUrl(idToken) {
    const cfg = readConfig();
    return cfg.databaseURL + '/' + cfg.doc.replace(/^\/+/, '') + '.json?auth=' + encodeURIComponent(idToken);
  }

  async function pull() {
    const t = await token();
    if (!t) return null;
    try {
      const res = await fetch(docUrl(t));
      if (res.status === 401 || res.status === 403) { setStatus('denied'); return null; }
      if (!res.ok) return null;
      const body = await res.json().catch(() => null);
      return body;
    } catch (e) {
      if (isNetworkError(e)) setStatus('offline');
      return null;
    }
  }

  async function push() {
    if (state.pushing) { state.pendingPush = true; return false; }
    const t = await token();
    if (!t) return false;
    state.pushing = true;
    try {
      const res = await fetch(docUrl(t), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(store.state),
      });
      if (res.status === 401 || res.status === 403) { setStatus('denied'); return false; }
      if (!res.ok) return false;
      setStatus('synced');
      return true;
    } catch (e) {
      if (isNetworkError(e)) setStatus('offline');
      return false;
    } finally {
      state.pushing = false;
      if (state.pendingPush) { state.pendingPush = false; setTimeout(push, 300); }
    }
  }

  /** Applique un etat distant, apres copie locale de securite (regle 6). */
  function applyRemote(remote) {
    const next = model.normState(remote);
    store.snapshotCurrent('remplacement par la version distante');
    store.state = next;
    // touch:false — une version recue n'est pas plus recente du seul fait d'arriver.
    store.save({ reason: 'sync-pull', touch: false, push: false });
    store.hasWritten = !!next.updatedAt;
    setStatus('synced');
    if (MS.app && MS.app.render) MS.app.render();
  }

  async function reconcile() {
    const remote = await pull();
    if (state.status === 'denied') return;
    const verdict = decide(store.state, remote);
    if (verdict.action === 'pull' && remote) applyRemote(remote);
    else if (verdict.action === 'push') await push();
    else setStatus('synced');
    return verdict;
  }

  /** Ecoute continue par flux d'evenements. */
  async function listen() {
    const t = await token();
    if (!t || !globalThis.EventSource) return;
    stopListening();
    try {
      const es = new EventSource(docUrl(t));
      state.es = es;
      es.addEventListener('put', (ev) => {
        let payload = null;
        try { payload = JSON.parse(ev.data); } catch (e) { payload = null; }
        const path = S(O(payload).path, '/');
        const data = O(payload).data;
        if (path !== '/') { reconcile(); return; }
        const verdict = decide(store.state, data);
        if (verdict.action === 'pull' && data) applyRemote(data);
        else if (verdict.action === 'push') push();
        else setStatus('synced');
      });
      es.addEventListener('cancel', () => { setStatus('denied'); });
      es.addEventListener('auth_revoked', () => { refresh().then((ok) => (ok ? listen() : setStatus('off'))); });
      es.onerror = () => {
        if (globalThis.navigator && globalThis.navigator.onLine === false) setStatus('offline');
      };
      es.onopen = () => { setStatus('synced'); };
    } catch (e) { /* le flux n'est qu'un confort : la reconciliation periodique prend le relais */ }
  }

  function stopListening() {
    if (state.es) { try { state.es.close(); } catch (e) {} state.es = null; }
  }

  function stop() {
    stopListening();
  }

  async function start() {
    if (!configured()) { setStatus('disabled'); return; }
    if (!state.refreshToken) { setStatus('off'); return; }
    const t = await token();
    if (!t) { setStatus('off'); return; }
    await reconcile();
    listen();
  }

  /** Appele apres chaque enregistrement local. */
  function onLocalSave() {
    if (!configured() || !state.refreshToken) return;
    if (!store.hasWritten) return; // regle 2
    push();
  }

  function init() {
    loadToken();
    if (!configured()) { setStatus('disabled'); return; }
    setStatus(state.refreshToken ? 'offline' : 'off');
    start();
    if (globalThis.addEventListener) {
      globalThis.addEventListener('online', () => { if (configured() && state.refreshToken) start(); });
      globalThis.addEventListener('offline', () => { if (configured() && state.refreshToken) setStatus('offline'); });
    }
    setInterval(() => {
      if (configured() && state.refreshToken && state.status !== 'denied') reconcile();
    }, 5 * 60000);
  }

  /** Aucun bouton ne doit rester muet : pourquoi la fenetre ne peut pas s'ouvrir. */
  function loginBlockedReason() {
    if (!configured()) return "La synchronisation n’est pas configurée. Renseignez le projet cloud dans Paramètres › Synchronisation.";
    if (state.refreshToken && state.status === 'synced') return 'Vous êtes déjà connecté (' + state.email + ').';
    if (state.status === 'offline') return 'Pas de connexion internet : la connexion sera possible dès le retour du réseau.';
    return '';
  }

  MS.sync = {
    decide, readConfig, writeConfig, configured, status, shouldWarn, humanError,
    signIn, signOut, refresh, pull, push, reconcile, applyRemote, listen, stop, start,
    init, onLocalSave, loginBlockedReason,
    get email() { return state.email; },
    get connected() { return !!state.refreshToken; },
  };
})();
