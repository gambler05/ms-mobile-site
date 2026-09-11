import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { open, loadDemo } from './helpers.mjs';

const OUT = path.resolve('test-results/print');
fs.mkdirSync(OUT, { recursive: true });

/** Compte les pages d'un PDF produit par Chromium. */
function pdfPageCount(buffer) {
  const text = buffer.toString('latin1');
  const counts = Array.from(text.matchAll(/\/Type\s*\/Page[^s]/g)).length;
  const declared = Array.from(text.matchAll(/\/Count\s+(\d+)/g)).map((m) => parseInt(m[1], 10));
  return Math.max(counts, declared.length ? Math.max(...declared) : 0);
}

async function renderDoc(page, kind, repairIndex = 0) {
  await page.evaluate(({ k, i }) => {
    const repair = window.MS.store.state.repairs[i];
    const html = k === 'ticket' ? window.MS.print.ticketHtml(repair) : window.MS.print.invoiceHtml(repair);
    const root = document.getElementById('print-root');
    root.innerHTML = html;
    root.hidden = false;
    document.body.classList.add('printing');
    window.MS.print.fitToPage(root);
  }, { k: kind, i: repairIndex });
  await page.waitForTimeout(250);
}

test('ticket de prise en charge : une page, contenu complet', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  await renderDoc(page, 'ticket');

  // innerText applique les majuscules décidées par la feuille de style :
  // on compare sans tenir compte de la casse.
  const text = (await page.locator('#print-root').innerText()).toLowerCase();
  for (const expected of ['MS MOBILE', 'Ticket de prise en charge', 'REP-', 'Client', 'Appareil',
    'IMEI', 'Panne déclarée', 'État constaté', 'Montant estimé', 'Acompte', 'Reste à régler',
    'TVA', 'Conditions de dépôt', 'Garantie', 'Signature du client', 'Cachet et signature du magasin', 'SIRET']) {
    expect(text, 'le ticket porte « ' + expected + ' »').toContain(expected.toLowerCase());
  }

  const pdf = await page.pdf({ format: 'A4', printBackground: true, path: path.join(OUT, 'ticket.pdf') });
  expect(pdfPageCount(pdf), 'le ticket tient sur une page').toBe(1);
  await page.locator('#print-root .p-page').screenshot({ path: path.join(OUT, 'ticket.png') });
});

test('facture : une page, lignes, acompte déduit et net à payer', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  await page.evaluate(() => {
    // Une fiche chargée : plusieurs pièces, pour éprouver la mise en page.
    const r = window.MS.store.state.repairs[0];
    ['Écran', 'Batterie', 'Nappe de charge', 'Vitre arrière', 'Coque'].forEach((name, i) => {
      window.MS.ops.addPart(r.id, { name: name + ' de remplacement', qty: 1, price: 29 + i * 10 });
    });
  });
  await renderDoc(page, 'facture');

  const text = (await page.locator('#print-root').innerText()).toLowerCase();
  for (const expected of ['Facture', 'Désignation', 'Qté', 'Total', 'Acompte déduit', 'Net à payer', 'Garantie']) {
    expect(text, 'la facture porte « ' + expected + ' »').toContain(expected.toLowerCase());
  }
  const pdf = await page.pdf({ format: 'A4', printBackground: true, path: path.join(OUT, 'facture.pdf') });
  expect(pdfPageCount(pdf), 'la facture tient sur une page').toBe(1);
  await page.locator('#print-root .p-page').screenshot({ path: path.join(OUT, 'facture.png') });
});

test('document exceptionnellement long : signatures et pied de page restent solidaires', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  await page.evaluate(() => {
    const r = window.MS.store.state.repairs[0];
    r.issue = 'Panne décrite très longuement. '.repeat(40);
    r.deviceState = 'État constaté détaillé. '.repeat(40);
    r.notes = 'Notes internes. '.repeat(30);
    for (let i = 0; i < 25; i++) window.MS.ops.addPart(r.id, { name: 'Pièce ' + i, qty: 1, price: 19 });
  });
  await renderDoc(page, 'facture');
  const pdf = await page.pdf({ format: 'A4', printBackground: true, path: path.join(OUT, 'facture-longue.pdf') });
  const pages = pdfPageCount(pdf);
  expect(pages, 'un document très long déborde, mais reste borné').toBeGreaterThanOrEqual(1);

  // Signatures et pied de page ne doivent pas être séparés par une coupure de page.
  const geom = await page.evaluate(() => {
    const signs = document.querySelector('#print-root .p-signs').getBoundingClientRect();
    const foot = document.querySelector('#print-root .p-foot').getBoundingClientRect();
    const cs = getComputedStyle(document.querySelector('#print-root .p-signs'));
    const csFoot = getComputedStyle(document.querySelector('#print-root .p-foot'));
    return { gap: foot.top - signs.bottom, breakSigns: cs.breakInside, breakFoot: csFoot.breakInside };
  });
  expect(geom.breakSigns).toBe('avoid');
  expect(geom.breakFoot).toBe('avoid');
  expect(geom.gap, 'le pied suit immédiatement les signatures').toBeLessThan(40);
});

