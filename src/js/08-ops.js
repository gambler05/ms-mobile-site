/* ============================================================
   08 — Operations metier : stock, ventes, caisse, pieces
   L'integrite du stock se joue ici, sur tout le cycle.
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { S, N, I, M, A, O, uid, fmtMoney } = MS.util;
  const model = MS.model;
  const store = MS.store;

  function products() { return A(store.state.products); }
  function findProduct(id) { return products().find((p) => S(p.id) === S(id)) || null; }
  function findRepair(id) { return A(store.state.repairs).find((r) => S(r.id) === S(id)) || null; }
  function findClient(id) { return A(store.state.clients).find((c) => S(c.id) === S(id)) || null; }

  /* -------------------- Stock -------------------- */

  /**
   * Ajuste la quantite d'un article. Le stock ne devient jamais negatif.
   * Le journal coalesce : dix clics tiennent une ligne, un retour au depart l'efface.
   */
  function adjustStock(productId, delta, opts) {
    const o = O(opts);
    const product = findProduct(productId);
    if (!product) return { ok: false, error: 'Article introuvable.' };
    const before = I(product.qty, 0, 0);
    const after = Math.max(0, before + I(delta, 0));
    if (after === before && !o.force) return { ok: true, product, changed: false };
    product.qty = after;
    if (o.silent !== true) {
      store.log('Stock ajusté', product.name + ' : ' + before + ' → ' + after,
        after > before ? 'plus' : 'minus', {
          key: 'stock:' + product.id,
          meta: { from: before, to: after },
          dropIfSame: true,
          merge: (from, meta) => product.name + ' : ' + from + ' → ' + meta.to,
        });
    }
    if (o.save !== false) store.save({ reason: 'stock' });
    return { ok: true, product, changed: true, before, after };
  }

  function setStockQty(productId, qty, opts) {
    const product = findProduct(productId);
    if (!product) return { ok: false, error: 'Article introuvable.' };
    return adjustStock(productId, I(qty, 0, 0) - I(product.qty, 0, 0), opts);
  }

  /** Retire une quantite en respectant le stock disponible. Renvoie ce qui a pu etre retiré. */
  function takeFromStock(productId, qty, opts) {
    const product = findProduct(productId);
    const want = I(qty, 0, 0);
    if (!product || want <= 0) return 0;
    const taken = Math.min(want, I(product.qty, 0, 0));
    if (taken > 0) adjustStock(productId, -taken, Object.assign({ save: false }, O(opts)));
    return taken;
  }

  function giveBackToStock(productId, qty, opts) {
    const give = I(qty, 0, 0);
    if (give <= 0) return 0;
    const product = findProduct(productId);
    if (!product) return 0;
    adjustStock(productId, give, Object.assign({ save: false }, O(opts)));
    return give;
  }

  function saveProduct(data) {
    const incoming = O(data);
    const id = S(incoming.id);
    if (id) {
      const existing = findProduct(id);
      if (!existing) return { ok: false, error: 'Article introuvable.' };
      const before = I(existing.qty, 0, 0);
      const next = model.normProduct(Object.assign({}, existing, incoming), 0);
      next.id = existing.id;
      next.createdAt = existing.createdAt;
      Object.assign(existing, next);
      store.log('Article modifié', existing.name + (before !== existing.qty ? ' (qté ' + before + ' → ' + existing.qty + ')' : ''), 'edit');
      store.save({ reason: 'stock' });
      return { ok: true, product: existing };
    }
    const product = model.normProduct(incoming, products().length);
    store.state.products.unshift(product);
    store.log('Article créé', product.name + ' — ' + product.qty + ' en stock', 'box');
    store.save({ reason: 'stock' });
    return { ok: true, product };
  }

  function deleteProduct(id) {
    const product = findProduct(id);
    if (!product) return { ok: false, error: 'Article introuvable.' };
    store.state.products = products().filter((p) => S(p.id) !== S(id));
    store.log('Article supprimé', product.name, 'trash');
    store.save({ reason: 'stock' });
    return { ok: true };
  }

  /* -------------------- Caisse et ventes -------------------- */

  /**
   * Enregistre un encaissement. Chaque ligne du panier decremente le stock.
   * L'historique de caisse n'est pas modifiable ensuite : c'est un journal.
   */
  function recordCash(data) {
    const d = O(data);
    const items = A(d.items).map(model.normCashItem).filter((i) => i.qty > 0);
    const type = MS.util.pick(d.type, model.CASH_TYPES, 'Vente');
    if (type === 'Retrait') return recordWithdraw(d);

    const itemsTotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const amount = d.amount === undefined || d.amount === '' ? itemsTotal : Math.max(0, M(d.amount, 0));
    if (amount <= 0 && !items.length) return { ok: false, error: 'Saisissez un montant ou ajoutez au moins un article.' };

    const op = model.normCash({
      id: uid('csh'),
      date: d.date || new Date().toISOString(),
      amount,
      type,
      method: d.method,
      label: d.label,
      clientId: d.clientId,
      repairId: d.repairId,
      items,
    });
    store.state.cash.unshift(op);

    // Chaque ligne d'article decremente le stock.
    items.forEach((item) => {
      if (S(item.productId)) takeFromStock(item.productId, item.qty, { silent: true });
    });

    if (items.length) {
      const sale = model.normSale({
        id: uid('sal'), cashId: op.id, items, total: itemsTotal,
        method: op.method, clientId: op.clientId, date: op.date,
      });
      store.state.sales.unshift(sale);
      store.state.counters.sale = I(store.state.counters.sale, 0, 0) + 1;
    }

    store.log('Encaissement', op.type + ' — ' + fmtMoney(op.amount, O(store.state.settings).currency)
      + (op.label ? ' — ' + op.label : ''), 'euro');
    store.save({ reason: 'cash' });
    return { ok: true, op };
  }

  /** Un retrait sort de la caisse en especes, ne touche pas au stock, et compte pour 0. */
  function recordWithdraw(data) {
    const d = O(data);
    const amount = Math.max(0, M(d.amount, 0));
    if (amount <= 0) return { ok: false, error: 'Saisissez le montant du retrait.' };
    const op = model.normCash({
      id: uid('csh'), date: d.date || new Date().toISOString(),
      amount, type: 'Retrait', method: model.WITHDRAW_METHOD,
      label: S(d.label) || 'Retrait de caisse',
    });
    store.state.cash.unshift(op);
    store.log('Retrait de caisse', fmtMoney(amount, O(store.state.settings).currency) + ' — ' + op.label, 'minus');
    store.save({ reason: 'cash' });
    return { ok: true, op };
  }

  /* -------------------- Reparations -------------------- */

  function createRepair(data) {
    const d = O(data);
    if (!S(d.device).trim()) return { ok: false, error: "L’appareil est obligatoire." };
    if (!S(d.issue).trim()) return { ok: false, error: 'La panne déclarée est obligatoire.' };
    const { number, counter } = model.nextRepairNumber(store.state);
    const repair = model.normRepair(Object.assign({}, d, {
      id: uid('rep'), number, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      history: [{ status: MS.util.pick(d.status, model.REPAIR_STATUSES, model.REPAIR_STATUSES[0]),
        date: new Date().toISOString(), note: 'Prise en charge', user: MS.auth.currentUserName() }],
    }), 0);
    store.state.repairs.unshift(repair);
    store.state.counters.repair = counter;
    store.log('Réparation créée', repair.number + ' — ' + repair.device, 'wrench');
    store.save({ reason: 'repairs' });
    return { ok: true, repair };
  }

  function updateRepair(id, patch) {
    const repair = findRepair(id);
    if (!repair) return { ok: false, error: 'Fiche introuvable.' };
    const p = O(patch);
    if (p.device !== undefined && !S(p.device).trim()) return { ok: false, error: "L’appareil est obligatoire." };
    if (p.issue !== undefined && !S(p.issue).trim()) return { ok: false, error: 'La panne déclarée est obligatoire.' };
    const merged = model.normRepair(Object.assign({}, repair, p), 0);
    merged.id = repair.id;
    merged.number = repair.number;
    merged.createdAt = repair.createdAt;
    merged.parts = repair.parts;
    merged.history = repair.history;
    merged.updatedAt = new Date().toISOString();
    Object.assign(repair, merged);
    store.log('Fiche modifiée', repair.number + ' — ' + repair.device, 'edit', { key: 'repair:' + repair.id });
    store.save({ reason: 'repairs' });
    return { ok: true, repair };
  }

  function setRepairStatus(id, status, note) {
    const repair = findRepair(id);
    if (!repair) return { ok: false, error: 'Fiche introuvable.' };
    const next = MS.util.pick(status, model.REPAIR_STATUSES, repair.status);
    if (next === repair.status && !S(note)) return { ok: true, repair, changed: false };
    repair.status = next;
    repair.updatedAt = new Date().toISOString();
    repair.history = A(repair.history).concat([{
      status: next, date: new Date().toISOString(), note: S(note), user: MS.auth.currentUserName(),
    }]);
    store.log('Statut modifié', repair.number + ' → ' + next, 'refresh');
    store.save({ reason: 'repairs' });
    return { ok: true, repair, changed: true };
  }

  function deleteRepair(id) {
    const repair = findRepair(id);
    if (!repair) return { ok: false, error: 'Fiche introuvable.' };
    // Les pieces deja decomptees repartent en stock.
    A(repair.parts).forEach((part) => {
      if (part.fromStock && S(part.productId)) giveBackToStock(part.productId, part.qty, { silent: true });
    });
    store.state.repairs = A(store.state.repairs).filter((r) => S(r.id) !== S(id));
    store.log('Fiche supprimée', repair.number, 'trash');
    store.save({ reason: 'repairs' });
    return { ok: true };
  }

  /* -------------------- Pieces d'une reparation -------------------- */

  /**
   * Ajoute une piece. Si elle vient du stock et que l'on decompte,
   * la quantite est retiree immediatement et `fromStock` en garde la trace.
   */
  function addPart(repairId, data) {
    const repair = findRepair(repairId);
    if (!repair) return { ok: false, error: 'Fiche introuvable.' };
    const d = O(data);
    const part = model.normPart({
      id: uid('prt'), productId: d.productId, name: d.name, qty: I(d.qty, 1, 0) || 1,
      price: d.price, cost: d.cost, fromStock: false,
    });
    if (!S(part.name)) return { ok: false, error: 'Nommez la pièce.' };
    const wantStock = MS.util.B(d.fromStock, false) && S(part.productId);
    if (wantStock) {
      const product = findProduct(part.productId);
      if (!product) return { ok: false, error: "Cet article n’existe plus dans le stock." };
      const taken = takeFromStock(part.productId, part.qty, { silent: true });
      part.fromStock = taken > 0;
      part.qty = taken > 0 ? taken : part.qty;
      if (taken < I(d.qty, 1, 0)) {
        store.log('Pièce partiellement décomptée', product.name + ' : ' + taken + ' retirée(s) sur ' + I(d.qty, 1, 0) + ' demandée(s)', 'alert');
      }
    }
    repair.parts = A(repair.parts).concat([part]);
    repair.updatedAt = new Date().toISOString();
    store.log('Pièce ajoutée', repair.number + ' — ' + part.name + ' ×' + part.qty
      + (part.fromStock ? ' (décomptée du stock)' : ''), 'plus');
    store.save({ reason: 'repairs' });
    return { ok: true, part, repair };
  }

  /** Basculer le decompte reajuste le stock dans le bon sens. */
  function togglePartStock(repairId, partId) {
    const repair = findRepair(repairId);
    if (!repair) return { ok: false, error: 'Fiche introuvable.' };
    const part = A(repair.parts).find((p) => S(p.id) === S(partId));
    if (!part) return { ok: false, error: 'Pièce introuvable.' };
    if (!S(part.productId)) return { ok: false, error: "Cette pièce n’est rattachée à aucun article du stock." };
    const product = findProduct(part.productId);
    if (!product) return { ok: false, error: "Cet article n’existe plus dans le stock." };

    if (part.fromStock) {
      giveBackToStock(part.productId, part.qty, { silent: true });
      part.fromStock = false;
      store.log('Pièce remise en stock', repair.number + ' — ' + part.name + ' ×' + part.qty, 'refresh');
    } else {
      const taken = takeFromStock(part.productId, part.qty, { silent: true });
      if (taken <= 0) {
        store.save({ reason: 'repairs' });
        return { ok: false, error: 'Stock épuisé pour ' + product.name + '.' };
      }
      part.qty = taken;
      part.fromStock = true;
      store.log('Pièce décomptée', repair.number + ' — ' + part.name + ' ×' + taken, 'minus');
    }
    repair.updatedAt = new Date().toISOString();
    store.save({ reason: 'repairs' });
    return { ok: true, part };
  }

  /** Supprimer une piece decomptee la remet en stock. */
  function removePart(repairId, partId) {
    const repair = findRepair(repairId);
    if (!repair) return { ok: false, error: 'Fiche introuvable.' };
    const part = A(repair.parts).find((p) => S(p.id) === S(partId));
    if (!part) return { ok: false, error: 'Pièce introuvable.' };
    if (part.fromStock && S(part.productId)) giveBackToStock(part.productId, part.qty, { silent: true });
    repair.parts = A(repair.parts).filter((p) => S(p.id) !== S(partId));
    repair.updatedAt = new Date().toISOString();
    store.log('Pièce retirée', repair.number + ' — ' + part.name
      + (part.fromStock ? ' (remise en stock)' : ''), 'trash');
    store.save({ reason: 'repairs' });
    return { ok: true };
  }

  function setPartQty(repairId, partId, qty) {
    const repair = findRepair(repairId);
    if (!repair) return { ok: false, error: 'Fiche introuvable.' };
    const part = A(repair.parts).find((p) => S(p.id) === S(partId));
    if (!part) return { ok: false, error: 'Pièce introuvable.' };
    const want = I(qty, 1, 0);
    const before = I(part.qty, 1, 0);
    if (want === before) return { ok: true, part };
    if (part.fromStock && S(part.productId)) {
      const delta = want - before;
      if (delta > 0) {
        const taken = takeFromStock(part.productId, delta, { silent: true });
        part.qty = before + taken;
        if (taken < delta) {
          store.save({ reason: 'repairs' });
          return { ok: false, error: 'Stock insuffisant : quantité portée à ' + part.qty + '.', part };
        }
      } else {
        giveBackToStock(part.productId, -delta, { silent: true });
        part.qty = want;
      }
    } else {
      part.qty = want;
    }
    repair.updatedAt = new Date().toISOString();
    store.save({ reason: 'repairs' });
    return { ok: true, part };
  }

  /* -------------------- Clients -------------------- */

  function saveClient(data) {
    const d = O(data);
    const id = S(d.id);
    if (id) {
      const existing = findClient(id);
      if (!existing) return { ok: false, error: 'Client introuvable.' };
      const next = model.normClient(Object.assign({}, existing, d), 0);
      next.id = existing.id;
      next.createdAt = existing.createdAt;
      Object.assign(existing, next);
      store.log('Client modifié', existing.name, 'edit');
      store.save({ reason: 'clients' });
      return { ok: true, client: existing };
    }
    if (!S(d.name).trim()) return { ok: false, error: 'Le nom du client est obligatoire.' };
    const client = model.normClient(d, A(store.state.clients).length);
    store.state.clients.unshift(client);
    store.log('Client créé', client.name + (client.phone ? ' — ' + client.phone : ''), 'user');
    store.save({ reason: 'clients' });
    return { ok: true, client };
  }

  function deleteClient(id) {
    const client = findClient(id);
    if (!client) return { ok: false, error: 'Client introuvable.' };
    store.state.clients = A(store.state.clients).filter((c) => S(c.id) !== S(id));
    // Les fiches gardent le nom : on detache sans faire disparaitre l'information.
    A(store.state.repairs).forEach((r) => {
      if (S(r.clientId) === S(id)) { r.clientId = ''; r.clientName = r.clientName || client.name; }
    });
    store.log('Client supprimé', client.name, 'trash');
    store.save({ reason: 'clients' });
    return { ok: true };
  }

  function repairsOfClient(clientId) {
    const id = S(clientId);
    return A(store.state.repairs).filter((r) => S(r.clientId) === id);
  }

  function countRepairs(clientId) { return repairsOfClient(clientId).length; }

  /**
   * Recherche client : classement par pertinence, insensible aux accents,
   * insensible aux espaces dans les numeros, et jusqu'au milieu d'un numero.
   */
  function searchClients(query, limit) {
    const raw = S(query).trim();
    if (!raw) return [];
    const q = MS.util.norm(raw);
    const qDigits = MS.util.digits(raw);
    const out = [];
    A(store.state.clients).forEach((c) => {
      const name = MS.util.norm(c.name);
      const phone = MS.util.digits(c.phone);
      let score = -1;
      if (q && name.indexOf(q) === 0) score = 100;                                  // commence par
      else if (q && new RegExp('(^|\\s)' + escapeRe(q)).test(name)) score = 80;      // debut de mot
      else if (q && name.indexOf(q) > -1) score = 60;                               // milieu
      if (qDigits.length >= 2 && phone) {
        if (phone.indexOf(qDigits) === 0) score = Math.max(score, 95);
        else if (phone.indexOf(qDigits) > -1) score = Math.max(score, 70);           // milieu d'un numero
      }
      if (q && MS.util.norm(c.email).indexOf(q) === 0) score = Math.max(score, 50);
      if (score >= 0) out.push({ client: c, score, repairs: countRepairs(c.id) });
    });
    out.sort((a, b) => b.score - a.score || MS.util.norm(a.client.name).localeCompare(MS.util.norm(b.client.name)));
    return out.slice(0, I(limit, 8, 1));
  }

  function escapeRe(s) { return S(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* -------------------- Tarifs depuis la grille -------------------- */

  /**
   * Cherche le modele le plus precis : « iPhone 16 Pro Max » avant « iPhone 16 ».
   * Renvoie null si l'appareil est absent : on le dit, on ne devine pas.
   */
  function findPricing(device) {
    const target = MS.util.norm(device);
    if (!target) return null;
    let best = null;
    A(O(store.state.pricing).tabs).forEach((tab) => {
      A(tab.rows).forEach((row) => {
        const modelName = MS.util.norm(row.model);
        if (!modelName) return;
        const contained = target.indexOf(modelName) > -1 || modelName.indexOf(target) > -1;
        if (!contained) return;
        const exact = modelName === target;
        const score = (exact ? 1000 : 0) + modelName.length + (target.indexOf(modelName) > -1 ? 50 : 0);
        if (!best || score > best.score) {
          best = {
            score, tab, row,
            prices: A(tab.cols).map((col) => ({ label: col.name, value: S(O(row.cells)[col.id]) }))
              .filter((p) => S(p.value).trim()),
          };
        }
      });
    });
    return best;
  }

  /** Les valeurs restent du texte, mais on sait en extraire un nombre. */
  function priceFromText(text) {
    const m = S(text).replace(/\s/g, '').match(/(\d+([.,]\d{1,2})?)/);
    if (!m) return null;
    const n = N(m[1], NaN);
    return Number.isFinite(n) ? n : null;
  }

  MS.ops = {
    findProduct, findRepair, findClient,
    adjustStock, setStockQty, takeFromStock, giveBackToStock, saveProduct, deleteProduct,
    recordCash, recordWithdraw,
    createRepair, updateRepair, setRepairStatus, deleteRepair,
    addPart, togglePartStock, removePart, setPartQty,
    saveClient, deleteClient, repairsOfClient, countRepairs, searchClients,
    findPricing, priceFromText,
  };
})();
