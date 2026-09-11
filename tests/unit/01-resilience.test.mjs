/* Données volontairement corrompues : aucun écran ne doit lever d'exception. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMS } from '../harness.mjs';

const MS = loadMS();
const { S, N, I, A, O, D, parseDateLoose } = MS.util;

test('accesseurs défensifs : aucune valeur ne lève', () => {
  const junk = [null, undefined, NaN, Infinity, {}, [], '', '  ', 0, false, () => {}, Symbol.iterator];
  for (const v of junk) {
    assert.equal(typeof S(v), 'string');
    assert.ok(Number.isFinite(N(v)));
    assert.ok(Number.isInteger(I(v)));
    assert.ok(Array.isArray(A(v)));
    assert.equal(typeof O(v), 'object');
    assert.ok(!Number.isNaN(new Date(D(v)).getTime()));
  }
});

test('montants écrits à la française', () => {
  assert.equal(N('1 299,50'), 1299.5);
  assert.equal(N('12.50 EUR'), 12.5);
  assert.equal(N('1 234,00 €'), 1234);
  assert.equal(N('abc'), 0);
  assert.equal(N('-3,5'), -3.5);
  assert.equal(I('-4', 0, 0), 0, 'un entier borné à zéro ne devient jamais négatif');
});

test('le format français prime et une date impossible est rejetée', () => {
  assert.equal(parseDateLoose('05/08/2026').slice(0, 10), '2026-08-05', '5 août, pas 8 mai');
  assert.equal(parseDateLoose('5.8.26').slice(0, 10), '2026-08-05');
  assert.equal(parseDateLoose('2026-08-05T14:30').slice(0, 10), '2026-08-05');
  assert.equal(parseDateLoose('31/02/2026'), null);
  assert.equal(parseDateLoose('32/13/2020'), null);
  assert.equal(parseDateLoose('pas une date'), null);
  assert.equal(parseDateLoose(''), null);
});

test('un enregistrement abîmé est complété, jamais rejeté', () => {
  const model = MS.model;
  const p = model.normProduct({ qty: '-3', price: 'douze', category: 'inexistante', condition: 42 }, 11);
  assert.equal(p.name, 'Article 12', 'un article sans nom ne disparaît pas');
  assert.equal(p.qty, 0);
  assert.equal(p.price, 0);
  assert.equal(p.category, 'Autre / Divers');
  assert.equal(p.condition, 'Neuf');

  const r = model.normRepair({ status: 'inexistant', history: 'pas un tableau', parts: 'non plus' }, 0);
  assert.equal(r.status, 'En attente');
  assert.ok(Array.isArray(r.history) && r.history.length === 1);
  assert.deepEqual(r.parts, []);

  const c = model.normCash({ type: 'bidon', method: 'bidon', amount: 'douze' });
  assert.equal(c.type, 'Vente');
  assert.equal(c.method, 'Espèces');
  assert.equal(c.amount, 0);
});

test('état entièrement corrompu : normalisé sans exception', () => {
  const model = MS.model;
  const corrupt = {
    version: 'x', updatedAt: 'jamais', settings: 'pas un objet',
    products: [null, undefined, 42, 'texte', { id: 'a' }, { id: 'a' }],
    clients: 'pas un tableau',
    repairs: [{ status: null, parts: [null, { qty: -5 }] }],
    cash: [{ amount: {}, date: '31/02/2020' }],
    sales: [{ items: 'non' }],
    pricing: { tabs: [{ id: 'x', cols: [{ id: 'c' }, { id: 'c' }], rows: [{ id: 'r' }, { id: 'r' }] }, { id: 'x' }] },
    logs: 'non', counters: { repair: 'x' },
  };
  const st = model.normState(corrupt);
  assert.equal(st.products.length, 6);
  const ids = st.products.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'les identifiants en double sont rendus uniques');
  const tabIds = st.pricing.tabs.map((t) => t.id);
  assert.equal(new Set(tabIds).size, 2, 'deux onglets homonymes deviennent atteignables');
  const colIds = st.pricing.tabs[0].cols.map((c) => c.id);
  assert.equal(new Set(colIds).size, colIds.length);
  const rowIds = st.pricing.tabs[0].rows.map((r) => r.id);
  assert.equal(new Set(rowIds).size, rowIds.length);
  assert.deepEqual(st.clients, []);
  assert.equal(st.repairs[0].parts.length, 2);
  assert.equal(st.repairs[0].parts[1].qty, 0);
});

test('un nom contenant du code HTML est échappé', () => {
  const html = MS.util.esc('<img src=x onerror="alert(1)">& "quote" \'apos\'');
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('&amp;'));
  assert.ok(html.includes('&quot;'));
  assert.ok(html.includes('&#39;'));
});

test('références fantômes : une pièce pointant un article disparu ne casse rien', () => {
  const MS2 = loadMS();
  MS2.store.load();
  const r = MS2.ops.createRepair({ device: 'X', issue: 'Y' }).repair;
  r.parts = [MS2.model.normPart({ id: 'p1', productId: 'fantome', name: 'Pièce', qty: 2, fromStock: true })];
  const res = MS2.ops.togglePartStock(r.id, 'p1');
  assert.equal(res.ok, false);
  assert.match(res.error, /n’existe plus|n'existe plus/);
  assert.equal(MS2.ops.removePart(r.id, 'p1').ok, true, 'la pièce fantôme reste supprimable');
});

test('deux horodatages de la même seconde restent distinguables', () => {
  const a = parseDateLoose('2026-09-11T08:32:12.019Z');
  const b = parseDateLoose('2026-09-11T08:32:12.461Z');
  assert.notEqual(a, b, 'les millisecondes ne doivent pas être perdues');
  assert.equal(new Date(b) - new Date(a), 442);
  // Le fuseau est respecté : un ISO en UTC n'est pas relu en heure locale.
  assert.equal(parseDateLoose('2026-09-11T08:32:12+02:00'), '2026-09-11T06:32:12.000Z');
  // Une date impossible reste rejetée, même écrite en ISO.
  assert.equal(parseDateLoose('2026-02-31T10:00:00Z'), null);
});

test('la décision de synchronisation distingue deux versions d’une même seconde', () => {
  const MS2 = loadMS();
  const withData = (t) => {
    const s = MS2.model.emptyState();
    s.products = [MS2.model.normProduct({ name: 'X' }, 0)];
    s.updatedAt = t;
    return s;
  };
  const verdict = MS2.sync.decide(withData('2026-09-11T08:32:12.461Z'), withData('2026-09-11T08:32:12.019Z'));
  assert.equal(verdict.action, 'push', 'la version locale plus récente de 442 ms repart au serveur');
});
