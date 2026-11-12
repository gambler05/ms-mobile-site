// Rend chaque reel de reels/defs/ en MP4 vertical 1080 × 1920, 30 i/s, prêt pour Instagram.
//   node reels/render.mjs            tous les reels
//   node reels/render.mjs batterie   un seul
// Sorties dans reels/out/ : <id>.mp4, <id>.jpg (couverture), <id>.txt (légende).
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('@playwright/test')); } catch { ({ chromium } = require('playwright')); }

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out');
mkdirSync(out, { recursive: true });
const FPS = 30;

const wanted = process.argv.slice(2);
const ids = readdirSync(join(here, 'defs')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3))
  .filter((id) => !wanted.length || wanted.includes(id));
if (!ids.length) { console.error('Aucun reel trouvé pour : ' + wanted.join(', ')); process.exit(1); }

const browser = await chromium.launch({ executablePath: process.env.MS_CHROME || undefined });
for (const id of ids) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(here, 'player.html')).href + '?r=' + id);
  const duration = await page.evaluate(() => window.__prep());
  const frames = Math.round((duration / 1000) * FPS);

  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', // piste muette : la musique s'ajoute dans Instagram
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart',
    join(out, id + '.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });

  for (let f = 0; f < frames; f++) {
    await page.evaluate((ms) => window.__seek(ms), (f * 1000) / FPS);
    const shot = await page.screenshot({ type: 'jpeg', quality: 96 });
    if (!ff.stdin.write(shot)) await once(ff.stdin, 'drain');
  }
  ff.stdin.end();
  const [code] = await once(ff, 'close');
  if (code !== 0) { console.error(`ffmpeg a échoué pour ${id} (code ${code})`); process.exit(1); }

  // Couverture : fin de l'accroche, quand le titre est entièrement affiché.
  const hookEnd = await page.evaluate(() => window.REEL.scenes[0].dur * 1000 - 600);
  await page.evaluate((ms) => window.__seek(ms), hookEnd);
  await page.screenshot({ path: join(out, id + '.jpg'), type: 'jpeg', quality: 92 });
  writeFileSync(join(out, id + '.txt'), (await page.evaluate(() => window.REEL.caption)) + '\n');
  await page.close();
  console.log(`✓ ${id}.mp4 — ${(duration / 1000).toFixed(1)} s, ${frames} images`);
}
await browser.close();
