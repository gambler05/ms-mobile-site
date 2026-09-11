/* ============================================================
   20 — Import de données existantes
   Tolérant, pas exigeant : un atelier arrive toujours avec un historique.
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { S, N, I, M, A, O, esc, flat, digits, uid, parseDateLoose, fmtDateTime, dayKey } = MS.util;
  const ui = MS.ui, store = MS.store, model = MS.model;

  /* ---------------------------------------------------------
     Lecture tolerante des noms de champs.
     Du plus precis au plus vague : sans cela, un fichier valide
     donnerait des colonnes entieres a zero.
     --------------------------------------------------------- */

  const FIELDS = [
    { key: 'amount', exact: ['montant', 'montantttc', 'montantht', 'totalttc', 'totalht', 'total', 'somme', 'prixtotal', 'encaisse', 'ca', 'chiffreaffaires', 'valeur'], patterns: ['montant', 'total', 'somme', 'encaiss'] },
    { key: 'deposit', exact: ['acompte', 'avance', 'arrhes', 'deposit', 'accompte'], patterns: ['acompte', 'arrhes', 'avance'] },
    { key: 'cost', exact: ['prixachat', 'prixdachat', 'achat', 'cout', 'pa', 'coutachat', 'cost', 'prixrevient'], patterns: ['prixachat', 'prixdachat', 'coutachat', 'revient'] },
    { key: 'price', exact: ['prixvente', 'prix', 'pv', 'tarif', 'prixttc', 'prixunitaire', 'price', 'montantprevu', 'prixestime', 'devis'], patterns: ['prixvente', 'prixunitaire', 'tarif', 'prix'] },
    { key: 'date', exact: ['date', 'dateoperation', 'datevente', 'datecreation', 'datedepot', 'jour', 'createdat', 'created', 'datefacture', 'dateencaissement', 'dateheure'], patterns: ['date', 'jour', 'created'] },
    { key: 'method', exact: ['mode', 'modepaiement', 'modedepaiement', 'moyenpaiement', 'moyendepaiement', 'paiement', 'reglement', 'methode', 'method', 'typepaiement'], patterns: ['paiement', 'reglement', 'moyen'] },
    { key: 'type', exact: ['type', 'typeoperation', 'nature', 'operation', 'categorieoperation', 'rubrique'], patterns: ['typeoperation', 'nature', 'operation'] },
    { key: 'status', exact: ['statut', 'status', 'etat', 'etape', 'avancement', 'etatreparation'], patterns: ['statut', 'status', 'etape', 'avancement'] },
    { key: 'imei', exact: ['imei', 'numeroserie', 'nserie', 'numserie', 'serial', 'serialnumber', 'sn', 'noserie'], patterns: ['imei', 'serie', 'serial'] },
    { key: 'device', exact: ['appareil', 'device', 'modele', 'materiel', 'machine', 'produitrepare', 'modeleappareil', 'marquemodele'], patterns: ['appareil', 'modele', 'materiel', 'device'] },
    { key: 'issue', exact: ['panne', 'probleme', 'issue', 'defaut', 'symptome', 'motif', 'prestation', 'intervention', 'reparation', 'description', 'travaux'], patterns: ['panne', 'probleme', 'defaut', 'symptome', 'interven', 'prestation'] },
    { key: 'deviceState', exact: ['etatconstate', 'etatappareil', 'etatreception', 'constat', 'etatmateriel'], patterns: ['etatconstate', 'etatreception', 'constat'] },
    { key: 'passcode', exact: ['code', 'codedeverrouillage', 'motdepasse', 'codepin', 'pin', 'schema'], patterns: ['codedever', 'codepin', 'schema'] },
    { key: 'phone', exact: ['telephone', 'tel', 'portable', 'mobile', 'phone', 'numerotelephone', 'notel', 'tellephone', 'gsm'], patterns: ['telephone', 'portable', 'mobile', 'phone', 'gsm'] },
    { key: 'email', exact: ['email', 'mail', 'courriel', 'adressemail', 'emailclient', 'adresseelectronique'], patterns: ['mail', 'courriel'] },
    { key: 'clientName', exact: ['client', 'nomclient', 'customer', 'clientnom', 'nomprenom', 'nomduclient', 'proprietaire'], patterns: ['nomclient', 'client', 'customer', 'proprietaire'] },
    { key: 'name', exact: ['nom', 'name', 'produit', 'article', 'designation', 'libelleproduit', 'intituleproduit', 'titre'], patterns: ['produit', 'article', 'designation', 'nom'] },
    { key: 'label', exact: ['libelle', 'intitule', 'commentaire', 'observation', 'objet', 'memo', 'label'], patterns: ['libelle', 'intitule', 'objet', 'commentaire'] },
    { key: 'qty', exact: ['quantite', 'qte', 'qty', 'stock', 'nombre', 'nb', 'quantitestock', 'enstock', 'quantity'], patterns: ['quantite', 'stock', 'nombre', 'qte'] },
    { key: 'minQty', exact: ['seuil', 'seuilalerte', 'stockmini', 'stockminimum', 'minimum', 'alerte', 'minqty'], patterns: ['seuil', 'minimum', 'stockmini'] },
    { key: 'ref', exact: ['reference', 'ref', 'codebarre', 'codebarres', 'sku', 'code', 'ean', 'refarticle'], patterns: ['reference', 'codebarre', 'sku', 'ean'] },
    { key: 'supplier', exact: ['fournisseur', 'supplier', 'grossiste', 'distributeur'], patterns: ['fournisseur', 'supplier', 'grossiste'] },
    { key: 'category', exact: ['categorie', 'category', 'famille', 'rayon', 'typearticle', 'typeproduit', 'groupe'], patterns: ['categorie', 'famille', 'rayon'] },
    { key: 'condition', exact: ['etatproduit', 'etatarticle', 'neufoccasion', 'condition'], patterns: ['etatproduit', 'etatarticle', 'condition'] },
    { key: 'variant', exact: ['variante', 'couleur', 'capacite', 'taille', 'declinaison', 'coloris'], patterns: ['variante', 'couleur', 'capacite', 'declinaison'] },
    { key: 'address', exact: ['adresse', 'address', 'rue', 'adressepostale', 'voie'], patterns: ['adresse', 'address', 'rue'] },
    { key: 'notes', exact: ['notes', 'note', 'remarque', 'remarques', 'complement', 'divers', 'infos'], patterns: ['remarque', 'note', 'complement'] },
    { key: 'number', exact: ['numero', 'num', 'no', 'nofiche', 'numerofiche', 'ticket', 'dossier', 'numerodossier', 'bon', 'numerobon'], patterns: ['nofiche', 'numerofiche', 'dossier', 'ticket', 'numero'] },
    { key: 'invoiceNo', exact: ['facture', 'numerofacture', 'nofacture', 'invoice', 'invoiceno'], patterns: ['facture', 'invoice'] },
  ];

  /** Nom de champ aplati -> champ canonique, ou null. */
  function matchField(rawKey) {
    const f = flat(rawKey);
    if (!f) return null;
    for (const field of FIELDS) if (field.exact.includes(f)) return field.key;
    for (const field of FIELDS) {
      for (const p of field.patterns) if (f.indexOf(p) > -1) return field.key;
    }
    return null;
  }

  /**
   * Projette un enregistrement brut sur les champs canoniques.
   * Deux passes : les valeurs renseignees d'abord, puis les colonnes
   * presentes mais vides. Une colonne « montant » laissee vide doit rester
   * une operation de caisse sans montant, pas un enregistrement inconnu ;
   * mais elle ne doit pas non plus masquer un « total » renseigne a cote.
   */
  function mapRecord(raw, seenKeys) {
    const out = {};
    const record = O(raw);
    const keys = Object.keys(record);
    keys.forEach((key) => {
      if (seenKeys) seenKeys.add(S(key));
      const canonical = matchField(key);
      if (!canonical) return;
      const value = record[key];
      if (value === null || value === undefined || value === '') return;
      // Le premier champ reconnu gagne : les synonymes sont ordonnes du plus precis au plus vague.
      if (out[canonical] === undefined) out[canonical] = value;
    });
    keys.forEach((key) => {
      const canonical = matchField(key);
      if (canonical && out[canonical] === undefined) out[canonical] = '';
    });
    return out;
  }

  /* -------------------- Correspondance des valeurs -------------------- */

  const STATUS_MAP = [
    [['enattente', 'attente', 'recu', 'depose', 'nouveau', 'apriseencharge', 'encours'], 'En attente'],
    [['diagnostic', 'devis', 'endiagnostic', 'expertise', 'attentedevis', 'attenteaccord'], 'Diagnostic'],
    [['attentepieces', 'attentedepieces', 'commandepiece', 'commandepieces', 'piececommandee', 'attentepiece', 'attentefournisseur'], 'Attente pièces'],
    [['enreparation', 'encoursdereparation', 'encoursreparation', 'entravaux', 'atelier', 'reparationencours'], 'En réparation'],
    [['termine', 'pret', 'reparee', 'repare', 'fini', 'aretirer', 'pretaretirer', 'disponible', 'ok'], 'Terminé'],
    [['livre', 'rendu', 'recupere', 'remis', 'restitue', 'cloture', 'clos'], 'Livré'],
  ];

  const TYPE_MAP = [
    [['retrait', 'prelevement', 'sortie', 'sortiecaisse', 'retraitcaisse', 'depense'], 'Retrait'],
    [['vente', 'ventes', 'sale', 'venteproduit', 'ventecomptoir'], 'Vente'],
    [['reparation', 'sav', 'main', 'maindoeuvre', 'intervention'], 'Réparation'],
    [['accessoire', 'accessoires', 'access'], 'Accessoire'],
    [['diagnostic', 'devis', 'expertise'], 'Diagnostic'],
    [['service', 'prestation', 'forfait', 'divers'], 'Service'],
  ];

  const METHOD_CASH = ['especes', 'espece', 'liquide', 'cash', 'numeraire', 'especessonnantes'];

  function mapValue(value, table, fallback) {
    const f = flat(value);
    if (!f) return fallback;
    for (const [keys, target] of table) if (keys.includes(f)) return target;
    for (const [keys, target] of table) {
      for (const k of keys) if (f.indexOf(k) > -1 || k.indexOf(f) > -1) return target;
    }
    return fallback;
  }

  function mapStatus(value) { return mapValue(value, STATUS_MAP, model.REPAIR_STATUSES[0]); }
  function mapType(value) { return mapValue(value, TYPE_MAP, 'Vente'); }
  function mapMethod(value) {
    const f = flat(value);
    if (!f) return 'Espèces';
    if (METHOD_CASH.some((k) => f.indexOf(k) > -1)) return 'Espèces';
    // « CB », « virement », « cheque » : tout ce qui n'est pas especes est traite en carte.
    return 'Carte bancaire';
  }

  /* -------------------- Lecture des fichiers -------------------- */

  /** Analyse CSV : delimiteur devine, guillemets doubles geres. */
  function parseCsv(text) {
    const raw = S(text).replace(/^﻿/, '');
    if (!raw.trim()) return [];
    const firstLine = raw.split(/\r?\n/)[0] || '';
    const counts = { ';': (firstLine.match(/;/g) || []).length, ',': (firstLine.match(/,/g) || []).length, '\t': (firstLine.match(/\t/g) || []).length };
    const delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || ';';
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (quoted) {
        if (ch === '"') {
          if (raw[i + 1] === '"') { cell += '"'; i++; }
          else quoted = false;
        } else cell += ch;
        continue;
      }
      if (ch === '"') { quoted = true; continue; }
      if (ch === delim) { row.push(cell); cell = ''; continue; }
      if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
      if (ch === '\r') continue;
      cell += ch;
    }
    row.push(cell);
    if (row.length > 1 || S(row[0]).trim()) rows.push(row);
    if (rows.length < 2) return [];
    const headers = rows[0].map((h) => S(h).trim());
    return rows.slice(1)
      .filter((r) => r.some((c) => S(c).trim()))
      .map((r) => {
        const obj = {};
        headers.forEach((h, i) => { if (h) obj[h] = S(r[i]); });
        return obj;
      });
  }

  /** Detection automatique du type de fichier. */
  function detect(text, filename) {
    const raw = S(text).trim();
    if (raw.startsWith('{') || raw.startsWith('[')) {
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
      if (parsed === null) return { kind: 'illisible', data: null };
      const o = O(parsed);
      const internal = S(o._app) === 'MS-MOBILE'
        || (Array.isArray(o.products) && Array.isArray(o.repairs) && Array.isArray(o.cash));
      return internal ? { kind: 'backup', data: parsed } : { kind: 'foreign', data: parsed };
    }
    const rows = parseCsv(raw);
    if (!rows.length) return { kind: 'illisible', data: null };
    return { kind: 'foreign', data: rows };
  }

  /* -------------------- Classement des enregistrements -------------------- */

  /** Devine le type d'un enregistrement d'apres les champs reconnus. */
  function guessKind(mapped, hintKey) {
    const hint = flat(hintKey);
    if (hint) {
      if (hint.indexOf('reparation') > -1 || hint.indexOf('fiche') > -1 || hint.indexOf('repair') > -1) return 'repair';
      if (hint.indexOf('caisse') > -1 || hint.indexOf('vente') > -1 || hint.indexOf('cash') > -1 || hint.indexOf('operation') > -1) return 'cash';
      if (hint.indexOf('stock') > -1 || hint.indexOf('produit') > -1 || hint.indexOf('article') > -1 || hint.indexOf('inventaire') > -1) return 'product';
      if (hint.indexOf('client') > -1 || hint.indexOf('customer') > -1) return 'client';
    }
    const m = O(mapped);
    if (m.device !== undefined || m.issue !== undefined || m.status !== undefined) return 'repair';
    if (m.qty !== undefined && (m.price !== undefined || m.ref !== undefined || m.supplier !== undefined || m.category !== undefined)) return 'product';
    if (m.amount !== undefined || m.method !== undefined || (m.type !== undefined && m.date !== undefined)) return 'cash';
    if (m.phone !== undefined || m.email !== undefined || m.clientName !== undefined) return 'client';
    if (m.name !== undefined && m.qty !== undefined) return 'product';
    return 'inconnu';
  }

  /** Aplati une structure quelconque en une liste de {record, hint}. */
  function collect(data) {
    const out = [];
    if (Array.isArray(data)) {
      data.forEach((r) => { if (r && typeof r === 'object' && !Array.isArray(r)) out.push({ record: r, hint: '' }); });
      return out;
    }
    const o = O(data);
    Object.keys(o).forEach((key) => {
      const value = o[key];
      if (Array.isArray(value)) {
        value.forEach((r) => { if (r && typeof r === 'object' && !Array.isArray(r)) out.push({ record: r, hint: key }); });
      } else if (value && typeof value === 'object') {
        Object.keys(value).forEach((k2) => {
          const r = value[k2];
          if (r && typeof r === 'object' && !Array.isArray(r)) out.push({ record: r, hint: key });
        });
      }
    });
    if (!out.length && Object.keys(o).length) out.push({ record: o, hint: '' });
    return out;
  }

  /* ---------------------------------------------------------
     Analyse complete : renvoie un rapport et l'etat a importer.
     Fonction pure : testable sans navigateur.
     --------------------------------------------------------- */

  function analyze(text, filename) {
    const detected = detect(text, filename);
    const report = {
      kind: detected.kind,
      filename: S(filename),
      counts: { products: 0, clients: 0, repairs: 0, cash: 0, sales: 0, pricing: 0 },
      cashTotal: 0,
      missingAmount: 0,
      badDates: 0,
      badDateSamples: [],
      unknownRecords: 0,
      fieldsSeen: [],
      mergedClients: 0,
      errors: [],
    };

    if (detected.kind === 'illisible') {
      report.errors.push("Le fichier n’est ni une sauvegarde interne, ni un tableau exploitable.");
      return { report, state: null };
    }

    if (detected.kind === 'backup') {
      const state = model.normState(detected.data);
      report.counts = model.countRecords(state);
      report.cashTotal = A(state.cash).reduce((s, op) => s + model.cashRevenue(op), 0);
      report.fieldsSeen = Object.keys(O(detected.data)).slice(0, 60);
      return { report, state };
    }

    // --- Export tiers ---
    const seen = new Set();
    const products = [], clients = [], repairs = [], cash = [];
    collect(detected.data).forEach((entry) => {
      const mapped = mapRecord(entry.record, seen);
      if (!Object.keys(mapped).length) { report.unknownRecords += 1; return; }
      const kind = guessKind(mapped, entry.hint);
      switch (kind) {
        case 'repair': repairs.push(mapped); break;
        case 'product': products.push(mapped); break;
        case 'cash': cash.push(mapped); break;
        case 'client': clients.push(mapped); break;
        default: report.unknownRecords += 1;
      }
    });

    const outProducts = products.map((m, i) => model.normProduct({
      id: uid('prd'), name: m.name || m.label, category: mapCategory(m.category), condition: m.condition,
      ref: m.ref, supplier: m.supplier, variant: m.variant, qty: m.qty, minQty: m.minQty,
      cost: m.cost, price: m.price, notes: m.notes, createdAt: readDate(m.date, report),
    }, i));

    const outClients = clients.map((m, i) => model.normClient({
      id: uid('cli'), name: m.clientName || m.name, phone: m.phone, email: m.email,
      address: m.address, notes: m.notes, createdAt: readDate(m.date, report),
    }, i));

    const outRepairs = repairs.map((m, i) => {
      const created = readDate(m.date, report);
      return model.normRepair({
        id: uid('rep'), number: S(m.number) || ('REP-' + String(i + 1).padStart(4, '0')),
        clientName: S(m.clientName) || S(m.name), clientPhone: S(m.phone),
        device: S(m.device), imei: S(m.imei), issue: S(m.issue), deviceState: S(m.deviceState),
        passcode: S(m.passcode), price: m.price, deposit: m.deposit,
        status: mapStatus(m.status), invoiceNo: S(m.invoiceNo), notes: S(m.notes),
        createdAt: created, updatedAt: created,
        history: [{ status: mapStatus(m.status), date: created, note: 'Importé' }],
      }, i);
    });

    const cashOwners = [];
    const outCash = cash.map((m) => {
      const type = mapType(m.type !== undefined ? m.type : m.label);
      if (m.amount === undefined || M(m.amount, 0) <= 0) report.missingAmount += 1;
      const op = model.normCash({
        id: uid('csh'), date: readDate(m.date, report), amount: m.amount,
        type, method: type === 'Retrait' ? model.WITHDRAW_METHOD : mapMethod(m.method),
        label: S(m.label) || S(m.name) || S(m.issue), items: [],
      });
      // Une operation qui nomme son client garde ce lien : rien ne se perd.
      const name = S(m.clientName).trim();
      const phone = S(m.phone).trim();
      if (name || phone) cashOwners.push({ op, name, phone });
      return op;
    });

    // Clients recrees depuis les fiches (et les operations qui les nomment),
    // doublons fusionnes par telephone.
    const merged = mergeClients(outClients, outRepairs, cashOwners);
    report.mergedClients = merged.mergedCount;

    const state = model.emptyState();
    state.products = outProducts;
    state.clients = merged.clients;
    state.repairs = merged.repairs;
    state.cash = outCash;
    state.counters.repair = outRepairs.length;

    report.counts = model.countRecords(state);
    report.cashTotal = Math.round(outCash.reduce((s, op) => s + model.cashRevenue(op), 0) * 100) / 100;
    report.fieldsSeen = Array.from(seen).sort();
    return { report, state };
  }

  function mapCategory(value) {
    const f = flat(value);
    if (!f) return model.DEFAULT_CATEGORY;
    const hit = model.CATEGORIES.find((c) => flat(c) === f);
    if (hit) return hit;
    const loose = model.CATEGORIES.find((c) => flat(c).indexOf(f) > -1 || f.indexOf(flat(c)) > -1);
    return loose || model.DEFAULT_CATEGORY;
  }

  /** Date illisible : comptee dans le rapport plutot que transformee en silence. */
  function readDate(value, report) {
    if (value === undefined || value === null || value === '') return new Date().toISOString();
    const iso = parseDateLoose(value);
    if (iso) return iso;
    if (report) {
      report.badDates += 1;
      if (report.badDateSamples.length < 8) report.badDateSamples.push(S(value).slice(0, 40));
    }
    return new Date().toISOString();
  }

  /** Fusionne les doublons par telephone et rattache fiches et operations. */
  function mergeClients(clients, repairs, cashOwners) {
    const byPhone = new Map();
    const byName = new Map();
    const out = [];
    let mergedCount = 0;

    const push = (client) => {
      const phone = digits(client.phone);
      const nameKey = flat(client.name);
      if (phone.length >= 6 && byPhone.has(phone)) { mergedCount += 1; return byPhone.get(phone); }
      if (phone.length < 6 && nameKey && byName.has(nameKey)) { mergedCount += 1; return byName.get(nameKey); }
      out.push(client);
      if (phone.length >= 6) byPhone.set(phone, client);
      if (nameKey) byName.set(nameKey, client);
      return client;
    };

    A(clients).forEach((c) => push(c));

    A(repairs).forEach((r) => {
      const name = S(r.clientName).trim();
      const phone = S(r.clientPhone).trim();
      if (!name && !phone) return;
      const existing = push(model.normClient({
        id: uid('cli'), name: name || ('Client ' + digits(phone).slice(-4)), phone, createdAt: r.createdAt,
      }, out.length));
      r.clientId = existing.id;
      if (!S(r.clientName)) r.clientName = existing.name;
      if (!S(r.clientPhone)) r.clientPhone = existing.phone;
      // Complete la fiche client avec ce que la reparation apporte.
      if (!S(existing.phone) && phone) existing.phone = phone;
    });

    A(cashOwners).forEach((entry) => {
      const owner = O(entry);
      const name = S(owner.name).trim();
      const phone = S(owner.phone).trim();
      if (!name && !phone) return;
      const client = push(model.normClient({
        id: uid('cli'), name: name || ('Client ' + digits(phone).slice(-4)), phone,
        createdAt: S(O(owner.op).date),
      }, out.length));
      if (owner.op) owner.op.clientId = client.id;
      if (!S(client.phone) && phone) client.phone = phone;
    });

    return { clients: out, repairs, mergedCount };
  }

  /* ---------------------------------------------------------
     Regle 6.1 — importer un stock n'efface jamais l'identite
     de la boutique. Un champ personnalise ici est conserve ;
     un champ reste au reglage d'usine prend la valeur qui arrive.
     --------------------------------------------------------- */

  const INSTALL_FIELDS = ['shopName', 'docName', 'address', 'phone', 'email', 'siret', 'vatRate',
    'currency', 'lowStock', 'warrantyMonths', 'smsTemplate', 'cgv', 'logo', 'theme'];

  function mergeSettings(current, incoming) {
    const cur = model.normSettings(current);
    const inc = model.normSettings(incoming);
    const factory = model.normSettings({});
    const out = Object.assign({}, cur);
    INSTALL_FIELDS.forEach((field) => {
      const isFactory = String(cur[field]) === String(factory[field]);
      const incomingHasValue = S(inc[field]) !== '' && String(inc[field]) !== String(factory[field]);
      if (isFactory && incomingHasValue) out[field] = inc[field];
    });
    // Les comptes et la protection appartiennent a l'installation : jamais ecrases par un import.
    out.accounts = cur.accounts;
    out.authScope = cur.authScope;
    out.autolockMinutes = cur.autolockMinutes;
    out.maxAttempts = cur.maxAttempts;
    out.recovery = cur.recovery;
    return model.normSettings(out);
  }

  /** Fusionne un etat importe dans l'etat courant (ajout). */
  function mergeInto(currentState, incomingState) {
    const cur = model.normState(currentState);
    const inc = model.normState(incomingState);
    const next = model.normState(cur);
    next.settings = mergeSettings(cur.settings, inc.settings);
    next.products = A(cur.products).concat(A(inc.products));
    next.cash = A(inc.cash).concat(A(cur.cash));
    next.sales = A(inc.sales).concat(A(cur.sales));
    next.repairs = A(inc.repairs).concat(A(cur.repairs));

    // Doublons de clients fusionnes par telephone, y compris avec l'existant.
    const merged = mergeClients(A(cur.clients).concat(A(inc.clients)), next.repairs);
    next.clients = merged.clients;

    if (A(inc.pricing.tabs).length) {
      next.pricing = model.normPricing({ tabs: A(cur.pricing.tabs).concat(A(inc.pricing.tabs)) });
    }
    return model.normState(next);
  }

  /* -------------------- Interface -------------------- */

  function openFromFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => ui.toast("Le fichier n’a pas pu être lu.", 'error');
    reader.onload = () => {
      const text = S(reader.result);
      let result;
      try { result = analyze(text, S(file.name)); }
      catch (e) {
        ui.toast("Le fichier n’a pas pu être analysé : " + S(e.message), 'error');
        return;
      }
      openReport(result);
    };
    reader.readAsText(file, 'utf-8');
  }

  /** Rapport detaille avant validation : sans lui, un import a moitie rate passe inapercu. */
  function openReport(result) {
    const { report, state } = result;
    const isBackup = report.kind === 'backup';
    if (!state) {
      ui.modal({
        title: 'Import impossible', size: 'sm',
        body: '<p class="lead">Ce fichier ne peut pas être exploité.</p>'
          + '<ul class="report-errors">' + A(report.errors).map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul>',
        footer: '<button type="button" class="btn primary" data-close>Fermer</button>',
      });
      return;
    }

    const body = '<p class="lead">' + (isBackup ? 'Sauvegarde interne MS-MOBILE' : 'Export d’un logiciel tiers') + '</p>'
      + '<p class="muted">' + esc(report.filename) + '</p>'
      + '<div class="grid stats-grid">'
      + ui.statCard('Articles', String(report.counts.products), '', 'neutral', 'box')
      + ui.statCard('Clients', String(report.counts.clients), report.mergedClients ? report.mergedClients + ' doublon(s) fusionné(s)' : '', 'neutral', 'users')
      + ui.statCard('Réparations', String(report.counts.repairs), '', 'neutral', 'wrench')
      + ui.statCard('Opérations de caisse', String(report.counts.cash), 'total ' + ui.money(report.cashTotal), 'primary', 'euro')
      + '</div>'
      + '<ul class="report-list">'
      + '<li>Montant total de caisse : <b>' + esc(ui.money(report.cashTotal)) + '</b></li>'
      + '<li>Opérations sans montant : <b>' + report.missingAmount + '</b></li>'
      + '<li>Dates illisibles : <b>' + report.badDates + '</b>'
      + (report.badDateSamples.length ? ' <span class="muted">(' + esc(report.badDateSamples.join(', ')) + ')</span>' : '') + '</li>'
      + '<li>Enregistrements non reconnus : <b>' + report.unknownRecords + '</b></li>'
      + '</ul>'
      + (report.fieldsSeen.length
        ? '<details class="report-fields"><summary>Noms de champs rencontrés (' + report.fieldsSeen.length + ')</summary>'
          + '<p class="mono small">' + esc(report.fieldsSeen.join(' · ')) + '</p></details>'
        : '')
      + '<p class="muted small">Une copie de vos données actuelles est mise de côté avant tout remplacement.</p>';

    const footer = '<button type="button" class="btn ghost" data-close>Annuler</button>'
      + (isBackup
        ? '<button type="button" class="btn primary" data-act="replace">Restaurer cette sauvegarde</button>'
        : '<button type="button" class="btn ghost" data-act="replace">Remplacer</button>'
          + '<button type="button" class="btn primary" data-act="merge">Ajouter aux données actuelles</button>');

    const m = ui.modal({ title: 'Rapport d’import', size: 'lg', body, footer });
    if (!m) return;
    ui.on(m.el, '[data-act="replace"]', 'click', () => apply(state, false, report, m));
    ui.on(m.el, '[data-act="merge"]', 'click', () => apply(state, true, report, m));
  }

  function apply(incoming, merge, report, m) {
    const next = merge ? mergeInto(store.state, incoming) : (() => {
      const st = model.normState(incoming);
      // Importer un stock ne doit jamais effacer le nom ou l'adresse de la boutique.
      st.settings = mergeSettings(store.state.settings, st.settings);
      return st;
    })();
    store.replaceState(next, { reason: 'import' });
    store.log('Import de données', S(report.filename) + ' — ' + report.counts.repairs + ' réparation(s), '
      + report.counts.cash + ' opération(s), ' + report.counts.products + ' article(s)', 'upload');
    store.save({ reason: 'import' });
    if (m) m.close();
    // Se placer sur une periode qui montre les donnees : « Jour » afficherait une caisse vide.
    if (MS.screens.cash && MS.screens.cash.showPeriod) MS.screens.cash.showPeriod('all');
    ui.toast('Import terminé.', 'success');
    MS.app.go('cash');
    MS.app.render();
  }

  MS.import = {
    analyze, detect, parseCsv, matchField, mapRecord, guessKind,
    mapStatus, mapType, mapMethod, mapCategory, mergeClients, mergeSettings, mergeInto,
    openFromFile, openReport, FIELDS,
  };
})();
