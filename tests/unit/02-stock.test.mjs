/* Intégrité du stock sur le cycle complet. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMS } from '../harness.mjs';

function fresh() {
  const MS = loadMS();
  MS.store.load();
  return MS;
}

test('vente : chaque ligne décrémente le stock', () => {
  const MS = fresh();
  const p = MS.ops.saveProduct({ name: 'Coque', qty: 10, price: 14.9 }).product;
  MS.ops.recordCash({ type: 'Vente', method: 'Espèces', items: [{ productId: p.id, name: p.name, qty: 3, price: 14.9 }] });
  assert.equal(MS.ops.findProduct(p.id).qty, 7);
  assert.equal(MS.store.state.cash[0].amount, 44.7);
  assert.equal(MS.store.state.sales.length, 1);
});

test('le stock ne devient jamais négatif', () => {
  const MS = fresh();
  const p = MS.ops.saveProduct({ name: 'X', qty: 2 }).product;
  MS.ops.adjustStock(p.id, -50);
  assert.equal(MS.ops.findProduct(p.id).qty, 0);
  MS.ops.recordCash({ type: 'Vente', items: [{ productId: p.id, name: 'X', qty: 5, price: 1 }] });
  assert.equal(MS.ops.findProduct(p.id).qty, 0);
});

test('pièce de réparation : décompte, bascule, quantité, suppression', () => {
  const MS = fresh();
  const p = MS.ops.saveProduct({ name: 'Écran', qty: 5, price: 99 }).product;
  const r = MS.ops.createRepair({ device: 'iPhone', issue: 'Écran' }).repair;

  MS.ops.addPart(r.id, { productId: p.id, name: p.name, qty: 2, price: 99, fromStock: true });
  const part = r.parts[0];
  assert.equal(MS.ops.findProduct(p.id).qty, 3, 'décompté à l’ajout');
  assert.equal(part.fromStock, true);

  MS.ops.togglePartStock(r.id, part.id);
  assert.equal(MS.ops.findProduct(p.id).qty, 5, 'la bascule remet en stock');
  assert.equal(part.fromStock, false);

  MS.ops.togglePartStock(r.id, part.id);
  assert.equal(MS.ops.findProduct(p.id).qty, 3, 'la bascule redécompte');

  MS.ops.setPartQty(r.id, part.id, 4);
  assert.equal(MS.ops.findProduct(p.id).qty, 1);
  MS.ops.setPartQty(r.id, part.id, 1);
  assert.equal(MS.ops.findProduct(p.id).qty, 4);

  MS.ops.removePart(r.id, part.id);
  assert.equal(MS.ops.findProduct(p.id).qty, 5, 'supprimer une pièce décomptée la remet en stock');
});

test('pièce non décomptée : sa suppression ne crée pas de stock', () => {
  const MS = fresh();
  const p = MS.ops.saveProduct({ name: 'Écran', qty: 5 }).product;
  const r = MS.ops.createRepair({ device: 'X', issue: 'Y' }).repair;
  MS.ops.addPart(r.id, { productId: p.id, name: p.name, qty: 2, fromStock: false });
  assert.equal(MS.ops.findProduct(p.id).qty, 5);
  MS.ops.removePart(r.id, r.parts[0].id);
  assert.equal(MS.ops.findProduct(p.id).qty, 5);
});

test('stock insuffisant : on prend ce qui reste et on le dit', () => {
  const MS = fresh();
  const p = MS.ops.saveProduct({ name: 'Écran', qty: 1 }).product;
  const r = MS.ops.createRepair({ device: 'X', issue: 'Y' }).repair;
  MS.ops.addPart(r.id, { productId: p.id, name: p.name, qty: 3, fromStock: true });
  assert.equal(MS.ops.findProduct(p.id).qty, 0);
  assert.equal(r.parts[0].qty, 1, 'la quantité reflète ce qui a pu être retiré');
});

test('supprimer une fiche remet ses pièces décomptées en stock', () => {
  const MS = fresh();
  const p = MS.ops.saveProduct({ name: 'Écran', qty: 5 }).product;
  const r = MS.ops.createRepair({ device: 'X', issue: 'Y' }).repair;
  MS.ops.addPart(r.id, { productId: p.id, name: p.name, qty: 3, fromStock: true });
  assert.equal(MS.ops.findProduct(p.id).qty, 2);
  MS.ops.deleteRepair(r.id);
  assert.equal(MS.ops.findProduct(p.id).qty, 5);
});

test('un retrait compte pour 0 dans l’encaisse et force le mode « De la caisse »', () => {
  const MS = fresh();
  MS.ops.recordCash({ type: 'Vente', amount: 100, method: 'Carte bancaire' });
  MS.ops.recordWithdraw({ amount: 40, label: 'Banque' });
  const totals = MS.stats.totals(MS.store.state.cash);
  assert.equal(totals.revenue, 100);
  assert.equal(totals.withdrawals, 40);
  assert.equal(totals.card, 100);
  assert.equal(MS.store.state.cash[0].method, 'De la caisse');
  assert.equal(MS.model.cashRevenue(MS.store.state.cash[0]), 0);
});

test('le journal coalesce les ajustements répétés et efface le retour au départ', () => {
  const MS = fresh();
  const p = MS.ops.saveProduct({ name: 'Coque', qty: 5 }).product;
  const key = 'stock:' + p.id;
  MS.ops.adjustStock(p.id, 1);
  MS.ops.adjustStock(p.id, 1);
  MS.ops.adjustStock(p.id, 1);
  let lines = MS.store.state.logs.filter((l) => l.key === key);
  assert.equal(lines.length, 1, 'trois clics tiennent une seule ligne');
  assert.match(lines[0].detail, /5 → 8/);
  MS.ops.adjustStock(p.id, -3);
  lines = MS.store.state.logs.filter((l) => l.key === key);
  assert.equal(lines.length, 0, 'revenu au chiffre de départ, la ligne disparaît');
});

test('numérotation sans collision et compteurs qui ne reculent jamais', () => {
  const MS = fresh();
  MS.store.state.repairs = [MS.model.normRepair({ number: 'REP-0007' }, 0)];
  MS.store.state.counters.repair = 2;
  const next = MS.model.nextRepairNumber(MS.store.state);
  assert.equal(next.number, 'REP-0003');
  const st = MS.model.normState(MS.store.state);
  assert.equal(st.counters.repair, 7, 'le compteur rattrape le numéro le plus élevé');
  assert.equal(MS.model.nextRepairNumber(st).number, 'REP-0008');
});

test('reste à régler : prix + pièces − acompte', () => {
  const MS = fresh();
  const r = MS.ops.createRepair({ device: 'X', issue: 'Y', price: 100, deposit: 30 }).repair;
  MS.ops.addPart(r.id, { name: 'Colle', qty: 2, price: 5 });
  assert.equal(MS.model.repairTotal(r), 110);
  assert.equal(MS.model.repairBalance(r), 80);
});

test('niveaux de stock : rupture, faible, normal', () => {
  const MS = fresh();
  const settings = { lowStock: 2 };
  assert.equal(MS.model.stockLevel({ qty: 0 }, settings), 'out');
  assert.equal(MS.model.stockLevel({ qty: 2 }, settings), 'low');
  assert.equal(MS.model.stockLevel({ qty: 3 }, settings), 'ok');
  assert.equal(MS.model.stockLevel({ qty: 4, minQty: 5 }, settings), 'low', 'le seuil propre prime');
  assert.equal(MS.model.threshold({ minQty: 0 }, settings), 2, '0 = seuil général');
});

test('recherche client : pertinence, accents, espaces, milieu de numéro', () => {
  const MS = fresh();
  MS.ops.saveClient({ name: 'Dupont Marie', phone: '06 12 34 56 78' });
  MS.ops.saveClient({ name: 'Lemaître Sophie', phone: '07 98 76 54 32' });
  MS.ops.saveClient({ name: 'Jean Dupond', phone: '06 11 22 33 44' });

  const byStart = MS.ops.searchClients('dup');
  assert.equal(byStart[0].client.name, 'Dupont Marie', 'ce qui commence par la saisie vient en premier');
  assert.equal(byStart.length, 2, 'le début de mot suit');

  assert.equal(MS.ops.searchClients('lemaitre')[0].client.name, 'Lemaître Sophie', 'insensible aux accents');
  assert.equal(MS.ops.searchClients('LEMAÎTRE')[0].client.name, 'Lemaître Sophie');
  assert.equal(MS.ops.searchClients('0612345678')[0].client.name, 'Dupont Marie', 'insensible aux espaces');
  assert.equal(MS.ops.searchClients('765')[0].client.name, 'Lemaître Sophie', 'recherche au milieu du numéro');
  assert.deepEqual(MS.ops.searchClients('inconnu'), [], 'aucun résultat ne bloque rien');
});

test('tarif : le modèle le plus précis gagne, un appareil absent le dit', () => {
  const MS = fresh();
  MS.store.state.pricing = MS.model.normPricing({ tabs: [{
    id: 't', name: 'iPhone',
    cols: [{ id: 'c1', name: 'Écran' }, { id: 'c2', name: 'Batterie' }],
    rows: [
      { id: 'r1', model: 'iPhone 16', cells: { c1: '299', c2: '89' } },
      { id: 'r2', model: 'iPhone 16 Pro Max', cells: { c1: '389', c2: 'sur devis' } },
    ],
  }] });
  const hit = MS.ops.findPricing('iPhone 16 Pro Max');
  assert.equal(hit.row.model, 'iPhone 16 Pro Max');
  assert.equal(MS.ops.findPricing('iPhone 16').row.model, 'iPhone 16');
  assert.equal(MS.ops.findPricing('Nokia 3310'), null, 'un appareil absent le dit au lieu de deviner');
  assert.equal(MS.ops.priceFromText('259/179'), 259, 'on sait extraire un nombre');
  assert.equal(MS.ops.priceFromText('sur devis'), null, 'sans jamais forcer un nombre');
  assert.equal(MS.ops.priceFromText('-'), null);
});
