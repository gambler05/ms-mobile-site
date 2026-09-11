/* ============================================================
   03 — Persistance, journal, sauvegardes automatiques
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { S, A, O, I, D, uid, dayKey, deepClone } = MS.util;
  const model = MS.model;

  const KEY = MS.config.storageKey;
  const BAK_PREFIX = KEY + '.bak.';
  const PRE_KEY = KEY + '.pre';
  const BAK_KEEP = 3;

  /** Acces au stockage qui n'echoue jamais bruyamment. */
  const LS = {
    get(k) {
      try { return globalThis.localStorage ? globalThis.localStorage.getItem(k) : null; }
      catch (e) { return null; }
    },
    set(k, v) {
      try { globalThis.localStorage.setItem(k, v); return true; }
      catch (e) { return false; }
    },
    del(k) {
      try { globalThis.localStorage.removeItem(k); return true; }
      catch (e) { return false; }
    },
    keys() {
      try {
        const ls = globalThis.localStorage;
        if (!ls) return [];
        const out = [];
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i);
          if (k !== null) out.push(k);
        }
        return out;
      } catch (e) { return []; }
    },
  };

  const listeners = [];
  const store = {
    state: model.emptyState(),
    /** Vrai si cet appareil a deja enregistre quelque chose (regle anti-perte 2). */
    hasWritten: false,
    lastError: '',
  };

  function subscribe(fn) { if (typeof fn === 'function') listeners.push(fn); }
  function emit(reason) {
    listeners.forEach((fn) => { try { fn(store.state, reason); } catch (e) { console.error(e); } });
  }

  /* -------------------- Chargement -------------------- */

  function load() {
    const raw = LS.get(KEY);
    if (!raw) {
      store.state = model.emptyState();
      store.hasWritten = false;
      return store.state;
    }
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    if (!parsed) {
      // Fichier illisible : on ne perd rien, on le met de cote et on repart propre.
      LS.set(KEY + '.corrupt.' + Date.now(), raw.slice(0, 2000000));
      store.state = model.emptyState();
      store.hasWritten = false;
      return store.state;
    }
    store.state = model.normState(parsed);
    // Une base deja enregistree porte une date : cet appareil a donc ecrit.
    store.hasWritten = !!store.state.updatedAt;
    return store.state;
  }

  /* -------------------- Enregistrement -------------------- */

  /**
   * Enregistre l'etat. `opts.touch === false` conserve la date de mise a jour
   * (utile quand on applique une version distante : elle n'est pas plus recente
   * du fait de son arrivee).
   */
  function save(opts) {
    const o = O(opts);
    if (o.touch !== false) {
      store.state.updatedAt = new Date().toISOString();
      store.hasWritten = true;
    }
    store.state.version = model.STATE_VERSION;
    const payload = JSON.stringify(store.state);
    if (!writeWithRoom(KEY, payload)) {
      store.lastError = "Le stockage du navigateur est plein : les données n’ont pas pu être enregistrées.";
      emit('save-failed');
      return false;
    }
    store.lastError = '';
    backupIfNeeded();
    if (o.silent !== true) emit(S(o.reason) || 'save');
    if (o.push !== false && MS.sync && MS.sync.onLocalSave) MS.sync.onLocalSave();
    return true;
  }

  /**
   * Ecrit en sacrifiant l'historique si la place manque.
   * L'enregistrement des donnees courantes ne doit jamais echouer a cause des sauvegardes.
   */
  function writeWithRoom(key, payload) {
    if (LS.set(key, payload)) return true;
    const backups = listBackups();
    for (let i = backups.length - 1; i >= 0; i--) {
      LS.del(backups[i].key);
      if (LS.set(key, payload)) return true;
    }
    LS.del(PRE_KEY);
    if (LS.set(key, payload)) return true;
    // Dernier recours : on allege le journal, jamais les donnees metier.
    if (A(store.state.logs).length) {
      store.state.logs = store.state.logs.slice(0, 50);
      const lighter = JSON.stringify(store.state);
      if (LS.set(key, lighter)) return true;
    }
    return false;
  }

  /**
   * Modification atomique : applique `fn` sur l'etat puis enregistre.
   * `fn` peut renvoyer false pour annuler.
   */
  function mutate(fn, opts) {
    if (typeof fn !== 'function') return false;
    let result;
    try { result = fn(store.state); }
    catch (e) { console.error(e); return false; }
    if (result === false) return false;
    return save(opts);
  }

  /* -------------------- Journal -------------------- */

  /**
   * Ajoute une ligne de journal. `opts.key` coalesce : une action repetee
   * sur la meme cible tient une seule ligne a jour au lieu d'en empiler dix.
   */
  function log(action, detail, icon, opts) {
    const o = O(opts);
    const user = MS.auth && MS.auth.currentUserName ? MS.auth.currentUserName() : '';
    const key = S(o.key);
    const logs = A(store.state.logs);
    if (key) {
      const idx = logs.findIndex((l) => S(O(l).key) === key);
      const WINDOW = 10 * 60 * 1000; // au-dela, c'est une nouvelle intention
      if (idx > -1 && Date.now() - new Date(logs[idx].date).getTime() < WINDOW) {
        const line = logs[idx];
        const meta = O(o.meta);
        const from = O(line.meta).from !== undefined ? O(line.meta).from : meta.from;
        // Retour au chiffre de depart : la ligne n'a plus lieu d'etre.
        if (o.dropIfSame && from !== undefined && String(from) === String(meta.to)) {
          logs.splice(idx, 1);
          store.state.logs = logs;
          return null;
        }
        line.action = S(action) || line.action;
        line.detail = typeof o.merge === 'function' ? S(o.merge(from, meta)) : S(detail);
        line.date = new Date().toISOString();
        line.user = user;
        line.meta = Object.assign({}, O(line.meta), meta, { from });
        logs.splice(idx, 1);
        logs.unshift(line);
        store.state.logs = logs;
        return line;
      }
      if (o.dropIfSame && O(o.meta).from !== undefined && String(O(o.meta).from) === String(O(o.meta).to)) return null;
    }
    const entry = model.normLog({
      id: uid('log'), action, detail, icon: icon || 'dot',
      date: new Date().toISOString(), user, key, meta: O(o.meta),
    });
    logs.unshift(entry);
    store.state.logs = logs.slice(0, model.LOG_CAP);
    return entry;
  }

  /* -------------------- Sauvegardes automatiques -------------------- */

  /** Une copie complete par jour, les trois dernieres conservees. */
  function backupIfNeeded() {
    const today = dayKey(new Date());
    const key = BAK_PREFIX + today;
    if (LS.get(key)) return false;
    const payload = JSON.stringify({
      date: new Date().toISOString(),
      counts: model.countRecords(store.state),
      state: store.state,
    });
    if (!LS.set(key, payload)) {
      // Pas de place : on sacrifie les plus anciennes, une a une.
      const backups = listBackups();
      for (let i = backups.length - 1; i >= 0; i--) {
        LS.del(backups[i].key);
        if (LS.set(key, payload)) break;
      }
    }
    pruneBackups();
    return true;
  }

  function listBackups() {
    return LS.keys()
      .filter((k) => k.indexOf(BAK_PREFIX) === 0)
      .map((k) => {
        let meta = {};
        try { meta = JSON.parse(LS.get(k)) || {}; } catch (e) { meta = {}; }
        return {
          key: k,
          day: k.slice(BAK_PREFIX.length),
          date: S(O(meta).date) || k.slice(BAK_PREFIX.length),
          counts: O(O(meta).counts),
        };
      })
      .sort((a, b) => (a.day < b.day ? 1 : -1));
  }

  function pruneBackups() {
    const backups = listBackups();
    backups.slice(BAK_KEEP).forEach((b) => LS.del(b.key));
  }

  function readBackup(key) {
    let parsed = null;
    try { parsed = JSON.parse(LS.get(key)); } catch (e) { parsed = null; }
    const st = O(parsed).state;
    return st ? model.normState(st) : null;
  }

  function restoreBackup(key) {
    const st = readBackup(key);
    if (!st) return false;
    snapshotCurrent('restauration');
    store.state = st;
    save({ reason: 'restore' });
    return true;
  }

  /**
   * Regle anti-perte 6 : avant tout remplacement, la version presente sur
   * l'appareil est copiee localement et proposee a la restauration.
   */
  function snapshotCurrent(reason) {
    if (model.isEmptyState(store.state)) return false;
    const payload = JSON.stringify({
      date: new Date().toISOString(),
      reason: S(reason),
      counts: model.countRecords(store.state),
      state: store.state,
    });
    return LS.set(PRE_KEY, payload);
  }

  function getSnapshot() {
    let parsed = null;
    try { parsed = JSON.parse(LS.get(PRE_KEY)); } catch (e) { parsed = null; }
    if (!parsed || !O(parsed).state) return null;
    return {
      date: S(parsed.date),
      reason: S(parsed.reason),
      counts: O(parsed.counts),
      state: model.normState(parsed.state),
    };
  }

  function restoreSnapshot() {
    const snap = getSnapshot();
    if (!snap) return false;
    store.state = snap.state;
    save({ reason: 'restore-snapshot' });
    LS.del(PRE_KEY);
    return true;
  }

  /** Remplace l'etat (import, restauration, reception distante). */
  function replaceState(next, opts) {
    const o = O(opts);
    if (o.snapshot !== false) snapshotCurrent(S(o.reason) || 'remplacement');
    store.state = model.normState(next);
    return save(o);
  }

  /** Effacement volontaire : marqueur pose au moment de l'action (regle 4). */
  function eraseAll() {
    snapshotCurrent('effacement');
    const settings = deepClone(store.state.settings);
    const fresh = model.emptyState();
    fresh.settings = model.normSettings(settings);
    fresh.erased = new Date().toISOString();
    store.state = fresh;
    log('Effacement total', 'Toutes les données ont été effacées', 'trash');
    return save({ reason: 'erase' });
  }

  MS.store = {
    get state() { return store.state; },
    set state(v) { store.state = v; },
    get hasWritten() { return store.hasWritten; },
    set hasWritten(v) { store.hasWritten = !!v; },
    get lastError() { return store.lastError; },
    KEY, PRE_KEY, BAK_PREFIX, LS,
    load, save, mutate, log, subscribe, emit,
    backupIfNeeded, listBackups, readBackup, restoreBackup, pruneBackups,
    snapshotCurrent, getSnapshot, restoreSnapshot, replaceState, eraseAll,
  };
})();
