/* ============================================================
   09 — Agregats : periodes, chiffre d'affaires, repartitions
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { S, N, M, A, O, I, toDate, dayKey, monthKey, startOfDay, endOfDay, addDays } = MS.util;
  const model = MS.model;
  const store = MS.store;

  const PERIODS = [
    { id: 'day', label: 'Jour' },
    { id: 'yesterday', label: 'Hier' },
    { id: 'week', label: 'Semaine' },
    { id: 'month', label: 'Mois' },
    { id: 'all', label: 'Tout' },
  ];

  /** Bornes d'une periode nommee. `all` ne borne rien. */
  function periodRange(period, ref) {
    const now = ref ? toDate(ref) : new Date();
    switch (S(period)) {
      case 'yesterday': {
        const d = addDays(now, -1);
        return { from: startOfDay(d), to: endOfDay(d) };
      }
      case 'week': {
        const d = new Date(now);
        const dow = (d.getDay() + 6) % 7; // lundi = 0
        return { from: startOfDay(addDays(d, -dow)), to: endOfDay(now) };
      }
      case 'month': {
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        return { from: startOfDay(d), to: endOfDay(now) };
      }
      case 'all':
        return { from: null, to: null };
      case 'day':
      default:
        return { from: startOfDay(now), to: endOfDay(now) };
    }
  }

  function inRange(date, range) {
    const r = O(range);
    if (!r.from && !r.to) return true;
    const t = toDate(date).getTime();
    if (r.from && t < r.from.getTime()) return false;
    if (r.to && t > r.to.getTime()) return false;
    return true;
  }

  /** Operations de caisse d'une periode, filtre de type optionnel. */
  function cashIn(range, type) {
    const wanted = S(type);
    return A(store.state.cash).filter((op) => inRange(op.date, range) && (!wanted || S(op.type) === wanted));
  }

  /** Totaux : encaisse (hors retraits), especes, carte, retraits. */
  function totals(ops) {
    const out = { revenue: 0, cash: 0, card: 0, withdrawals: 0, count: 0 };
    A(ops).forEach((op) => {
      const amount = Math.max(0, M(O(op).amount, 0));
      out.count += 1;
      if (S(op.type) === 'Retrait') { out.withdrawals += amount; return; }
      out.revenue += amount;
      if (S(op.method) === 'Espèces') out.cash += amount;
      else if (S(op.method) === 'Carte bancaire') out.card += amount;
    });
    const round = (v) => Math.round(v * 100) / 100;
    out.revenue = round(out.revenue); out.cash = round(out.cash);
    out.card = round(out.card); out.withdrawals = round(out.withdrawals);
    return out;
  }

  function revenueBetween(from, to) {
    return totals(A(store.state.cash).filter((op) => inRange(op.date, { from, to }))).revenue;
  }

  function revenueToday() {
    const r = periodRange('day');
    return revenueBetween(r.from, r.to);
  }

  function revenueThisMonth() {
    const r = periodRange('month');
    return revenueBetween(r.from, r.to);
  }

  function revenuePreviousMonth() {
    const now = new Date();
    const from = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
    return revenueBetween(from, to);
  }

  /** Courbe du chiffre d'affaires sur N jours (le dernier point est aujourd'hui). */
  function revenueSeries(days) {
    const n = I(days, 14, 1);
    const buckets = new Map();
    for (let i = n - 1; i >= 0; i--) buckets.set(dayKey(addDays(new Date(), -i)), 0);
    A(store.state.cash).forEach((op) => {
      const key = dayKey(op.date);
      if (!buckets.has(key)) return;
      buckets.set(key, buckets.get(key) + model.cashRevenue(op));
    });
    return Array.from(buckets.entries()).map(([day, value]) => ({ day, value: Math.round(value * 100) / 100 }));
  }

  /** Repartition du chiffre d'affaires du mois par type d'operation. */
  function breakdownByType(range) {
    const map = new Map();
    cashIn(range).forEach((op) => {
      const revenue = model.cashRevenue(op);
      if (!revenue) return;
      const type = S(op.type) || 'Autre';
      map.set(type, (map.get(type) || 0) + revenue);
    });
    const rows = Array.from(map.entries())
      .map(([type, value]) => ({ type, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);
    const total = rows.reduce((s, r) => s + r.value, 0);
    rows.forEach((r) => { r.share = total > 0 ? r.value / total : 0; });
    return { rows, total: Math.round(total * 100) / 100 };
  }

  function stockStats() {
    const settings = O(store.state.settings);
    const products = A(store.state.products);
    let units = 0, low = 0, out = 0, value = 0;
    products.forEach((p) => {
      const qty = I(p.qty, 0, 0);
      units += qty;
      value += qty * Math.max(0, M(p.cost, 0));
      const level = model.stockLevel(p, settings);
      if (level === 'out') out += 1;
      else if (level === 'low') low += 1;
    });
    return { units, refs: products.length, low, out, value: Math.round(value * 100) / 100 };
  }

  function repairStats() {
    const repairs = A(store.state.repairs);
    const open = repairs.filter((r) => ['En attente', 'Diagnostic', 'Attente pièces', 'En réparation'].includes(S(r.status)));
    const ready = repairs.filter((r) => S(r.status) === 'Terminé');
    return { total: repairs.length, open: open.length, ready: ready.length };
  }

  /** Y a-t-il des operations hors de la periode affichee ? (bandeau d'information) */
  function outsideCount(range) {
    if (!O(range).from && !O(range).to) return 0;
    return A(store.state.cash).filter((op) => !inRange(op.date, range)).length;
  }

  MS.stats = {
    PERIODS, periodRange, inRange, cashIn, totals, revenueBetween, revenueToday,
    revenueThisMonth, revenuePreviousMonth, revenueSeries, breakdownByType,
    stockStats, repairStats, outsideCount,
  };
})();
