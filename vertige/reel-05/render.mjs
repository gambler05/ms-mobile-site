// Rendu image par image du Reel (Playwright + canvas) → frames PNG.
// Usage : node render.mjs [dossierFrames] [--stills 0.3,5.5,...]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(here, 'frames');
const stillsArg = process.argv.indexOf('--stills');
const stills = stillsArg > 0 ? process.argv[stillsArg + 1].split(',').map(Number) : null;
const FPS = 30, DURATION = 30.5, TOTAL = Math.round(FPS * DURATION), WORKERS = 4;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const url = 'file://' + path.join(here, 'reel.html');
const grab = (page) => page.evaluate(() => document.getElementById('c').toDataURL('image/png').slice(22));

async function worker(i) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto(url); await page.evaluate(() => window.ready);
  if (stills) {
    if (i) return;
    for (const s of stills) { await page.evaluate(f => renderFrame(f), Math.round(s * FPS)); writeFileSync(path.join(out, `still_${s.toFixed(2)}.png`), Buffer.from(await grab(page), 'base64')); }
    await page.evaluate(() => renderCover()); writeFileSync(path.join(out, 'cover.png'), Buffer.from(await grab(page), 'base64'));
    return;
  }
  for (let f = i; f < TOTAL; f += WORKERS) {
    await page.evaluate(n => renderFrame(n), f);
    writeFileSync(path.join(out, `f_${String(f).padStart(5, '0')}.png`), Buffer.from(await grab(page), 'base64'));
  }
}
await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i)));
await browser.close();
console.log(stills ? 'stills ok' : `${TOTAL} frames → ${out}`);
