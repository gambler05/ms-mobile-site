/* ============================================================
   15 — Fiche de réparation (écran de détail)
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { S, I, M, A, O, esc, fmtDate, fmtDateTime, fmtAgo } = MS.util;
  const ui = MS.ui, store = MS.store, model = MS.model, ops = MS.ops;

  function render(host, id) {
    const repair = ops.findRepair(id);
    if (!repair) {
      host.innerHTML = '<div class="card"><h2>Fiche introuvable</h2>'
        + '<p class="muted">Cette fiche n’existe plus ou le lien est erroné.</p>'
        + '<a class="btn primary" href="#/repairs">Retour aux réparations</a></div>';
      return;
    }
    const client = ops.findClient(repair.clientId);
    const balance = model.repairBalance(repair);
    const total = model.repairTotal(repair);

    host.innerHTML =
      '<div class="detail-head">'
      + '<a class="btn ghost small" href="#/repairs">← Réparations</a>'
      + '<div class="row-btns">'
      + '<button type="button" class="btn small" data-act="edit">' + ui.icon('edit') + ' Modifier</button>'
      + '<button type="button" class="btn small" data-act="ticket">' + ui.icon('print') + ' Ticket</button>'
      + '<button type="button" class="btn small" data-act="invoice">' + ui.icon('doc') + ' Facture</button>'
      + '<button type="button" class="btn primary small" data-act="finish">' + ui.icon('check') + ' Fin d’intervention</button>'
      + '<button type="button" class="icon-btn danger-ghost" data-act="delete" aria-label="Supprimer la fiche">' + ui.icon('trash') + '</button>'
      + '</div></div>'

      + '<div class="grid cols-2">'
      + '<section class="card">'
      + '<div class="card-head"><h2>' + esc(repair.number) + ' ' + ui.badge(repair.status, MS.screens.repairs.statusKind(repair.status)) + '</h2>'
      + '<span class="muted">créée le ' + esc(fmtDate(repair.createdAt)) + ' · modifiée ' + esc(fmtAgo(repair.updatedAt)) + '</span></div>'
      + '<dl class="deflist">'
      + def('Client', client
        ? '<a class="link" href="#/client/' + esc(client.id) + '">' + esc(client.name) + '</a>'
          + (client.phone ? ' — ' + esc(client.phone) : '')
        : (esc(repair.clientName || 'Client de passage') + (repair.clientPhone ? ' — ' + esc(repair.clientPhone) : '')), true)
      + def('Appareil', esc(repair.device || '—'), true)
      + def('IMEI', esc(repair.imei || '—'), true)
      + def('Panne déclarée', esc(repair.issue || '—'), true)
      + def('État à la réception', esc(repair.deviceState || '—'), true)
      + def('Code de déverrouillage', repair.passcode ? '<span class="mono">' + esc(repair.passcode) + '</span>' : '—', true)
      + def('Notes internes', esc(repair.notes || '—'), true)
      + '</dl></section>'

      + '<section class="card">'
      + '<h2>Montants</h2>'
      + '<dl class="deflist money-list">'
      + def('Prix estimé', esc(ui.money(repair.price)), true)
      + def('Pièces facturées', esc(ui.money(total - M(repair.price, 0))), true)
      + def('Total', '<b>' + esc(ui.money(total)) + '</b>', true)
      + def('Acompte versé', esc(ui.money(repair.deposit)), true)
      + def('Reste à régler', '<b class="' + (balance > 0 ? 'due' : 'paid') + '">' + esc(ui.money(balance)) + '</b>', true)
      + '</dl>'
      + '<div class="row-btns">'
      + '<button type="button" class="btn small" data-act="cash">' + ui.icon('euro') + ' Encaisser le solde</button>'
      + '<button type="button" class="btn small" data-act="sign">' + ui.icon('edit') + ' Signature client</button>'
      + '</div>'
      + (repair.signature ? '<figure class="sign-preview"><img alt="Signature du client" src="' + esc(repair.signature) + '"><figcaption class="muted">Signature recueillie</figcaption></figure>' : '')
      + (repair.invoiceNo ? '<p class="muted">Facture émise : <b>' + esc(repair.invoiceNo) + '</b></p>' : '')
      + '</section></div>'

      + '<div class="grid cols-2">'
      + statusCard(repair)
      + partsCard(repair)
      + '</div>';

    bind(host, repair);
  }

  function def(label, valueHtml, raw) {
    return '<div class="def"><dt>' + esc(label) + '</dt><dd>' + (raw ? valueHtml : esc(valueHtml)) + '</dd></div>';
  }

  function statusCard(repair) {
    return '<section class="card"><h2>Statut et historique</h2>'
      + '<div class="status-line">' + model.REPAIR_STATUSES.map((s) => {
        const done = model.REPAIR_STATUSES.indexOf(s) <= model.REPAIR_STATUSES.indexOf(repair.status);
        return '<button type="button" class="step' + (done ? ' done' : '') + (s === repair.status ? ' current' : '') + '" data-status="' + esc(s) + '">'
          + esc(s) + '</button>';
      }).join('') + '</div>'
      + '<ol class="timeline">' + A(repair.history).slice().reverse().map((h) =>
        '<li><span class="tl-dot"></span><div><b>' + esc(h.status) + '</b>'
        + '<span class="muted"> — ' + esc(fmtDateTime(h.date)) + (h.user ? ' · ' + esc(h.user) : '') + '</span>'
        + (h.note ? '<p class="muted">' + esc(h.note) + '</p>' : '') + '</div></li>').join('')
      + '</ol></section>';
  }

  function partsCard(repair) {
    const parts = A(repair.parts);
    return '<section class="card"><div class="card-head"><h2>Pièces utilisées</h2>'
      + '<button type="button" class="btn small" data-act="add-part">' + ui.icon('plus') + ' Ajouter</button></div>'
      + (parts.length
        ? '<div class="table-wrap"><table class="table parts-table"><thead><tr>'
          + '<th>Pièce</th><th class="num">Qté</th><th class="num">Prix</th><th>Stock</th><th class="col-act">Actions</th></tr></thead><tbody>'
          + parts.map((p) => {
            const product = ops.findProduct(p.productId);
            return '<tr data-part="' + esc(p.id) + '">'
              + '<td data-label="Pièce"><span class="cell-main">' + esc(p.name) + '</span>'
              + (product ? '<span class="cell-sub">stock : ' + I(product.qty, 0, 0) + '</span>' : '<span class="cell-sub">hors stock</span>')
              + '</td>'
              + '<td class="num" data-label="Qté">' + I(p.qty, 1, 0) + '</td>'
              + '<td class="num" data-label="Prix">' + esc(ui.money(M(p.price, 0) * I(p.qty, 1, 0))) + '</td>'
              + '<td data-label="Stock">' + (p.fromStock
                ? ui.badge('Décomptée', 'good') : ui.badge('Non décomptée', 'warn')) + '</td>'
              + '<td class="col-act" data-label="Actions"><div class="row-btns">'
              + (S(p.productId)
                ? '<button type="button" class="btn small ghost" data-act="toggle-part">' + (p.fromStock ? 'Remettre' : 'Décompter') + '</button>'
                : '')
              + '<button type="button" class="icon-btn" data-act="part-qty" aria-label="Changer la quantité">' + ui.icon('edit') + '</button>'
              + '<button type="button" class="icon-btn danger-ghost" data-act="del-part" aria-label="Retirer la pièce">' + ui.icon('trash') + '</button>'
              + '</div></td></tr>';
          }).join('') + '</tbody></table></div>'
        : ui.empty('Aucune pièce enregistrée.'))
      + '</section>';
  }

  /* -------------------- Interactions -------------------- */

  function bind(host, repair) {
    ui.on(host, '[data-act="edit"]', 'click', () => MS.screens.repairs.openForm(repair.id));
    ui.on(host, '[data-status]', 'click', (e, el) => changeStatus(repair, S(el.dataset.status)));
    ui.on(host, '[data-act="add-part"]', 'click', () => openPartForm(repair));
    ui.on(host, '[data-act="toggle-part"]', 'click', (e, el) => {
      const res = ops.togglePartStock(repair.id, el.closest('tr').dataset.part);
      if (!res.ok) ui.toast(res.error, 'error');
      MS.app.render();
    });
    ui.on(host, '[data-act="del-part"]', 'click', async (e, el) => {
      const partId = el.closest('tr').dataset.part;
      const part = A(repair.parts).find((p) => S(p.id) === partId);
      const ok = await ui.confirm({
        title: 'Retirer la pièce', danger: true, confirmLabel: 'Retirer',
        message: 'Retirer « ' + S(O(part).name) + ' » de la fiche ?',
        detail: O(part).fromStock ? 'La quantité décomptée sera remise en stock.' : '',
      });
      if (!ok) return;
      ops.removePart(repair.id, partId);
      MS.app.render();
    });
    ui.on(host, '[data-act="part-qty"]', 'click', async (e, el) => {
      const partId = el.closest('tr').dataset.part;
      const part = A(repair.parts).find((p) => S(p.id) === partId);
      const value = await ui.prompt({ title: 'Quantité', label: 'Nouvelle quantité', value: String(I(O(part).qty, 1, 0)) });
      if (value === null) return;
      const res = ops.setPartQty(repair.id, partId, value);
      if (!res.ok) ui.toast(res.error, 'error');
      MS.app.render();
    });
    ui.on(host, '[data-act="cash"]', 'click', () => openCash(repair));
    ui.on(host, '[data-act="finish"]', 'click', () => openFinish(repair));
    ui.on(host, '[data-act="sign"]', 'click', () => openSignature(repair));
    ui.on(host, '[data-act="ticket"]', 'click', () => MS.print.ticket(repair));
    ui.on(host, '[data-act="invoice"]', 'click', () => MS.print.invoice(repair));
    ui.on(host, '[data-act="delete"]', 'click', async () => {
      const ok = await ui.confirm({
        title: 'Supprimer la fiche', danger: true, confirmLabel: 'Supprimer',
        message: 'Supprimer définitivement ' + repair.number + ' ?',
        detail: 'Les pièces décomptées seront remises en stock.',
      });
      if (!ok) return;
      ops.deleteRepair(repair.id);
      ui.toast('Fiche supprimée.', 'success');
      MS.app.go('repairs');
    });
  }

  async function changeStatus(repair, status) {
    if (S(status) === S(repair.status)) return;
    const note = await ui.prompt({
      title: 'Passer au statut « ' + status + ' »',
      label: 'Note (facultative)',
      confirmLabel: 'Changer le statut',
    });
    if (note === null) return;
    ops.setRepairStatus(repair.id, status, note);
    ui.toast('Statut : ' + status, 'success');
    if (status === 'Terminé') openFinish(ops.findRepair(repair.id));
    else MS.app.render();
  }

  /* -------------------- Pièces -------------------- */

  function openPartForm(repair) {
    const products = A(store.state.products);
    const m = ui.modal({
      title: 'Ajouter une pièce',
      body: '<form id="part-form" class="form-grid">'
        + '<label class="field wide"><span>Article du stock</span><select name="productId" id="part-product">'
        + '<option value="">— Pièce hors stock —</option>'
        + products.map((p) => '<option value="' + esc(p.id) + '" data-name="' + esc(p.name) + '" data-price="' + esc(String(M(p.price, 0)))
          + '" data-cost="' + esc(String(M(p.cost, 0))) + '">' + esc(p.name) + ' — ' + I(p.qty, 0, 0) + ' en stock</option>').join('')
        + '</select></label>'
        + '<label class="field wide"><span>Nom de la pièce *</span><input name="name" id="part-name" required></label>'
        + '<label class="field"><span>Quantité</span><input name="qty" inputmode="numeric" value="1"></label>'
        + '<label class="field"><span>Prix facturé (unité)</span><input name="price" id="part-price" inputmode="decimal" value="0"></label>'
        + '<label class="field"><span>Prix d’achat (unité)</span><input name="cost" id="part-cost" inputmode="decimal" value="0"></label>'
        + '<label class="field check wide"><input type="checkbox" name="fromStock" id="part-stock" checked>'
        + '<span>Décompter du stock immédiatement</span></label>'
        + '<p class="muted wide">Le décompte peut être basculé à tout moment : le stock est réajusté dans le bon sens.</p>'
        + '</form>',
      footer: '<button type="button" class="btn ghost" data-close>Annuler</button>'
        + '<button type="button" class="btn primary" data-act="ok">Ajouter</button>',
    });
    if (!m) return;
    const select = ui.$('#part-product', m.el);
    select.addEventListener('change', () => {
      const opt = select.selectedOptions[0];
      if (!opt || !opt.value) { ui.$('#part-stock', m.el).checked = false; return; }
      ui.$('#part-name', m.el).value = S(opt.dataset.name);
      ui.$('#part-price', m.el).value = S(opt.dataset.price);
      ui.$('#part-cost', m.el).value = S(opt.dataset.cost);
      ui.$('#part-stock', m.el).checked = true;
    });
    const submit = () => {
      const form = ui.$('#part-form', m.el);
      const data = Object.fromEntries(new FormData(form).entries());
      data.fromStock = !!ui.$('#part-stock', m.el).checked;
      const res = ops.addPart(repair.id, data);
      if (!res.ok) { ui.toast(res.error, 'error'); return; }
      m.close();
      MS.app.render();
    };
    ui.on(m.el, '[data-act="ok"]', 'click', submit);
    ui.$('#part-form', m.el).addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  }

  /* -------------------- Encaissement rattaché -------------------- */

  function openCash(repair) {
    const balance = model.repairBalance(repair);
    const m = ui.modal({
      title: 'Encaisser — ' + repair.number,
      size: 'sm',
      body: '<form id="repcash" class="form-grid">'
        + '<label class="field"><span>Montant</span><input name="amount" inputmode="decimal" value="' + esc(String(Math.max(0, balance))) + '" autofocus></label>'
        + '<label class="field"><span>Mode de paiement</span><select name="method">' + ui.selectOptions(model.PAY_METHODS, model.PAY_METHODS[0]) + '</select></label>'
        + '<label class="field check wide"><input type="checkbox" name="deliver"' + (S(repair.status) === 'Terminé' ? ' checked' : '') + '>'
        + '<span>Passer la fiche en « Livré »</span></label>'
        + '<p class="muted wide">L’opération sera rattachée à cette fiche dans le journal de caisse.</p>'
        + '</form>',
      footer: '<button type="button" class="btn ghost" data-close>Annuler</button>'
        + '<button type="button" class="btn primary" data-act="ok">Encaisser</button>',
    });
    if (!m) return;
    const submit = () => {
      const data = Object.fromEntries(new FormData(ui.$('#repcash', m.el)).entries());
      const res = ops.recordCash({
        amount: S(data.amount), type: 'Réparation', method: S(data.method),
        label: repair.number + ' — ' + repair.device, clientId: repair.clientId, repairId: repair.id,
      });
      if (!res.ok) { ui.toast(res.error, 'error'); return; }
      // L'acompte enregistre absorbe l'encaissement : le reste du est recalcule.
      const fresh = ops.findRepair(repair.id);
      if (fresh) ops.updateRepair(fresh.id, { deposit: M(fresh.deposit, 0) + M(res.op.amount, 0) });
      if (data.deliver) ops.setRepairStatus(repair.id, 'Livré', 'Appareil remis au client');
      m.close();
      ui.toast('Encaissement de ' + ui.money(res.op.amount) + ' enregistré.', 'success');
      MS.app.render();
    };
    ui.on(m.el, '[data-act="ok"]', 'click', submit);
    ui.$('#repcash', m.el).addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  }

  /* -------------------- Fin d'intervention -------------------- */

  function smsText(repair) {
    const settings = O(store.state.settings);
    const client = ops.findClient(repair.clientId);
    const name = S(client ? client.name : repair.clientName) || 'Bonjour';
    return S(settings.smsTemplate)
      .replace(/\{client\}/gi, name)
      .replace(/\{appareil\}/gi, S(repair.device))
      .replace(/\{boutique\}/gi, S(settings.shopName))
      .replace(/\{montant\}/gi, ui.money(model.repairBalance(repair)))
      .replace(/\{reference\}/gi, S(repair.number))
      .replace(/\{garantie\}/gi, String(I(settings.warrantyMonths, 3, 0)));
  }

  function openFinish(repair) {
    if (!repair) return;
    const balance = model.repairBalance(repair);
    const phone = S(repair.clientPhone) || S(O(ops.findClient(repair.clientId)).phone);
    const parts = A(repair.parts);
    const pending = parts.filter((p) => !p.fromStock && S(p.productId));
    const message = smsText(repair);

    const m = ui.modal({
      title: 'Fin d’intervention — ' + repair.number,
      size: 'lg',
      body: '<div class="finish">'
        + '<section class="finish-block"><h3>' + ui.icon('sms') + ' Prévenir le client</h3>'
        + '<label class="field wide"><span>Message</span><textarea id="sms-body" rows="3">' + esc(message) + '</textarea></label>'
        + '<label class="field"><span>Numéro</span><input id="sms-phone" value="' + esc(phone) + '" placeholder="06 12 34 56 78"></label>'
        + '<div class="row-btns"><button type="button" class="btn" data-act="sms">Ouvrir l’application SMS</button>'
        + '<button type="button" class="btn ghost" data-act="copy">Copier le message</button></div>'
        + '<p class="muted small">Dépend d’une application de messagerie sur l’appareil : sur un ordinateur sans relais de messages, l’envoi n’est pas possible. Le message reste copiable.</p>'
        + '</section>'

        + '<section class="finish-block"><h3>' + ui.icon('euro') + ' Encaisser le solde</h3>'
        + '<p class="lead">Reste à régler : <b>' + esc(ui.money(balance)) + '</b></p>'
        + (balance > 0
          ? '<div class="row-btns"><button type="button" class="btn primary" data-act="cash">Encaisser ' + esc(ui.money(balance)) + '</button></div>'
          : '<p class="muted">Rien à encaisser.</p>')
        + '</section>'

        + '<section class="finish-block"><h3>' + ui.icon('box') + ' Pièces</h3>'
        + (parts.length
          ? '<ul class="finish-parts">' + parts.map((p) =>
              '<li><span>' + esc(p.name) + ' ×' + I(p.qty, 1, 0) + '</span>'
              + (p.fromStock ? ui.badge('Décomptée', 'good') : ui.badge('Non décomptée', 'warn'))
              + (S(p.productId) ? '<button type="button" class="btn small ghost" data-toggle="' + esc(p.id) + '">'
                + (p.fromStock ? 'Remettre' : 'Décompter') + '</button>' : '') + '</li>').join('') + '</ul>'
          : '<p class="muted">Aucune pièce sur cette fiche.</p>')
        + (pending.length ? '<p class="warn-text">' + ui.icon('alert') + ' ' + pending.length
          + ' pièce(s) non décomptée(s) du stock.</p>' : '')
        + '</section>'

        + '<section class="finish-block"><h3>' + ui.icon('print') + ' Documents</h3>'
        + '<div class="row-btns"><button type="button" class="btn" data-act="ticket">Ticket de prise en charge</button>'
        + '<button type="button" class="btn" data-act="invoice">Facture</button></div></section>'
        + '</div>',
      footer: '<button type="button" class="btn ghost" data-close>Fermer</button>'
        + '<button type="button" class="btn primary" data-act="deliver">Marquer comme livré</button>',
    });
    if (!m) return;

    ui.on(m.el, '[data-act="sms"]', 'click', () => {
      const body = S(ui.$('#sms-body', m.el).value);
      const to = S(ui.$('#sms-phone', m.el).value).replace(/[^\d+]/g, '');
      if (!to) { ui.toast('Renseignez un numéro de téléphone.', 'info'); return; }
      const href = 'sms:' + to + '?&body=' + encodeURIComponent(body);
      try {
        window.location.href = href;
        store.log('SMS client', repair.number + ' — ' + to, 'sms');
        store.save({ reason: 'repairs', silent: true });
      } catch (e) {
        ui.toast("Aucune application de messagerie n’a pu être ouverte. Copiez le message.", 'error');
      }
    });
    ui.on(m.el, '[data-act="copy"]', 'click', async () => {
      const body = S(ui.$('#sms-body', m.el).value);
      try {
        await navigator.clipboard.writeText(body);
        ui.toast('Message copié.', 'success');
      } catch (e) {
        const ta = ui.$('#sms-body', m.el);
        ta.select();
        ui.toast('Copiez le message sélectionné (Ctrl+C).', 'info');
      }
    });
    ui.on(m.el, '[data-act="cash"]', 'click', () => { m.close(); openCash(ops.findRepair(repair.id)); });
    ui.on(m.el, '[data-toggle]', 'click', (e, el) => {
      const res = ops.togglePartStock(repair.id, el.dataset.toggle);
      if (!res.ok) { ui.toast(res.error, 'error'); return; }
      m.close();
      openFinish(ops.findRepair(repair.id));
      MS.app.render();
    });
    ui.on(m.el, '[data-act="ticket"]', 'click', () => MS.print.ticket(ops.findRepair(repair.id)));
    ui.on(m.el, '[data-act="invoice"]', 'click', () => MS.print.invoice(ops.findRepair(repair.id)));
    ui.on(m.el, '[data-act="deliver"]', 'click', () => {
      ops.setRepairStatus(repair.id, 'Livré', 'Appareil remis au client');
      m.close();
      ui.toast('Fiche marquée comme livrée.', 'success');
      MS.app.render();
    });
  }

  /* -------------------- Signature -------------------- */

  function openSignature(repair) {
    const m = ui.modal({
      title: 'Signature du client',
      body: '<p class="muted">Faites signer dans le cadre ci-dessous.</p>'
        + '<canvas id="sign-pad" class="sign-pad" width="600" height="220" aria-label="Zone de signature"></canvas>',
      footer: '<button type="button" class="btn ghost" data-act="clear">Effacer</button>'
        + '<button type="button" class="btn ghost" data-close>Annuler</button>'
        + '<button type="button" class="btn primary" data-act="ok">Enregistrer</button>',
    });
    if (!m) return;
    const canvas = ui.$('#sign-pad', m.el);
    const ctx = canvas.getContext('2d');
    let drawing = false, dirty = false;
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
    const pos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const src = e.touches && e.touches[0] ? e.touches[0] : e;
      return { x: (src.clientX - rect.left) * (canvas.width / rect.width), y: (src.clientY - rect.top) * (canvas.height / rect.height) };
    };
    const start = (e) => { drawing = true; dirty = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); };
    const move = (e) => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); };
    const end = () => { drawing = false; };
    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointerleave', end);
    ui.on(m.el, '[data-act="clear"]', 'click', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = false; });
    ui.on(m.el, '[data-act="ok"]', 'click', () => {
      if (!dirty) { ui.toast('La zone de signature est vide.', 'info'); return; }
      let data = '';
      try { data = canvas.toDataURL('image/png'); } catch (e) { data = ''; }
      if (!data) { ui.toast("La signature n’a pas pu être enregistrée.", 'error'); return; }
      ops.updateRepair(repair.id, { signature: data });
      m.close();
      ui.toast('Signature enregistrée.', 'success');
      MS.app.render();
    });
  }

  MS.screens.repair = { render, openFinish, openCash, smsText };
})();
