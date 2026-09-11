/* ============================================================
   14 — Réparations : liste et formulaire de fiche
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { S, I, M, A, O, esc, norm, digits, fmtDate, fmtAgo, dayKey } = MS.util;
  const ui = MS.ui, store = MS.store, model = MS.model, ops = MS.ops;

  const view = { q: '', status: '' };

  function statusKind(status) {
    if (S(status) === 'Livré') return 'done';
    if (S(status) === 'Terminé') return 'good';
    if (S(status) === 'Attente pièces') return 'warn';
    if (S(status) === 'En réparation') return 'info';
    return 'neutral';
  }

  function filtered() {
    const q = norm(view.q);
    const qd = digits(view.q);
    return A(store.state.repairs).filter((r) => {
      if (view.status && S(r.status) !== view.status) return false;
      if (!q) return true;
      const hay = norm([r.number, r.device, r.issue, r.imei, r.clientName, r.notes, r.deviceState].join(' '));
      if (hay.indexOf(q) > -1) return true;
      if (qd.length >= 2 && digits(r.clientPhone).indexOf(qd) > -1) return true;
      if (qd.length >= 2 && digits(r.imei).indexOf(qd) > -1) return true;
      return false;
    });
  }

  function render(host) {
    const list = filtered();
    const counts = {};
    A(store.state.repairs).forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });

    host.innerHTML =
      '<section class="card filters"><div class="filter-row">'
      + '<label class="field grow"><span>Rechercher</span>'
      + '<input data-keep="rep-q" id="rep-q" value="' + esc(view.q) + '" placeholder="Numéro, appareil, panne, IMEI, client, téléphone…"></label>'
      + '<button type="button" class="btn primary" data-act="new">' + ui.icon('plus') + ' Nouvelle réparation</button>'
      + '</div><div class="chips" role="group" aria-label="Statut">'
      + '<button type="button" class="chip' + (view.status ? '' : ' on') + '" data-status="">Tous ('
      + A(store.state.repairs).length + ')</button>'
      + model.REPAIR_STATUSES.map((s) => '<button type="button" class="chip' + (view.status === s ? ' on' : '') + '" data-status="' + esc(s) + '">'
        + esc(s) + ' (' + (counts[s] || 0) + ')</button>').join('')
      + '</div></section>'
      + listHtml(list);

    const q = ui.$('#rep-q', host);
    if (q) q.addEventListener('input', MS.util.debounce(() => { view.q = S(q.value); MS.app.render(); }, 180));
    ui.on(host, '[data-status]', 'click', (e, el) => { view.status = S(el.dataset.status); MS.app.render(); });
    ui.on(host, '[data-act="new"]', 'click', () => openForm());
  }

  function listHtml(list) {
    if (!list.length) {
      return '<section class="card">' + ui.empty(
        A(store.state.repairs).length ? 'Aucune fiche ne correspond à cette recherche.' : 'Aucune réparation enregistrée.',
        '<button type="button" class="btn primary" data-act="new">Créer une fiche</button>') + '</section>';
    }
    return '<section class="card"><div class="table-wrap"><table class="table repairs-table"><thead><tr>'
      + '<th>N°</th><th>Client</th><th>Appareil</th><th>Panne</th><th>Statut</th><th class="num">Reste dû</th><th class="col-act">Actions</th>'
      + '</tr></thead><tbody>'
      + list.map((r) => {
        const balance = model.repairBalance(r);
        return '<tr data-id="' + esc(r.id) + '">'
          + '<td data-label="N°"><a class="cell-main link" href="#/repair/' + esc(r.id) + '">' + esc(r.number) + '</a>'
          + '<span class="cell-sub">' + esc(fmtDate(r.createdAt)) + '</span>'
          + ui.foldout([
            { label: 'Client', value: r.clientName || 'Passage' },
            { label: 'Tél.', value: r.clientPhone },
            { label: 'Appareil', value: r.device },
            { label: 'Panne', value: r.issue },
            { label: 'Reste dû', value: ui.money(balance) },
          ]) + '</td>'
          + '<td data-label="Client">' + esc(r.clientName || 'Client de passage')
          + (r.clientPhone ? '<span class="cell-sub">' + esc(r.clientPhone) + '</span>' : '') + '</td>'
          + '<td data-label="Appareil">' + esc(r.device || '—') + (r.imei ? '<span class="cell-sub">IMEI ' + esc(r.imei) + '</span>' : '') + '</td>'
          + '<td data-label="Panne" class="col-issue">' + esc(r.issue || '—') + '</td>'
          + '<td data-label="Statut">' + ui.badge(r.status, statusKind(r.status)) + '</td>'
          + '<td data-label="Reste dû" class="num">' + esc(ui.money(balance)) + '</td>'
          + '<td class="col-act" data-label="Actions"><div class="row-btns">'
          + '<a class="icon-btn" href="#/repair/' + esc(r.id) + '" aria-label="Ouvrir la fiche">' + ui.icon('doc') + '</a>'
          + '<button type="button" class="icon-btn" data-act="edit" aria-label="Modifier">' + ui.icon('edit') + '</button>'
          + '</div></td></tr>';
      }).join('')
      + '</tbody></table></div></section>';
  }

  /* ---------------------------------------------------------
     Formulaire de fiche (creation et modification)
     --------------------------------------------------------- */

  function openForm(id) {
    const repair = id ? ops.findRepair(id) : null;
    const r = repair || model.normRepair({}, A(store.state.repairs).length);
    const draft = {
      clientId: S(r.clientId),
      clientName: S(r.clientName),
      clientPhone: S(r.clientPhone),
    };

    const m = ui.modal({
      title: repair ? 'Modifier ' + r.number : 'Nouvelle réparation',
      size: 'lg',
      body: '<form id="repair-form" class="form-grid">'
        + clientPickerHtml(draft)
        + '<label class="field"><span>Appareil *</span><input name="device" id="rep-device" value="' + esc(r.device) + '" placeholder="Ex. iPhone 13 Pro" required></label>'
        + '<label class="field"><span>IMEI / n° de série</span><input name="imei" value="' + esc(r.imei) + '"></label>'
        + '<label class="field wide"><span>Panne déclarée *</span><input name="issue" value="' + esc(r.issue) + '" placeholder="Ex. écran cassé, ne charge plus" required></label>'
        + '<label class="field wide"><span>État constaté à la réception</span><textarea name="deviceState" rows="2" placeholder="Rayures, coque absente, vitre arrière fêlée…">' + esc(r.deviceState) + '</textarea></label>'
        + '<label class="field"><span>Code de déverrouillage</span><input name="passcode" value="' + esc(r.passcode) + '"></label>'
        + '<label class="field"><span>Statut</span><select name="status">' + ui.selectOptions(model.REPAIR_STATUSES, r.status) + '</select></label>'
        + '<label class="field"><span>Prix estimé</span><input name="price" inputmode="decimal" id="rep-price" value="' + esc(String(M(r.price, 0))) + '"></label>'
        + '<label class="field"><span>Acompte</span><input name="deposit" inputmode="decimal" value="' + esc(String(M(r.deposit, 0))) + '"></label>'
        + '<div class="field wide"><span class="field-label">Tarif de la grille</span>'
        + '<div id="tariff-zone" class="tariff-zone"><p class="muted">Saisissez l’appareil pour voir les tarifs correspondants.</p></div></div>'
        + '<label class="field wide"><span>Notes internes</span><textarea name="notes" rows="2">' + esc(r.notes) + '</textarea></label>'
        + '</form>',
      footer: '<button type="button" class="btn ghost" data-close>Annuler</button>'
        + '<button type="button" class="btn primary" data-act="save">' + (repair ? 'Enregistrer' : 'Créer la fiche') + '</button>',
    });
    if (!m) return;

    mountClientPicker(m.el, draft);
    mountTariff(m.el);

    const submit = () => {
      const form = ui.$('#repair-form', m.el);
      const data = Object.fromEntries(new FormData(form).entries());
      data.clientId = draft.clientId;
      data.clientName = S(data.clientQuery !== undefined ? draft.clientName : draft.clientName);
      data.clientPhone = draft.clientPhone;
      delete data.clientQuery;
      const res = repair ? ops.updateRepair(repair.id, data) : ops.createRepair(data);
      if (!res.ok) { ui.toast(res.error, 'error'); return; }
      m.close();
      ui.toast(repair ? 'Fiche mise à jour.' : 'Fiche ' + res.repair.number + ' créée.', 'success');
      if (!repair) MS.app.go('repair/' + res.repair.id);
      else MS.app.render();
    };
    ui.on(m.el, '[data-act="save"]', 'click', submit);
    ui.$('#repair-form', m.el).addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  }

  /* -------------------- Recherche de client integree -------------------- */

  function clientPickerHtml(draft) {
    const attached = draft.clientId ? ops.findClient(draft.clientId) : null;
    return '<div class="field wide client-picker">'
      + '<span class="field-label">Client</span>'
      + '<div class="picker-row">'
      + '<input id="client-q" name="clientQuery" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="client-results"'
      + ' value="' + esc(attached ? attached.name : draft.clientName) + '" placeholder="Nom, prénom ou téléphone…">'
      + '<button type="button" class="btn small ghost" id="client-detach"' + (attached ? '' : ' hidden') + '>Détacher</button>'
      + '<button type="button" class="btn small" id="client-create">' + ui.icon('plus') + ' Nouveau client</button>'
      + '</div>'
      + '<div id="client-state" class="picker-state">' + pickerStateHtml(draft) + '</div>'
      + '<ul id="client-results" class="picker-results" role="listbox" hidden></ul>'
      + '</div>';
  }

  function pickerStateHtml(draft) {
    const attached = draft.clientId ? ops.findClient(draft.clientId) : null;
    if (attached) {
      return '<span class="pill-ok">' + ui.icon('check') + ' Fiche rattachée : <b>' + esc(attached.name) + '</b>'
        + (attached.phone ? ' — ' + esc(attached.phone) : '')
        + ' · ' + ops.countRepairs(attached.id) + ' réparation(s)</span>';
    }
    if (S(draft.clientName)) {
      return '<span class="pill-info">Client de passage : <b>' + esc(draft.clientName) + '</b>'
        + (draft.clientPhone ? ' — ' + esc(draft.clientPhone) : '') + '</span>';
    }
    return '<span class="muted">Aucun client rattaché. Le texte saisi devient le nom du client de passage.</span>';
  }

  function mountClientPicker(root, draft) {
    const input = ui.$('#client-q', root);
    const results = ui.$('#client-results', root);
    const stateEl = ui.$('#client-state', root);
    const detach = ui.$('#client-detach', root);
    if (!input || !results) return;
    let items = [];
    let active = -1;

    const refreshState = () => {
      stateEl.innerHTML = pickerStateHtml(draft);
      if (detach) detach.hidden = !draft.clientId;
    };

    const closeList = () => {
      results.hidden = true;
      results.innerHTML = '';
      input.setAttribute('aria-expanded', 'false');
      active = -1;
    };

    const paint = () => {
      if (!items.length) { closeList(); return; }
      results.innerHTML = items.map((hit, i) =>
        '<li role="option" id="cli-opt-' + i + '" class="picker-item' + (i === active ? ' active' : '') + '" data-idx="' + i + '" aria-selected="' + (i === active) + '">'
        + '<span class="pi-name">' + esc(hit.client.name) + '</span>'
        + '<span class="pi-phone">' + esc(hit.client.phone || '—') + '</span>'
        + '<span class="pi-count">' + hit.repairs + ' rép.</span></li>').join('');
      results.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    };

    const choose = (i) => {
      const hit = items[i];
      if (!hit) return;
      draft.clientId = hit.client.id;
      draft.clientName = hit.client.name;
      draft.clientPhone = hit.client.phone;
      input.value = hit.client.name;
      closeList();
      refreshState();
    };

    input.addEventListener('input', () => {
      const value = S(input.value);
      // Ne jamais bloquer : le texte saisi devient le nom du client de passage.
      if (draft.clientId) draft.clientId = '';
      draft.clientName = value;
      draft.clientPhone = '';
      items = ops.searchClients(value, 8);
      active = items.length ? 0 : -1;
      paint();
      refreshState();
    });

    input.addEventListener('keydown', (e) => {
      if (results.hidden) {
        if (e.key === 'ArrowDown') { items = ops.searchClients(S(input.value), 8); active = 0; paint(); e.preventDefault(); }
        return;
      }
      if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); paint(); e.preventDefault(); }
      else if (e.key === 'Enter') { if (active > -1) { choose(active); e.preventDefault(); } }
      else if (e.key === 'Escape') { closeList(); }
    });

    input.addEventListener('blur', () => setTimeout(closeList, 150));
    ui.on(results, '.picker-item', 'mousedown', (e, el) => { e.preventDefault(); choose(I(el.dataset.idx, 0, 0)); });

    if (detach) detach.addEventListener('click', () => {
      // Detache la fiche sans effacer le nom.
      draft.clientId = '';
      draft.clientName = S(input.value);
      refreshState();
      input.focus();
    });

    const createBtn = ui.$('#client-create', root);
    if (createBtn) createBtn.addEventListener('click', () => {
      MS.screens.clients.openForm(null, { name: S(input.value) }, (client) => {
        draft.clientId = client.id;
        draft.clientName = client.name;
        draft.clientPhone = client.phone;
        input.value = client.name;
        refreshState();
      });
    });

    refreshState();
  }

  /* -------------------- Reprise d'un tarif depuis la grille -------------------- */

  function mountTariff(root) {
    const device = ui.$('#rep-device', root);
    const zone = ui.$('#tariff-zone', root);
    const price = ui.$('#rep-price', root);
    if (!device || !zone) return;

    const refresh = () => {
      const value = S(device.value).trim();
      if (!value) { zone.innerHTML = '<p class="muted">Saisissez l’appareil pour voir les tarifs correspondants.</p>'; return; }
      const hit = ops.findPricing(value);
      if (!hit) {
        // Un appareil absent de la grille le dit au lieu de deviner.
        zone.innerHTML = '<p class="muted">' + ui.icon('alert') + ' Aucun tarif pour « ' + esc(value) + ' » dans les grilles. '
          + '<a href="#/pricing" data-close>Compléter la grille</a></p>';
        return;
      }
      zone.innerHTML = '<p class="muted">Grille <b>' + esc(hit.tab.name) + '</b> — modèle <b>' + esc(hit.row.model) + '</b></p>'
        + '<div class="chips">' + hit.prices.map((p, i) =>
          '<button type="button" class="chip tariff" data-tariff="' + i + '"><b>' + esc(p.label) + '</b> ' + esc(p.value) + '</button>').join('')
        + '</div>';
      ui.on(zone, '[data-tariff]', 'click', (e, el) => {
        const chosen = hit.prices[I(el.dataset.tariff, 0, 0)];
        if (!chosen) return;
        const n = ops.priceFromText(chosen.value);
        if (n === null) {
          ui.toast('« ' + chosen.value +' » n’est pas un montant : reportez-le à la main.', 'info', 5000);
          return;
        }
        if (price) price.value = String(n);
        ui.toast(chosen.label + ' : ' + ui.money(n) + ' reporté dans le prix estimé.', 'success');
      });
    };

    device.addEventListener('input', MS.util.debounce(refresh, 250));
    refresh();
  }

  MS.screens.repairs = { render, openForm, view, statusKind };
})();
