import { test, expect } from '@playwright/test';
import { open, loadDemo } from './helpers.mjs';

test('caisse : encaissement avec panier, le stock baisse et la période suit', async ({ page }) => {
  const errors = await open(page);
  await loadDemo(page);
  await page.evaluate(() => { window.location.hash = '#/cash'; });
  await page.waitForTimeout(150);

  const before = await page.evaluate(() => window.MS.store.state.products.find((p) => p.name.startsWith('Coque')).qty);
  const coqueId = await page.evaluate(() => window.MS.store.state.products.find((p) => p.name.startsWith('Coque')).id);
  await page.selectOption('#cart-pick', coqueId);
  await page.click('[data-act="cart-add"]');
  await page.waitForTimeout(120);
  await page.click('[data-cart-inc="0"]');
  await page.waitForTimeout(120);
  await expect(page.locator('.cart-total')).toContainText('29,80');
  await page.click('#cash-in button[type="submit"]');
  await page.waitForTimeout(200);

  const after = await page.evaluate(() => window.MS.store.state.products.find((p) => p.name.startsWith('Coque')).qty);
  expect(after).toBe(before - 2);
  await expect(page.locator('.cash-table')).toContainText('29,80');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('caisse : un retrait compte pour 0 et la carte reste sur « Retrait »', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  await page.evaluate(() => { window.location.hash = '#/cash'; });
  await page.waitForTimeout(150);
  const revenueBefore = await page.evaluate(() => window.MS.stats.totals(window.MS.stats.cashIn(window.MS.stats.periodRange('day'))).revenue);

  await page.click('[data-mode="out"]');
  await page.waitForTimeout(120);
  await page.fill('#cash-out input[name="amount"]', '150');
  await page.fill('#cash-out input[name="label"]', 'Dépôt en banque');
  await page.click('#cash-out button[type="submit"]');
  await page.waitForTimeout(200);

  await expect(page.locator('[data-mode="out"]'), 'la carte reste sur Retrait').toHaveClass(/on/);
  const totals = await page.evaluate(() => window.MS.stats.totals(window.MS.stats.cashIn(window.MS.stats.periodRange('day'))));
  expect(totals.withdrawals).toBe(150);
  expect(totals.revenue, 'le retrait ne gonfle pas l’encaisse').toBe(revenueBefore);
  await expect(page.locator('.row-withdraw')).toBeVisible();
});

test('caisse : période et date sont exclusives, et le bandeau signale le hors-période', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  await page.evaluate(() => { window.location.hash = '#/cash'; });
  await page.waitForTimeout(150);

  // Le jeu de démonstration couvre 14 jours : sur « Jour », le reste est hors période.
  await expect(page.locator('.banner-info')).toContainText('en dehors de la période');
  await page.click('[data-period="month"]');
  await page.waitForTimeout(150);
  await expect(page.locator('[data-period="month"]')).toHaveClass(/on/);

  await page.fill('#cash-date', '2026-09-01');
  await page.waitForTimeout(180);
  const chipsOn = await page.locator('.chip.on').count();
  expect(chipsOn, 'choisir une date éteint les boutons de période').toBe(0);

  await page.click('[data-period="all"]');
  await page.waitForTimeout(180);
  expect(await page.inputValue('#cash-date'), 'cliquer un bouton efface la date').toBe('');
  await expect(page.locator('.banner-info')).toHaveCount(0);
});

test('caisse : l’historique n’offre ni édition ni suppression', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  await page.evaluate(() => { window.location.hash = '#/cash'; });
  await page.waitForTimeout(150);
  const actions = await page.locator('.cash-table [data-act="edit"], .cash-table [data-act="del"]').count();
  expect(actions, 'un journal de caisse ne s’édite pas').toBe(0);
});

