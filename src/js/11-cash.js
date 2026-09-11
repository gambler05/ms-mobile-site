/* ============================================================
   11 — Caisse
   L'historique est un journal : une operation ne s'edite ni ne se supprime.
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { S, N, I, M, A, O, esc, fmtDate, fmtDateTime, dayKey, toDate } = MS.util;
  const ui = MS.ui, stats = MS.stats, store = MS.store, model = MS.model, ops = MS.ops;

  // Au demarrage, la carte revient sur « Encaissement ».
  const view = { mode: 'in', period: 'day', date: '', type: '', cart: [], form: {} };

  function currentRange() {
    if (view.date) {
      const d = toDate(view.date);
      return { from: MS.util.startOfDay(d), to: MS.util.endOfDay(d) };
    }
    return stats.periodRange(view.period);
  }

  function render(host) {
    const range = currentRange();
    const list = stats.cashIn(range, view.type);
    const totals = stats.totals(list);
    const outside = stats.outsideCount(range);

    host.innerHTML =
      transactionCard()
      + '<div class="grid stats-grid">'
      + ui.statCard('Total encaissé', ui.money(totals.revenue), periodLabel(), 'primary')
      + ui.statCard('Espèces', ui.money(totals.cash), '', 'neutral')
      + ui.statCard('Carte bancaire', ui.money(totals.card), '', 'neutral')
      + ui.statCard('Retraits', ui.money(totals.withdrawals), 'Déduits du total', totals.withdrawals ? 'warn' : 'neutral')
      + '</div>'
      + filtersHtml()
      + (outside
        ? '<div class="banner banner-info">' + ui.icon('clock')
          + '<span>' + outside + ' opération(s) existent en dehors de la période affichée.</span>'
          + '<button type="button" class="btn small" data-act="show-all">Tout afficher</button></div>'
        : '')
      + historyHtml(list, totals);

    bind(host, list, totals);
  }

  function periodLabel() {
    if (view.date) return 'Journée du ' + fmtDate(view.date);
    const p = stats.PERIODS.find((x) => x.id === view.period);
    return p ? p.label : '';
  }

  /* -------------------- Carte unique « Nouvelle transaction » -------------------- */

  function transactionCard() {
    const isIn = view.mode === 'in';
    return '<section class="card transaction">'
      + '<div class="card-head"><h2>Nouvelle transaction</h2>'
      + '<div class="switch" role="tablist" aria-label="Mode de transaction">'
      + '<button type="button" role="tab" aria-selected="' + (isIn ? 'true' : 'false') + '" class="switch-btn' + (isIn ? ' on' : '') + '" data-mode="in">' + ui.icon('euro') + ' Encaissement</button>'
      + '<button type="button" role="tab" aria-selected="' + (!isIn ? 'true' : 'false') + '" class="switch-btn' + (!isIn ? ' on' : '') + '" data-mode="out">' + ui.icon('minus') + ' Retrait</button>'
      + '</div></div>'
      + (isIn ? formIn() : formOut())
      + '</section>';
  }

  function formIn() {
    const f = O(view.form);
    const cartTotal = view.cart.reduce((s, i) => s + M(i.price, 0) * I(i.qty, 1, 0), 0);
    return '<form id="cash-in" class="form-grid">'
      + '<label class="field"><span>Montant</span>'
      + '<input name="amount" inputmode="decimal" data-keep="cash-amount" placeholder="0,00" value="'
      + esc(view.cart.length ? String(cartTotal).replace('.', ',') : S(f.amount)) + '"'
      + (view.cart.length ? ' readonly' : '') + '></label>'
      + '<label class="field"><span>Type</span><select name="type" data-keep="cash-type">'
      + ui.selectOptions(model.CASH_TYPES.filter((t) => t !== 'Retrait'), S(f.type) || 'Vente') + '</select></label>'
      + '<label class="field"><span>Mode de paiement</span><select name="method" data-keep="cash-method">'
      + ui.selectOptions(model.PAY_METHODS, S(f.method) || model.PAY_METHODS[0]) + '</select></label>'
      + '<label class="field wide"><span>Libellé</span><input name="label" data-keep="cash-label" value="' + esc(f.label) + '" placeholder="Ex. Coque iPhone 15"></label>'
      + '<label class="field wide"><span>Client (facultatif)</span><select name="clientId" data-keep="cash-client">'
      + '<option value="">— Client de passage —</option>'
      + ui.selectOptions(A(store.state.clients).map((c) => ({ value: c.id, label: c.name + (c.phone ? ' — ' + c.phone : '') })), S(f.clientId))
      + '</select></label>'
      + cartHtml()
      + '<div class="row-end wide"><button type="submit" class="btn primary">' + ui.icon('check') + ' Encaisser</button></div>'
      + '</form>';
  }

  function cartHtml() {
    const products = A(store.state.products);
    const total = view.cart.reduce((s, i) => s + M(i.price, 0) * I(i.qty, 1, 0), 0);
    return '<div class="cart wide">'
      + '<div class="cart-head"><h3>Panier d’articles</h3>'
      + '<div class="cart-add">'
      + '<select data-keep="cart-pick" id="cart-pick" aria-label="Article à ajouter">'
      + '<option value="">— Choisir un article du stock —</option>'
      + products.map((p) => '<option value="' + esc(p.id) + '"' + (I(p.qty, 0, 0) <= 0 ? ' disabled' : '') + '>'
        + esc(p.name) + (p.variant ? ' (' + esc(p.variant) + ')' : '') + ' — ' + esc(ui.money(p.price))
        + ' — ' + I(p.qty, 0, 0) + ' en stock</option>').join('')
      + '</select>'
      + '<button type="button" class="btn small" data-act="cart-add">' + ui.icon('plus') + ' Ajouter</button>'
      + '</div></div>'
      + (view.cart.length
        ? '<ul class="cart-list">' + view.cart.map((item, idx) => {
            const product = ops.findProduct(item.productId);
            const max = product ? I(product.qty, 0, 0) : 999;
            return '<li><span class="cart-name">' + esc(item.name) + '</span>'
              + '<span class="cart-qty"><button type="button" class="icon-btn small" data-cart-dec="' + idx + '" aria-label="Retirer un">' + ui.icon('minus') + '</button>'
              + '<b>' + I(item.qty, 1, 0) + '</b>'
              + '<button type="button" class="icon-btn small" data-cart-inc="' + idx + '"' + (I(item.qty, 1, 0) >= max ? ' disabled' : '') + ' aria-label="Ajouter un">' + ui.icon('plus') + '</button></span>'
              + '<span class="cart-price">' + esc(ui.money(M(item.price, 0) * I(item.qty, 1, 0))) + '</span>'
              + '<button type="button" class="icon-btn danger-ghost" data-cart-del="' + idx + '" aria-label="Supprimer la ligne">' + ui.icon('trash') + '</button></li>';
          }).join('') + '</ul>'
          + '<p class="cart-total">Total panier : <b>' + esc(ui.money(total)) + '</b> <span class="muted">— chaque ligne décrémente le stock.</span></p>'
        : '<p class="muted">Aucun article. Un encaissement sans panier reste possible : saisissez simplement un montant.</p>')
      + '</div>';
  }

  function formOut() {
    return '<form id="cash-out" class="form-grid">'
      + '<label class="field"><span>Montant du retrait</span>'
      + '<input name="amount" inputmode="decimal" data-keep="out-amount" placeholder="0,00" autofocus></label>'
      + '<label class="field"><span>Motif</span><input name="label" data-keep="out-label" placeholder="Ex. dépôt en banque"></label>'
      + '<p class="muted wide">Sort de la caisse en espèces, ne touche pas au stock, et vient en déduction du total encaissé.</p>'
      + '<div class="row-end wide"><button type="submit" class="btn danger">' + ui.icon('minus') + ' Enregistrer le retrait</button></div>'
      + '</form>';
  }

  /* -------------------- Filtres -------------------- */

  function filtersHtml() {
    return '<section class="card filters">'
      + '<div class="filter-row">'
      + '<div class="chips" role="group" aria-label="Période">'
      + stats.PERIODS.map((p) => '<button type="button" class="chip' + (!view.date && view.period === p.id ? ' on' : '') + '" data-period="' + esc(p.id) + '">' + esc(p.label) + '</button>').join('')
      + '</div>'
      + '<label class="field inline"><span>Journée précise</span>'
      + '<input type="date" data-keep="cash-date" id="cash-date" value="' + esc(view.date) + '"></label>'
      + (view.date ? '<button type="button" class="btn small ghost" data-act="clear-date">Effacer la date</button>' : '')
      + '</div>'
      + '<div class="filter-row">'
      + '<label class="field inline"><span>Type d’opération</span><select data-keep="cash-typef" id="cash-typef">'
      + '<option value="">Tous les types</option>' + ui.selectOptions(model.CASH_TYPES, view.type) + '</select></label>'
      + '<button type="button" class="btn small" data-act="export">' + ui.icon('download') + ' Export CSV</button>'
      + '</div></section>';
  }

  /* -------------------- Historique -------------------- */

  function historyHtml(list, totals) {
    if (!list.length) {
      return '<section class="card"><h2>Historique</h2>'
        + ui.empty('Aucune opération sur cette période.') + '</section>';
    }
    return '<section class="card"><h2>Historique <span class="muted">— ' + list.length + ' opération(s), non modifiables</span></h2>'
      + '<div class="table-wrap"><table class="table cash-table">'
      + '<thead><tr><th>Date</th><th>Type</th><th>Libellé</th><th>Mode</th><th class="num">Montant</th></tr></thead><tbody>'
      + list.map((op) => {
        const withdraw = S(op.type) === 'Retrait';
        const client = ops.findClient(op.clientId);
        const details = A(op.items).map((i) => i.name + ' ×' + i.qty).join(', ');
        return '<tr class="' + (withdraw ? 'row-withdraw' : '') + '">'
          + '<td data-label="Date">' + esc(fmtDateTime(op.date)) + '</td>'
          + '<td data-label="Type">' + ui.badge(op.type, withdraw ? 'warn' : 'neutral') + '</td>'
          + '<td data-label="Libellé"><span class="cell-main">' + esc(op.label || (withdraw ? 'Retrait de caisse' : '—')) + '</span>'
          + ui.foldout([
            { label: 'Client', value: client ? client.name : '' },
            { label: 'Articles', value: details },
            { label: 'Mode', value: op.method },
          ]) + '</td>'
          + '<td data-label="Mode">' + esc(op.method) + '</td>'
          + '<td data-label="Montant" class="num ' + (withdraw ? 'neg' : '') + '">'
          + esc((withdraw ? '−' : '') + ui.money(op.amount)) + '</td></tr>';
      }).join('')
      + '</tbody><tfoot><tr><th colspan="4">Total encaissé (retraits déduits)</th>'
      + '<td class="num"><b>' + esc(ui.money(totals.revenue - totals.withdrawals)) + '</b></td></tr></tfoot>'
      + '</table></div></section>';
  }

  /* -------------------- Interactions -------------------- */

  function bind(host, list, totals) {
    ui.on(host, '[data-mode]', 'click', (e, el) => {
      view.mode = el.dataset.mode === 'out' ? 'out' : 'in';
      MS.app.render();
    });
    ui.on(host, '[data-period]', 'click', (e, el) => {
      // Les deux filtres sont exclusifs : cliquer un bouton efface la date.
      view.period = el.dataset.period;
      view.date = '';
      MS.app.render();
    });
    ui.on(host, '[data-act="clear-date"]', 'click', () => { view.date = ''; MS.app.render(); });
    ui.on(host, '[data-act="show-all"]', 'click', () => { view.period = 'all'; view.date = ''; MS.app.render(); });

    const dateInput = ui.$('#cash-date', host);
    if (dateInput) dateInput.addEventListener('change', () => {
      // Choisir une date eteint les boutons de periode.
      view.date = S(dateInput.value);
      MS.app.render();
    });
    const typeInput = ui.$('#cash-typef', host);
    if (typeInput) typeInput.addEventListener('change', () => { view.type = S(typeInput.value); MS.app.render(); });

    ui.on(host, '[data-act="cart-add"]', 'click', () => {
      const pick = ui.$('#cart-pick', host);
      const product = ops.findProduct(pick ? pick.value : '');
      if (!product) { ui.toast('Choisissez un article du stock.', 'info'); return; }
      if (I(product.qty, 0, 0) <= 0) { ui.toast(product.name + ' est en rupture.', 'error'); return; }
      keepForm(host);
      const existing = view.cart.find((i) => S(i.productId) === S(product.id));
      if (existing) {
        if (I(existing.qty, 1, 0) >= I(product.qty, 0, 0)) { ui.toast('Stock disponible atteint pour ' + product.name + '.', 'info'); return; }
        existing.qty = I(existing.qty, 1, 0) + 1;
      } else {
        view.cart.push({ productId: product.id, name: product.name, qty: 1, price: M(product.price, 0) });
      }
      MS.app.render();
    });
    ui.on(host, '[data-cart-inc]', 'click', (e, el) => {
      const item = view.cart[I(el.dataset.cartInc, 0, 0)];
      const product = ops.findProduct(O(item).productId);
      if (item && (!product || I(item.qty, 1, 0) < I(product.qty, 0, 0))) { item.qty = I(item.qty, 1, 0) + 1; keepForm(host); MS.app.render(); }
    });
    ui.on(host, '[data-cart-dec]', 'click', (e, el) => {
      const idx = I(el.dataset.cartDec, 0, 0);
      const item = view.cart[idx];
      if (!item) return;
      item.qty = I(item.qty, 1, 0) - 1;
      if (item.qty <= 0) view.cart.splice(idx, 1);
      keepForm(host);
      MS.app.render();
    });
    ui.on(host, '[data-cart-del]', 'click', (e, el) => {
      view.cart.splice(I(el.dataset.cartDel, 0, 0), 1);
      keepForm(host);
      MS.app.render();
    });

    ui.on(host, '[data-act="export"]', 'click', () => exportCsv(list, totals));

    const formIn = ui.$('#cash-in', host);
    if (formIn) formIn.addEventListener('submit', (e) => { e.preventDefault(); submitIn(formIn); });
    const formOut = ui.$('#cash-out', host);
    if (formOut) formOut.addEventListener('submit', (e) => { e.preventDefault(); submitOut(formOut); });
  }

  /** Conserve la saisie en cours quand le panier change. */
  function keepForm(host) {
    const form = ui.$('#cash-in', host);
    if (!form) return;
    const data = new FormData(form);
    view.form = {
      amount: S(data.get('amount')), type: S(data.get('type')), method: S(data.get('method')),
      label: S(data.get('label')), clientId: S(data.get('clientId')),
    };
  }

  function submitIn(form) {
    const data = new FormData(form);
    const res = ops.recordCash({
      amount: view.cart.length ? undefined : S(data.get('amount')),
      type: S(data.get('type')),
      method: S(data.get('method')),
      label: S(data.get('label')),
      clientId: S(data.get('clientId')),
      items: view.cart.slice(),
    });
    if (!res.ok) { ui.toast(res.error, 'error'); return; }
    view.cart = [];
    view.form = {};
    // Apres un encaissement, la periode affichee doit montrer l'operation.
    if (view.date && view.date !== dayKey(new Date())) view.date = '';
    ui.toast('Encaissement enregistré : ' + ui.money(res.op.amount), 'success');
    MS.app.render();
  }

  function submitOut(form) {
    const data = new FormData(form);
    const res = ops.recordWithdraw({ amount: S(data.get('amount')), label: S(data.get('label')) });
    if (!res.ok) { ui.toast(res.error, 'error'); return; }
    ui.toast('Retrait enregistré : ' + ui.money(res.op.amount), 'success');
    // La carte reste sur « Retrait ».
    view.mode = 'out';
    MS.app.render();
  }

  function exportCsv(list, totals) {
    const rows = [['Date', 'Type', 'Libellé', 'Mode de paiement', 'Client', 'Articles', 'Montant']];
    A(list).forEach((op) => {
      const client = ops.findClient(op.clientId);
      rows.push([
        fmtDateTime(op.date), op.type, op.label, op.method,
        client ? client.name : '',
        A(op.items).map((i) => i.name + ' x' + i.qty).join(' | '),
        (S(op.type) === 'Retrait' ? '-' : '') + M(op.amount, 0).toFixed(2),
      ]);
    });
    rows.push([]);
    rows.push(['Total encaissé', '', '', '', '', '', (totals.revenue - totals.withdrawals).toFixed(2)]);
    rows.push(['dont espèces', '', '', '', '', '', totals.cash.toFixed(2)]);
    rows.push(['dont carte', '', '', '', '', '', totals.card.toFixed(2)]);
    rows.push(['Retraits', '', '', '', '', '', totals.withdrawals.toFixed(2)]);
    ui.exportCsv('caisse-' + dayKey(new Date()) + '.csv', rows);
  }

  /** Utilise par l'import : se placer sur une periode qui montre les donnees. */
  function showPeriod(period) { view.period = S(period) || 'all'; view.date = ''; }

  MS.screens.cash = { render, showPeriod, view };
})();
