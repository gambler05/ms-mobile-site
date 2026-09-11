/* ============================================================
   02 — Modele de donnees et normalisation
   Regle 2 : un enregistrement abime est complete, jamais rejete.
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { S, N, I, M, A, O, B, D, uid, pick, uniquifyIds, deepClone } = MS.util;

  const CATEGORIES = [
    'Téléphones', 'Consoles', 'Accessoires', 'Ordinateurs', 'Écrans', 'Batteries',
    'Châssis', 'Vitre arrière', 'Caméra arrière', 'Caméra avant', 'Connecteurs de charge',
    'iPad et tablettes', 'Câbles', 'Chargeurs', 'Écouteurs', 'Casques', 'Power banks',
    'Films de protection', 'Autre / Divers',
  ];
  const DEFAULT_CATEGORY = 'Autre / Divers';
  const CONDITIONS = ['Neuf', 'Occasion', 'Reconditionné'];
  const REPAIR_STATUSES = ['En attente', 'Diagnostic', 'Attente pièces', 'En réparation', 'Terminé', 'Livré'];
  const CASH_TYPES = ['Vente', 'Réparation', 'Accessoire', 'Diagnostic', 'Service', 'Retrait'];
  const PAY_METHODS = ['Espèces', 'Carte bancaire'];
  const WITHDRAW_METHOD = 'De la caisse';
  const ROLES = ['Administrateur', 'Vendeur', 'Technicien'];
  const ADMIN_SCREENS = ['settings', 'logs'];
  const SENSITIVE_SCREENS = ['stock', 'alerts', 'repairs', 'clients', 'pricing', 'settings', 'logs', 'repair', 'client'];

  const STATE_VERSION = 1;

  const FACTORY_SETTINGS = {
    shopName: 'MS MOBILE',
    docName: '',
    address: '',
    phone: '',
    email: '',
    siret: '',
    vatRate: 20,
    currency: 'EUR',
    lowStock: 2,
    warrantyMonths: 3,
    smsTemplate: 'Bonjour {client}, votre {appareil} est prêt. Montant à régler : {montant}. {boutique} — réf. {reference}.',
    cgv: "Le client déclare avoir pris connaissance des conditions de dépôt. Tout appareil non retiré dans un délai de 90 jours pourra être considéré comme abandonné. La garantie couvre la pièce remplacée pendant {garantie} mois, hors casse, oxydation et mauvaise utilisation. Une sauvegarde des données est recommandée avant intervention : l’atelier ne peut être tenu responsable d’une perte de données.",
    logo: '',
    theme: 'light',
    authScope: 'off',
    autolockMinutes: 0,
    maxAttempts: 5,
  };

  /* -------------------- Parametres -------------------- */

  function normSettings(raw) {
    const s = O(raw);
    const out = {};
    out.shopName = S(s.shopName, FACTORY_SETTINGS.shopName) || FACTORY_SETTINGS.shopName;
    out.docName = S(s.docName);
    out.address = S(s.address);
    out.phone = S(s.phone);
    out.email = S(s.email);
    out.siret = S(s.siret);
    out.vatRate = Math.max(0, M(s.vatRate === undefined ? FACTORY_SETTINGS.vatRate : s.vatRate, FACTORY_SETTINGS.vatRate));
    out.currency = S(s.currency, FACTORY_SETTINGS.currency) || FACTORY_SETTINGS.currency;
    out.lowStock = I(s.lowStock === undefined ? FACTORY_SETTINGS.lowStock : s.lowStock, FACTORY_SETTINGS.lowStock, 0);
    out.warrantyMonths = I(s.warrantyMonths === undefined ? FACTORY_SETTINGS.warrantyMonths : s.warrantyMonths, FACTORY_SETTINGS.warrantyMonths, 0);
    out.smsTemplate = S(s.smsTemplate, FACTORY_SETTINGS.smsTemplate) || FACTORY_SETTINGS.smsTemplate;
    out.cgv = S(s.cgv, FACTORY_SETTINGS.cgv) || FACTORY_SETTINGS.cgv;
    out.logo = S(s.logo);
    out.theme = pick(s.theme, ['light', 'dark'], 'light');
    out.authScope = pick(s.authScope, ['off', 'app', 'sensitive'], 'off');
    out.autolockMinutes = pick(I(s.autolockMinutes, 0, 0), [0, 5, 15, 30, 60], 0);
    out.maxAttempts = I(s.maxAttempts === undefined ? 5 : s.maxAttempts, 5, 1);
    out.accounts = A(s.accounts).map(normAccount).filter((a) => a.login);
    out.recovery = S(s.recovery);
    return out;
  }

  function normAccount(raw) {
    const a = O(raw);
    return {
      id: S(a.id) || uid('usr'),
      login: S(a.login).trim(),
      name: S(a.name) || S(a.login).trim(),
      role: pick(a.role, ROLES, 'Vendeur'),
      salt: S(a.salt),
      hash: S(a.hash),
      createdAt: D(a.createdAt),
    };
  }

  /* -------------------- Article de stock -------------------- */

  function normProduct(raw, index) {
    const p = O(raw);
    const n = I(index, 0, 0) + 1;
    return {
      id: S(p.id) || uid('prd'),
      name: S(p.name).trim() || ('Article ' + n),
      category: pick(p.category, CATEGORIES, DEFAULT_CATEGORY),
      condition: pick(p.condition, CONDITIONS, 'Neuf'),
      ref: S(p.ref),
      supplier: S(p.supplier),
      variant: S(p.variant),
      qty: I(p.qty, 0, 0),
      minQty: I(p.minQty, 0, 0),
      cost: Math.max(0, M(p.cost, 0)),
      price: Math.max(0, M(p.price, 0)),
      notes: S(p.notes),
      createdAt: D(p.createdAt),
    };
  }

  /** Seuil effectif : le seuil de l'article, sinon le seuil general. */
  function threshold(product, settings) {
    const own = I(O(product).minQty, 0, 0);
    return own > 0 ? own : I(O(settings).lowStock, 2, 0);
  }

  /** Trois etats derives : rupture / faible / normal. */
  function stockLevel(product, settings) {
    const q = I(O(product).qty, 0, 0);
    if (q <= 0) return 'out';
    if (q <= threshold(product, settings)) return 'low';
    return 'ok';
  }

  const STOCK_LEVEL_LABEL = { out: 'Rupture', low: 'Stock faible', ok: 'En stock' };

  /* -------------------- Client -------------------- */

  function normClient(raw, index) {
    const c = O(raw);
    const n = I(index, 0, 0) + 1;
    return {
      id: S(c.id) || uid('cli'),
      name: S(c.name).trim() || ('Client ' + n),
      phone: S(c.phone).trim(),
      email: S(c.email).trim(),
      address: S(c.address),
      notes: S(c.notes),
      createdAt: D(c.createdAt),
    };
  }

  /* -------------------- Reparation -------------------- */

  function normPart(raw) {
    const p = O(raw);
    return {
      id: S(p.id) || uid('prt'),
      productId: S(p.productId),
      name: S(p.name).trim() || 'Pièce',
      qty: I(p.qty, 1, 0),
      price: Math.max(0, M(p.price, 0)),
      cost: Math.max(0, M(p.cost, 0)),
      fromStock: B(p.fromStock, false),
    };
  }

  function normHistory(raw) {
    const h = O(raw);
    return {
      status: pick(h.status, REPAIR_STATUSES, REPAIR_STATUSES[0]),
      date: D(h.date),
      note: S(h.note),
      user: S(h.user),
    };
  }

  function normRepair(raw, index) {
    const r = O(raw);
    const n = I(index, 0, 0) + 1;
    const status = pick(r.status, REPAIR_STATUSES, REPAIR_STATUSES[0]);
    let history = A(r.history).map(normHistory);
    if (!history.length) history = [{ status, date: D(r.createdAt), note: 'Création de la fiche', user: '' }];
    return {
      id: S(r.id) || uid('rep'),
      number: S(r.number).trim() || ('REP-' + String(n).padStart(4, '0')),
      clientId: S(r.clientId),
      clientName: S(r.clientName).trim(),
      clientPhone: S(r.clientPhone).trim(),
      device: S(r.device).trim(),
      imei: S(r.imei).trim(),
      issue: S(r.issue).trim(),
      deviceState: S(r.deviceState),
      passcode: S(r.passcode),
      price: Math.max(0, M(r.price, 0)),
      deposit: Math.max(0, M(r.deposit, 0)),
      status,
      parts: A(r.parts).map(normPart),
      signature: S(r.signature),
      invoiceNo: S(r.invoiceNo),
      history,
      notes: S(r.notes),
      createdAt: D(r.createdAt),
      updatedAt: D(r.updatedAt, D(r.createdAt)),
    };
  }

  /** Reste a regler : prix estime + pieces facturees - acompte, jamais negatif a l'affichage. */
  function repairBalance(repair) {
    const r = O(repair);
    const parts = A(r.parts).reduce((sum, p) => sum + Math.max(0, M(O(p).price, 0)) * I(O(p).qty, 1, 0), 0);
    return Math.round((Math.max(0, M(r.price, 0)) + parts - Math.max(0, M(r.deposit, 0))) * 100) / 100;
  }

  function repairTotal(repair) {
    const r = O(repair);
    const parts = A(r.parts).reduce((sum, p) => sum + Math.max(0, M(O(p).price, 0)) * I(O(p).qty, 1, 0), 0);
    return Math.round((Math.max(0, M(r.price, 0)) + parts) * 100) / 100;
  }

  /* -------------------- Caisse et ventes -------------------- */

  function normCashItem(raw) {
    const i = O(raw);
    return {
      productId: S(i.productId),
      name: S(i.name).trim() || 'Article',
      qty: I(i.qty, 1, 0),
      price: Math.max(0, M(i.price, 0)),
    };
  }

  function normCash(raw) {
    const c = O(raw);
    const type = pick(c.type, CASH_TYPES, 'Vente');
    const isWithdraw = type === 'Retrait';
    return {
      id: S(c.id) || uid('csh'),
      date: D(c.date, D(c.createdAt)),
      amount: Math.max(0, M(c.amount, 0)),
      type,
      method: isWithdraw ? WITHDRAW_METHOD : pick(c.method, PAY_METHODS, PAY_METHODS[0]),
      label: S(c.label),
      clientId: S(c.clientId),
      repairId: S(c.repairId),
      items: A(c.items).map(normCashItem),
      createdAt: D(c.createdAt, D(c.date)),
    };
  }

  /** Regle de chiffre d'affaires : un retrait compte pour 0 dans l'encaisse. */
  function cashRevenue(op) {
    const c = O(op);
    return S(c.type) === 'Retrait' ? 0 : Math.max(0, M(c.amount, 0));
  }

  function normSale(raw) {
    const s = O(raw);
    const items = A(s.items).map(normCashItem);
    const computed = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    return {
      id: S(s.id) || uid('sal'),
      cashId: S(s.cashId),
      items,
      total: s.total === undefined ? Math.round(computed * 100) / 100 : Math.max(0, M(s.total, 0)),
      method: pick(s.method, PAY_METHODS, PAY_METHODS[0]),
      clientId: S(s.clientId),
      date: D(s.date, D(s.createdAt)),
      createdAt: D(s.createdAt, D(s.date)),
    };
  }

  /* -------------------- Grille tarifaire -------------------- */

  function normPricing(raw) {
    const tabs = A(O(raw).tabs !== undefined ? O(raw).tabs : raw).map((tab, ti) => {
      const t = O(tab);
      const cols = A(t.cols).map((c, ci) => {
        const col = O(c);
        return { id: S(col.id) || uid('col'), name: S(col.name).trim() || ('Colonne ' + (ci + 1)) };
      });
      // Contrainte d'integrite : identifiants uniques dans l'onglet.
      uniquifyIds(cols, 'col');
      const rows = A(t.rows).map((r, ri) => {
        const row = O(r);
        const cells = O(row.cells);
        const clean = {};
        cols.forEach((col) => { clean[col.id] = S(cells[col.id]); });
        return { id: S(row.id) || uid('row'), model: S(row.model).trim() || ('Modèle ' + (ri + 1)), cells: clean };
      });
      uniquifyIds(rows, 'row');
      return { id: S(t.id) || uid('tab'), name: S(t.name).trim() || ('Onglet ' + (ti + 1)), cols, rows };
    });
    // Identifiants d'onglets uniques : deux identiques rendent un onglet inatteignable.
    uniquifyIds(tabs, 'tab');
    return { tabs };
  }

  /* -------------------- Journal -------------------- */

  const LOG_CAP = 600;

  function normLog(raw) {
    const l = O(raw);
    return {
      id: S(l.id) || uid('log'),
      action: S(l.action) || 'Action',
      detail: S(l.detail),
      icon: S(l.icon) || 'dot',
      date: D(l.date),
      user: S(l.user),
      key: S(l.key),
      meta: O(l.meta),
    };
  }

  /* -------------------- Etat global -------------------- */

  function emptyState() {
    return {
      version: STATE_VERSION,
      // Regle anti-perte 1 : une base neuve n'a pas de date de mise a jour.
      updatedAt: null,
      erased: null,
      settings: normSettings({}),
      products: [],
      clients: [],
      repairs: [],
      cash: [],
      sales: [],
      pricing: { tabs: [] },
      logs: [],
      counters: { repair: 0, invoice: 0, sale: 0 },
    };
  }

  function normState(raw) {
    const s = O(raw);
    const out = {
      version: I(s.version, STATE_VERSION, 0) || STATE_VERSION,
      updatedAt: s.updatedAt ? D(s.updatedAt) : null,
      erased: s.erased ? D(s.erased) : null,
      settings: normSettings(s.settings),
      products: A(s.products).map(normProduct),
      clients: A(s.clients).map(normClient),
      repairs: A(s.repairs).map(normRepair),
      cash: A(s.cash).map(normCash),
      sales: A(s.sales).map(normSale),
      pricing: normPricing(s.pricing),
      logs: A(s.logs).map(normLog).slice(0, LOG_CAP),
      counters: {
        repair: I(O(s.counters).repair, 0, 0),
        invoice: I(O(s.counters).invoice, 0, 0),
        sale: I(O(s.counters).sale, 0, 0),
      },
    };
    // Identifiants uniques : un doublon fait atterrir une modification sur la mauvaise fiche.
    uniquifyIds(out.products, 'prd');
    uniquifyIds(out.clients, 'cli');
    uniquifyIds(out.repairs, 'rep');
    uniquifyIds(out.cash, 'csh');
    uniquifyIds(out.sales, 'sal');
    // Les compteurs ne reculent jamais.
    out.counters.repair = Math.max(out.counters.repair, maxNumber(out.repairs, 'number', 'REP-'));
    out.counters.invoice = Math.max(out.counters.invoice, maxNumber(out.repairs, 'invoiceNo', 'FAC-'));
    out.counters.sale = Math.max(out.counters.sale, out.sales.length);
    return out;
  }

  function maxNumber(list, field, prefix) {
    let max = 0;
    A(list).forEach((item) => {
      const m = S(O(item)[field]).match(/(\d+)\s*$/);
      if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
    });
    return max;
  }

  /** Un etat est "vide" s'il ne porte aucune donnee metier. Sert a la regle « le vide ne gagne jamais ». */
  function isEmptyState(st) {
    const s = O(st);
    const count = A(s.products).length + A(s.clients).length + A(s.repairs).length
      + A(s.cash).length + A(s.sales).length + A(O(s.pricing).tabs).length;
    return count === 0;
  }

  function countRecords(st) {
    const s = O(st);
    return {
      products: A(s.products).length,
      clients: A(s.clients).length,
      repairs: A(s.repairs).length,
      cash: A(s.cash).length,
      sales: A(s.sales).length,
      pricing: A(O(s.pricing).tabs).length,
    };
  }

  /** Numerotation sans collision avec les numeros deja utilises. */
  function nextRepairNumber(state) {
    const s = O(state);
    const used = new Set(A(s.repairs).map((r) => S(O(r).number)));
    let n = I(O(s.counters).repair, 0, 0);
    let num;
    do { n += 1; num = 'REP-' + String(n).padStart(4, '0'); } while (used.has(num) && n < 1e7);
    return { number: num, counter: n };
  }

  function nextInvoiceNumber(state) {
    const s = O(state);
    const used = new Set(A(s.repairs).map((r) => S(O(r).invoiceNo)).filter(Boolean));
    let n = I(O(s.counters).invoice, 0, 0);
    const year = new Date().getFullYear();
    let num;
    do { n += 1; num = 'FAC-' + year + '-' + String(n).padStart(4, '0'); } while (used.has(num) && n < 1e7);
    return { number: num, counter: n };
  }

  MS.model = {
    CATEGORIES, DEFAULT_CATEGORY, CONDITIONS, REPAIR_STATUSES, CASH_TYPES, PAY_METHODS,
    WITHDRAW_METHOD, ROLES, ADMIN_SCREENS, SENSITIVE_SCREENS, STATE_VERSION, LOG_CAP,
    FACTORY_SETTINGS, STOCK_LEVEL_LABEL,
    normSettings, normAccount, normProduct, normClient, normRepair, normPart, normCash,
    normCashItem, normSale, normPricing, normLog, normState, emptyState,
    threshold, stockLevel, repairBalance, repairTotal, cashRevenue,
    isEmptyState, countRecords, nextRepairNumber, nextInvoiceNumber, deepCloneState: deepClone,
  };
})();
