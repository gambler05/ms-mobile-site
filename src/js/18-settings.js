/* ============================================================
   18 — Paramètres
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { S, I, M, A, O, esc, fmtDateTime, dayKey } = MS.util;
  const ui = MS.ui, store = MS.store, model = MS.model;

  function render(host) {
    const s = O(store.state.settings);
    host.innerHTML =
      identityHtml(s) + documentsHtml(s) + appearanceHtml(s)
      + accountsHtml(s) + syncHtml() + dataHtml();
    bind(host);
  }

  /* -------------------- Identité -------------------- */

  function identityHtml(s) {
    return '<section class="card"><h2>Identité de la boutique</h2>'
      + '<form id="identity-form" class="form-grid">'
      + '<label class="field"><span>Nom de la boutique</span><input name="shopName" value="' + esc(s.shopName) + '"></label>'
      + '<label class="field"><span>Nom porté par les documents</span><input name="docName" value="' + esc(s.docName) + '" placeholder="' + esc(MS.config.docName || s.shopName) + '"></label>'
      + '<label class="field wide"><span>Adresse postale</span><input name="address" value="' + esc(s.address) + '"></label>'
      + '<label class="field"><span>Téléphone</span><input name="phone" value="' + esc(s.phone) + '"></label>'
      + '<label class="field"><span>E-mail</span><input name="email" value="' + esc(s.email) + '"></label>'
      + '<label class="field"><span>SIRET</span><input name="siret" value="' + esc(s.siret) + '"></label>'
      + '<label class="field"><span>Taux de TVA (%)</span><input name="vatRate" inputmode="decimal" value="' + esc(String(M(s.vatRate, 20))) + '"></label>'
      + '<label class="field"><span>Devise</span><select name="currency">'
      + ui.selectOptions(['EUR', 'CHF', 'USD', 'GBP', 'MAD', 'XOF'], s.currency) + '</select></label>'
      + '<label class="field"><span>Seuil d’alerte général</span><input name="lowStock" inputmode="numeric" value="' + esc(String(I(s.lowStock, 2, 0))) + '"></label>'
      + '<label class="field"><span>Garantie (mois)</span><input name="warrantyMonths" inputmode="numeric" value="' + esc(String(I(s.warrantyMonths, 3, 0))) + '"></label>'
      + '<p class="muted wide">Le nom porté par les documents ne comporte pas le nom de ville ; l’adresse postale complète figure en dessous.</p>'
      + '<div class="row-end wide"><button type="submit" class="btn primary">Enregistrer</button></div>'
      + '</form></section>';
  }

  /* -------------------- Documents -------------------- */

  function documentsHtml(s) {
    return '<section class="card"><h2>Documents</h2>'
      + '<form id="docs-form" class="form-grid">'
      + '<label class="field wide"><span>Modèle de SMS</span>'
      + '<textarea name="smsTemplate" rows="3">' + esc(s.smsTemplate) + '</textarea></label>'
      + '<p class="muted wide">Variables : <code>{client}</code>, <code>{appareil}</code>, <code>{boutique}</code>, <code>{montant}</code>, <code>{reference}</code>, <code>{garantie}</code>.</p>'
      + '<label class="field wide"><span>Conditions de dépôt (imprimées sur le ticket)</span>'
      + '<textarea name="cgv" rows="5">' + esc(s.cgv) + '</textarea></label>'
      + '<div class="field wide"><span class="field-label">Logo</span>'
      + '<div class="logo-row">' + (s.logo
        ? '<img class="logo-preview" src="' + esc(s.logo) + '" alt="Logo de la boutique">'
        : '<span class="muted">Logo intégré par défaut.</span>')
      + '<input type="file" id="logo-file" accept="image/*" class="file-input">'
      + '<button type="button" class="btn small" data-act="pick-logo">Choisir une image</button>'
      + (s.logo ? '<button type="button" class="btn small danger-ghost" data-act="clear-logo">Retirer</button>' : '')
      + '</div></div>'
      + '<div class="row-end wide"><button type="submit" class="btn primary">Enregistrer</button></div>'
      + '</form></section>';
  }

  function appearanceHtml(s) {
    return '<section class="card"><h2>Apparence</h2>'
      + '<div class="chips">'
      + '<button type="button" class="chip' + (s.theme === 'light' ? ' on' : '') + '" data-theme="light">' + ui.icon('sun') + ' Clair</button>'
      + '<button type="button" class="chip' + (s.theme === 'dark' ? ' on' : '') + '" data-theme="dark">' + ui.icon('moon') + ' Sombre</button>'
      + '</div><p class="muted">Deux états seulement : le thème ne suit pas le réglage du système.</p></section>';
  }

  /* -------------------- Comptes et session -------------------- */

  function accountsHtml(s) {
    const accounts = A(s.accounts);
    return '<section class="card"><h2>Comptes et session</h2>'
      + '<div class="form-grid">'
      + '<label class="field"><span>Portée de la protection</span><select id="auth-scope">'
      + ui.selectOptions([
        { value: 'off', label: 'Aucune protection' },
        { value: 'app', label: 'À l’ouverture : connexion obligatoire' },
        { value: 'sensitive', label: 'Écrans sensibles seulement (caisse libre)' },
      ], s.authScope) + '</select></label>'
      + '<label class="field"><span>Verrouillage après inactivité</span><select id="auth-lock">'
      + ui.selectOptions([
        { value: '0', label: 'Jamais' }, { value: '5', label: '5 minutes' }, { value: '15', label: '15 minutes' },
        { value: '30', label: '30 minutes' }, { value: '60', label: '1 heure' },
      ], String(I(s.autolockMinutes, 0, 0))) + '</select></label>'
      + '<label class="field"><span>Tentatives avant blocage</span>'
      + '<input id="auth-attempts" inputmode="numeric" value="' + esc(String(I(s.maxAttempts, 5, 1))) + '"></label>'
      + '</div>'
      + (accounts.length
        ? '<div class="table-wrap"><table class="table"><thead><tr><th>Identifiant</th><th>Nom</th><th>Rôle</th><th class="col-act">Actions</th></tr></thead><tbody>'
          + accounts.map((a) => '<tr data-account="' + esc(a.id) + '">'
            + '<td data-label="Identifiant">' + esc(a.login) + '</td>'
            + '<td data-label="Nom">' + esc(a.name) + '</td>'
            + '<td data-label="Rôle">' + ui.badge(a.role, a.role === 'Administrateur' ? 'good' : 'neutral') + '</td>'
            + '<td class="col-act" data-label="Actions"><div class="row-btns">'
            + '<button type="button" class="btn small ghost" data-act="passwd">Mot de passe</button>'
            + '<button type="button" class="icon-btn danger-ghost" data-act="del-account" aria-label="Supprimer">' + ui.icon('trash') + '</button>'
            + '</div></td></tr>').join('')
          + '</tbody></table></div>'
        : '<p class="muted">Aucun compte. Sans compte, la protection reste inactive quelle que soit la portée choisie.</p>')
      + '<div class="row-btns">'
      + '<button type="button" class="btn" data-act="add-account">' + ui.icon('plus') + ' Ajouter un compte</button>'
      + '<button type="button" class="btn ghost" data-act="recovery">' + ui.icon('key') + ' Générer une clé de secours</button>'
      + '</div>'
      + '<p class="muted small">Aucun mot de passe n’est stocké en clair : seules des empreintes salées le sont. '
      + 'Écrans réservés à l’administrateur : Paramètres et Journal. '
      + '<b>Limite :</b> ce verrou protège l’interface, pas le fichier. Quelqu’un qui obtient le fichier et sait lire le stockage du navigateur accède aux données. '
      + 'La protection réelle des données repose sur le compte de synchronisation.</p>'
      + '</section>';
  }

  /* -------------------- Synchronisation -------------------- */

  function syncHtml() {
    const cfg = MS.sync.readConfig();
    const st = MS.sync.status();
    return '<section class="card"><h2>Synchronisation</h2>'
      + '<p class="lead"><span class="sync-pill sync-' + esc(st.code) + '">' + ui.icon('cloud') + ' ' + esc(st.label) + '</span></p>'
      + '<p class="muted">' + esc(st.help) + '</p>'
      + '<form id="sync-form" class="form-grid">'
      + '<label class="field"><span>Clé d’API du projet</span><input name="apiKey" value="' + esc(cfg.apiKey) + '" placeholder="AIza…"></label>'
      + '<label class="field"><span>URL de la base temps réel</span><input name="databaseURL" value="' + esc(cfg.databaseURL) + '" placeholder="https://exemple.firebaseio.com"></label>'
      + '<label class="field wide"><span>Document de la boutique</span><input name="doc" value="' + esc(cfg.doc) + '"></label>'
      + '<p class="muted wide">Ce document doit <b>différer</b> de celui de l’autre boutique, sinon les deux bases s’écrasent mutuellement. '
      + 'Règles d’accès côté serveur : lecture et écriture réservées aux comptes authentifiés.</p>'
      + '<div class="row-end wide">'
      + (MS.sync.connected
        ? '<button type="button" class="btn ghost" data-act="sync-out">Se déconnecter</button>'
        : '<button type="button" class="btn ghost" data-act="sync-in">Se connecter</button>')
      + '<button type="submit" class="btn primary">Enregistrer la configuration</button></div>'
      + '</form>'
      + '<p class="muted small">L’état entier est envoyé à chaque enregistrement : si deux personnes enregistrent dans la même seconde sur deux appareils, la dernière écriture écrase l’autre. À deux dans une boutique, cela n’arrive quasiment jamais.</p>'
      + '</section>';
  }

  /* -------------------- Données -------------------- */

  function dataHtml() {
    const backups = store.listBackups();
    const snap = store.getSnapshot();
    const counts = model.countRecords(store.state);
    return '<section class="card"><h2>Données</h2>'
      + '<p class="muted">' + counts.products + ' article(s), ' + counts.clients + ' client(s), '
      + counts.repairs + ' réparation(s), ' + counts.cash + ' opération(s) de caisse.</p>'
      + '<div class="row-btns">'
      + '<button type="button" class="btn" data-act="export-json">' + ui.icon('download') + ' Export de sauvegarde</button>'
      + '<input type="file" id="import-file" accept=".json,.csv,application/json,text/csv" class="file-input">'
      + '<button type="button" class="btn" data-act="import">' + ui.icon('upload') + ' Import / restauration</button>'
      + '<button type="button" class="btn ghost" data-act="demo">Jeu de démonstration</button>'
      + '<button type="button" class="btn danger" data-act="erase">' + ui.icon('trash') + ' Effacement total</button>'
      + '</div>'
      + '<h3>Sauvegardes automatiques</h3>'
      + (backups.length
        ? '<ul class="backup-list">' + backups.map((b) =>
            '<li><span><b>' + esc(MS.util.fmtDate(b.date)) + '</b> — '
            + I(O(b.counts).products, 0, 0) + ' articles, ' + I(O(b.counts).repairs, 0, 0) + ' réparations, '
            + I(O(b.counts).cash, 0, 0) + ' opérations</span>'
            + '<button type="button" class="btn small" data-restore="' + esc(b.key) + '">Restaurer</button></li>').join('') + '</ul>'
        : '<p class="muted">Aucune sauvegarde encore enregistrée. Une copie complète est faite une fois par jour, les trois dernières sont conservées.</p>')
      + (snap
        ? '<h3>Copie avant remplacement</h3><p class="muted">Prise le ' + esc(fmtDateTime(snap.date))
          + ' (' + esc(snap.reason) + ') — ' + I(O(snap.counts).repairs, 0, 0) + ' réparation(s).'
          + ' <button type="button" class="btn small" data-act="restore-snap">Restaurer cette copie</button></p>'
        : '')
      + '<p class="muted small">Les sauvegardes ne dépendent ni du réseau, ni du service de synchronisation, ni d’une action de votre part. '
      + 'Si le stockage sature, les plus anciennes sont sacrifiées : l’enregistrement des données courantes n’échoue jamais à cause de l’historique.</p>'
      + '</section>';
  }

  /* -------------------- Interactions -------------------- */

  function bind(host) {
    const identity = ui.$('#identity-form', host);
    if (identity) identity.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(identity).entries());
      Object.assign(store.state.settings, model.normSettings(Object.assign({}, store.state.settings, data)));
      store.log('Paramètres modifiés', 'Identité de la boutique', 'settings');
      store.save({ reason: 'settings' });
      ui.toast('Identité enregistrée.', 'success');
      MS.app.render();
    });

    const docs = ui.$('#docs-form', host);
    if (docs) docs.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(docs).entries());
      store.state.settings.smsTemplate = S(data.smsTemplate);
      store.state.settings.cgv = S(data.cgv);
      store.log('Paramètres modifiés', 'Documents', 'settings');
      store.save({ reason: 'settings' });
      ui.toast('Documents enregistrés.', 'success');
      MS.app.render();
    });

    ui.on(host, '[data-act="pick-logo"]', 'click', () => ui.$('#logo-file', host).click());
    const logoFile = ui.$('#logo-file', host);
    if (logoFile) logoFile.addEventListener('change', () => {
      const file = logoFile.files && logoFile.files[0];
      if (!file) return;
      if (file.size > 400000) { ui.toast('Image trop lourde (400 Ko maximum).', 'error'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        store.state.settings.logo = S(reader.result);
        store.log('Logo modifié', '', 'settings');
        store.save({ reason: 'settings' });
        ui.toast('Logo enregistré.', 'success');
        MS.app.render();
      };
      reader.onerror = () => ui.toast("L’image n’a pas pu être lue.", 'error');
      reader.readAsDataURL(file);
    });
    ui.on(host, '[data-act="clear-logo"]', 'click', () => {
      store.state.settings.logo = '';
      store.save({ reason: 'settings' });
      MS.app.render();
    });

    ui.on(host, '[data-theme]', 'click', (e, el) => {
      store.state.settings.theme = el.dataset.theme === 'dark' ? 'dark' : 'light';
      store.save({ reason: 'settings' });
      MS.app.render();
    });

    const scope = ui.$('#auth-scope', host);
    if (scope) scope.addEventListener('change', () => {
      if (scope.value !== 'off' && !MS.auth.hasAccounts()) {
        ui.toast('Créez d’abord un compte : sans compte, la protection resterait inactive.', 'info', 6000);
        scope.value = 'off';
        return;
      }
      store.state.settings.authScope = scope.value;
      store.log('Protection modifiée', scope.options[scope.selectedIndex].text, 'shield');
      store.save({ reason: 'settings' });
      MS.app.render();
    });
    const lock = ui.$('#auth-lock', host);
    if (lock) lock.addEventListener('change', () => {
      store.state.settings.autolockMinutes = I(lock.value, 0, 0);
      store.save({ reason: 'settings' });
    });
    const attempts = ui.$('#auth-attempts', host);
    if (attempts) attempts.addEventListener('change', () => {
      store.state.settings.maxAttempts = I(attempts.value, 5, 1);
      store.save({ reason: 'settings' });
    });

    ui.on(host, '[data-act="add-account"]', 'click', openAccountForm);
    ui.on(host, '[data-act="passwd"]', 'click', (e, el) => openPasswordForm(el.closest('tr').dataset.account));
    ui.on(host, '[data-act="del-account"]', 'click', async (e, el) => {
      const id = el.closest('tr').dataset.account;
      const ok = await ui.confirm({ title: 'Supprimer le compte', danger: true, confirmLabel: 'Supprimer', message: 'Supprimer ce compte ?' });
      if (!ok) return;
      const res = MS.auth.removeAccount(id);
      if (!res.ok) { ui.toast(res.error, 'error'); return; }
      ui.toast('Compte supprimé.', 'success');
      MS.app.render();
    });
    ui.on(host, '[data-act="recovery"]', 'click', async () => {
      const key = await MS.auth.generateRecovery();
      ui.modal({
        title: 'Clé de secours',
        size: 'sm',
        body: '<p class="lead mono big">' + esc(key) + '</p>'
          + '<p class="muted">Notez cette clé maintenant : elle ne sera plus affichée. '
          + 'Elle permet de reprendre la main si tous les mots de passe sont perdus.</p>',
        footer: '<button type="button" class="btn primary" data-close>J’ai noté</button>',
      });
      MS.app.render();
    });

    const syncForm = ui.$('#sync-form', host);
    if (syncForm) syncForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(syncForm).entries());
      MS.sync.writeConfig(data);
      ui.toast('Configuration enregistrée.', 'success');
      MS.app.render();
    });
    ui.on(host, '[data-act="sync-in"]', 'click', () => MS.app.openSyncLogin());
    ui.on(host, '[data-act="sync-out"]', 'click', () => { MS.sync.signOut(); MS.app.render(); });

    ui.on(host, '[data-act="export-json"]', 'click', exportBackup);
    ui.on(host, '[data-act="import"]', 'click', () => ui.$('#import-file', host).click());
    const importFile = ui.$('#import-file', host);
    if (importFile) importFile.addEventListener('change', () => {
      const file = importFile.files && importFile.files[0];
      if (!file) return;
      MS.import.openFromFile(file);
      importFile.value = '';
    });
    ui.on(host, '[data-act="demo"]', 'click', async () => {
      const ok = await ui.confirm({
        title: 'Jeu de démonstration',
        message: 'Charger des données de démonstration ?',
        detail: 'Vos données actuelles seront remplacées. Une copie est mise de côté avant.',
        confirmLabel: 'Charger',
      });
      if (!ok) return;
      MS.demo.load();
      ui.toast('Jeu de démonstration chargé.', 'success');
      MS.app.go('dashboard');
      MS.app.render();
    });
    ui.on(host, '[data-act="erase"]', 'click', async () => {
      const ok = await ui.confirm({
        title: 'Effacement total', danger: true, confirmLabel: 'Tout effacer',
        message: 'Effacer toutes les données de cette boutique ?',
        detail: 'Articles, clients, réparations, caisse et grilles seront supprimés. Les paramètres de la boutique sont conservés. Une copie est mise de côté avant.',
      });
      if (!ok) return;
      store.eraseAll();
      ui.toast('Données effacées.', 'success');
      MS.app.render();
    });
    ui.on(host, '[data-restore]', 'click', async (e, el) => {
      const ok = await ui.confirm({
        title: 'Restaurer la sauvegarde',
        message: 'Remplacer les données actuelles par cette sauvegarde ?',
        detail: 'Une copie de l’état actuel est mise de côté avant le remplacement.',
        confirmLabel: 'Restaurer',
      });
      if (!ok) return;
      if (store.restoreBackup(el.dataset.restore)) {
        store.log('Sauvegarde restaurée', el.dataset.restore, 'refresh');
        store.save({ reason: 'restore' });
        ui.toast('Sauvegarde restaurée.', 'success');
      } else ui.toast('Cette sauvegarde est illisible.', 'error');
      MS.app.render();
    });
    ui.on(host, '[data-act="restore-snap"]', 'click', async () => {
      const ok = await ui.confirm({ title: 'Restaurer la copie', message: 'Revenir à la copie prise avant le dernier remplacement ?', confirmLabel: 'Restaurer' });
      if (!ok) return;
      store.restoreSnapshot();
      ui.toast('Copie restaurée.', 'success');
      MS.app.render();
    });
  }

  function openAccountForm() {
    const m = ui.modal({
      title: 'Nouveau compte',
      body: '<form id="account-form" class="form-grid">'
        + '<label class="field"><span>Identifiant *</span><input name="login" autocomplete="off" required autofocus></label>'
        + '<label class="field"><span>Nom affiché</span><input name="name" autocomplete="off"></label>'
        + '<label class="field"><span>Rôle</span><select name="role">' + ui.selectOptions(model.ROLES, 'Vendeur') + '</select></label>'
        + '<label class="field"><span>Mot de passe *</span><input name="password" type="password" autocomplete="new-password" required></label>'
        + '<p class="form-error wide" id="account-error" role="alert"></p></form>',
      footer: '<button type="button" class="btn ghost" data-close>Annuler</button>'
        + '<button type="button" class="btn primary" data-act="ok">Créer</button>',
    });
    if (!m) return;
    const submit = async () => {
      const data = Object.fromEntries(new FormData(ui.$('#account-form', m.el)).entries());
      const res = await MS.auth.addAccount(data);
      if (!res.ok) { ui.$('#account-error', m.el).textContent = res.error; return; }
      m.close();
      ui.toast('Compte créé.', 'success');
      MS.app.render();
    };
    ui.on(m.el, '[data-act="ok"]', 'click', submit);
    ui.$('#account-form', m.el).addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  }

  function openPasswordForm(id) {
    const m = ui.modal({
      title: 'Changer le mot de passe',
      size: 'sm',
      body: '<form id="pwd-form"><label class="field"><span>Nouveau mot de passe</span>'
        + '<input name="password" type="password" autocomplete="new-password" autofocus></label>'
        + '<p class="form-error" id="pwd-error" role="alert"></p></form>',
      footer: '<button type="button" class="btn ghost" data-close>Annuler</button>'
        + '<button type="button" class="btn primary" data-act="ok">Enregistrer</button>',
    });
    if (!m) return;
    const submit = async () => {
      const data = Object.fromEntries(new FormData(ui.$('#pwd-form', m.el)).entries());
      const res = await MS.auth.setPassword(id, S(data.password));
      if (!res.ok) { ui.$('#pwd-error', m.el).textContent = res.error; return; }
      m.close();
      ui.toast('Mot de passe modifié.', 'success');
    };
    ui.on(m.el, '[data-act="ok"]', 'click', submit);
    ui.$('#pwd-form', m.el).addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  }

  function exportBackup() {
    const payload = JSON.stringify(Object.assign({}, store.state, {
      _app: 'MS-MOBILE', _shop: MS.config.shopId, _exportedAt: new Date().toISOString(),
    }), null, 2);
    ui.download('ms-mobile-' + MS.config.shopId + '-' + dayKey(new Date()) + '.json', payload, 'application/json');
    store.log('Export de sauvegarde', dayKey(new Date()), 'download');
    store.save({ reason: 'export', silent: true });
  }

  MS.screens.settings = { render, exportBackup };
})();
