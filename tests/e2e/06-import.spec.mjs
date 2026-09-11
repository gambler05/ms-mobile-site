import { test, expect } from '@playwright/test';
import { open } from './helpers.mjs';

const CSV = 'Date;MONTANT_TTC;Mode de règlement;Libellé;Nature;Client;Téléphone\r\n'
  + '05/08/2024;129,90;CB;Écran iPhone 13;reparation;Marie Dupont;06 12 34 56 78\r\n'
  + '06/08/2024;45,00;Espèces;Coque;vente;Marie DUPONT;0612345678\r\n'
  + '31/02/2024;60,00;CB;Date impossible;vente;;\r\n'
  + '07/08/2024;;CB;Sans montant;vente;;\r\n';

/** Dépose un fichier dans le champ d'import, comme le ferait l'utilisateur. */
async function importFile(page, name, content) {
  await page.evaluate(() => { window.location.hash = '#/settings'; });
  await page.waitForTimeout(200);
  await page.setInputFiles('#import-file', {
    name, mimeType: name.endsWith('.json') ? 'application/json' : 'text/csv',
    buffer: Buffer.from(content, 'utf8'),
  });
  await page.waitForTimeout(500);
}

test('le rapport d’import précède la validation et liste ce qui a été compris', async ({ page }) => {
  const errors = await open(page);
  await importFile(page, 'ancien-logiciel.csv', CSV);

  const report = page.locator('.modal');
  await expect(report).toContainText('Rapport d’import');
  await expect(report).toContainText('Export d’un logiciel tiers');
  await expect(report).toContainText('Opérations sans montant');
  await expect(report).toContainText('Dates illisibles');
  await expect(report).toContainText('31/02/2024');
  await expect(report, 'les noms de champs rencontrés sont listés').toContainText('MONTANT_TTC');
  // Rien n'est encore appliqué.
  expect(await page.evaluate(() => window.MS.store.state.cash.length)).toBe(0);

  await page.click('[data-act="merge"]');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    cash: window.MS.store.state.cash.length,
    clients: window.MS.store.state.clients.length,
    total: window.MS.stats.totals(window.MS.store.state.cash).revenue,
  }));
  expect(after.cash).toBe(4);
  expect(after.clients, 'les doublons de Marie sont fusionnés par téléphone').toBe(1);
  expect(after.total).toBeCloseTo(234.9, 2);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('après import, la période affichée montre les données anciennes', async ({ page }) => {
  await open(page);
  await importFile(page, 'ancien-logiciel.csv', CSV);
  await page.click('[data-act="merge"]');
  await page.waitForTimeout(600);

  // On atterrit sur la caisse, et la période ne laisse pas croire qu'il ne s'est rien passé.
  await expect(page.locator('.screen-title')).toHaveText('Caisse');
  await expect(page.locator('[data-period="all"]')).toHaveClass(/on/);
  await expect(page.locator('.cash-table')).toContainText('129,90');
});

test('importer un stock ne touche ni au nom ni à l’adresse de la boutique', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => {
    const s = window.MS.store.state.settings;
    return { name: s.shopName, address: s.address };
  });
  expect(before.name).toContain('MS MOBILE');

  const foreign = JSON.stringify({
    settings: { shopName: 'Boutique concurrente', address: 'Ailleurs' },
    produits: [{ Designation: 'Coque', 'Quantité': 4, 'Prix': '14,90' }],
  });
  await importFile(page, 'stock-tiers.json', foreign);
  await page.click('[data-act="merge"]');
  await page.waitForTimeout(500);

  const after = await page.evaluate(() => {
    const s = window.MS.store.state.settings;
    return { name: s.shopName, address: s.address, products: window.MS.store.state.products.length };
  });
  expect(after.name, 'le nom de la boutique survit à l’import').toBe(before.name);
  expect(after.address).toBe(before.address);
  expect(after.products).toBe(1);
});

test('une sauvegarde interne est reconnue et restaurée, l’état précédent reste récupérable', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.MS.demo.load(); });
  const backup = await page.evaluate(() => JSON.stringify(Object.assign({}, window.MS.store.state, { _app: 'MS-MOBILE' })));
  await page.evaluate(() => { window.MS.store.eraseAll(); window.MS.app.render(); });
  expect(await page.evaluate(() => window.MS.store.state.repairs.length)).toBe(0);

  await importFile(page, 'sauvegarde.json', backup);
  await expect(page.locator('.modal')).toContainText('Sauvegarde interne');
  await page.click('[data-act="replace"]');
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.MS.store.state.repairs.length)).toBe(5);
  expect(await page.evaluate(() => !!window.MS.store.getSnapshot()), 'une copie de l’état précédent est gardée').toBe(true);
});

test('un fichier inexploitable est refusé sans rien casser', async ({ page }) => {
  const errors = await open(page);
  await importFile(page, 'photo.pdf', '%PDF-1.4 contenu binaire');
  await expect(page.locator('.modal')).toContainText('Import impossible');
  await page.click('[data-close]');
  await page.waitForTimeout(200);
  await expect(page.locator('#screen')).toContainText('Paramètres' , { useInnerText: false }).catch(() => {});
  expect(await page.evaluate(() => window.MS.store.state.products.length)).toBe(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('sauvegardes automatiques : listées et restaurables depuis les paramètres', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.MS.demo.load(); });
  await page.evaluate(() => { window.location.hash = '#/settings'; window.MS.app.render(); });
  await page.waitForTimeout(250);
  await expect(page.locator('.backup-list')).toContainText('réparations');
  const restoreButtons = await page.locator('[data-restore]').count();
  expect(restoreButtons).toBeGreaterThanOrEqual(1);
});
