/* ============================================================
   16 — Clients : liste, fiche, formulaire
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { S, I, A, O, esc, norm, digits, fmtDate, dayKey } = MS.util;
  const ui = MS.ui, store = MS.store, model = MS.model, ops = MS.ops;

  const view = { q: '' };

  function filtered() {
    const q = norm(view.q);
    const qd = digits(view.q);
    return A(store.state.clients).filter((c) => {
      if (!q) return true;
      if (norm([c.name, c.email, c.address, c.notes].join(' ')).indexOf(q) > -1) return true;
      if (qd.length >= 2 && digits(c.phone).indexOf(qd) > -1) return true;
      return false;
    }).sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  }

  function render(host) {
    const list = filtered();
    host.innerHTML =
      '<section class="card filters"><div class="filter-row">'
      + '<label class="field grow"><span>Rechercher</span>'
      + '<input data-keep="cli-q" id="cli-q" value="' + esc(view.q) + '" placeholder="Nom, téléphone, e-mail…"></label>'
      + '<button type="button" class="btn primary" data-act="new">' + ui.icon('plus') + ' Nouveau client</button>'
      + '<button type="button" class="btn small" data-act="export">' + ui.icon('download') + ' Export CSV</button>'
      + '</div></section>'
      + (list.length
        ? '<section class="card"><div class="table-wrap"><table class="table"><thead><tr>'
          + '<th>Nom</th><th>Téléphone</th><th>E-mail</th><th class="num">Réparations</th><th class="col-act">Actions</th>'
          + '</tr></thead><tbody>'
          + list.map((c) => {
            const count = ops.countRepairs(c.id);
            return '<tr data-id="' + esc(c.id) + '">'
              + '<td data-label="Nom"><a class="cell-main link" href="#/client/' + esc(c.id) + '">' + esc(c.name) + '</a>'
              + ui.foldout([
                { label: 'Tél.', value: c.phone },
                { label: 'E-mail', value: c.email },
                { label: 'Réparations', value: String(count) },
              ]) + '</td>'
              + '<td data-label="Téléphone">' + esc(c.phone || '—') + '</td>'
              + '<td data-label="E-mail">' + esc(c.email || '—') + '</td>'
              + '<td class="num" data-label="Réparations">' + count + '</td>'
              + '<td class="col-act" data-label="Actions"><div class="row-btns">'
              + '<a class="icon-btn" href="#/client/' + esc(c.id) + '" aria-label="Ouvrir la fiche">' + ui.icon('doc') + '</a>'
              + '<button type="button" class="icon-btn" data-act="edit" aria-label="Modifier">' + ui.icon('edit') + '</button>'
              + '<button type="button" class="icon-btn danger-ghost" data-act="del" aria-label="Supprimer">' + ui.icon('trash') + '</button>'
              + '</div></td></tr>';
          }).join('')
          + '</tbody></table></div></section>'
        : '<section class="card">' + ui.empty(
            A(store.state.clients).length ? 'Aucun client ne correspond.' : 'Aucun client enregistré.',
            '<button type="button" class="btn primary" data-act="new">Créer un client</button>') + '</section>');

    const q = ui.$('#cli-q', host);
    if (q) q.addEventListener('input', MS.util.debounce(() => { view.q = S(q.value); MS.app.render(); }, 180));
    ui.on(host, '[data-act="new"]', 'click', () => openForm());
    ui.on(host, '[data-act="edit"]', 'click', (e, el) => openForm(el.closest('tr').dataset.id));
    ui.on(host, '[data-act="export"]', 'click', () => exportCsv(list));
    ui.on(host, '[data-act="del"]', 'click', (e, el) => remove(el.closest('tr').dataset.id));
  }

  async function remove(id) {
    const client = ops.findClient(id);
    if (!client) return;
    const count = ops.countRepairs(id);
    const ok = await ui.confirm({
      title: 'Supprimer le client', danger: true, confirmLabel: 'Supprimer',
      message: 'Supprimer la fiche de ' + client.name + ' ?',
      detail: count ? count + ' réparation(s) resteront enregistrées, avec le nom conservé.' : '',
    });
    if (!ok) return;
    ops.deleteClient(id);
    ui.toast('Client supprimé.', 'success');
    MS.app.render();
  }

  /* -------------------- Fiche client -------------------- */

  function renderDetail(host, id) {
    const client = ops.findClient(id);
    if (!client) {
      host.innerHTML = '<div class="card"><h2>Client introuvable</h2>'
        + '<a class="btn primary" href="#/clients">Retour aux clients</a></div>';
      return;
    }
    const repairs = ops.repairsOfClient(client.id);
    const spent = A(store.state.cash).filter((op) => S(op.clientId) === S(client.id) && S(op.type) !== 'Retrait')
      .reduce((s, op) => s + MS.util.M(op.amount, 0), 0);

    host.innerHTML =
      '<div class="detail-head"><a class="btn ghost small" href="#/clients">← Clients</a>'
      + '<div class="row-btns">'
      + '<button type="button" class="btn small" data-act="edit">' + ui.icon('edit') + ' Modifier</button>'
      + '<button type="button" class="btn primary small" data-act="new-repair">' + ui.icon('wrench') + ' Nouvelle réparation</button>'
      + '</div></div>'
      + '<div class="grid cols-2">'
      + '<section class="card"><h2>' + esc(client.name) + '</h2><dl class="deflist">'
      + '<div class="def"><dt>Téléphone</dt><dd>' + (client.phone ? '<a class="link" href="tel:' + esc(client.phone.replace(/\s/g, '')) + '">' + esc(client.phone) + '</a>' : '—') + '</dd></div>'
      + '<div class="def"><dt>E-mail</dt><dd>' + (client.email ? '<a class="link" href="mailto:' + esc(client.email) + '">' + esc(client.email) + '</a>' : '—') + '</dd></div>'
      + '<div class="def"><dt>Adresse</dt><dd>' + esc(client.address || '—') + '</dd></div>'
      + '<div class="def"><dt>Notes</dt><dd>' + esc(client.notes || '—') + '</dd></div>'
      + '<div class="def"><dt>Client depuis</dt><dd>' + esc(fmtDate(client.createdAt)) + '</dd></div>'
      + '</dl></section>'
      + '<section class="card"><h2>Chiffres</h2><div class="grid stats-grid">'
      + ui.statCard('Réparations', String(repairs.length), '', 'primary', 'wrench')
      + ui.statCard('Encaissé', ui.money(spent), 'toutes opérations', 'neutral', 'euro')
      + '</div></section></div>'
      + '<section class="card"><h2>Historique des réparations</h2>'
      + (repairs.length
        ? '<div class="table-wrap"><table class="table"><thead><tr><th>N°</th><th>Date</th><th>Appareil</th><th>Panne</th><th>Statut</th><th class="num">Total</th></tr></thead><tbody>'
          + repairs.map((r) => '<tr>'
            + '<td data-label="N°"><a class="link" href="#/repair/' + esc(r.id) + '">' + esc(r.number) + '</a></td>'
            + '<td data-label="Date">' + esc(fmtDate(r.createdAt)) + '</td>'
            + '<td data-label="Appareil">' + esc(r.device) + '</td>'
            + '<td data-label="Panne">' + esc(r.issue) + '</td>'
            + '<td data-label="Statut">' + ui.badge(r.status, MS.screens.repairs.statusKind(r.status)) + '</td>'
            + '<td class="num" data-label="Total">' + esc(ui.money(model.repairTotal(r))) + '</td></tr>').join('')
          + '</tbody></table></div>'
        : ui.empty('Aucune réparation pour ce client.'))
      + '</section>';

    ui.on(host, '[data-act="edit"]', 'click', () => openForm(client.id));
    ui.on(host, '[data-act="new-repair"]', 'click', () => MS.screens.repairs.openForm());
  }

  /* -------------------- Formulaire -------------------- */

  function openForm(id, preset, onSaved) {
    const client = id ? ops.findClient(id) : null;
    const c = client || model.normClient(O(preset), A(store.state.clients).length);
    const isNew = !client;
    const m = ui.modal({
      title: client ? 'Modifier le client' : 'Nouveau client',
      body: '<form id="client-form" class="form-grid">'
        + '<label class="field wide"><span>Nom *</span><input name="name" value="' + esc(isNew ? S(O(preset).name) : c.name) + '" required autofocus></label>'
        + '<label class="field"><span>Téléphone</span><input name="phone" value="' + esc(c.phone) + '" inputmode="tel"></label>'
        + '<label class="field"><span>E-mail</span><input name="email" type="email" value="' + esc(c.email) + '"></label>'
        + '<label class="field wide"><span>Adresse</span><input name="address" value="' + esc(c.address) + '"></label>'
        + '<label class="field wide"><span>Notes</span><textarea name="notes" rows="2">' + esc(c.notes) + '</textarea></label>'
        + '<p class="form-error wide" id="client-error" role="alert"></p>'
        + '</form>',
      footer: '<button type="button" class="btn ghost" data-close>Annuler</button>'
        + '<button type="button" class="btn primary" data-act="ok">Enregistrer</button>',
    });
    if (!m) return;
    const submit = () => {
      const data = Object.fromEntries(new FormData(ui.$('#client-form', m.el)).entries());
      if (client) data.id = client.id;
      // Doublon par telephone : on previent sans bloquer.
      const phone = digits(data.phone);
      if (!client && phone.length >= 6) {
        const twin = A(store.state.clients).find((x) => digits(x.phone) === phone);
        if (twin) {
          ui.$('#client-error', m.el).textContent = 'Un client existe déjà avec ce numéro : ' + twin.name + '. Enregistrez à nouveau pour créer quand même.';
          if (!m.el.dataset.warned) { m.el.dataset.warned = '1'; return; }
        }
      }
      const res = ops.saveClient(data);
      if (!res.ok) { ui.$('#client-error', m.el).textContent = res.error; return; }
      m.close();
      ui.toast(client ? 'Client modifié.' : 'Client créé.', 'success');
      if (typeof onSaved === 'function') onSaved(res.client);
      else MS.app.render();
    };
    ui.on(m.el, '[data-act="ok"]', 'click', submit);
    ui.$('#client-form', m.el).addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  }

  function exportCsv(list) {
    const rows = [['Nom', 'Téléphone', 'E-mail', 'Adresse', 'Réparations', 'Notes', 'Créé le']];
    A(list).forEach((c) => rows.push([c.name, c.phone, c.email, c.address, String(ops.countRepairs(c.id)), c.notes, fmtDate(c.createdAt)]));
    ui.exportCsv('clients-' + dayKey(new Date()) + '.csv', rows);
  }

  MS.screens.clients = { render, openForm, view };
  MS.screens.client = { render: renderDetail };
})();
