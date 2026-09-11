/* ============================================================
   19 — Journal d'activité
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { S, A, esc, fmtDateTime, norm } = MS.util;
  const ui = MS.ui, store = MS.store, model = MS.model;

  const view = { q: '' };

  function render(host) {
    const needle = norm(view.q);
    const logs = A(store.state.logs)
      .filter((l) => !needle || norm([l.action, l.detail, l.user].join(' ')).indexOf(needle) > -1)
      .slice(0, 300);

    host.innerHTML =
      '<section class="card filters"><div class="filter-row">'
      + '<label class="field grow"><span>Rechercher</span>'
      + '<input data-keep="log-q" id="log-q" value="' + esc(view.q) + '" placeholder="Action, détail, utilisateur…"></label>'
      + '<button type="button" class="btn small danger-ghost" data-act="purge">' + ui.icon('trash') + ' Purger le journal</button>'
      + '</div><p class="muted">Les 300 dernières actions sont affichées ; le journal en conserve ' + model.LOG_CAP + '.</p></section>'
      + (logs.length
        ? '<section class="card"><ul class="logs">' + logs.map((l) =>
            '<li><span class="log-icon">' + ui.icon(iconFor(l.icon)) + '</span>'
            + '<div class="log-body"><b>' + esc(l.action) + '</b>'
            + (l.detail ? '<span class="log-detail">' + esc(l.detail) + '</span>' : '') + '</div>'
            + '<span class="log-meta">' + esc(fmtDateTime(l.date)) + (l.user ? ' · ' + esc(l.user) : '') + '</span></li>').join('')
          + '</ul></section>'
        : '<section class="card">' + ui.empty('Le journal est vide.') + '</section>');

    const q = ui.$('#log-q', host);
    if (q) q.addEventListener('input', MS.util.debounce(() => { view.q = S(q.value); MS.app.render(); }, 200));
    ui.on(host, '[data-act="purge"]', 'click', async () => {
      const ok = await ui.confirm({
        title: 'Purger le journal', danger: true, confirmLabel: 'Purger',
        message: 'Effacer toutes les lignes du journal ?',
        detail: 'Les données métier ne sont pas touchées.',
      });
      if (!ok) return;
      store.state.logs = [];
      store.log('Journal purgé', '', 'trash');
      store.save({ reason: 'logs' });
      ui.toast('Journal purgé.', 'success');
      MS.app.render();
    });
  }

  function iconFor(name) {
    return ui.ICONS[S(name)] ? S(name) : 'dot';
  }

  MS.screens.logs = { render, view };
})();
