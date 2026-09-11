/* ============================================================
   12 — Stock
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { S, N, I, M, A, O, esc, norm, fmtDate, dayKey } = MS.util;
  const ui = MS.ui, store = MS.store, model = MS.model, ops = MS.ops, stats = MS.stats;

  const view = { q: '', category: '', sort: 'recent' };

  const SORTS = [
    { value: 'recent', label: 'Plus récents' },
    { value: 'name', label: 'Nom (A → Z)' },
    { value: 'qty', label: 'Quantité croissante' },
    { value: 'price', label: 'Prix décroissant' },
  ];

  function filtered() {
    const settings = O(store.state.settings);
    const q = norm(view.q);
    const cat = S(view.category);
    let list = A(store.state.products).filter((p) => {
      if (cat && S(p.category) !== cat) return false;
      if (!q) return true;
      const hay = norm([p.name, p.ref, p.supplier, p.category, p.condition, p.variant, p.notes].join(' '));
      return hay.indexOf(q) > -1;
    });
    const by = {
      recent: (a, b) => (S(b.createdAt) > S(a.createdAt) ? 1 : -1),
      name: (a, b) => norm(a.name).localeCompare(norm(b.name)),
      qty: (a, b) => I(a.qty, 0, 0) - I(b.qty, 0, 0),
      price: (a, b) => M(b.price, 0) - M(a.price, 0),
    };
    return list.sort(by[view.sort] || by.recent);
  }

  function render(host) {
    const st = stats.stockStats();
    const list = filtered();
    host.innerHTML =
      '<div class="grid stats-grid">'
      + ui.statCard('Articles en stock', String(st.units), 'unités', 'primary')
      + ui.statCard('Références', String(st.refs), '', 'neutral')
      + ui.statCard('Stock faible', String(st.low), 'sous le seuil', st.low ? 'warn' : 'good')
      + ui.statCard('Ruptures', String(st.out), 'à zéro', st.out ? 'bad' : 'good')
      + '</div>'
      + '<section class="card filters"><div class="filter-row">'
      + '<label class="field grow"><span>Rechercher</span>'
      + '<input data-keep="stock-q" id="stock-q" value="' + esc(view.q) + '" placeholder="Nom, référence, IMEI, catégorie, fournisseur, état…"></label>'
      + '<label class="field inline"><span>Catégorie</span><select data-keep="stock-cat" id="stock-cat">'
      + '<option value="">Toutes</option>' + ui.selectOptions(model.CATEGORIES, view.category) + '</select></label>'
      + '<label class="field inline"><span>Tri</span><select data-keep="stock-sort" id="stock-sort">'
      + ui.selectOptions(SORTS, view.sort) + '</select></label>'
      + '</div><div class="filter-row">'
      + '<button type="button" class="btn primary" data-act="new">' + ui.icon('plus') + ' Nouvel article</button>'
      + '<button type="button" class="btn small" data-act="export">' + ui.icon('download') + ' Export CSV</button>'
      + '</div></section>'
      + tableHtml(list);
    bind(host, list);
  }

  function tableHtml(list) {
    if (!list.length) {
      return '<section class="card">'
        + ui.empty(A(store.state.products).length ? 'Aucun article ne correspond à cette recherche.' : 'Le stock est vide.',
          '<button type="button" class="btn primary" data-act="new">Ajouter un article</button>')
        + '</section>';
    }
    const settings = O(store.state.settings);
    return '<section class="card"><div class="table-wrap"><table class="table stock-table">'
      + '<thead><tr>'
      + '<th class="col-name">Produit</th><th class="col-cat">Catégorie</th><th class="col-price num">Prix</th>'
      + '<th class="col-qty num">Quantité</th><th class="col-state">État</th><th class="col-min num">Seuil</th>'
      + '<th class="col-sup">Fournisseur</th><th class="col-act">Actions</th>'
      + '</tr></thead><tbody>'
      + list.map((p) => rowHtml(p, settings)).join('')
      + '</tbody></table></div></section>';
  }

  function rowHtml(p, settings) {
    const level = model.stockLevel(p, settings);
    const qty = I(p.qty, 0, 0);
    const kind = level === 'out' ? 'bad' : level === 'low' ? 'warn' : 'good';
    return '<tr data-id="' + esc(p.id) + '" class="lvl-' + level + '">'
      + '<td class="col-name" data-label="Produit"><span class="cell-main">' + esc(p.name) + '</span>'
      + (p.variant ? '<span class="cell-sub">' + esc(p.variant) + '</span>' : '')
      // Le contenu des colonnes effacees se replie sous le nom : rien n'est perdu.
      + ui.foldout([
        { label: 'Catégorie', value: p.category },
        { label: 'Prix', value: ui.money(p.price) },
        { label: 'Seuil', value: I(p.minQty, 0, 0) ? String(p.minQty) : 'général (' + I(settings.lowStock, 2, 0) + ')' },
        { label: 'Fournisseur', value: p.supplier },
        { label: 'Réf.', value: p.ref },
        { label: 'État', value: p.condition },
      ]) + '</td>'
      + '<td class="col-cat" data-label="Catégorie">' + esc(p.category) + '</td>'
      + '<td class="col-price num" data-label="Prix">' + esc(ui.money(p.price)) + '</td>'
      + '<td class="col-qty num" data-label="Quantité"><b class="qty qty-' + level + '">' + qty + '</b></td>'
      + '<td class="col-state" data-label="État">' + ui.badge(model.STOCK_LEVEL_LABEL[level], kind) + '</td>'
      + '<td class="col-min num" data-label="Seuil">' + (I(p.minQty, 0, 0) || '—') + '</td>'
      + '<td class="col-sup" data-label="Fournisseur">' + esc(p.supplier || '—') + '</td>'
      + '<td class="col-act" data-label="Actions"><div class="row-btns">'
      + '<button type="button" class="icon-btn" data-act="inc" title="Ajouter une unité" aria-label="Ajouter une unité">' + ui.icon('plus') + '</button>'
      + '<button type="button" class="icon-btn" data-act="dec"' + (qty <= 0 ? ' disabled' : '') + ' title="Retirer une unité" aria-label="Retirer une unité">' + ui.icon('minus') + '</button>'
      + '<button type="button" class="icon-btn" data-act="edit" title="Modifier" aria-label="Modifier">' + ui.icon('edit') + '</button>'
      + '<button type="button" class="icon-btn danger-ghost" data-act="del" title="Supprimer" aria-label="Supprimer">' + ui.icon('trash') + '</button>'
      + '</div></td></tr>';
  }

  function bind(host, list) {
    const q = ui.$('#stock-q', host);
    if (q) q.addEventListener('input', MS.util.debounce(() => { view.q = S(q.value); MS.app.render(); }, 180));
    const cat = ui.$('#stock-cat', host);
    if (cat) cat.addEventListener('change', () => { view.category = S(cat.value); MS.app.render(); });
    const sort = ui.$('#stock-sort', host);
    if (sort) sort.addEventListener('change', () => { view.sort = S(sort.value); MS.app.render(); });

    ui.on(host, '[data-act="new"]', 'click', () => openForm());
    ui.on(host, '[data-act="export"]', 'click', () => exportCsv(list));
    ui.on(host, '[data-act="inc"]', 'click', (e, el) => {
      const id = el.closest('tr').dataset.id;
      ops.adjustStock(id, 1);
      MS.app.render();
    });
    ui.on(host, '[data-act="dec"]', 'click', (e, el) => {
      const id = el.closest('tr').dataset.id;
      ops.adjustStock(id, -1);
      MS.app.render();
    });
    ui.on(host, '[data-act="edit"]', 'click', (e, el) => openForm(el.closest('tr').dataset.id));
    ui.on(host, '[data-act="del"]', 'click', async (e, el) => {
      const id = el.closest('tr').dataset.id;
      const product = ops.findProduct(id);
      if (!product) return;
      const ok = await ui.confirm({
        title: 'Supprimer l’article', danger: true, confirmLabel: 'Supprimer',
        message: 'Supprimer « ' + product.name +' » du stock ?',
        detail: 'Les ventes et réparations déjà enregistrées conservent leur trace.',
      });
      if (!ok) return;
      ops.deleteProduct(id);
      ui.toast('Article supprimé.', 'success');
      MS.app.render();
    });
  }

  /* -------------------- Fiche article -------------------- */

  function openForm(id, preset) {
    const product = id ? ops.findProduct(id) : null;
    const p = product || model.normProduct(O(preset), A(store.state.products).length);
    const m = ui.modal({
      title: product ? 'Modifier l’article' : 'Nouvel article',
      body: '<form id="product-form" class="form-grid">'
        + '<label class="field wide"><span>Nom *</span><input name="name" value="' + esc(p.name) + '" required autofocus></label>'
        + '<label class="field"><span>Catégorie</span><select name="category">' + ui.selectOptions(model.CATEGORIES, p.category) + '</select></label>'
        + '<label class="field"><span>État</span><select name="condition">' + ui.selectOptions(model.CONDITIONS, p.condition) + '</select></label>'
        + '<label class="field"><span>Référence / IMEI</span><input name="ref" value="' + esc(p.ref) + '"></label>'
        + '<label class="field"><span>Variante</span><input name="variant" value="' + esc(p.variant) + '" placeholder="Couleur, capacité…"></label>'
        + '<label class="field"><span>Fournisseur</span><input name="supplier" value="' + esc(p.supplier) + '"></label>'
        + '<label class="field"><span>Quantité</span><input name="qty" inputmode="numeric" value="' + esc(String(I(p.qty, 0, 0))) + '"></label>'
        + '<label class="field"><span>Seuil d’alerte</span><input name="minQty" inputmode="numeric" value="' + esc(String(I(p.minQty, 0, 0))) + '" placeholder="0 = seuil général"></label>'
        + '<label class="field"><span>Prix d’achat</span><input name="cost" inputmode="decimal" value="' + esc(String(M(p.cost, 0))) + '"></label>'
        + '<label class="field"><span>Prix de vente</span><input name="price" inputmode="decimal" value="' + esc(String(M(p.price, 0))) + '"></label>'
        + '<label class="field wide"><span>Notes</span><textarea name="notes" rows="2">' + esc(p.notes) + '</textarea></label>'
        + '</form>',
      footer: '<button type="button" class="btn ghost" data-close>Annuler</button>'
        + '<button type="button" class="btn primary" data-act="save">Enregistrer</button>',
    });
    if (!m) return;
    const submit = () => {
      const form = ui.$('#product-form', m.el);
      const data = Object.fromEntries(new FormData(form).entries());
      if (product) data.id = product.id;
      const res = ops.saveProduct(data);
      if (!res.ok) { ui.toast(res.error, 'error'); return; }
      m.close();
      ui.toast(product ? 'Article modifié.' : 'Article ajouté.', 'success');
      MS.app.render();
    };
    ui.on(m.el, '[data-act="save"]', 'click', submit);
    ui.$('#product-form', m.el).addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  }

  /* -------------------- Reapprovisionnement -------------------- */

  function openRestock(id) {
    const product = ops.findProduct(id);
    if (!product) { ui.toast('Article introuvable.', 'error'); return; }
    const m = ui.modal({
      title: 'Réapprovisionner',
      size: 'sm',
      body: '<p class="lead">' + esc(product.name) + '</p>'
        + '<p class="muted">Stock actuel : <b>' + I(product.qty, 0, 0) + '</b></p>'
        + '<form id="restock-form"><label class="field"><span>Quantité à ajouter</span>'
        + '<input name="qty" inputmode="numeric" value="1" autofocus></label>'
        + '<div class="chips">' + [1, 2, 5, 10, 20, 50].map((n) =>
          '<button type="button" class="chip" data-quick="' + n + '">+' + n + '</button>').join('') + '</div></form>',
      footer: '<button type="button" class="btn ghost" data-close>Annuler</button>'
        + '<button type="button" class="btn primary" data-act="ok">Ajouter au stock</button>',
    });
    if (!m) return;
    const input = () => ui.$('input[name="qty"]', m.el);
    ui.on(m.el, '[data-quick]', 'click', (e, el) => { input().value = el.dataset.quick; });
    const submit = () => {
      const n = I(input().value, 0, 0);
      if (n <= 0) { ui.toast('Saisissez une quantité supérieure à zéro.', 'info'); return; }
      ops.adjustStock(product.id, n);
      m.close();
      ui.toast(product.name + ' : +' + n + ' en stock.', 'success');
      MS.app.render();
    };
    ui.on(m.el, '[data-act="ok"]', 'click', submit);
    ui.$('#restock-form', m.el).addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  }

  function exportCsv(list) {
    const settings = O(store.state.settings);
    const rows = [['Produit', 'Variante', 'Catégorie', 'État', 'Référence', 'Fournisseur', 'Quantité', 'Seuil', 'Prix achat', 'Prix vente', 'Niveau', 'Créé le']];
    A(list).forEach((p) => rows.push([
      p.name, p.variant, p.category, p.condition, p.ref, p.supplier,
      String(I(p.qty, 0, 0)), String(I(p.minQty, 0, 0)),
      M(p.cost, 0).toFixed(2), M(p.price, 0).toFixed(2),
      model.STOCK_LEVEL_LABEL[model.stockLevel(p, settings)], fmtDate(p.createdAt),
    ]));
    ui.exportCsv('stock-' + dayKey(new Date()) + '.csv', rows);
  }

  MS.screens.stock = { render, openForm, openRestock, view };
})();
