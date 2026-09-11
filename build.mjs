/* ============================================================
   Build — un fichier HTML autonome par boutique.
   Même base de code ; seuls changent le nom, les coordonnées,
   la palette, le logo, la clé de stockage et le document de sync.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(root, 'src');
const DIST = path.join(root, 'dist');

/* -------------------- Encodeur PNG minimal -------------------- */

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGBA brut -> PNG. */
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filtre "None"
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(full.slice(0, 2), 16) || 0, parseInt(full.slice(2, 4), 16) || 0, parseInt(full.slice(4, 6), 16) || 0];
}

/** Icône : carré arrondi en dégradé + silhouette de téléphone et clé plate. */
function makeIcon(size, accent, accent2) {
  const [r1, g1, b1] = hexToRgb(accent);
  const [r2, g2, b2] = hexToRgb(accent2);
  const px = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const inside = (x, y, x0, y0, x1, y1, r) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r);
    const cy = Math.min(Math.max(y, y0 + r), y1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.0001;
  };
  // Téléphone centré
  const pw = size * 0.30, ph = size * 0.50;
  const px0 = (size - pw) / 2, py0 = (size - ph) / 2;
  const phoneR = size * 0.045;
  const screenPad = size * 0.035;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const bg = inside(x, y, 0, 0, size - 1, size - 1, radius);
      if (!bg) { px[i + 3] = 0; continue; }
      const t = (x + y) / (2 * size);
      let r = Math.round(r1 + (r2 - r1) * t);
      let g = Math.round(g1 + (g2 - g1) * t);
      let b = Math.round(b1 + (b2 - b1) * t);
      if (inside(x, y, px0, py0, px0 + pw, py0 + ph, phoneR)) {
        r = 255; g = 255; b = 255;
        if (inside(x, y, px0 + screenPad, py0 + screenPad * 1.6, px0 + pw - screenPad, py0 + ph - screenPad * 1.6, phoneR * 0.5)) {
          r = Math.round(r1 * 0.75); g = Math.round(g1 * 0.75); b = Math.round(b1 * 0.75);
        }
      }
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
    }
  }
  return encodePng(size, size, px);
}

/* -------------------- Assemblage -------------------- */

const JS_FILES = fs.readdirSync(path.join(SRC, 'js')).filter((f) => f.endsWith('.js')).sort();

function initials(name) {
  return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'MS';
}

function buildShop(cfg) {
  const accent = cfg.palette?.accent || '#2563eb';
  const accent2 = cfg.palette?.accent2 || accent;
  const accentInk = cfg.palette?.accentInk || '#ffffff';

  const icon512 = 'data:image/png;base64,' + makeIcon(512, accent, accent2).toString('base64');
  const icon180 = 'data:image/png;base64,' + makeIcon(180, accent, accent2).toString('base64');

  const manifest = {
    name: cfg.shopName,
    short_name: initials(cfg.shopName) + ' Mobile',
    description: 'Gestion commerciale pour atelier de réparation et vente de téléphonie.',
    start_url: '.',
    scope: '.',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f4f6fa',
    theme_color: accent,
    lang: 'fr',
    icons: [
      { src: icon180, sizes: '180x180', type: 'image/png', purpose: 'any' },
      { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
  const manifestUrl = 'data:application/manifest+json;base64,'
    + Buffer.from(JSON.stringify(manifest), 'utf8').toString('base64');

  const styles = fs.readFileSync(path.join(SRC, 'styles.css'), 'utf8')
    .replace(/__ACCENT__/g, accent)
    .replace(/__ACCENT2__/g, accent2)
    .replace(/__ACCENT_INK__/g, accentInk);

  const configJs = '/* Configuration de la boutique — seule partie qui diffère entre les deux fichiers. */\n'
    + 'globalThis.MS = globalThis.MS || {};\n'
    + 'globalThis.MS.config = ' + JSON.stringify({
      shopId: cfg.id,
      shopName: cfg.shopName,
      docName: cfg.docName || '',
      address: cfg.address || '',
      phone: cfg.phone || '',
      email: cfg.email || '',
      siret: cfg.siret || '',
      logo: cfg.logo || '',
      storageKey: cfg.storageKey,
      syncDoc: cfg.syncDoc,
      firebase: cfg.firebase || {},
      buildDate: new Date().toISOString().slice(0, 10),
    }, null, 2) + ';\n'
    + '/* Premier démarrage : l’identité de la boutique renseigne les paramètres restés au réglage d’usine. */\n'
    + 'globalThis.MS.configDefaults = { shopName: MS.config.shopName, docName: MS.config.docName,'
    + ' address: MS.config.address, phone: MS.config.phone, email: MS.config.email, siret: MS.config.siret };\n';

  const scripts = [configJs].concat(
    JS_FILES.map((f) => '/* ===== ' + f + ' ===== */\n' + fs.readFileSync(path.join(SRC, 'js', f), 'utf8'))
  ).join('\n');

  // Un fichier qui ne compile pas ne doit jamais sortir du build.
  try { new vm.Script(scripts, { filename: cfg.file }); }
  catch (e) { throw new Error('Le bundle de ' + cfg.file + ' ne compile pas : ' + e.message); }

  const html = fs.readFileSync(path.join(SRC, 'shell.html'), 'utf8')
    .replace(/__TITLE__/g, cfg.shopName + ' — Gestion d’atelier')
    .replace(/__SHORT__/g, initials(cfg.shopName) + ' Mobile')
    .replace(/__SHOPNAME__/g, cfg.shopName)
    .replace(/__INITIALS__/g, initials(cfg.shopName))
    .replace(/__ACCENT__/g, accent)
    .replace(/__MANIFEST__/g, manifestUrl)
    .replace(/__ICON512__/g, icon512)
    .replace(/__ICON180__/g, icon180)
    .replace('__STYLES__', () => styles)
    .replace('__SCRIPTS__', () => scripts);

  fs.mkdirSync(DIST, { recursive: true });
  const out = path.join(DIST, cfg.file);
  fs.writeFileSync(out, html, 'utf8');
  return { out, size: Buffer.byteLength(html, 'utf8') };
}

const shops = fs.readdirSync(path.join(root, 'shops')).filter((f) => f.endsWith('.json'));
const built = [];
for (const file of shops) {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'shops', file), 'utf8'));
  const res = buildShop(cfg);
  built.push(res);
  console.log('✓ ' + path.relative(root, res.out) + '  ' + (res.size / 1024).toFixed(0) + ' Ko');
}

// Deux boutiques ouvertes sur le même ordinateur ne doivent jamais s'écraser.
const keys = shops.map((f) => JSON.parse(fs.readFileSync(path.join(root, 'shops', f), 'utf8')));
const dupStorage = new Set();
const dupDoc = new Set();
for (const k of keys) {
  if (dupStorage.has(k.storageKey)) throw new Error('Clé de stockage en double : ' + k.storageKey);
  if (dupDoc.has(k.syncDoc)) throw new Error('Document de synchronisation en double : ' + k.syncDoc);
  dupStorage.add(k.storageKey);
  dupDoc.add(k.syncDoc);
}
console.log('Clés de stockage et documents de synchronisation distincts : vérifié.');
