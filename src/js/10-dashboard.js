/* ============================================================
   10 — Tableau de bord
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { S, A, O, M, esc, fmtDate, fmtDateTime, fmtAgo } = MS.util;
  const ui = MS.ui, stats = MS.stats, store = MS.store, model = MS.model;

  function render(host) {
    const month = stats.revenueThisMonth();
    const prev = stats.revenuePreviousMonth();
    const rep = stats.repairStats();
    const alerts = MS.app.alertCount();
    const delta = prev > 0 ? Math.round(((month - prev) / prev) * 100) : (month > 0 ? 100 : 0);
    const deltaText = prev > 0
      ? (delta >= 0 ? '+' : '') + delta + ' % vs mois précédent (' + ui.money(prev) + ')'
      : 'Pas de référence le mois précédent';

    host.innerHTML =
      '<div class="grid stats-grid">'
      + ui.statCard("Chiffre d’affaires du jour", ui.money(stats.revenueToday()), fmtDate(new Date()), 'primary', 'euro')
      + ui.statCard('Ce mois-ci', ui.money(month), deltaText, delta >= 0 ? 'good' : 'warn', 'dashboard')
      + ui.statCard('Réparations en cours', String(rep.open), rep.ready + ' prête(s) à livrer', 'neutral', 'wrench')
      + ui.statCard('Alertes de stock', String(alerts), alerts ? 'À réapprovisionner' : 'Rien à signaler', alerts ? 'warn' : 'good', 'alert')
      + '</div>'

      + '<div class="row-actions">'
      + '<button type="button" class="btn primary" data-act="new-repair">' + ui.icon('wrench') + ' Nouvelle réparation</button>'
      + '<button type="button" class="btn" data-act="new-cash">' + ui.icon('euro') + ' Nouvel encaissement</button>'
      + '</div>'

      + '<div class="grid cols-2">'
      + '<section class="card"><h2>Chiffre d’affaires sur 14 jours</h2>' + chartHtml() + '</section>'
      + '<section class="card"><h2>Répartition du mois par type</h2>' + breakdownHtml() + '</section>'
      + '</div>'

      + '<div class="grid cols-2">'
      + '<section class="card"><h2>Dernières réparations</h2>' + lastRepairsHtml() + '</section>'
      + '<section class="card"><h2>Dernières opérations de caisse</h2>' + lastCashHtml() + '</section>'
      + '</div>';

    ui.on(host, '[data-act="new-repair"]', 'click', () => MS.screens.repairs.openForm());
    ui.on(host, '[data-act="new-cash"]', 'click', () => MS.app.go('cash'));
  }

  /** Courbe dessinee en SVG : aucune dependance. */
  function chartHtml() {
    const series = stats.revenueSeries(14);
    const max = Math.max(1, ...series.map((p) => p.value));
    const W = 560, H = 180, padX = 44, padY = 18;
    const stepX = (W - padX * 2) / Math.max(1, series.length - 1);
    const pts = series.map((p, i) => {
      const x = padX + i * stepX;
      const y = H - padY - (p.value / max) * (H - padY * 2);
      return { x, y, p };
    });
    const line = pts.map((pt, i) => (i ? 'L' : 'M') + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1)).join(' ');
    const area = line + ' L' + pts[pts.length - 1].x.toFixed(1) + ' ' + (H - padY) + ' L' + pts[0].x.toFixed(1) + ' ' + (H - padY) + ' Z';
    const dots = pts.map((pt) =>
      '<circle class="spark-dot" cx="' + pt.x.toFixed(1) + '" cy="' + pt.y.toFixed(1) + '" r="3">'
      + '<title>' + esc(fmtDate(pt.p.day) + ' — ' + ui.money(pt.p.value)) + '</title></circle>').join('');
    const labels = pts.map((pt, i) => (i % 3 === 0 || i === pts.length - 1)
      ? '<text class="spark-label" x="' + pt.x.toFixed(1) + '" y="' + (H - 2) + '" text-anchor="middle">'
        + esc(fmtDate(pt.p.day).slice(0, 5)) + '</text>' : '').join('');
    const total = series.reduce((s, p) => s + p.value, 0);
    return '<div class="chart-wrap"><svg viewBox="0 0 ' + W + ' ' + H + '" class="spark" role="img" '
      + 'aria-label="Chiffre d’affaires des 14 derniers jours, total ' + esc(ui.money(total)) + '">'
      + '<line class="spark-axis" x1="' + padX + '" y1="' + (H - padY) + '" x2="' + (W - padX) + '" y2="' + (H - padY) + '"/>'
      + '<path class="spark-area" d="' + area + '"/><path class="spark-line" d="' + line + '"/>' + dots + labels
      + '<text class="spark-label" x="' + (padX - 6) + '" y="' + (padY + 4) + '" text-anchor="end">' + esc(ui.money(max)) + '</text>'
      + '</svg></div>'
      + '<p class="muted">Total sur la période : <b>' + esc(ui.money(total)) + '</b></p>';
  }

  function breakdownHtml() {
    const { rows, total } = stats.breakdownByType(stats.periodRange('month'));
    if (!rows.length) return ui.empty('Aucun encaissement ce mois-ci.');
    return '<ul class="bars">' + rows.map((r) =>
      '<li><span class="bar-label">' + esc(r.type) + '</span>'
      + '<span class="bar-track"><span class="bar-fill" style="width:' + (r.share * 100).toFixed(1) + '%"></span></span>'
      + '<span class="bar-value">' + esc(ui.money(r.value)) + '</span></li>').join('')
      + '</ul><p class="muted">Total : <b>' + esc(ui.money(total)) + '</b></p>';
  }

  function lastRepairsHtml() {
    const repairs = A(store.state.repairs).slice(0, 6);
    if (!repairs.length) return ui.empty('Aucune réparation enregistrée.');
    return '<ul class="mini-list">' + repairs.map((r) =>
      '<li><a href="#/repair/' + esc(r.id) + '">'
      + '<span class="mini-main"><b>' + esc(r.number) + '</b> — ' + esc(r.device || 'Appareil non précisé') + '</span>'
      + '<span class="mini-sub">' + esc(r.clientName || 'Client de passage') + ' · ' + esc(fmtAgo(r.updatedAt)) + '</span>'
      + '</a>' + ui.badge(r.status, statusKind(r.status)) + '</li>').join('') + '</ul>';
  }

  function statusKind(status) {
    if (S(status) === 'Livré') return 'done';
    if (S(status) === 'Terminé') return 'good';
    if (S(status) === 'Attente pièces') return 'warn';
    return 'neutral';
  }

  function lastCashHtml() {
    const ops = A(store.state.cash).slice(0, 6);
    if (!ops.length) return ui.empty('Aucune opération de caisse.');
    return '<ul class="mini-list">' + ops.map((op) => {
      const withdraw = S(op.type) === 'Retrait';
      return '<li><span class="mini-main"><b>' + esc(withdraw ? '−' + ui.money(op.amount) : ui.money(op.amount)) + '</b> — ' + esc(op.type) + '</span>'
        + '<span class="mini-sub">' + esc(fmtDateTime(op.date)) + ' · ' + esc(op.method) + (op.label ? ' · ' + esc(op.label) : '') + '</span>'
        + ui.badge(withdraw ? 'Retrait' : op.method, withdraw ? 'warn' : 'neutral') + '</li>';
    }).join('') + '</ul>';
  }

  MS.screens.dashboard = { render };
})();
