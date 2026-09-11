import { test, expect } from '@playwright/test';
import { open, loadDemo, SCREENS, overflow } from './helpers.mjs';

const WIDTHS = [360, 390, 480, 640, 768, 820, 960, 1100, 1280, 1440, 1600];

test('de 360 à 1600 px : aucun débordement horizontal, sur tous les écrans', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  const failures = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const screen of SCREENS) {
      await page.evaluate((s) => { window.location.hash = '#/' + s; }, screen);
      await page.waitForTimeout(90);
      const o = await overflow(page);
      if (o.scrollWidth > o.clientWidth + 1) {
        failures.push(width + 'px / ' + screen + ' : scrollWidth=' + o.scrollWidth
          + ' > ' + o.clientWidth + ' — ' + o.offenders.join(', '));
      }
    }
  }
  expect(failures, failures.join('\n')).toEqual([]);
});

test('aucun libellé tronqué : le texte tient dans son élément', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  const failures = [];
  for (const width of [360, 480, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const screen of SCREENS) {
      await page.evaluate((s) => { window.location.hash = '#/' + s; }, screen);
      await page.waitForTimeout(90);
      const clipped = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('.btn, .chip, .stat-label, .nav-link span, .mob-link span, .badge, th, .field > span').forEach((el) => {
          const cs = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          // Les intitulés de colonnes délibérément masqués en mode bloc
          // (repris par data-label sur chaque cellule) ne sont pas des troncatures.
          if (rect.width < 3 || rect.height < 3) return;
          // Un dépassement assumé par une ellipse n'est pas une troncature accidentelle.
          if (cs.textOverflow === 'ellipsis' || cs.overflow === 'hidden') return;
          if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
            out.push(el.tagName + '.' + String(el.className).split(' ')[0] + ' « ' + el.textContent.trim().slice(0, 28) + ' »');
          }
        });
        return out.slice(0, 4);
      });
      if (clipped.length) failures.push(width + 'px / ' + screen + ' : ' + clipped.join(' | '));
    }
  }
  expect(failures, failures.join('\n')).toEqual([]);
});

test('les colonnes s’effacent par ordre d’importance et se replient sous le nom', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  await page.evaluate(() => { window.location.hash = '#/stock'; });
  await page.waitForTimeout(150);

  const state = async () => page.evaluate(() => {
    const vis = (sel) => {
      const el = document.querySelector(sel);
      return !!el && getComputedStyle(el).display !== 'none';
    };
    // Position réelle à l'écran : un parent masqué rend l'enfant invisible
    // même si son propre style calculé dit « inline ».
    // Union sur toutes les lignes : une ligne sans fournisseur n'a rien à replier.
    const foldItems = Array.from(new Set(
      Array.from(document.querySelectorAll('.stock-table tbody .fold-item'))
        .filter((el) => el.getBoundingClientRect().width > 0)
        .map((el) => el.dataset.k)
    ));
    return {
      sup: vis('.stock-table tbody td.col-sup'),
      min: vis('.stock-table tbody td.col-min'),
      cat: vis('.stock-table tbody td.col-cat'),
      price: vis('.stock-table tbody td.col-price'),
      blocks: getComputedStyle(document.querySelector('.stock-table tbody tr')).display === 'block',
      folded: foldItems,
    };
  });

  await page.setViewportSize({ width: 1400, height: 900 });
  await page.waitForTimeout(120);
  let s = await state();
  expect(s.sup && s.min && s.cat && s.price, 'toutes les colonnes à 1400 px').toBe(true);
  expect(s.folded, 'rien à replier tant que tout est visible').toEqual([]);

  await page.setViewportSize({ width: 1150, height: 900 });
  await page.waitForTimeout(120);
  s = await state();
  expect(s.sup, 'le fournisseur s’efface en premier').toBe(false);
  expect(s.folded, 'son contenu se replie sous le nom').toContain('sup');
  expect(s.cat, 'la catégorie tient encore').toBe(true);

  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(120);
  s = await state();
  expect(s.cat).toBe(false);
  expect(s.folded).toEqual(expect.arrayContaining(['sup', 'min', 'cat']));

  await page.setViewportSize({ width: 500, height: 900 });
  await page.waitForTimeout(120);
  s = await state();
  expect(s.blocks, 'sous le seuil, chaque ligne devient un bloc').toBe(true);
  expect(s.folded, 'en mode bloc chaque champ porte déjà son intitulé').toEqual([]);

  // Rien n'est perdu : tous les intitulés sont présents dans le bloc.
  const labels = await page.evaluate(() => Array.from(
    document.querySelectorAll('.stock-table tbody tr:first-child td[data-label]')
  ).filter((el) => getComputedStyle(el).display !== 'none').map((el) => el.dataset.label));
  expect(labels).toEqual(expect.arrayContaining(['Produit', 'Catégorie', 'Prix', 'Quantité', 'État', 'Seuil', 'Fournisseur']));
});

test('la grille tarifaire garde sa colonne de modèles pendant le défilement', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  await page.setViewportSize({ width: 700, height: 800 });
  await page.evaluate(() => { window.location.hash = '#/pricing'; });
  await page.waitForTimeout(200);
  const sticky = await page.evaluate(() => {
    const cell = document.querySelector('.pricing-table tbody .sticky-col');
    return cell ? getComputedStyle(cell).position : null;
  });
  expect(sticky).toBe('sticky');
  // Le défilement horizontal reste confiné au tableau.
  const o = await overflow(page);
  expect(o.scrollWidth).toBeLessThanOrEqual(o.clientWidth + 1);
});

test('les écrans mobiles annoncés dans la barre basse y sont bien', async ({ page }) => {
  await open(page);
  await page.setViewportSize({ width: 390, height: 760 });
  await page.waitForTimeout(150);
  const links = await page.evaluate(() => Array.from(document.querySelectorAll('.mob-link'))
    .map((el) => el.getAttribute('href') || 'plus'));
  expect(links).toEqual(['#/dashboard', '#/cash', '#/stock', '#/repairs', 'plus']);
  // « Plus » donne accès aux écrans restants.
  await page.locator('[data-more]').click();
  await page.waitForTimeout(150);
  const more = await page.evaluate(() => Array.from(document.querySelectorAll('.more-link')).map((el) => el.getAttribute('href')));
  expect(more).toEqual(expect.arrayContaining(['#/alerts', '#/clients', '#/pricing', '#/settings', '#/logs']));
});
