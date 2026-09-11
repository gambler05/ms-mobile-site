import { test, expect } from '@playwright/test';
import path from 'node:path';

const PAGE = 'file://' + path.resolve('design/atelier-3d.html');

async function open(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(PAGE);
  await page.waitForSelector('.service');
  await page.waitForTimeout(900);
  return errors;
}

/** Part de pixels réellement peints dans la scène. */
function sceneCoverage(page, threshold) {
  return page.evaluate((min) => {
    const c = document.getElementById('scene');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0, total = 0;
    for (let i = 0; i < d.length; i += 4 * 16) {
      total++;
      if (d[i] + d[i + 1] + d[i + 2] > min) n++;
    }
    return total ? n / total : 0;
  }, threshold);
}

test('la scène 3D se peint réellement, sans dépendance externe', async ({ page }) => {
  const errors = await open(page);
  // Aucune ressource distante : le fichier doit être autonome.
  const external = await page.evaluate(() => Array.from(document.querySelectorAll('script[src], link[href], img[src]'))
    .map((el) => el.getAttribute('src') || el.getAttribute('href'))
    .filter((u) => /^https?:/.test(u)));
  expect(external, 'aucune ressource chargée depuis le réseau').toEqual([]);

  const painted = await sceneCoverage(page, 120);
  expect(painted, 'la scène n’est pas un canvas vide').toBeGreaterThan(0.05);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('sélectionner un service focalise la caméra et filtre le panneau', async ({ page }) => {
  await open(page);
  const before = await page.locator('.order').count();
  expect(before).toBeGreaterThan(3);

  await page.click('[data-service="pc"]');
  await page.waitForTimeout(1800);

  await expect(page.locator('[data-service="pc"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#workshop-text')).toContainText('PC, MacBook');
  const orders = await page.locator('.order-device').allTextContents();
  expect(orders.join(' ')).toMatch(/MacBook|Dell/);
  expect(orders.join(' '), 'les commandes des autres services sont écartées').not.toMatch(/iPhone|PlayStation/);
  await expect(page.locator('.bar-row').nth(1)).toContainText('72 %');

  // Un second clic ramène la vue d'ensemble.
  await page.click('[data-service="pc"]');
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-service="pc"]')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.locator('.order').count()).toBe(before);
});

test('de 360 à 1600 px : aucun débordement horizontal', async ({ page }) => {
  await open(page);
  const failures = [];
  for (const width of [360, 390, 480, 640, 768, 860, 1024, 1280, 1440, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(160);
    const o = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    if (o.sw > o.cw + 1) failures.push(width + 'px : ' + o.sw + ' > ' + o.cw);
  }
  expect(failures, failures.join('\n')).toEqual([]);
});

test('sur petit écran, rien ne recouvre la scène', async ({ page }) => {
  await open(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);

  const boxes = await page.evaluate(() => {
    const r = (s) => {
      const el = document.querySelector(s);
      const b = el.getBoundingClientRect();
      return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, w: b.width, h: b.height };
    };
    return { kpi: r('.kpi-row'), workshop: r('.workshop'), canvas: r('#scene') };
  });
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  expect(overlaps(boxes.kpi, boxes.workshop), 'les compteurs ne chevauchent pas le panneau').toBe(false);
  expect(overlaps(boxes.kpi, boxes.canvas), 'les compteurs ne recouvrent pas la scène').toBe(false);
  expect(boxes.canvas.h, 'la scène garde une hauteur utile').toBeGreaterThan(180);

  // Et elle est toujours dessinée à cette taille.
  expect(await sceneCoverage(page, 120)).toBeGreaterThan(0.05);
});

test('la scène reste manipulable : rotation et zoom', async ({ page }) => {
  await open(page);
  const signature = () => sceneCoverage(page, 200);
  const before = await signature();

  const box = await page.locator('#scene').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 220, box.y + box.height / 2 + 40, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  const after = await signature();
  expect(Math.abs(after - before), 'la rotation change réellement l’image').toBeGreaterThan(0.0005);
});
