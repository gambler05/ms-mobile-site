/* ============================================================
   06 — Socle d'interface : icones, rendu, modales, routage
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { S, N, I, A, O, esc, uid, fmtMoney, csvDoc } = MS.util;
  const store = MS.store;

  /* -------------------- Icones -------------------- */
  const ICONS = {
    dashboard: '<path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z"/>',
    cash: '<path d="M2 6h20v12H2z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>',
    box: '<path d="M12 2 3 6.5v11L12 22l9-4.5v-11L12 2Zm0 2.2 6.5 3.3L12 10.8 5.5 7.5 12 4.2ZM5 9.3l6 3v7.2l-6-3V9.3Zm8 10.2v-7.2l6-3v7.2l-6 3Z"/>',
    alert: '<path d="M12 2 1 21h22L12 2Zm0 5 7.5 12.9h-15L12 7Zm-1 4v5h2v-5h-2Zm0 6v2h2v-2h-2Z"/>',
    wrench: '<path d="M21.7 6.3a5.5 5.5 0 0 1-7.4 7.4l-7 7a2.1 2.1 0 0 1-3-3l7-7a5.5 5.5 0 0 1 7.4-7.4L15 7l2 2 4.7-2.7Z"/>',
    users: '<path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.9 0-7 2-7 4.5V21h14v-3.5C16 15 12.9 13 9 13Zm8.5-2A3.5 3.5 0 1 0 17.5 4a3.5 3.5 0 0 0 0 7Zm.5 2c-.9 0-1.7.1-2.4.4 1.5 1.1 2.4 2.5 2.4 4.1V21h4v-3.5c0-2.2-1.9-4.5-4-4.5Z"/>',
    tags: '<path d="M2 4h9l11 11-9 9L2 13V4Zm4 2.5A1.5 1.5 0 1 0 6 9.5a1.5 1.5 0 0 0 0-3Z"/>',
    settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9.4 4a7.5 7.5 0 0 1-.1 1.2l2 1.6-2 3.4-2.4-1a7.6 7.6 0 0 1-2 1.2l-.4 2.6h-4l-.4-2.6a7.6 7.6 0 0 1-2-1.2l-2.4 1-2-3.4 2-1.6a7.6 7.6 0 0 1 0-2.4l-2-1.6 2-3.4 2.4 1a7.6 7.6 0 0 1 2-1.2L10.5 2h4l.4 2.6c.7.3 1.4.7 2 1.2l2.4-1 2 3.4-2 1.6c.1.4.1.8.1 1.2Z"/>',
    list: '<path d="M3 5h18v2H3V5Zm0 6h18v2H3v-2Zm0 6h18v2H3v-2Z"/>',
    plus: '<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/>',
    minus: '<path d="M5 11h14v2H5z"/>',
    edit: '<path d="m3 17.2 10.6-10.6 3.8 3.8L6.8 21H3v-3.8ZM20.7 5.6 18.4 3.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8 1.7-1.8a1 1 0 0 0 0-1.5Z"/>',
    trash: '<path d="M6 7h12v14H6V7Zm3-4h6l1 2h4v2H4V5h4l1-2Z"/>',
    search: '<path d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z"/>',
    print: '<path d="M6 2h12v5H6V2Zm-3 7h18v8h-3v5H8v-5H5V9H3Zm7 6h8v6h-8v-6Z"/>',
    sms: '<path d="M2 3h20v14H7l-5 4V3Zm5 6v2h2V9H7Zm4 0v2h2V9h-2Zm4 0v2h2V9h-2Z"/>',
    cloud: '<path d="M6 19a5 5 0 0 1-.6-9.9A7 7 0 0 1 19 9.6 4.5 4.5 0 0 1 18 19H6Z"/>',
    user: '<path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.5-8 5.5V22h16v-2.5c0-3-3.6-5.5-8-5.5Z"/>',
    key: '<path d="M14 2a6 6 0 1 0-5.7 8L7 11.3V14H4v3H1v4h6v-3h3v-3h1.6l1.7-1.7A6 6 0 0 0 14 2Zm1.5 3.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z"/>',
    shield: '<path d="M12 2 4 5v7c0 5 3.4 9.4 8 10 4.6-.6 8-5 8-10V5l-8-3Z"/>',
    check: '<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z"/>',
    x: '<path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4L10.6 10.6l6.3-6.3 1.4 1.4Z"/>',
    download: '<path d="M11 3h2v9h4l-5 6-5-6h4V3ZM4 19h16v2H4z"/>',
    upload: '<path d="M13 21h-2v-9H7l5-6 5 6h-4v9ZM4 19h16v2H4z"/>',
    refresh: '<path d="M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8Z"/>',
    dot: '<circle cx="12" cy="12" r="4"/>',
    sun: '<path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0-6h0v3h0V1Zm0 19v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M19.8 4.2l-2.1 2.1M6.3 17.7l-2.1 2.1" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
    moon: '<path d="M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10Z"/>',
    menu: '<path d="M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z"/>',
    phone: '<path d="M6.6 2h4l2 5-2.5 1.5a12 12 0 0 0 5.4 5.4L17 11.4l5 2v4a2 2 0 0 1-2.2 2A18 18 0 0 1 2.6 4.2 2 2 0 0 1 4.6 2h2Z"/>',
    euro: '<path d="M15 5.5a5.5 5.5 0 0 0-5.2 3.8H14v2H9.4v1.4H14v2H9.8A5.5 5.5 0 0 0 15 18.5c1.2 0 2.3-.4 3.2-1l1.1 1.7A7.5 7.5 0 0 1 7.7 14.7H5.5v-2h1.9v-1.4H5.5v-2h1.9A7.5 7.5 0 0 1 19.3 4.8L18.2 6.5a5.4 5.4 0 0 0-3.2-1Z"/>',
    chevron: '<path d="m9 6 6 6-6 6z"/>',
    grid: '<path d="M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z"/>',
    doc: '<path d="M6 2h8l4 4v16H6V2Zm7 1.5V7h3.5L13 3.5ZM8 11h8v2H8v-2Zm0 4h8v2H8v-2Z"/>',
    clock: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5h-2v6l4.5 2.7 1-1.7L13 11.8V7Z"/>',
  };

  function icon(name, cls) {
    const path = ICONS[S(name)] || ICONS.dot;
    return '<svg class="ic ' + esc(cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + path + '</svg>';
  }

  /* -------------------- Raccourcis DOM -------------------- */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** Delegation d'evenement : survit aux re-rendus. */
  function on(root, selector, event, handler) {
    if (!root) return;
    root.addEventListener(event, (e) => {
      const target = e.target && e.target.closest ? e.target.closest(selector) : null;
      if (target && root.contains(target)) handler(e, target);
    });
  }

  /* -------------------- Focus conserve entre deux rendus -------------------- */

  function captureFocus() {
    const el = document.activeElement;
    if (!el || !el.dataset || !el.dataset.keep) return null;
    return {
      keep: el.dataset.keep,
      start: typeof el.selectionStart === 'number' ? el.selectionStart : null,
      end: typeof el.selectionEnd === 'number' ? el.selectionEnd : null,
    };
  }

  function restoreFocus(snap) {
    if (!snap) return;
    const el = document.querySelector('[data-keep="' + CSS.escape(snap.keep) + '"]');
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
      if (snap.start !== null && typeof el.setSelectionRange === 'function') el.setSelectionRange(snap.start, snap.end);
    } catch (e) { /* champ non focusable : sans consequence */ }
  }

  /* -------------------- Messages -------------------- */

  function toast(message, kind, ms) {
    const root = $('#toast-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast toast-' + (kind || 'info');
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    el.innerHTML = icon(kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'dot') + '<span>' + esc(message) + '</span>';
    root.appendChild(el);
    const delay = I(ms, kind === 'error' ? 6000 : 3500, 800);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 250); }, delay);
  }

  /* -------------------- Modales -------------------- */

  let modalStack = [];

  function modal(opts) {
    const o = O(opts);
    const root = $('#modal-root');
    if (!root) return null;
    const id = uid('mod');
    const wrap = document.createElement('div');
    wrap.className = 'modal-back';
    wrap.dataset.modal = id;
    const size = S(o.size) || 'md';
    wrap.innerHTML =
      '<div class="modal modal-' + esc(size) + '" role="dialog" aria-modal="true" aria-label="' + esc(o.title || 'Fenêtre') + '">'
      + '<header class="modal-head"><h2>' + esc(o.title || '') + '</h2>'
      + '<button type="button" class="icon-btn" data-close aria-label="Fermer">' + icon('x') + '</button></header>'
      + '<div class="modal-body">' + (S(o.body) || '') + '</div>'
      + (o.footer === false ? '' : '<footer class="modal-foot">' + (S(o.footer) || '') + '</footer>')
      + '</div>';
    root.appendChild(wrap);
    document.body.classList.add('modal-open');
    const close = () => {
      wrap.remove();
      modalStack = modalStack.filter((m) => m.id !== id);
      if (!modalStack.length) document.body.classList.remove('modal-open');
      if (typeof o.onClose === 'function') o.onClose();
    };
    modalStack.push({ id, close });
    on(wrap, '[data-close]', 'click', close);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap && o.dismissible !== false) close(); });
    const api = { el: wrap, close, body: $('.modal-body', wrap), foot: $('.modal-foot', wrap) };
    if (typeof o.onOpen === 'function') o.onOpen(api);
    const focusable = wrap.querySelector('[autofocus], input, select, textarea, button:not([data-close])');
    if (focusable) setTimeout(() => { try { focusable.focus(); } catch (e) {} }, 30);
    return api;
  }

  function closeTopModal() {
    const top = modalStack[modalStack.length - 1];
    if (top) top.close();
  }

  function confirm(opts) {
    const o = O(opts);
    return new Promise((resolve) => {
      const m = modal({
        title: S(o.title) || 'Confirmer',
        size: 'sm',
        body: '<p class="lead">' + esc(o.message) + '</p>' + (o.detail ? '<p class="muted">' + esc(o.detail) + '</p>' : ''),
        footer: '<button type="button" class="btn ghost" data-no>' + esc(o.cancelLabel || 'Annuler') + '</button>'
          + '<button type="button" class="btn ' + (o.danger ? 'danger' : 'primary') + '" data-yes>' + esc(o.confirmLabel || 'Confirmer') + '</button>',
        onClose: () => resolve(false),
      });
      if (!m) { resolve(false); return; }
      on(m.el, '[data-no]', 'click', () => m.close());
      on(m.el, '[data-yes]', 'click', () => { resolve(true); m.close(); });
    });
  }

  function prompt(opts) {
    const o = O(opts);
    return new Promise((resolve) => {
      const m = modal({
        title: S(o.title) || 'Saisie',
        size: 'sm',
        body: '<label class="field"><span>' + esc(o.label || '') + '</span>'
          + '<input type="' + esc(o.type || 'text') + '" id="prompt-input" value="' + esc(o.value || '') + '" autofocus></label>'
          + (o.help ? '<p class="muted">' + esc(o.help) + '</p>' : ''),
        footer: '<button type="button" class="btn ghost" data-no>Annuler</button>'
          + '<button type="button" class="btn primary" data-yes>' + esc(o.confirmLabel || 'Valider') + '</button>',
        onClose: () => resolve(null),
      });
      if (!m) { resolve(null); return; }
      const input = $('#prompt-input', m.el);
      const done = () => { const v = input ? input.value : ''; resolve(v); m.el.remove(); document.body.classList.remove('modal-open'); };
      on(m.el, '[data-no]', 'click', () => m.close());
      on(m.el, '[data-yes]', 'click', done);
      if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
    });
  }

  /* -------------------- Telechargement -------------------- */

  function download(filename, content, mime) {
    try {
      const blob = new Blob([content], { type: S(mime) || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = S(filename) || 'export.txt';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
      return true;
    } catch (e) {
      toast("Le téléchargement n’a pas pu démarrer.", 'error');
      return false;
    }
  }

  function exportCsv(filename, rows) {
    return download(filename, csvDoc(rows), 'text/csv;charset=utf-8');
  }

  /* -------------------- Fragments d'interface -------------------- */

  function money(v) { return fmtMoney(v, O(store.state.settings).currency); }

  function badge(text, kind) {
    return '<span class="badge badge-' + esc(kind || 'neutral') + '">' + esc(text) + '</span>';
  }

  function empty(message, action) {
    return '<div class="empty">' + icon('box') + '<p>' + esc(message) + '</p>' + (S(action) || '') + '</div>';
  }

  function statCard(label, value, hint, kind) {
    return '<div class="stat stat-' + esc(kind || 'neutral') + '">'
      + '<span class="stat-label">' + esc(label) + '</span>'
      + '<strong class="stat-value">' + esc(value) + '</strong>'
      + (hint ? '<span class="stat-hint">' + esc(hint) + '</span>' : '') + '</div>';
  }

  function selectOptions(list, selected) {
    return A(list).map((v) => {
      const val = typeof v === 'object' ? S(O(v).value) : S(v);
      const lab = typeof v === 'object' ? S(O(v).label) : S(v);
      return '<option value="' + esc(val) + '"' + (String(val) === String(selected) ? ' selected' : '') + '>' + esc(lab) + '</option>';
    }).join('');
  }

  /**
   * Repli d'une ligne de tableau : le contenu des colonnes effacees
   * reapparait sous le nom. Chaque element porte la cle de sa colonne
   * pour n'apparaitre que lorsque cette colonne a disparu.
   */
  const FOLD_KEYS = {
    categorie: 'cat', prix: 'price', seuil: 'min', fournisseur: 'sup', ref: 'ref',
    etat: 'state', client: 'client', tel: 'phone', appareil: 'device', panne: 'issue',
    restedu: 'due', articles: 'items', mode: 'method', email: 'email', reparations: 'count',
  };

  function foldout(pairs) {
    const items = A(pairs).filter((p) => S(O(p).value)).map((p) => {
      const key = FOLD_KEYS[MS.util.flat(O(p).label)] || 'x';
      return '<span class="fold-item" data-k="' + esc(key) + '"><b>' + esc(O(p).label) + '</b> ' + esc(O(p).value) + '</span>';
    }).join('');
    return items ? '<div class="foldout">' + items + '</div>' : '';
  }

  MS.ui = {
    ICONS, icon, $, $$, on, toast, modal, closeTopModal, confirm, prompt,
    download, exportCsv, money, badge, empty, statCard, selectOptions, foldout,
    captureFocus, restoreFocus,
  };
})();
