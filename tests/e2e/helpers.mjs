import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const FILE_REPUBLIQUE = 'file://' + path.join(root, 'dist/ms-mobile-republique.html');
export const FILE_GARE = 'file://' + path.join(root, 'dist/ms-mobile-gare.html');

/** Ouvre l'application et collecte toute exception survenue au rendu. */
export async function open(page, url = FILE_REPUBLIQUE, hash = '') {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });
  await page.goto(url + (hash ? '#/' + hash : ''));
  await page.waitForFunction(() => window.MS && window.MS.app);
  await page.waitForSelector('#screen .card, #screen .grid', { timeout: 10000 });
  return errors;
}

/** Injecte un état dans le stockage puis recharge. */
export async function seed(page, url, state) {
  await page.goto(url);
  await page.waitForFunction(() => window.MS && window.MS.store);
  await page.evaluate((st) => {
    localStorage.setItem(window.MS.config.storageKey, JSON.stringify(st));
  }, state);
  await page.reload();
  await page.waitForFunction(() => window.MS && window.MS.app);
}

/** Charge le jeu de démonstration dans l'onglet courant. */
export async function loadDemo(page) {
  await page.evaluate(() => { window.MS.demo.load(); window.MS.app.render(); });
  await page.waitForTimeout(120);
}

export const SCREENS = ['dashboard', 'cash', 'stock', 'alerts', 'repairs', 'clients', 'pricing', 'settings', 'logs'];

/** Débordement horizontal réel de la page. */
export async function overflow(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    offenders: Array.from(document.querySelectorAll('body *')).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > document.documentElement.clientWidth + 1.5
        && getComputedStyle(el).position !== 'fixed'
        && !el.closest('.table-wrap, .pricing-wrap, #print-root');
    }).slice(0, 5).map((el) => el.tagName + '.' + String(el.className).split(' ')[0] + ' right=' + Math.round(el.getBoundingClientRect().right)),
  }));
}

/** Visibilité réelle : style calculé et position à l'écran, jamais l'attribut seul. */
export async function reallyVisible(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false, visible: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      found: true,
      visible: cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.01 && r.width > 0 && r.height > 0,
      display: cs.display, visibility: cs.visibility, width: r.width, height: r.height,
      top: r.top, bottom: r.bottom,
    };
  }, selector);
}
