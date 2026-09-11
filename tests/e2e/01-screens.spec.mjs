import { test, expect } from '@playwright/test';
import { open, seed, loadDemo, SCREENS, FILE_REPUBLIQUE, FILE_GARE, reallyVisible } from './helpers.mjs';

test('les neuf écrans se rendent sans une seule exception', async ({ page }) => {
  const errors = await open(page);
  await loadDemo(page);
  for (const screen of SCREENS) {
    await page.evaluate((s) => { window.location.hash = '#/' + s; }, screen);
    await page.waitForTimeout(140);
    await expect(page.locator('#screen')).not.toBeEmpty();
    const title = await page.locator('.screen-title').textContent();
    expect(title.trim().length, 'l’écran ' + screen + ' porte un titre').toBeGreaterThan(2);
  }
  expect(errors, errors.join('\n')).toEqual([]);
});

test('les écrans de détail se rendent, et une adresse inconnue retombe sur le tableau de bord', async ({ page }) => {
  const errors = await open(page);
  await loadDemo(page);
  const ids = await page.evaluate(() => ({
    repair: window.MS.store.state.repairs[0].id,
    client: window.MS.store.state.clients[0].id,
  }));
  await page.evaluate((id) => { window.location.hash = '#/repair/' + id; }, ids.repair);
  await page.waitForTimeout(140);
  await expect(page.locator('#screen')).toContainText('REP-');

  await page.evaluate((id) => { window.location.hash = '#/client/' + id; }, ids.client);
  await page.waitForTimeout(140);
  await expect(page.locator('#screen')).toContainText('Historique des réparations');

  await page.evaluate(() => { window.location.hash = '#/ecran-qui-nexiste-pas'; });
  await page.waitForTimeout(140);
  await expect(page.locator('.screen-title')).toHaveText('Tableau de bord');

  // Une fiche supprimée ne casse rien : elle le dit.
  await page.evaluate(() => { window.location.hash = '#/repair/fantome'; });
  await page.waitForTimeout(140);
  await expect(page.locator('#screen')).toContainText('introuvable');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('données volontairement corrompues : tous les écrans se rendent quand même', async ({ page }) => {
  const corrupt = {
    version: 'x', updatedAt: 'jamais', erased: 'peut-être',
    settings: { shopName: '<script>alert(1)</script>', vatRate: 'beaucoup', theme: 'fluo', lowStock: null, currency: 42 },
    products: [
      null, undefined, 42, 'texte', [],
      { id: 'dup', name: null, qty: '-5', price: 'douze', category: 'inconnue', minQty: {} },
      { id: 'dup', name: '<img src=x onerror="window.__xss=1">', qty: 3 },
    ],
    clients: [{ id: 'c1', name: null, phone: { objet: true } }, 'pas un client'],
    repairs: [
      { id: 'r1', number: null, status: 'inexistant', createdAt: '31/02/2020', parts: 'pas un tableau', history: 42, price: 'cher', clientId: 'fantome' },
      { id: 'r1', device: '<b>gras</b>', issue: null, parts: [null, { productId: 'fantome', qty: -3, fromStock: 'oui' }] },
    ],
    cash: [{ id: 'k1', amount: NaN, type: null, method: 999, date: '32/13/2020' }, null],
    sales: [{ items: 'non', total: 'beaucoup' }],
    pricing: { tabs: [
      { id: 'same', name: null, cols: [{ id: 'c' }, { id: 'c' }], rows: [{ id: 'r', cells: 'non' }, { id: 'r' }] },
      { id: 'same', name: 'Doublon' },
    ] },
    logs: [{ action: null, date: 'hier' }, 'texte'],
    counters: { repair: 'x', invoice: null },
  };
  await seed(page, FILE_REPUBLIQUE, corrupt);
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });

  for (const screen of SCREENS) {
    await page.evaluate((s) => { window.location.hash = '#/' + s; }, screen);
    await page.waitForTimeout(150);
    const empty = await page.locator('#screen').evaluate((el) => el.innerHTML.trim().length);
    expect(empty, 'l’écran ' + screen + ' affiche quelque chose').toBeGreaterThan(50);
    await expect(page.locator('#screen'), 'l’écran ' + screen + ' ne signale pas d’indisponibilité')
      .not.toContainText('Écran indisponible');
  }
  // Les fiches de détail aussi, y compris avec un client fantôme.
  await page.evaluate(() => { window.location.hash = '#/repair/r1'; });
  await page.waitForTimeout(150);
  await expect(page.locator('#screen')).not.toContainText('Écran indisponible');

  expect(await page.evaluate(() => window.__xss), 'aucun code injecté ne s’exécute').toBeUndefined();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('un article sans nom devient « Article N » au lieu de disparaître', async ({ page }) => {
  await seed(page, FILE_REPUBLIQUE, { products: Array.from({ length: 12 }, () => ({})) });
  await page.evaluate(() => { window.location.hash = '#/stock'; window.MS.app.render(); });
  await page.waitForTimeout(150);
  const rows = await page.locator('.stock-table tbody tr').count();
  expect(rows).toBe(12);
  await expect(page.locator('#screen')).toContainText('Article 12');
});

test('isolation entre boutiques : deux fichiers, deux stockages', async ({ page }) => {
  await open(page, FILE_REPUBLIQUE);
  await page.evaluate(() => {
    window.MS.ops.saveProduct({ name: 'Article République', qty: 4 });
  });
  await open(page, FILE_GARE);
  const gareProducts = await page.evaluate(() => window.MS.store.state.products.map((p) => p.name));
  expect(gareProducts).not.toContain('Article République');
  const keys = await page.evaluate(() => ({
    gare: window.MS.config.storageKey,
    doc: window.MS.config.syncDoc,
    stored: Object.keys(localStorage).filter((k) => k.startsWith('msmobile')),
  }));
  expect(keys.gare).toBe('msmobile.gare.v1');
  expect(keys.doc).toBe('shops/gare');
  expect(keys.stored.some((k) => k.startsWith('msmobile.republique'))).toBe(true);
  expect(keys.stored.some((k) => k.startsWith('msmobile.gare'))).toBe(true);

  await open(page, FILE_REPUBLIQUE);
  const repProducts = await page.evaluate(() => window.MS.store.state.products.map((p) => p.name));
  expect(repProducts).toContain('Article République');
});

test('visibilité contrôlée au style calculé, jamais à l’attribut seul', async ({ page }) => {
  await open(page);
  await loadDemo(page);

  // Bureau : barre latérale visible, barre basse absente.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(120);
  expect((await reallyVisible(page, '.nav')).visible).toBe(true);
  expect((await reallyVisible(page, '.mobile-bar')).visible).toBe(false);

  // Mobile : l'inverse, et la barre basse est réellement dans l'écran.
  await page.setViewportSize({ width: 390, height: 760 });
  await page.waitForTimeout(120);
  expect((await reallyVisible(page, '.nav')).visible).toBe(false);
  const bar = await reallyVisible(page, '.mobile-bar');
  expect(bar.visible).toBe(true);
  expect(bar.bottom).toBeLessThanOrEqual(761);

  // Le panneau modal se ferme réellement : plus aucun nœud, pas seulement masqué.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.MS.screens.stock.openForm());
  await page.waitForTimeout(150);
  expect((await reallyVisible(page, '.modal')).visible).toBe(true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  expect((await reallyVisible(page, '.modal')).found).toBe(false);
});