test('stock : +1, −1 désactivé à zéro, et le journal ne se remplit pas de bruit', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  await page.evaluate(() => { window.location.hash = '#/stock'; });
  await page.waitForTimeout(150);
  await page.fill('#stock-q', 'Batterie iPhone 12');
  await page.waitForTimeout(300);

  const dec = page.locator('.stock-table tbody tr [data-act="dec"]').first();
  await expect(dec, 'le −1 est désactivé à zéro').toBeDisabled();

  const logsBefore = await page.evaluate(() => window.MS.store.state.logs.length);
  const inc = page.locator('.stock-table tbody tr [data-act="inc"]').first();
  for (let i = 0; i < 4; i++) { await inc.click(); await page.waitForTimeout(80); }
  const qty = await page.evaluate(() => window.MS.store.state.products.find((p) => p.name.startsWith('Batterie')).qty);
  expect(qty).toBe(4);
  const logsAfter = await page.evaluate(() => window.MS.store.state.logs.length);
  expect(logsAfter - logsBefore, 'quatre clics tiennent une seule ligne de journal').toBe(1);

  // Retour au chiffre de départ : la ligne disparaît.
  for (let i = 0; i < 4; i++) {
    await page.locator('.stock-table tbody tr [data-act="dec"]').first().click();
    await page.waitForTimeout(80);
  }
  const logsEnd = await page.evaluate(() => window.MS.store.state.logs.length);
  expect(logsEnd).toBe(logsBefore);
});

test('réparation : recherche client au clavier, tarif repris de la grille', async ({ page }) => {
  const errors = await open(page);
  await loadDemo(page);
  await page.evaluate(() => { window.location.hash = '#/repairs'; });
  await page.waitForTimeout(150);
  await page.click('[data-act="new"]');
  await page.waitForTimeout(200);

  // Insensible aux accents et aux espaces : on tape sans accent.
  await page.fill('#client-q', 'lemaitre');
  await page.waitForTimeout(200);
  await expect(page.locator('.picker-item').first()).toContainText('Sophie Lemaître');
  await page.locator('#client-q').press('Enter');
  await page.waitForTimeout(150);
  await expect(page.locator('#client-state')).toContainText('Fiche rattachée');

  // Le tarif le plus précis est proposé et rempli en un clic.
  await page.fill('#rep-device', 'iPhone 13');
  await page.waitForTimeout(400);
  await expect(page.locator('#tariff-zone')).toContainText('iPhone 13');
  await page.locator('#tariff-zone .chip.tariff').first().click();
  await page.waitForTimeout(150);
  expect(await page.inputValue('#rep-price')).toBe('189');

  await page.fill('input[name="issue"]', 'Écran cassé');
  await page.click('[data-act="save"]');
  await page.waitForTimeout(300);
  await expect(page.locator('#screen')).toContainText('REP-');
  await expect(page.locator('#screen')).toContainText('Sophie Lemaître');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('réparation : un client inconnu ne bloque jamais, il devient client de passage', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  await page.evaluate(() => { window.MS.screens.repairs.openForm(); });
  await page.waitForTimeout(200);
  await page.fill('#client-q', 'Monsieur Personne');
  await page.waitForTimeout(200);
  await expect(page.locator('#client-state')).toContainText('Client de passage');
  await page.fill('#rep-device', 'Nokia 3310');
  await page.waitForTimeout(400);
  await expect(page.locator('#tariff-zone'), 'un appareil absent le dit au lieu de deviner').toContainText('Aucun tarif');
  await page.fill('input[name="issue"]', 'Ne s’allume plus');
  await page.click('[data-act="save"]');
  await page.waitForTimeout(300);
  await expect(page.locator('#screen')).toContainText('Monsieur Personne');
});

test('fiche : statut, pièce décomptée et fin d’intervention', async ({ page }) => {
  const errors = await open(page);
  await loadDemo(page);
  const id = await page.evaluate(() => window.MS.store.state.repairs[0].id);
  await page.evaluate((i) => { window.location.hash = '#/repair/' + i; }, id);
  await page.waitForTimeout(200);

  // La pièce du jeu de démonstration est décomptée : la bascule la remet en stock.
  const stockBefore = await page.evaluate(() => window.MS.store.state.products[0].qty);
  await page.locator('[data-act="toggle-part"]').first().click();
  await page.waitForTimeout(200);
  const stockAfter = await page.evaluate(() => window.MS.store.state.products[0].qty);
  expect(stockAfter).toBe(stockBefore + 1);
  await expect(page.locator('.parts-table')).toContainText('Non décomptée');

  // Fin d'intervention : SMS pré-rempli, solde, pièces, documents.
  await page.click('[data-act="finish"]');
  await page.waitForTimeout(250);
  const sms = await page.inputValue('#sms-body');
  expect(sms).toContain('iPhone 13');
  expect(sms).not.toContain('{client}');
  await expect(page.locator('.finish')).toContainText('Reste à régler');
  await expect(page.locator('.warn-text'), 'les pièces non décomptées sont signalées').toBeVisible();
  await page.click('[data-act="deliver"]');
  await page.waitForTimeout(250);
  const status = await page.evaluate(() => window.MS.store.state.repairs[0].status);
  expect(status).toBe('Livré');
  await expect(page.locator('.timeline')).toContainText('Appareil remis au client');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('grille tarifaire : saisie enregistrée à la sortie, Entrée descend d’une case', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  await page.evaluate(() => { window.location.hash = '#/pricing'; });
  await page.waitForTimeout(200);

  const first = page.locator('.pricing-table tbody tr:first-child .cell-input').nth(1);
  await first.fill('sur devis');
  await first.press('Enter');
  await page.waitForTimeout(150);

  const saved = await page.evaluate(() => {
    const tab = window.MS.store.state.pricing.tabs[0];
    return tab.rows[0].cells[tab.cols[0].id];
  });
  expect(saved, 'les valeurs restent du texte').toBe('sur devis');

  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    const inputs = Array.from(document.querySelectorAll('.pricing-table .cell-input'));
    return inputs.indexOf(el);
  });
  const colCount = await page.evaluate(() => window.MS.store.state.pricing.tabs[0].cols.length);
  expect(focused, 'Entrée passe à la case suivante, une ligne plus bas').toBe(1 + colCount + 1);
});

