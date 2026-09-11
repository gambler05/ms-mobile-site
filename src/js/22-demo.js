/* ============================================================
   22 — Jeu de démonstration
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { uid, addDays } = MS.util;
  const model = MS.model, store = MS.store;

  function iso(daysAgo, hour) {
    const d = addDays(new Date(), -daysAgo);
    d.setHours(hour || 10, 30, 0, 0);
    return d.toISOString();
  }

  function build() {
    const state = model.emptyState();
    state.settings = model.normSettings(Object.assign({}, store.state.settings, {
      shopName: store.state.settings.shopName || MS.config.shopName,
    }));

    const products = [
      { name: 'Écran iPhone 13 (OLED)', category: 'Écrans', ref: 'SCR-IP13', supplier: 'MobileParts', qty: 6, minQty: 2, cost: 42, price: 129 },
      { name: 'Écran Samsung S21', category: 'Écrans', ref: 'SCR-S21', supplier: 'MobileParts', qty: 1, minQty: 2, cost: 58, price: 159 },
      { name: 'Batterie iPhone 12', category: 'Batteries', ref: 'BAT-IP12', supplier: 'CellPro', qty: 0, minQty: 3, cost: 14, price: 59 },
      { name: 'Connecteur de charge iPhone 11', category: 'Connecteurs de charge', ref: 'CNX-IP11', supplier: 'CellPro', qty: 4, cost: 9, price: 49 },
      { name: 'Coque silicone iPhone 15', category: 'Accessoires', variant: 'Noir', qty: 12, cost: 2.5, price: 14.9 },
      { name: 'Chargeur USB-C 20 W', category: 'Chargeurs', qty: 8, cost: 6, price: 24.9 },
      { name: 'Film verre trempé universel', category: 'Films de protection', qty: 25, cost: 1.2, price: 9.9 },
      { name: 'iPhone 12 64 Go reconditionné', category: 'Téléphones', condition: 'Reconditionné', variant: 'Bleu', ref: '356789123456789', qty: 2, cost: 210, price: 329 },
      { name: 'Écouteurs sans fil', category: 'Écouteurs', qty: 3, minQty: 4, cost: 18, price: 49.9 },
    ].map((p, i) => model.normProduct(Object.assign({ id: uid('prd'), createdAt: iso(30 - i) }, p), i));

    const clients = [
      { name: 'Marie Dupont', phone: '06 12 34 56 78', email: 'marie.dupont@example.fr', address: '12 rue des Lilas, Lyon' },
      { name: 'Karim Benali', phone: '07 98 76 54 32', email: 'k.benali@example.fr' },
      { name: 'Sophie Lemaître', phone: '06 45 23 89 01', notes: 'Préfère être prévenue par SMS.' },
      { name: 'Entreprise Colibri', phone: '04 78 55 12 00', email: 'contact@colibri.example', address: '4 quai Perrache, Lyon' },
    ].map((c, i) => model.normClient(Object.assign({ id: uid('cli'), createdAt: iso(60 - i * 5) }, c), i));

    const repairs = [
      { clientId: clients[0].id, clientName: clients[0].name, clientPhone: clients[0].phone, device: 'iPhone 13', imei: '356123456789012', issue: 'Écran cassé suite à une chute', deviceState: 'Coque rayée, vitre arrière intacte', price: 149, deposit: 50, status: 'En réparation', days: 2 },
      { clientId: clients[1].id, clientName: clients[1].name, clientPhone: clients[1].phone, device: 'Samsung Galaxy S21', issue: 'Ne charge plus', deviceState: 'Bon état général', price: 69, status: 'Attente pièces', days: 4 },
      { clientId: clients[2].id, clientName: clients[2].name, clientPhone: clients[2].phone, device: 'iPhone 11', issue: 'Batterie qui se vide en 2 h', price: 59, deposit: 0, status: 'Terminé', days: 6 },
      { clientName: 'Client de passage', clientPhone: '', device: 'iPad Air 2', issue: 'Vitre fissurée', price: 119, status: 'Diagnostic', days: 1 },
      { clientId: clients[3].id, clientName: clients[3].name, clientPhone: clients[3].phone, device: 'MacBook Pro 13"', issue: 'Clavier qui répète des touches', price: 189, deposit: 100, status: 'Livré', days: 12 },
    ].map((r, i) => model.normRepair(Object.assign({}, r, {
      id: uid('rep'), number: 'REP-' + String(i + 1).padStart(4, '0'),
      createdAt: iso(r.days, 9), updatedAt: iso(Math.max(0, r.days - 1), 16),
      history: [
        { status: 'En attente', date: iso(r.days, 9), note: 'Prise en charge' },
        { status: r.status, date: iso(Math.max(0, r.days - 1), 16), note: '' },
      ],
    }), i));

    // Une pièce décomptée, pour illustrer le cycle complet.
    repairs[0].parts = [model.normPart({
      id: uid('prt'), productId: products[0].id, name: products[0].name, qty: 1, price: 129, cost: 42, fromStock: true,
    })];
    products[0].qty = 5;

    const cash = [];
    const types = ['Vente', 'Réparation', 'Accessoire', 'Service', 'Diagnostic'];
    for (let d = 13; d >= 0; d--) {
      const n = 1 + ((d * 7) % 3);
      for (let k = 0; k < n; k++) {
        const type = types[(d + k) % types.length];
        const amount = [14.9, 59, 129, 24.9, 89, 39, 159][(d + k * 3) % 7];
        cash.push(model.normCash({
          id: uid('csh'), date: iso(d, 10 + k * 3), amount, type,
          method: (d + k) % 3 === 0 ? 'Espèces' : 'Carte bancaire',
          label: type === 'Réparation' ? 'Solde intervention' : 'Vente comptoir',
        }));
      }
    }
    cash.push(model.normCash({ id: uid('csh'), date: iso(3, 18), amount: 200, type: 'Retrait', label: 'Dépôt en banque' }));
    cash.sort((a, b) => (a.date < b.date ? 1 : -1));

    const cols = ['Écran', 'Batterie', 'Connecteur', 'Vitre arrière', 'Caméra'];
    const mkTab = (name, models) => {
      const colObjs = cols.map((c) => ({ id: uid('col'), name: c }));
      return {
        id: uid('tab'), name, cols: colObjs,
        rows: models.map((m) => ({
          id: uid('row'), model: m[0],
          cells: colObjs.reduce((acc, c, i) => { acc[c.id] = m[1][i] || ''; return acc; }, {}),
        })),
      };
    };
    const pricing = { tabs: [
      mkTab('iPhone', [
        ['iPhone 16 Pro Max', ['389', '99', '79', '169', 'sur devis']],
        ['iPhone 16', ['299', '89', '79', '139', 'sur devis']],
        ['iPhone 15', ['259/179', '89', '69', '129', '119']],
        ['iPhone 14', ['229/159', '79', '69', '119', '109']],
        ['iPhone 13', ['189/149', '79', '69', '109', '99']],
        ['iPhone 12', ['169/129', '69', '59', '99', '89']],
        ['iPhone 11', ['129/99', '59', '49', '89', '79']],
      ]),
      mkTab('Samsung', [
        ['Galaxy S24 Ultra', ['429', '109', '89', '-', 'sur devis']],
        ['Galaxy S23', ['329', '99', '79', '149', '129']],
        ['Galaxy S22', ['289', '89', '79', '139', '119']],
        ['Galaxy S21', ['249', '89', '69', '129', '109']],
        ['Galaxy A54', ['159', '69', '59', '99', '89']],
      ]),
    ] };

    state.products = products;
    state.clients = clients;
    state.repairs = repairs;
    state.cash = cash;
    state.pricing = pricing;
    state.counters = { repair: repairs.length, invoice: 0, sale: 0 };
    state.logs = [model.normLog({ action: 'Jeu de démonstration', detail: 'Données d’exemple chargées', icon: 'box', date: new Date().toISOString() })];
    return model.normState(state);
  }

  function load() {
    const state = build();
    store.replaceState(state, { reason: 'demo' });
    return state;
  }

  MS.demo = { build, load };
})();
