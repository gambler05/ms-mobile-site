/* Règles anti-perte, sauvegardes et quota. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMS } from '../harness.mjs';

const T1 = '2026-01-01T10:00:00.000Z';
const T2 = '2026-01-02T10:00:00.000Z';

function withData(updatedAt, MS) {
  const s = MS.model.emptyState();
  s.products = [MS.model.normProduct({ name: 'Article' }, 0)];
  s.updatedAt = updatedAt;
  return s;
}
function erased(at, MS) {
  const s = MS.model.emptyState();
  s.updatedAt = at;
  s.erased = at;
  return s;
}

test('1. une base neuve n’a pas de date de mise à jour', () => {
  const MS = loadMS();
  assert.equal(MS.model.emptyState().updatedAt, null);
});

test('2. un appareil qui n’a jamais rien enregistré n’écrit pas', () => {
  const MS = loadMS();
  assert.equal(MS.sync.decide(MS.model.emptyState(), null).action, 'noop');
  assert.equal(MS.sync.decide(MS.model.emptyState(), withData(T1, MS)).action, 'pull');
});

test('3. le vide ne gagne jamais', () => {
  const MS = loadMS();
  // Appareil vierge, serveur plein : le serveur l'emporte quelles que soient les dates.
  assert.equal(MS.sync.decide(MS.model.emptyState(), withData(T1, MS)).action, 'pull');
  // Appareil vide mais déjà utilisé, serveur plein et plus ancien : le serveur l'emporte encore.
  const emptyButUsed = Object.assign(MS.model.emptyState(), { updatedAt: T2 });
  assert.equal(MS.sync.decide(emptyButUsed, withData(T1, MS)).action, 'pull');
  // Serveur vide, appareil plein : on publie, on n'efface pas.
  assert.equal(MS.sync.decide(withData(T1, MS), MS.model.emptyState()).action, 'push');
});

test('4. un effacement volontaire se distingue d’une base neuve et se propage', () => {
  const MS = loadMS();
  assert.equal(MS.sync.decide(erased(T2, MS), withData(T1, MS)).action, 'push');
  assert.equal(MS.sync.decide(withData(T1, MS), erased(T2, MS)).action, 'pull');
  // Un effacement plus ancien que les données distantes ne les emporte pas.
  assert.equal(MS.sync.decide(erased(T1, MS), withData(T2, MS)).action, 'pull');
});

test('5. travail hors ligne plus récent : renvoyé au serveur', () => {
  const MS = loadMS();
  assert.equal(MS.sync.decide(withData(T2, MS), withData(T1, MS)).action, 'push');
  assert.equal(MS.sync.decide(withData(T1, MS), withData(T2, MS)).action, 'pull');
  assert.equal(MS.sync.decide(withData(T1, MS), withData(T1, MS)).action, 'noop');
});

test('6. avant tout remplacement, la version locale est copiée et restaurable', () => {
  const MS = loadMS();
  MS.store.load();
  MS.ops.saveProduct({ name: 'Article précieux', qty: 3 });
  assert.equal(MS.store.state.products.length, 1);

  MS.sync.applyRemote(withData(T2, MS));
  assert.equal(MS.store.state.products[0].name, 'Article');

  const snap = MS.store.getSnapshot();
  assert.ok(snap, 'une copie a été prise avant le remplacement');
  assert.equal(snap.state.products[0].name, 'Article précieux');
  assert.equal(MS.store.restoreSnapshot(), true);
  assert.equal(MS.store.state.products[0].name, 'Article précieux');
});

test('une version reçue ne rend pas l’appareil plus récent que le serveur', () => {
  const MS = loadMS();
  MS.store.load();
  MS.sync.applyRemote(withData(T1, MS));
  assert.equal(MS.store.state.updatedAt, T1, 'la date distante est conservée telle quelle');
});

test('isolation entre boutiques : deux clés de stockage distinctes', () => {
  const A = loadMS({ storageKey: 'msmobile.a.v1', shopId: 'a' });
  A.store.load();
  A.ops.saveProduct({ name: 'Article boutique A', qty: 1 });
  const rawA = A.__storage.getItem('msmobile.a.v1');
  assert.ok(rawA.includes('Article boutique A'));
  assert.equal(A.__storage.getItem('msmobile.b.v1'), null, 'rien n’est écrit sous la clé de l’autre boutique');
});

test('sauvegardes : une par jour, les trois dernières conservées', () => {
  const MS = loadMS();
  MS.store.load();
  MS.ops.saveProduct({ name: 'X', qty: 1 });
  assert.equal(MS.store.listBackups().length, 1);
  // Simule cinq jours d'historique.
  ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'].forEach((day) => {
    MS.__storage.setItem(MS.store.BAK_PREFIX + day, JSON.stringify({ date: day, counts: {}, state: MS.model.emptyState() }));
  });
  assert.equal(MS.store.listBackups().length, 5);
  MS.store.pruneBackups();
  const kept = MS.store.listBackups();
  assert.equal(kept.length, 3, 'les trois dernières sont conservées');
  assert.ok(kept[0].day > kept[2].day, 'triées de la plus récente à la plus ancienne');
});

test('stockage saturé : l’historique est sacrifié, les données courantes passent', () => {
  const MS = loadMS({}, { quota: 14000 });
  MS.store.load();
  // Un historique volumineux occupe la place.
  MS.__storage.setItem(MS.store.BAK_PREFIX + '2026-01-01', 'x'.repeat(9000));
  const ok = MS.ops.saveProduct({ name: 'Article vital', qty: 1 });
  assert.equal(ok.ok, true);
  const raw = MS.__storage.getItem(MS.store.KEY);
  assert.ok(raw && raw.includes('Article vital'), 'les données courantes sont enregistrées');
  assert.equal(MS.store.lastError, '', 'aucune erreur remontée à l’utilisateur');
});

test('données illisibles : mises de côté, l’application repart propre', () => {
  const MS = loadMS();
  MS.__storage.setItem('msmobile.test.v1', '{ceci n’est pas du JSON');
  MS.store.load();
  assert.equal(MS.store.state.products.length, 0);
  const corruptKeys = Array.from(MS.__storage.map.keys()).filter((k) => k.includes('.corrupt.'));
  assert.equal(corruptKeys.length, 1, 'le contenu illisible est conservé de côté');
});

test('effacement volontaire : marqueur posé, paramètres conservés', () => {
  const MS = loadMS();
  MS.store.load();
  MS.store.state.settings.shopName = 'MS MOBILE Gare';
  MS.ops.saveProduct({ name: 'X', qty: 1 });
  MS.store.eraseAll();
  assert.ok(MS.store.state.erased, 'un marqueur distingue l’effacement d’une base neuve');
  assert.equal(MS.store.state.products.length, 0);
  assert.equal(MS.store.state.settings.shopName, 'MS MOBILE Gare', 'l’identité de la boutique survit');
});

test('les erreurs techniques sont traduites en langage de comptoir', () => {
  const MS = loadMS();
  assert.equal(MS.sync.humanError('INVALID_PASSWORD'), 'Mot de passe incorrect.');
  assert.equal(MS.sync.humanError('TOO_MANY_ATTEMPTS_TRY_LATER : blah'), 'Trop de tentatives. Réessayez dans quelques minutes.');
  assert.match(MS.sync.humanError('OPERATION_NOT_ALLOWED'), /n’est pas activée dans la console/);
  assert.match(MS.sync.humanError('PERMISSION_DENIED'), /Accès refusé/);
  assert.equal(MS.sync.humanError('NETWORK'), 'Pas de connexion internet.');
  assert.equal(MS.sync.humanError('BOOM_42'), 'Erreur inattendue. Réessayez.');
});

test('l’indicateur distingue les quatre situations et dit quoi faire', () => {
  const MS = loadMS();
  const st = MS.sync.status();
  assert.equal(st.code, 'disabled');
  assert.ok(st.help.length > 10, 'le message dit quoi faire');
  assert.equal(MS.sync.shouldWarn(), false, 'pas de bandeau quand la sync n’est pas configurée');
  assert.match(MS.sync.loginBlockedReason(), /n’est pas configurée/, 'aucun bouton ne reste muet');
});
