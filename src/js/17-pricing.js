/* ============================================================
   17 — Grilles tarifaires
   Les valeurs restent du texte : « 259/179 », « sur devis », « - ».
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { S, I, A, O, esc, norm, uid, dayKey } = MS.util;
  const ui = MS.ui, store = MS.store, model = MS.model;

  const view = { tabId: '', q: '' };

  function tabs() { return A(O(store.state.pricing).tabs); }
  function activeTab() {
    const list = tabs();
    if (!list.length) return null;
    return list.find((t) => S(t.id) === S(view.tabId)) || list[0];
  }

  function render(host) {
    const list = tabs();
    const tab = activeTab();
    if (tab) view.tabId = tab.id;

    host.innerHTML =
      '<section class="card"><div class="card-head">'
      + '<div class="tabs" role="tablist">'
      + list.map((t) => '<button type="button" role="tab" class="tab' + (tab && t.id === tab.id ? ' on' : '') + '" data-tab="' + esc(t.id) + '">'
        + esc(t.name) + '</button>').join('')
      + '<button type="button" class="tab add" data-act="add-tab" title="Ajouter un onglet">' + ui.icon('plus') + '</button>'
      + '</div></div>'
      + (tab
        ? '<div class="filter-row">'
          + '<label class="field grow"><span>Rechercher un modèle</span>'
          + '<input data-keep="pri-q" id="pri-q" value="' + esc(view.q) + '" placeholder="iPhone 14, Galaxy S22…"></label>'
          + '<button type="button" class="btn small" data-act="rename-tab">' + ui.icon('edit') + ' Renommer l’onglet</button>'
          + '<button type="button" class="btn small" data-act="add-col">' + ui.icon('plus') + ' Colonne</button>'
          + '<button type="button" class="btn small" data-act="add-row">' + ui.icon('plus') + ' Modèle</button>'
          + '<button type="button" class="btn small" data-act="export">' + ui.icon('download') + ' Export CSV</button>'
          + '<button type="button" class="btn small danger-ghost" data-act="del-tab">' + ui.icon('trash') + ' Onglet</button>'
          + '</div>'
        : '')
      + '</section>'
      + (tab ? gridHtml(tab) : '<section class="card">'
        + ui.empty('Aucune grille tarifaire. Créez un onglet par marque ou par famille.',
          '<button type="button" class="btn primary" data-act="add-tab">Créer un onglet</button>') + '</section>');

    bind(host, tab);
  }

  function gridHtml(tab) {
    const cols = A(tab.cols);
    const q = norm(view.q);
    const rows = A(tab.rows).filter((r) => !q || norm(r.model).indexOf(q) > -1);
    if (!cols.length) {
      return '<section class="card">' + ui.empty('Cet onglet n’a aucune colonne. Ajoutez un type d’intervention.',
        '<button type="button" class="btn primary" data-act="add-col">Ajouter une colonne</button>') + '</section>';
    }
    return '<section class="card grid-card"><div class="table-wrap pricing-wrap"><table class="table pricing-table">'
      + '<thead><tr><th class="sticky-col">Modèle</th>'
      + cols.map((c, i) => '<th data-col="' + esc(c.id) + '"><span class="col-head">'
        + '<span class="col-name">' + esc(c.name) + '</span>'
        + '<span class="col-tools">'
        + '<button type="button" class="icon-btn tiny" data-col-left="' + esc(c.id) + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="Déplacer à gauche">‹</button>'
        + '<button type="button" class="icon-btn tiny" data-col-right="' + esc(c.id) + '"' + (i === cols.length - 1 ? ' disabled' : '') + ' aria-label="Déplacer à droite">›</button>'
        + '<button type="button" class="icon-btn tiny" data-col-rename="' + esc(c.id) + '" aria-label="Renommer">' + ui.icon('edit') + '</button>'
        + '<button type="button" class="icon-btn tiny danger-ghost" data-col-del="' + esc(c.id) + '" aria-label="Supprimer la colonne">' + ui.icon('trash') + '</button>'
        + '</span></span></th>').join('')
      + '<th class="col-act">Ligne</th></tr></thead><tbody>'
      + (rows.length ? rows.map((r) => rowHtml(r, cols)).join('')
        : '<tr><td class="sticky-col" colspan="' + (cols.length + 2) + '">Aucun modèle ne correspond à cette recherche.</td></tr>')
      + '</tbody></table></div>'
      + '<p class="muted small">Les valeurs restent du texte : « 259/179 », « sur devis » ou « - » sont acceptés tels quels. '
      + 'Entrée passe à la case suivante.</p></section>';
  }

  function rowHtml(row, cols) {
    return '<tr data-row="' + esc(row.id) + '">'
      + '<th class="sticky-col"><input class="cell-input model-input" data-model="' + esc(row.id) + '" value="' + esc(row.model) + '" aria-label="Modèle"></th>'
      + cols.map((c) => '<td><input class="cell-input" data-cell="' + esc(row.id) + '|' + esc(c.id) + '" '
        + 'value="' + esc(O(row.cells)[c.id]) + '" aria-label="' + esc(row.model + ' — ' + c.name) + '"></td>').join('')
      + '<td class="col-act"><button type="button" class="icon-btn danger-ghost" data-row-del="' + esc(row.id) + '" aria-label="Supprimer le modèle">'
      + ui.icon('trash') + '</button></td></tr>';
  }

  /* -------------------- Interactions -------------------- */

  function bind(host, tab) {
    ui.on(host, '[data-tab]', 'click', (e, el) => { view.tabId = S(el.dataset.tab); MS.app.render(); });
    ui.on(host, '[data-act="add-tab"]', 'click', addTab);
    const q = ui.$('#pri-q', host);
    if (q) q.addEventListener('input', MS.util.debounce(() => { view.q = S(q.value); MS.app.render(); }, 200));
    if (!tab) return;

    ui.on(host, '[data-act="rename-tab"]', 'click', () => renameTab(tab));
    ui.on(host, '[data-act="del-tab"]', 'click', () => deleteTab(tab));
    ui.on(host, '[data-act="add-col"]', 'click', () => addCol(tab));
    ui.on(host, '[data-act="add-row"]', 'click', () => addRow(tab));
    ui.on(host, '[data-act="export"]', 'click', () => exportCsv(tab));
    ui.on(host, '[data-col-left]', 'click', (e, el) => moveCol(tab, el.dataset.colLeft, -1));
    ui.on(host, '[data-col-right]', 'click', (e, el) => moveCol(tab, el.dataset.colRight, 1));
    ui.on(host, '[data-col-rename]', 'click', (e, el) => renameCol(tab, el.dataset.colRename));
    ui.on(host, '[data-col-del]', 'click', (e, el) => deleteCol(tab, el.dataset.colDel));
    ui.on(host, '[data-row-del]', 'click', (e, el) => deleteRow(tab, el.dataset.rowDel));

    // Enregistrement a la sortie de la case.
    ui.on(host, '.cell-input', 'change', (e, el) => saveCell(tab, el));
    // Entree passe a la case suivante : indispensable quand on remplit trente lignes.
    ui.on(host, '.cell-input', 'keydown', (e, el) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      saveCell(tab, el);
      const inputs = ui.$$('.cell-input', host);
      const idx = inputs.indexOf(el);
      const cols = A(tab.cols).length + 1;
      const next = inputs[idx + cols] || inputs[idx + 1];
      if (next) { next.focus(); if (next.select) next.select(); }
    });
  }

  function saveCell(tab, el) {
    const value = S(el.value);
    if (el.dataset.model !== undefined) {
      const row = A(tab.rows).find((r) => S(r.id) === S(el.dataset.model));
      if (!row) return;
      if (S(row.model) === value) return;
      row.model = value || row.model;
      el.value = row.model;
    } else {
      const [rowId, colId] = S(el.dataset.cell).split('|');
      const row = A(tab.rows).find((r) => S(r.id) === rowId);
      if (!row) return;
      if (S(O(row.cells)[colId]) === value) return;
      row.cells = O(row.cells);
      row.cells[colId] = value;
    }
    store.save({ reason: 'pricing', silent: true });
  }

  async function addTab() {
    const name = await ui.prompt({ title: 'Nouvel onglet', label: 'Marque ou famille', confirmLabel: 'Créer' });
    if (name === null) return;
    const clean = S(name).trim();
    if (!clean) { ui.toast('Donnez un nom à l’onglet.', 'info'); return; }
    const tab = { id: uid('tab'), name: clean, cols: [
      { id: uid('col'), name: 'Écran' }, { id: uid('col'), name: 'Batterie' }, { id: uid('col'), name: 'Connecteur' },
    ], rows: [] };
    store.state.pricing = model.normPricing({ tabs: tabs().concat([tab]) });
    view.tabId = tab.id;
    store.log('Onglet tarifaire créé', clean, 'tags');
    store.save({ reason: 'pricing' });
    MS.app.render();
  }

  async function renameTab(tab) {
    const name = await ui.prompt({ title: 'Renommer l’onglet', label: 'Nom', value: tab.name, confirmLabel: 'Renommer' });
    if (name === null || !S(name).trim()) return;
    tab.name = S(name).trim();
    store.save({ reason: 'pricing' });
    MS.app.render();
  }

  async function deleteTab(tab) {
    const ok = await ui.confirm({
      title: 'Supprimer l’onglet', danger: true, confirmLabel: 'Supprimer',
      message: 'Supprimer « ' + tab.name + ' » et tous ses tarifs ?',
      detail: A(tab.rows).length + ' modèle(s) seront perdus.',
    });
    if (!ok) return;
    store.state.pricing = { tabs: tabs().filter((t) => S(t.id) !== S(tab.id)) };
    view.tabId = '';
    store.log('Onglet tarifaire supprimé', tab.name, 'trash');
    store.save({ reason: 'pricing' });
    MS.app.render();
  }

  async function addCol(tab) {
    const name = await ui.prompt({ title: 'Nouvelle colonne', label: 'Type d’intervention', confirmLabel: 'Ajouter' });
    if (name === null || !S(name).trim()) return;
    const col = { id: uid('col'), name: S(name).trim() };
    tab.cols = A(tab.cols).concat([col]);
    A(tab.rows).forEach((r) => { r.cells = O(r.cells); r.cells[col.id] = ''; });
    store.save({ reason: 'pricing' });
    MS.app.render();
  }

  async function renameCol(tab, colId) {
    const col = A(tab.cols).find((c) => S(c.id) === S(colId));
    if (!col) return;
    const name = await ui.prompt({ title: 'Renommer la colonne', label: 'Nom', value: col.name, confirmLabel: 'Renommer' });
    if (name === null || !S(name).trim()) return;
    col.name = S(name).trim();
    store.save({ reason: 'pricing' });
    MS.app.render();
  }

  function moveCol(tab, colId, delta) {
    const cols = A(tab.cols);
    const idx = cols.findIndex((c) => S(c.id) === S(colId));
    const next = idx + delta;
    if (idx < 0 || next < 0 || next >= cols.length) return;
    const [col] = cols.splice(idx, 1);
    cols.splice(next, 0, col);
    tab.cols = cols;
    store.save({ reason: 'pricing' });
    MS.app.render();
  }

  async function deleteCol(tab, colId) {
    const col = A(tab.cols).find((c) => S(c.id) === S(colId));
    if (!col) return;
    const ok = await ui.confirm({
      title: 'Supprimer la colonne', danger: true, confirmLabel: 'Supprimer',
      message: 'Supprimer la colonne « ' + col.name + ' » ?',
      detail: 'Les tarifs de cette colonne seront perdus pour tous les modèles.',
    });
    if (!ok) return;
    tab.cols = A(tab.cols).filter((c) => S(c.id) !== S(colId));
    A(tab.rows).forEach((r) => { r.cells = O(r.cells); delete r.cells[colId]; });
    store.save({ reason: 'pricing' });
    MS.app.render();
  }

  async function addRow(tab) {
    const name = await ui.prompt({ title: 'Nouveau modèle', label: 'Modèle d’appareil', confirmLabel: 'Ajouter' });
    if (name === null || !S(name).trim()) return;
    const cells = {};
    A(tab.cols).forEach((c) => { cells[c.id] = ''; });
    tab.rows = A(tab.rows).concat([{ id: uid('row'), model: S(name).trim(), cells }]);
    store.save({ reason: 'pricing' });
    MS.app.render();
  }

  async function deleteRow(tab, rowId) {
    const row = A(tab.rows).find((r) => S(r.id) === S(rowId));
    if (!row) return;
    const ok = await ui.confirm({
      title: 'Supprimer le modèle', danger: true, confirmLabel: 'Supprimer',
      message: 'Supprimer la ligne « ' + row.model + ' » ?',
    });
    if (!ok) return;
    tab.rows = A(tab.rows).filter((r) => S(r.id) !== S(rowId));
    store.save({ reason: 'pricing' });
    MS.app.render();
  }

  function exportCsv(tab) {
    const cols = A(tab.cols);
    const rows = [['Modèle'].concat(cols.map((c) => c.name))];
    A(tab.rows).forEach((r) => rows.push([r.model].concat(cols.map((c) => S(O(r.cells)[c.id])))));
    ui.exportCsv('tarifs-' + norm(tab.name).replace(/\s+/g, '-') + '-' + dayKey(new Date()) + '.csv', rows);
  }

  MS.screens.pricing = { render, view };
})();
