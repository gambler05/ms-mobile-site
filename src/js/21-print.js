/* ============================================================
   21 — Impression : ticket de prise en charge et facture
   Calibré pour le papier, pas pour l'écran.
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { S, I, M, A, O, esc, fmtDate, fmtDateTime } = MS.util;
  const ui = MS.ui, store = MS.store, model = MS.model, ops = MS.ops;

  /** Le nom porté par les documents ne comporte pas le nom de ville. */
  function docName() {
    const s = O(store.state.settings);
    return S(s.docName) || S(MS.config.docName) || S(s.shopName) || S(MS.config.shopName);
  }

  function logoHtml() {
    const custom = S(O(store.state.settings).logo);
    if (custom) return '<img class="p-logo" src="' + esc(custom) + '" alt="">';
    return '<div class="p-logo p-logo-default" aria-hidden="true">' + esc(initials()) + '</div>';
  }

  function initials() {
    return S(docName()).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'MS';
  }

  function headerHtml(title, reference, date) {
    const s = O(store.state.settings);
    return '<header class="p-head">'
      + '<div class="p-brand">' + logoHtml()
      + '<div class="p-ident"><h1>' + esc(docName()) + '</h1>'
      + '<p>' + esc(s.address) + '</p>'
      + '<p>' + [S(s.phone), S(s.email)].filter(Boolean).map(esc).join(' — ') + '</p>'
      + (s.siret ? '<p>SIRET ' + esc(s.siret) + '</p>' : '')
      + '</div></div>'
      + '<div class="p-doc"><h2>' + esc(title) + '</h2>'
      + '<p class="p-ref">' + esc(reference) + '</p>'
      + '<p class="p-date">' + esc(fmtDate(date)) + '</p></div>'
      + '</header>';
  }

  function footerHtml() {
    const s = O(store.state.settings);
    return '<footer class="p-foot"><p>' + esc(docName())
      + (s.siret ? ' — SIRET ' + esc(s.siret) : '')
      + (s.vatRate > 0 ? ' — TVA ' + esc(String(M(s.vatRate, 20))) + ' %' : '')
      + '</p><p>' + esc(s.address) + (s.phone ? ' — ' + esc(s.phone) : '') + '</p></footer>';
  }

  function fieldRow(label, value) {
    return '<div class="p-field"><span class="p-label">' + esc(label) + '</span>'
      + '<span class="p-value">' + esc(S(value) || '—') + '</span></div>';
  }

  function clientOf(repair) {
    const client = ops.findClient(repair.clientId);
    return {
      name: S(client ? client.name : repair.clientName) || 'Client de passage',
      phone: S(client ? client.phone : repair.clientPhone),
      email: S(O(client).email),
      address: S(O(client).address),
    };
  }

  /* -------------------- Ticket de prise en charge -------------------- */

  function ticketHtml(repair) {
    const s = O(store.state.settings);
    const client = clientOf(repair);
    const balance = model.repairBalance(repair);
    const cgv = S(s.cgv).replace(/\{garantie\}/gi, String(I(s.warrantyMonths, 3, 0)));
    return '<article class="p-page">'
      + headerHtml('Ticket de prise en charge', repair.number, repair.createdAt)
      + '<section class="p-cols">'
      + '<div class="p-box"><h3>Client</h3>'
      + fieldRow('Nom', client.name) + fieldRow('Téléphone', client.phone)
      + (client.email ? fieldRow('E-mail', client.email) : '')
      + (client.address ? fieldRow('Adresse', client.address) : '')
      + '</div>'
      + '<div class="p-box"><h3>Appareil</h3>'
      + fieldRow('Appareil', repair.device) + fieldRow('IMEI / n° de série', repair.imei)
      + fieldRow('Code de déverrouillage', repair.passcode ? '••••' : '—')
      + '</div></section>'
      + '<section class="p-box"><h3>Panne déclarée</h3><p class="p-text">' + esc(repair.issue || '—') + '</p></section>'
      + '<section class="p-box"><h3>État constaté à la réception</h3><p class="p-text">' + esc(repair.deviceState || 'Aucune remarque particulière.') + '</p></section>'
      + '<section class="p-amounts"><table class="p-table"><tbody>'
      + '<tr><th>Montant estimé</th><td class="p-num">' + esc(ui.money(repair.price)) + '</td></tr>'
      + '<tr><th>Acompte versé</th><td class="p-num">' + esc(ui.money(repair.deposit)) + '</td></tr>'
      + '<tr class="p-total"><th>Reste à régler</th><td class="p-num">' + esc(ui.money(balance)) + '</td></tr>'
      + '</tbody></table>'
      + '<p class="p-vat">' + (M(s.vatRate, 0) > 0
        ? 'Montants exprimés TTC — TVA ' + esc(String(M(s.vatRate, 20))) + ' %.'
        : 'TVA non applicable.') + '</p></section>'
      + '<section class="p-box p-cgv"><h3>Conditions de dépôt</h3><p class="p-text">' + esc(cgv) + '</p>'
      + '<p class="p-text"><b>Garantie : ' + I(s.warrantyMonths, 3, 0) + ' mois</b> sur la pièce remplacée.</p></section>'
      + '<section class="p-signs">'
      + '<div class="p-sign"><span>Signature du client</span>'
      + (repair.signature ? '<img class="p-sign-img" src="' + esc(repair.signature) + '" alt="">' : '<div class="p-sign-box"></div>')
      + '</div>'
      + '<div class="p-sign"><span>Cachet et signature du magasin</span><div class="p-sign-box"></div></div>'
      + '</section>'
      + footerHtml()
      + '</article>';
  }

  /* -------------------- Facture -------------------- */

  function invoiceHtml(repair) {
    const s = O(store.state.settings);
    const client = clientOf(repair);
    const lines = [];
    if (M(repair.price, 0) > 0) {
      lines.push({ label: 'Intervention — ' + S(repair.issue || repair.device), qty: 1, price: M(repair.price, 0) });
    }
    A(repair.parts).forEach((p) => lines.push({ label: 'Pièce — ' + S(p.name), qty: I(p.qty, 1, 0), price: M(p.price, 0) }));
    if (!lines.length) lines.push({ label: 'Intervention — ' + S(repair.device), qty: 1, price: 0 });
    const total = model.repairTotal(repair);
    const net = model.repairBalance(repair);
    return '<article class="p-page">'
      + headerHtml('Facture', S(repair.invoiceNo) || repair.number, repair.updatedAt)
      + '<section class="p-cols">'
      + '<div class="p-box"><h3>Client</h3>'
      + fieldRow('Nom', client.name) + fieldRow('Téléphone', client.phone)
      + (client.address ? fieldRow('Adresse', client.address) : '')
      + '</div>'
      + '<div class="p-box"><h3>Références</h3>'
      + fieldRow('Fiche', repair.number)
      + fieldRow('Appareil', repair.device)
      + fieldRow('IMEI', repair.imei)
      + fieldRow('Déposé le', fmtDate(repair.createdAt))
      + '</div></section>'
      + '<section><table class="p-table p-lines"><thead><tr>'
      + '<th>Désignation</th><th class="p-num">Qté</th><th class="p-num">P.U.</th><th class="p-num">Montant</th>'
      + '</tr></thead><tbody>'
      + lines.map((l) => '<tr><td>' + esc(l.label) + '</td><td class="p-num">' + l.qty + '</td>'
        + '<td class="p-num">' + esc(ui.money(l.price)) + '</td>'
        + '<td class="p-num">' + esc(ui.money(l.price * l.qty)) + '</td></tr>').join('')
      + '</tbody><tfoot>'
      + '<tr><th colspan="3">Total</th><td class="p-num">' + esc(ui.money(total)) + '</td></tr>'
      + '<tr><th colspan="3">Acompte déduit</th><td class="p-num">− ' + esc(ui.money(repair.deposit)) + '</td></tr>'
      + '<tr class="p-total"><th colspan="3">Net à payer</th><td class="p-num">' + esc(ui.money(net)) + '</td></tr>'
      + '</tfoot></table></section>'
      + '<section class="p-box"><p class="p-text">' + (M(s.vatRate, 0) > 0
        ? 'Montants exprimés TTC — TVA ' + esc(String(M(s.vatRate, 20))) + ' %.'
        : 'TVA non applicable.')
      + ' Garantie de <b>' + I(s.warrantyMonths, 3, 0) + ' mois</b> sur la pièce remplacée, hors casse, oxydation et mauvaise utilisation.</p></section>'
      + '<section class="p-signs">'
      + '<div class="p-sign"><span>Signature du client</span>'
      + (repair.signature ? '<img class="p-sign-img" src="' + esc(repair.signature) + '" alt="">' : '<div class="p-sign-box"></div>')
      + '</div>'
      + '<div class="p-sign"><span>Cachet et signature du magasin</span><div class="p-sign-box"></div></div>'
      + '</section>'
      + footerHtml()
      + '</article>';
  }

  /* -------------------- Lancement -------------------- */

  function ticket(repair) {
    if (!repair) { ui.toast('Fiche introuvable : rien à imprimer.', 'error'); return; }
    run(ticketHtml(repair), 'ticket');
  }

  function invoice(repair) {
    if (!repair) { ui.toast('Fiche introuvable : rien à imprimer.', 'error'); return; }
    // Numero de facture attribue a la premiere emission.
    if (!S(repair.invoiceNo)) {
      const { number, counter } = model.nextInvoiceNumber(store.state);
      repair.invoiceNo = number;
      store.state.counters.invoice = counter;
      store.log('Facture émise', repair.number + ' → ' + number, 'doc');
      store.save({ reason: 'repairs' });
    }
    run(invoiceHtml(repair), 'facture');
    MS.app.render();
  }

  /**
   * Attend le chargement des images et le calcul de la mise en page :
   * sans cela, les appareils lents produisent des pages blanches.
   */
  function run(html, kind) {
    const root = ui.$('#print-root');
    if (!root) { ui.toast("La zone d’impression est introuvable.", 'error'); return; }
    root.innerHTML = html;
    root.hidden = false;
    document.body.classList.add('printing');

    const images = Array.from(root.querySelectorAll('img'));
    const waits = images.map((img) => (img.complete && img.naturalWidth
      ? Promise.resolve()
      : new Promise((resolve) => {
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          setTimeout(done, 2500);
        })));

    Promise.all(waits).then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      .then(() => {
        fitToPage(root);
        return new Promise((r) => requestAnimationFrame(r));
      })
      .then(() => {
        const cleanup = () => {
          document.body.classList.remove('printing');
          root.hidden = true;
          root.innerHTML = '';
          root.classList.remove('tight-1', 'tight-2', 'tight-3', 'measuring');
        };
        window.addEventListener('afterprint', cleanup, { once: true });
        setTimeout(() => { if (!root.hidden) cleanup(); }, 60000);
        try { window.print(); }
        catch (e) {
          cleanup();
          ui.toast("L’impression n’a pas pu démarrer sur cet appareil.", 'error');
        }
      });
  }

  /**
   * Une page chacun : si le document deborde, on resserre les espacements,
   * jamais les tailles de texte.
   */
  const PAGE_HEIGHT_PX = 1122; // A4 : 297 mm a 96 ppp
  const TIGHT_LEVELS = ['tight-1', 'tight-2', 'tight-3'];

  /**
   * Hauteur reellement occupee par le contenu. La page porte une hauteur
   * minimale d'une feuille A4 et pousse les signatures en bas : mesurer
   * telle quelle ferait croire que tout deborde, et resserrerait toujours.
   */
  function naturalHeight(root) {
    const host = root || (globalThis.document && document.getElementById('print-root'));
    const page = host && host.querySelector('.p-page');
    if (!page) return 0;
    const wasMeasuring = host.classList.contains('measuring');
    host.classList.add('measuring');
    const height = page.scrollHeight;
    if (!wasMeasuring) host.classList.remove('measuring');
    return height;
  }

  function fitToPage(root) {
    const page = root && root.querySelector('.p-page');
    if (!page) return '';
    root.classList.remove.apply(root.classList, TIGHT_LEVELS);
    root.classList.add('measuring');
    let applied = '';
    if (page.scrollHeight > PAGE_HEIGHT_PX) {
      for (let i = 0; i < TIGHT_LEVELS.length; i++) {
        root.classList.remove.apply(root.classList, TIGHT_LEVELS);
        root.classList.add(TIGHT_LEVELS[i]);
        applied = TIGHT_LEVELS[i];
        if (page.scrollHeight <= PAGE_HEIGHT_PX) break;
      }
    }
    root.classList.remove('measuring');
    return applied;
  }

  MS.print = { ticket, invoice, ticketHtml, invoiceHtml, docName, fitToPage, naturalHeight, PAGE_HEIGHT_PX, TIGHT_LEVELS };
})();
