import { test, expect } from '@playwright/test';
import { open, loadDemo, overflow } from './helpers.mjs';

async function goAtelier(page) {
  await page.evaluate(() => { window.location.hash = '#/atelier'; });
  await page.waitForSelector('#atelier-canvas');
  await page.waitForTimeout(900);
}

/** Part de pixels peints dans la scène, hors fond de studio. */
function painted(page) {
  return page.evaluate(() => {
    const c = document.getElementById('atelier-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const teintes = new Set();
    for (let i = 0; i < d.length; i += 4 * 53) teintes.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
    return teintes.size;
  });
}

test('l’écran Atelier 3D est accessible depuis le menu et la scène se peint', async ({ page }) => {
  const errors = await open(page);
  await loadDemo(page);

  const lien = page.locator('.nav-link[href="#/atelier"]');
  await expect(lien).toBeVisible();
  await lien.click();
  await page.waitForTimeout(900);
  await expect(page.locator('.screen-title')).toHaveText('Atelier 3D');

  expect(await painted(page), 'la scène n’est pas un aplat').toBeGreaterThan(20);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('les familles reflètent les vraies réparations en cours', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  await goAtelier(page);

  // Le jeu de démonstration : 3 téléphones et 1 tablette en cours, le MacBook est livré.
  const compte = (id) => page.locator('[data-family="' + id + '"] .atelier-count').textContent();
  expect(await compte('phone')).toBe('3');
  expect(await compte('tablet')).toBe('1');
  expect(await compte('pc'), 'une fiche livrée ne compte plus comme en cours').toBe('0');

  // Une nouvelle fiche se répercute sur la famille correspondante.
  await page.evaluate(() => window.MS.ops.createRepair({ device: 'PlayStation 5', issue: 'Surchauffe' }));
  await page.evaluate(() => { window.location.hash = '#/dashboard'; });
  await page.waitForTimeout(200);
  await goAtelier(page);
  expect(await compte('ps')).toBe('1');
});

test('sélectionner une famille focalise la caméra et filtre les fiches', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  await goAtelier(page);

  const avant = await page.locator('ul.atelier-orders li').count();
  await page.click('[data-family="phone"]');
  await page.waitForTimeout(1200);

  await expect(page.locator('[data-family="phone"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#atelier-text')).toContainText('Téléphones');
  const appareils = await page.locator('.atelier-device').allTextContents();
  expect(appareils.join(' ')).toMatch(/iPhone|Galaxy/);
  expect(appareils.join(' '), 'les autres familles sont écartées').not.toMatch(/MacBook|iPad/);

  // Un second clic revient à la vue d'ensemble.
  await page.click('[data-family="phone"]');
  await page.waitForTimeout(800);
  await expect(page.locator('[data-family="phone"]')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.locator('ul.atelier-orders li').count()).toBe(avant);
});

test('la scène s’arrête en quittant l’écran et repart en y revenant', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  await goAtelier(page);
  expect(await painted(page)).toBeGreaterThan(20);

  await page.evaluate(() => { window.location.hash = '#/stock'; });
  await page.waitForTimeout(400);
  expect(await page.locator('#atelier-canvas').count(), 'le canvas est retiré du document').toBe(0);

  await goAtelier(page);
  expect(await painted(page), 'la scène repeint au retour').toBeGreaterThan(20);
});

test('de 360 à 1600 px : aucun débordement sur l’écran Atelier', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  await goAtelier(page);
  const failures = [];
  for (const width of [360, 390, 640, 820, 1024, 1280, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(220);
    const o = await overflow(page);
    if (o.scrollWidth > o.clientWidth + 1) failures.push(width + 'px : ' + o.offenders.join(', '));
    const stage = await page.locator('.atelier-stage').boundingBox();
    if (!stage || stage.height < 200) failures.push(width + 'px : scène écrasée (' + (stage && Math.round(stage.height)) + 'px)');
  }
  expect(failures, failures.join('\n')).toEqual([]);
});
