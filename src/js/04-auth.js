/* ============================================================
   04 — Comptes, session, verrouillage
   Limite assumee : ce verrou protege l'interface, pas le fichier.
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { S, I, A, O, uid, pick } = MS.util;
  const model = MS.model;
  const store = MS.store;

  const SESSION_KEY = MS.config.storageKey + '.session';
  const ATTEMPT_KEY = MS.config.storageKey + '.attempts';
  const LOCK_MS = 60 * 1000;

  const state = { user: null, lockedOut: 0, lastActivity: Date.now() };

  /* -------------------- Empreintes salees -------------------- */

  function randomHex(bytes) {
    const n = I(bytes, 16, 1);
    const arr = new Uint8Array(n);
    if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(arr);
    else for (let i = 0; i < n; i++) arr[i] = Math.floor(Math.random() * 256);
    return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  const ITERATIONS = 120000;

  /** PBKDF2-SHA256 quand le navigateur le propose ; repli interne sinon. */
  async function hashPassword(password, salt) {
    const pwd = S(password);
    const slt = S(salt);
    const subtle = globalThis.crypto && globalThis.crypto.subtle;
    if (subtle && globalThis.TextEncoder) {
      try {
        const enc = new TextEncoder();
        const key = await subtle.importKey('raw', enc.encode(pwd), 'PBKDF2', false, ['deriveBits']);
        const bits = await subtle.deriveBits(
          { name: 'PBKDF2', salt: enc.encode(slt), iterations: ITERATIONS, hash: 'SHA-256' },
          key, 256
        );
        return 'pbkdf2$' + Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch (e) { /* repli ci-dessous */ }
    }
    return 'weak$' + weakHash(slt + '|' + pwd);
  }

  /** Repli sans dependance : moins solide, jamais utilise si SubtleCrypto repond. */
  function weakHash(input) {
    const s = S(input);
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let round = 0; round < 1000; round++) {
      for (let i = 0; i < s.length; i++) {
        h1 ^= s.charCodeAt(i) + round;
        h1 = (h1 * 16777619) >>> 0;
        h2 = ((h2 << 5) - h2 + h1) >>> 0;
      }
    }
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  }

  async function makeCredentials(password) {
    const salt = randomHex(16);
    const hash = await hashPassword(password, salt);
    return { salt, hash };
  }

  async function verify(password, salt, hash) {
    if (!S(hash)) return false;
    const computed = await hashPassword(password, salt);
    return constantTimeEqual(computed, S(hash));
  }

  function constantTimeEqual(a, b) {
    const x = S(a), y = S(b);
    if (x.length !== y.length) return false;
    let diff = 0;
    for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
    return diff === 0;
  }

  /* -------------------- Comptes -------------------- */

  function accounts() { return A(O(store.state.settings).accounts); }
  function hasAccounts() { return accounts().length > 0; }
  function scope() { return pick(O(store.state.settings).authScope, ['off', 'app', 'sensitive'], 'off'); }
  function enabled() { return scope() !== 'off' && hasAccounts(); }

  function currentUser() { return state.user; }
  function currentUserName() { return S(O(state.user).name); }
  function isAdmin() { return !enabled() || S(O(state.user).role) === 'Administrateur'; }

  async function addAccount({ login, name, role, password }) {
    const cleanLogin = S(login).trim();
    if (!cleanLogin) return { ok: false, error: "L’identifiant est obligatoire." };
    if (accounts().some((a) => S(a.login).toLowerCase() === cleanLogin.toLowerCase())) {
      return { ok: false, error: 'Cet identifiant existe déjà.' };
    }
    if (S(password).length < 4) return { ok: false, error: 'Le mot de passe doit faire au moins 4 caractères.' };
    const creds = await makeCredentials(password);
    const account = model.normAccount({
      id: uid('usr'), login: cleanLogin, name: S(name).trim() || cleanLogin,
      role: pick(role, model.ROLES, 'Vendeur'), salt: creds.salt, hash: creds.hash,
    });
    store.state.settings.accounts = accounts().concat([account]);
    store.log('Compte créé', account.login + ' (' + account.role + ')', 'user');
    store.save({ reason: 'accounts' });
    return { ok: true, account };
  }

  async function setPassword(id, password) {
    const account = accounts().find((a) => S(a.id) === S(id));
    if (!account) return { ok: false, error: 'Compte introuvable.' };
    if (S(password).length < 4) return { ok: false, error: 'Le mot de passe doit faire au moins 4 caractères.' };
    const creds = await makeCredentials(password);
    account.salt = creds.salt;
    account.hash = creds.hash;
    store.log('Mot de passe modifié', account.login, 'key');
    store.save({ reason: 'accounts' });
    return { ok: true };
  }

  function removeAccount(id) {
    const list = accounts();
    const account = list.find((a) => S(a.id) === S(id));
    if (!account) return { ok: false, error: 'Compte introuvable.' };
    const admins = list.filter((a) => S(a.role) === 'Administrateur');
    if (S(account.role) === 'Administrateur' && admins.length <= 1) {
      return { ok: false, error: 'Impossible de supprimer le dernier administrateur.' };
    }
    store.state.settings.accounts = list.filter((a) => S(a.id) !== S(id));
    store.log('Compte supprimé', account.login, 'user');
    store.save({ reason: 'accounts' });
    if (S(O(state.user).id) === S(id)) logout('compte supprimé');
    return { ok: true };
  }

  /** Cle de secours : affichee une seule fois, seule son empreinte est conservee. */
  async function generateRecovery() {
    const key = (randomHex(3) + '-' + randomHex(3) + '-' + randomHex(3)).toUpperCase();
    const creds = await makeCredentials(key);
    store.state.settings.recovery = creds.salt + ':' + creds.hash;
    store.log('Clé de secours générée', '', 'key');
    store.save({ reason: 'accounts' });
    return key;
  }

  async function useRecovery(key) {
    const stored = S(O(store.state.settings).recovery);
    if (!stored || stored.indexOf(':') < 0) return { ok: false, error: "Aucune clé de secours n’a été générée." };
    const [salt, hash] = stored.split(':');
    const ok = await verify(S(key).trim().toUpperCase(), salt, hash);
    if (!ok) return { ok: false, error: 'Clé de secours incorrecte.' };
    store.state.settings.authScope = 'off';
    store.state.settings.recovery = '';
    clearAttempts();
    state.user = null;
    persistSession();
    store.log('Protection désactivée', 'Reprise en main par clé de secours', 'shield');
    store.save({ reason: 'accounts' });
    return { ok: true };
  }

  /* -------------------- Tentatives -------------------- */

  function readAttempts() {
    let parsed = null;
    try { parsed = JSON.parse(store.LS.get(ATTEMPT_KEY)); } catch (e) { parsed = null; }
    return { count: I(O(parsed).count, 0, 0), until: I(O(parsed).until, 0, 0) };
  }

  function writeAttempts(v) { store.LS.set(ATTEMPT_KEY, JSON.stringify(v)); }
  function clearAttempts() { store.LS.del(ATTEMPT_KEY); }

  function lockRemaining() {
    const { until } = readAttempts();
    const left = until - Date.now();
    return left > 0 ? Math.ceil(left / 1000) : 0;
  }

  /* -------------------- Connexion -------------------- */

  async function login(loginName, password) {
    const wait = lockRemaining();
    if (wait > 0) {
      return { ok: false, error: 'Trop de tentatives. Réessayez dans ' + wait + ' seconde' + (wait > 1 ? 's' : '') + '.' };
    }
    const account = accounts().find((a) => S(a.login).toLowerCase() === S(loginName).trim().toLowerCase());
    const ok = account ? await verify(password, account.salt, account.hash) : false;
    if (!ok) {
      const att = readAttempts();
      const max = I(O(store.state.settings).maxAttempts, 5, 1);
      const count = att.count + 1;
      const until = count >= max ? Date.now() + LOCK_MS * Math.min(5, count - max + 1) : 0;
      writeAttempts({ count, until });
      store.log('Connexion refusée', S(loginName).trim() || '(identifiant vide)', 'shield');
      store.save({ reason: 'auth', silent: true, touch: false });
      if (until) return { ok: false, error: 'Trop de tentatives. Réessayez dans ' + Math.ceil(LOCK_MS / 1000) + ' secondes.' };
      return { ok: false, error: 'Identifiant ou mot de passe incorrect.' };
    }
    clearAttempts();
    state.user = { id: account.id, login: account.login, name: account.name, role: account.role };
    state.lastActivity = Date.now();
    persistSession();
    store.log('Connexion', account.login, 'user');
    store.save({ reason: 'auth', touch: false });
    return { ok: true, user: state.user };
  }

  function logout(reason) {
    const was = currentUserName();
    state.user = null;
    persistSession();
    if (was) {
      store.log('Déconnexion', S(reason), 'user');
      store.save({ reason: 'auth', touch: false, silent: true });
    }
    store.emit('auth');
  }

  /** Session par onglet : un rafraichissement la conserve, la fermeture la referme. */
  function persistSession() {
    try {
      if (state.user) globalThis.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user: state.user, at: Date.now() }));
      else globalThis.sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* stockage indisponible : la session ne survit pas au rafraichissement */ }
  }

  function restoreSession() {
    let parsed = null;
    try { parsed = JSON.parse(globalThis.sessionStorage.getItem(SESSION_KEY)); } catch (e) { parsed = null; }
    const user = O(O(parsed).user);
    if (!S(user.id)) return;
    // Le compte doit toujours exister.
    const account = accounts().find((a) => S(a.id) === S(user.id));
    if (!account) { try { globalThis.sessionStorage.removeItem(SESSION_KEY); } catch (e) {} return; }
    state.user = { id: account.id, login: account.login, name: account.name, role: account.role };
    state.lastActivity = I(O(parsed).at, Date.now(), 0);
    if (isExpired()) logout('inactivité');
  }

  function isExpired() {
    const minutes = I(O(store.state.settings).autolockMinutes, 0, 0);
    if (!minutes) return false;
    return Date.now() - state.lastActivity > minutes * 60000;
  }

  function touch() {
    state.lastActivity = Date.now();
    persistSession();
  }

  /** Un ecran est-il accessible en l'etat ? */
  function canView(screen) {
    if (!enabled()) return { ok: true };
    const name = S(screen);
    if (state.user && isExpired()) logout('inactivité');
    const admin = model.ADMIN_SCREENS.includes(name);
    const sensitive = model.SENSITIVE_SCREENS.includes(name);
    if (scope() === 'app') {
      if (!state.user) return { ok: false, reason: 'login' };
    } else if (scope() === 'sensitive') {
      if (sensitive && !state.user) return { ok: false, reason: 'login' };
    }
    if (admin && state.user && S(state.user.role) !== 'Administrateur') {
      return { ok: false, reason: 'admin' };
    }
    if (admin && !state.user && scope() !== 'off') return { ok: false, reason: 'login' };
    return { ok: true };
  }

  function startWatchdog() {
    if (!globalThis.document) return;
    ['click', 'keydown', 'pointerdown'].forEach((ev) => {
      globalThis.document.addEventListener(ev, () => { if (state.user) touch(); }, { passive: true });
    });
    setInterval(() => {
      if (state.user && isExpired()) {
        logout('inactivité');
        if (MS.ui && MS.ui.toast) MS.ui.toast('Session verrouillée après inactivité.', 'info');
        if (MS.app && MS.app.render) MS.app.render();
      }
    }, 15000);
  }

  MS.auth = {
    hashPassword, makeCredentials, verify, randomHex,
    accounts, hasAccounts, scope, enabled, currentUser, currentUserName, isAdmin,
    addAccount, setPassword, removeAccount, generateRecovery, useRecovery,
    login, logout, restoreSession, touch, canView, isExpired, lockRemaining,
    clearAttempts, startWatchdog,
  };
})();