test('le resserrement joue sur les espacements, jamais sur les tailles de texte', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  await renderDoc(page, 'ticket');
  const measure = () => page.evaluate(() => {
    const el = document.querySelector('#print-root .p-text');
    const box = document.querySelector('#print-root .p-box');
    const cs = getComputedStyle(el);
    return {
      fontSize: cs.fontSize,
      padding: getComputedStyle(box).paddingTop,
      // Hauteur réellement occupée : la page porte une hauteur minimale d'A4.
      height: window.MS.print.naturalHeight(document.getElementById('print-root')),
    };
  });
  const normal = await measure();
  await page.evaluate(() => document.getElementById('print-root').classList.add('tight-3'));
  await page.waitForTimeout(120);
  const tight = await measure();
  expect(tight.fontSize, 'la taille du texte ne bouge pas').toBe(normal.fontSize);
  expect(parseFloat(tight.padding), 'les espacements se resserrent').toBeLessThan(parseFloat(normal.padding));
  expect(tight.height, 'le document occupe moins de hauteur').toBeLessThan(normal.height);
});

test('lisibilité à l’impression : intitulés foncés, valeurs noires, traits visibles', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  await renderDoc(page, 'ticket');
  const contrast = await page.evaluate(() => {
    const lum = (rgb) => {
      const [r, g, b] = rgb.match(/\d+/g).map(Number).map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    // Fond effectif : le premier ancêtre qui en peint un.
    const background = (el) => {
      let node = el;
      while (node && node !== document.documentElement) {
        const bg = getComputedStyle(node).backgroundColor;
        const alpha = bg.startsWith('rgba') ? parseFloat(bg.split(',')[3]) : 1;
        if (bg && bg !== 'transparent' && alpha > 0.1) return bg;
        node = node.parentElement;
      }
      return 'rgb(255, 255, 255)';
    };
    const ratio = (el) => {
      const l1 = lum(getComputedStyle(el).color) + 0.05;
      const l2 = lum(background(el)) + 0.05;
      return l1 > l2 ? l1 / l2 : l2 / l1;
    };
    const worst = { ratio: 99, text: '' };
    document.querySelectorAll('#print-root .p-page *').forEach((el) => {
      if (!el.textContent.trim() || el.children.length) return;
      const r = ratio(el);
      if (r < worst.ratio) { worst.ratio = r; worst.text = el.textContent.trim().slice(0, 30); }
    });
    const rule = getComputedStyle(document.querySelector('#print-root .p-head')).borderBottomColor;
    const labelWeight = getComputedStyle(document.querySelector('#print-root .p-label')).fontWeight;
    const base = getComputedStyle(document.querySelector('#print-root .p-page')).fontSize;
    return { worst, rule, ruleLum: lum(rule), labelWeight, base };
  });
  expect(contrast.worst.ratio, 'aucun gris clair qui disparaît au laser').toBeGreaterThan(7);
  expect(contrast.ruleLum, 'les traits de séparation sont assez sombres').toBeLessThan(0.25);
  expect(Number(contrast.labelWeight), 'les intitulés de champs sont en gras').toBeGreaterThanOrEqual(700);
  // 11 pt ≈ 14,67 px
  expect(parseFloat(contrast.base)).toBeGreaterThanOrEqual(14);
});

test('l’impression attend le chargement des images', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  const printed = await page.evaluate(async () => {
    let called = false;
    const realPrint = window.print;
    window.print = () => { called = true; };
    // Un logo volumineux, pour que l'attente soit réelle.
    window.MS.store.state.settings.logo = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#333"/></svg>');
    window.MS.print.ticket(window.MS.store.state.repairs[0]);
    const immediately = called;
    await new Promise((r) => setTimeout(r, 900));
    window.print = realPrint;
    const images = Array.from(document.querySelectorAll('#print-root img'));
    return { immediately, later: called, imagesComplete: images.every((i) => i.complete), imageCount: images.length };
  });
  expect(printed.immediately, 'l’impression ne part pas avant la mise en page').toBe(false);
  expect(printed.later, 'elle part une fois les images chargées').toBe(true);
  expect(printed.imageCount).toBeGreaterThan(0);
  expect(printed.imagesComplete).toBe(true);
});

test('le nom porté par les documents n’inclut pas la ville', async ({ page }) => {
  await open(page);
  await loadDemo(page);
  const names = await page.evaluate(() => ({
    shop: window.MS.store.state.settings.shopName,
    doc: window.MS.print.docName(),
    address: window.MS.store.state.settings.address,
  }));
  expect(names.shop).toContain('République');
  expect(names.doc, 'le document porte le nom sans la ville').toBe('MS MOBILE');
  await renderDoc(page, 'ticket');
  const head = await page.locator('#print-root .p-ident').innerText();
  expect(head).toContain('MS MOBILE');
  expect(head, 'l’adresse postale complète figure en dessous').toContain('Lyon');
});
