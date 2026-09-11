/* ============================================================
   13 — Ruptures et stock faible
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { S, I, A, O, esc } = MS.util;
  const ui = MS.ui, store = MS.store, model = MS.model, ops = MS.ops;

  function render(host) {
    const settings = O(store.state.settings);
    const products = A(store.state.products);
    const out = products.filter((p) => model.stockLevel(p, settings) === 'out');
    const low = products.filter((p) => model.stockLevel(p, settings) === 'low');

    host.innerHTML =
      '<div class="grid stats-grid">'
      + ui.statCard('Ruptures', String(out.length), 'articles à zéro', out.length ? 'bad' : 'good')
      + ui.statCard('Stock faible', String(low.length), 'sous le seuil', low.length ? 'warn' : 'good')
      + ui.statCard('Seuil général', String(I(settings.lowStock, 2, 0)), 'unités', 'neutral')
      + '</div>'
      + section('Articles à zéro', out, 'bad', 'Aucune rupture. ')
      + section('Articles sous leur seuil', low, 'warn', 'Aucun article sous son seuil.');

    ui.on(host, '[data-restock]', 'click', (e, el) => MS.screens.stock.openRestock(el.dataset.restock));
    ui.on(host, '[data-edit]', 'click', (e, el) => MS.screens.stock.openForm(el.dataset.edit));
  }

  function section(title, list, kind, emptyText) {
    if (!list.length) return '<section class="card"><h2>' + esc(title) + '</h2>' + ui.empty(emptyText) + '</section>';
    const settings = O(store.state.settings);
    return '<section class="card"><h2>' + esc(title) + ' <span class="muted">— ' + list.length + '</span></h2>'
      + '<div class="table-wrap"><table class="table"><thead><tr>'
      + '<th>Produit</th><th>Catégorie</th><th class="num">Quantité</th><th class="num">Seuil</th><th>Fournisseur</th><th class="col-act">Actions</th>'
      + '</tr></thead><tbody>'
      + list.map((p) => '<tr>'
        + '<td data-label="Produit"><span class="cell-main">' + esc(p.name) + '</span>'
        + ui.foldout([
          { label: 'Catégorie', value: p.category },
          { label: 'Seuil', value: String(model.threshold(p, settings)) },
          { label: 'Fournisseur', value: p.supplier },
        ]) + '</td>'
        + '<td data-label="Catégorie">' + esc(p.category) + '</td>'
        + '<td class="num" data-label="Quantité">' + ui.badge(String(I(p.qty, 0, 0)), kind) + '</td>'
        + '<td class="num" data-label="Seuil">' + model.threshold(p, settings) + '</td>'
        + '<td data-label="Fournisseur">' + esc(p.supplier || '—') + '</td>'
        + '<td class="col-act" data-label="Actions"><div class="row-btns">'
        + '<button type="button" class="btn small primary" data-restock="' + esc(p.id) + '">' + ui.icon('plus') + ' Réapprovisionner</button>'
        + '<button type="button" class="icon-btn" data-edit="' + esc(p.id) + '" aria-label="Modifier">' + ui.icon('edit') + '</button>'
        + '</div></td></tr>').join('')
      + '</tbody></table></div></section>';
  }

  MS.screens.alerts = { render };
})();
