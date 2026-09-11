/* Import tolérant : conventions de nommage, formats de date, correspondances. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMS } from '../harness.mjs';

const MS = loadMS();
const imp = MS.import;

test('les noms de champs sont reconnus quelle que soit leur écriture', () => {
  for (const key of ['montant', 'montantTTC', 'MONTANT_TTC', 'total_ttc', 'Total TTC', 'somme', 'Montant€']) {
    assert.equal(imp.matchField(key), 'amount', key + ' devrait être un montant');
  }
  for (const key of ['telephone', 'Tél.', 'TEL', 'n° de téléphone', 'Portable', 'mobile']) {
    assert.equal(imp.matchField(key), 'phone', key + ' devrait être un téléphone');
  }
  for (const key of ['appareil', 'Appareil', 'MODELE', 'modèle', 'Matériel']) {
    assert.equal(imp.matchField(key), 'device', key);
  }
  for (const key of ['panne', 'Problème', 'defaut', 'Symptôme', 'Intervention']) {
    assert.equal(imp.matchField(key), 'issue', key);
  }
  assert.equal(imp.matchField('prix_achat'), 'cost', 'le plus précis gagne sur le plus vague');
  assert.equal(imp.matchField('prix de vente'), 'price');
  assert.equal(imp.matchField('quantité en stock'), 'qty');
  assert.equal(imp.matchField('colonne inconnue zzz'), null);
});

test('correspondance des valeurs', () => {
  assert.equal(imp.mapStatus('en cours de reparation'), 'En réparation');
  assert.equal(imp.mapStatus('PRET'), 'Terminé');
  assert.equal(imp.mapStatus('Livré'), 'Livré');
  assert.equal(imp.mapStatus('attente de pièces'), 'Attente pièces');
  assert.equal(imp.mapStatus('n’importe quoi'), 'En attente', 'valeur hors liste : repli sur la première');
  assert.equal(imp.mapType('prelevement'), 'Retrait');
  assert.equal(imp.mapType('Vente'), 'Vente');
  assert.equal(imp.mapType('SAV'), 'Réparation');
  assert.equal(imp.mapMethod('CB'), 'Carte bancaire');
  assert.equal(imp.mapMethod('virement'), 'Carte bancaire');
  assert.equal(imp.mapMethod('ESPECES'), 'Espèces');
  assert.equal(imp.mapMethod('liquide'), 'Espèces');
});

test('CSV point-virgule : caisse avec noms de colonnes exotiques', () => {
  const csv = 'Date;MONTANT_TTC;Mode de règlement;Libellé;Nature\r\n'
    + '05/08/2026;129,90;CB;Écran iPhone 13;reparation\r\n'
    + '06/08/2026;"45,00";Espèces;"Coque, verre";vente\r\n'
    + '07/08/2026;200;;Dépôt banque;prelevement\r\n';
  const { report, state } = imp.analyze(csv, 'caisse.csv');
  assert.equal(report.kind, 'foreign');
  assert.equal(state.cash.length, 3);
  const [a, b, c] = state.cash;
  assert.equal(a.amount, 129.9);
  assert.equal(a.type, 'Réparation');
  assert.equal(a.method, 'Carte bancaire');
  assert.equal(a.date.slice(0, 10), '2026-08-05', 'le format français prime');
  assert.equal(b.amount, 45);
  assert.equal(b.label, 'Coque, verre', 'les guillemets protègent le séparateur');
  assert.equal(c.type, 'Retrait');
  assert.equal(c.method, 'De la caisse');
  assert.equal(report.cashTotal, 174.9, 'le retrait ne compte pas dans le total');
  assert.ok(report.fieldsSeen.includes('MONTANT_TTC'), 'les noms rencontrés sont listés');
});

test('CSV virgule et tabulation : le délimiteur est deviné', () => {
  const comma = 'nom,quantite,prix\nCoque,5,14.90\nChargeur,2,24.90\n';
  assert.equal(imp.analyze(comma, 'stock.csv').state.products.length, 2);
  const tabbed = 'nom\tquantite\tprix\nCoque\t5\t14,90\n';
  const st = imp.analyze(tabbed, 'stock.tsv').state;
  assert.equal(st.products.length, 1);
  assert.equal(st.products[0].price, 14.9);
});

test('dates illisibles comptées dans le rapport, jamais transformées en silence', () => {
  const csv = 'date;montant;libelle\n31/02/2026;10;impossible\n32/13/2020;20;impossible\nhier;30;illisible\n05/08/2026;40;valide\n';
  const { report, state } = imp.analyze(csv, 'x.csv');
  assert.equal(state.cash.length, 4, 'aucune ligne n’est perdue');
  assert.equal(report.badDates, 3);
  assert.equal(report.badDateSamples.length, 3);
  assert.ok(report.badDateSamples.includes('31/02/2026'));
});

test('opérations sans montant signalées', () => {
  const csv = 'date;montant;libelle\n05/08/2026;;sans montant\n05/08/2026;0;zéro\n05/08/2026;12;ok\n';
  const { report } = imp.analyze(csv, 'x.csv');
  assert.equal(report.missingAmount, 2);
});

test('clients recréés depuis les fiches, doublons fusionnés par téléphone', () => {
  const csv = 'client;telephone;appareil;panne;statut;prix\n'
    + 'Marie Dupont;06 12 34 56 78;iPhone 13;écran cassé;en cours de reparation;149\n'
    + 'Marie DUPONT;0612345678;iPad;vitre;PRET;119\n'
    + 'Karim Benali;07 98 76 54 32;Galaxy S21;batterie;livré;69\n';
  const { report, state } = imp.analyze(csv, 'reparations.csv');
  assert.equal(state.repairs.length, 3);
  assert.equal(state.clients.length, 2, 'les deux fiches de Marie fusionnent sur le numéro');
  assert.equal(report.mergedClients, 1);
  const marie = state.clients.find((c) => /marie/i.test(c.name));
  const sesFiches = state.repairs.filter((r) => r.clientId === marie.id);
  assert.equal(sesFiches.length, 2, 'les deux réparations sont rattachées au même client');
  assert.equal(state.repairs[0].status, 'En réparation');
  assert.equal(state.repairs[1].status, 'Terminé');
  assert.equal(state.repairs[2].status, 'Livré');
});

test('JSON tiers : structure objet avec sections nommées', () => {
  const json = JSON.stringify({
    articles: [{ Designation: 'Coque', 'Quantité': 4, 'Prix de vente': '14,90', Fournisseur: 'MobileParts' }],
    dossiers: [{ 'N° dossier': 'D-42', Appareil: 'iPhone 12', Probleme: 'batterie', Etat: 'pret', 'Montant': 59 }],
    encaissements: [{ Date: '2026-08-05', Somme: 59, Reglement: 'cheque', Nature: 'reparation' }],
  });
  const { state, report } = imp.analyze(json, 'export.json');
  assert.equal(report.kind, 'foreign');
  assert.equal(state.products.length, 1);
  assert.equal(state.products[0].name, 'Coque');
  assert.equal(state.products[0].price, 14.9);
  assert.equal(state.repairs.length, 1);
  assert.equal(state.repairs[0].number, 'D-42');
  assert.equal(state.repairs[0].status, 'Terminé');
  assert.equal(state.cash.length, 1);
  assert.equal(state.cash[0].method, 'Carte bancaire', 'un chèque n’est pas des espèces');
});

test('sauvegarde interne reconnue et restaurée telle quelle', () => {
  const M2 = loadMS();
  M2.store.load();
  M2.ops.saveProduct({ name: 'Article sauvegardé', qty: 7 });
  const payload = JSON.stringify(Object.assign({}, M2.store.state, { _app: 'MS-MOBILE' }));
  const { report, state } = M2.import.analyze(payload, 'sauvegarde.json');
  assert.equal(report.kind, 'backup');
  assert.equal(state.products[0].name, 'Article sauvegardé');
  assert.equal(state.products[0].qty, 7);
});

test('un fichier illisible est refusé avec une explication', () => {
  const { report, state } = imp.analyze('%PDF-1.4 binaire', 'truc.pdf');
  assert.equal(state, null);
  assert.ok(report.errors.length);
});

test('importer un stock n’efface jamais l’identité de la boutique', () => {
  const M2 = loadMS();
  M2.store.load();
  M2.store.state.settings.shopName = 'MS MOBILE Gare';
  M2.store.state.settings.address = '3 place de la Gare, Lyon';
  // Le seuil d’alerte est resté au réglage d’usine : il prend la valeur qui arrive.
  const incoming = M2.model.normSettings({ shopName: 'Autre boutique', address: 'Ailleurs', lowStock: 9, phone: '01 02 03 04 05' });
  const merged = M2.import.mergeSettings(M2.store.state.settings, incoming);
  assert.equal(merged.shopName, 'MS MOBILE Gare', 'un champ personnalisé est conservé');
  assert.equal(merged.address, '3 place de la Gare, Lyon');
  assert.equal(merged.lowStock, 9, 'un champ resté au réglage d’usine prend la valeur qui arrive');
  assert.equal(merged.phone, '01 02 03 04 05', 'restauration sur une machine neuve');
});

test('les comptes et la protection ne sont jamais écrasés par un import', () => {
  const M2 = loadMS();
  M2.store.load();
  M2.store.state.settings.accounts = [M2.model.normAccount({ login: 'patron', role: 'Administrateur', hash: 'x', salt: 'y' })];
  M2.store.state.settings.authScope = 'app';
  const merged = M2.import.mergeSettings(M2.store.state.settings, M2.model.normSettings({ authScope: 'off', accounts: [] }));
  assert.equal(merged.accounts.length, 1);
  assert.equal(merged.authScope, 'app');
});

test('fusion dans les données existantes : rien n’est perdu', () => {
  const M2 = loadMS();
  M2.store.load();
  M2.ops.saveProduct({ name: 'Article existant', qty: 1 });
  M2.ops.recordCash({ type: 'Vente', amount: 10 });
  const incoming = M2.import.analyze('nom;quantite\nArticle importé;5\n', 'x.csv').state;
  const merged = M2.import.mergeInto(M2.store.state, incoming);
  assert.equal(merged.products.length, 2);
  assert.equal(merged.cash.length, 1, 'les opérations existantes restent');
  assert.ok(merged.products.some((p) => p.name === 'Article existant'));
  assert.ok(merged.products.some((p) => p.name === 'Article importé'));
});