test('protection : écrans d’administration réservés, la caisse reste libre', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  await page.evaluate(async () => {
    await window.MS.auth.addAccount({ login: 'vendeur', name: 'Vendeur', role: 'Vendeur', password: 'secret' });
    window.MS.store.state.settings.authScope = 'sensitive';
    window.MS.store.save({ reason: 'test' });
  });
  await page.evaluate(() => { window.location.hash = '#/cash'; window.MS.app.render(); });
  await page.waitForTimeout(200);
  await expect(page.locator('#screen'), 'la caisse reste libre').toContainText('Nouvelle transaction');

  await page.evaluate(() => { window.location.hash = '#/settings'; });
  await page.waitForTimeout(200);
  await expect(page.locator('#screen')).toContainText('Connexion requise');

  // Mauvais mot de passe : message clair, pas de passage en force.
  await page.fill('#login-form input[name="login"]', 'vendeur');
  await page.fill('#login-form input[name="password"]', 'faux');
  await page.click('#login-form button[type="submit"]');
  await page.waitForTimeout(400);
  await expect(page.locator('#login-error')).toContainText('incorrect');

  await page.fill('#login-form input[name="password"]', 'secret');
  await page.click('#login-form button[type="submit"]');
  await page.waitForTimeout(500);
  await expect(page.locator('#screen'), 'Paramètres est réservé à l’administrateur').toContainText('Réservé à l’administrateur');

  // Le journal aussi, et la navigation ne les propose plus.
  const links = await page.evaluate(() => Array.from(document.querySelectorAll('.nav-link')).map((a) => a.getAttribute('href')));
  expect(links).not.toContain('#/settings');
  expect(links).not.toContain('#/logs');
});

test('aucun bouton muet : la connexion sync dit pourquoi elle ne peut pas s’ouvrir', async ({ page }) => {
  await open(page);
  await page.click('[data-act="sync-panel"]');
  await page.waitForTimeout(200);
  await expect(page.locator('.modal')).toContainText('Sync désactivée');
  await page.click('[data-act="signin"]');
  await page.waitForTimeout(250);
  await expect(page.locator('.toast')).toContainText('n’est pas configurée');
});

test('export CSV de la caisse : ligne de total comprise', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  const csv = await page.evaluate(() => {
    const range = window.MS.stats.periodRange('all');
    const list = window.MS.stats.cashIn(range, '');
    const totals = window.MS.stats.totals(list);
    const rows = [['Date', 'Type', 'Libellé', 'Mode de paiement', 'Client', 'Articles', 'Montant']];
    list.forEach((op) => rows.push([op.date, op.type, op.label, op.method, '', '', String(op.amount)]));
    rows.push(['Total encaissé', '', '', '', '', '', String(totals.revenue - totals.withdrawals)]);
    return window.MS.util.csvDoc(rows);
  });
  expect(csv).toContain('Total encaissé');
  expect(csv.split('\r\n')[0]).toContain('"Date";"Type"');
  expect(csv.charCodeAt(0), 'BOM pour Excel').toBe(0xfeff);
});
