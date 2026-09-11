/* ============================================================
   01 — Accesseurs defensifs et utilitaires
   Regle 1 du principe directeur : aucun acces ne leve d'exception.
   ============================================================ */
(function () {
const MS = (globalThis.MS = globalThis.MS || {});

/** Chaine sure. Toute valeur devient une chaine ; null/undefined -> "". */
function S(v, def) {
  if (v === null || v === undefined) return def === undefined ? '' : def;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : (def === undefined ? '' : def);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? (def === undefined ? '' : def) : v.toISOString();
  try {
    if (typeof v === 'object') return def === undefined ? '' : def;
    return String(v);
  } catch (e) { return def === undefined ? '' : def; }
}

/** Nombre sur. Accepte "12,50", "12.50 EUR", " 1 299 ". Jamais NaN. */
function N(v, def) {
  const d = typeof def === 'number' && Number.isFinite(def) ? def : 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : d;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v !== 'string') return d;
  let s = v.trim();
  if (!s) return d;
  // espaces (y compris insecables) utilises comme separateur de milliers
  s = s.replace(/[\s  ]/g, '');
  // retire tout ce qui n'est ni chiffre, ni separateur, ni signe
  s = s.replace(/[^0-9.,+-]/g, '');
  if (!s) return d;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // le dernier separateur rencontre est le separateur decimal
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // "1,234" ambigu : traite en decimal (usage francais)
    s = s.replace(/,/g, '.');
  }
  // un seul point decimal
  const parts = s.split('.');
  if (parts.length > 2) s = parts.shift() + '.' + parts.join('');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : d;
}

/** Entier sur, borne optionnellement a un minimum. */
function I(v, def, min) {
  const n = Math.round(N(v, typeof def === 'number' ? def : 0));
  const val = Number.isFinite(n) ? n : (typeof def === 'number' ? def : 0);
  if (typeof min === 'number' && val < min) return min;
  return val;
}

/** Nombre positif arrondi au centime. */
function M(v, def) {
  const n = N(v, typeof def === 'number' ? def : 0);
  const r = Math.round(n * 100) / 100;
  return Number.isFinite(r) ? r : 0;
}

/** Tableau sur. Un non-tableau devient []. */
function A(v) {
  if (Array.isArray(v)) return v;
  return [];
}

/** Objet sur. Un non-objet (ou un tableau) devient {}. */
function O(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  return {};
}

/** Booleen tolerant : "0", "non", "false", "" sont faux. */
function B(v, def) {
  if (typeof v === 'boolean') return v;
  if (v === null || v === undefined) return !!def;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (!s) return false;
  if (['0', 'non', 'no', 'false', 'faux', 'n'].includes(s)) return false;
  if (['1', 'oui', 'yes', 'true', 'vrai', 'o', 'y'].includes(s)) return true;
  return !!def;
}

/** Date ISO sure. Une date impossible renvoie la valeur de repli (par defaut : maintenant). */
function D(v, def) {
  const fallback = def === undefined ? new Date().toISOString() : def;
  if (!v && v !== 0) return fallback;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? fallback : v.toISOString();
  if (typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
  }
  if (typeof v !== 'string') return fallback;
  const parsed = parseDateLoose(v);
  return parsed || fallback;
}

/**
 * Lecture tolerante de date. Le format francais prime :
 * 05/08/2026 est le 5 aout. Renvoie une chaine ISO ou null si impossible.
 */
function parseDateLoose(input) {
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input.toISOString();
  if (typeof input === 'number' && Number.isFinite(input)) {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  // 1. ISO 8601 complet, avec fuseau : lu tel quel, sans perdre ni les
  // millisecondes ni le decalage horaire. Deux enregistrements faits dans
  // la meme seconde doivent rester distinguables, sinon une version plus
  // recente passe pour identique et le travail se perd.
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/i);
  if (m) {
    const exact = new Date(raw.replace(' ', 'T'));
    if (Number.isNaN(exact.getTime())) return null;
    // Un quantieme impossible (31/02) deborderait silencieusement sur mars.
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const probe = new Date(Date.UTC(y, mo - 1, d));
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
    return exact.toISOString();
  }

  // 2. ISO sans fuseau, complet ou partiel : lu en heure locale.
  m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?)?$/);
  if (m) return buildDate(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), +(String(m[7] || '0').padEnd(3, '0')));

  // 3. jj/mm/aaaa, j.m.aa, jj-mm-aaaa, avec heure optionnelle
  m = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:[T, ]+(\d{1,2})[:h](\d{2})(?::(\d{2}))?)?/i);
  if (m) {
    let year = +m[3];
    if (m[3].length <= 2) year = year >= 70 ? 1900 + year : 2000 + year;
    // Le format francais prime : premier champ = jour.
    return buildDate(year, +m[2], +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }

  // 4. aaaa/mm/jj et ISO suivi d'un reste non reconnu
  m = raw.match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return buildDate(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), 0);

  return null;
}

/** Construit une date en rejetant les combinaisons impossibles (31/02, 32/13). */
function buildDate(y, mo, d, h, mi, s, ms) {
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > 31) return null;
  if (h > 23 || mi > 59 || s > 59) return null;
  if (y < 1900 || y > 2999) return null;
  const dt = new Date(y, mo - 1, d, h || 0, mi || 0, s || 0, ms || 0);
  // Un 31 fevrier deborde sur mars : on le detecte et on rejette.
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt.toISOString();
}

/** Identifiant court, unique en pratique, sans dependance. */
let uidSeq = 0;
function uid(prefix) {
  uidSeq = (uidSeq + 1) % 100000;
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return (prefix || 'id') + '_' + t + r + uidSeq.toString(36);
}

/** Echappement HTML. Toute donnee utilisateur passe par la. */
function esc(v) {
  return S(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Retire les accents. "Réparé" -> "repare". */
function deaccent(v) {
  return S(v).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Cle de comparaison : sans casse, sans accent, sans separateur. */
function flat(v) {
  return deaccent(S(v)).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Normalisation pour recherche : sans accent, minuscules, espaces resserres. */
function norm(v) {
  return deaccent(S(v)).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Chiffres seuls, pour comparer des numeros de telephone. */
function digits(v) {
  return S(v).replace(/\D/g, '');
}

function clamp(n, lo, hi) {
  const v = N(n, lo);
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

/** Valeur d'une liste fermee, repli sur la premiere entree. */
function pick(value, list, def) {
  const arr = A(list);
  const fallback = def !== undefined ? def : (arr[0] !== undefined ? arr[0] : '');
  const v = S(value);
  if (arr.includes(v)) return v;
  const f = flat(v);
  if (!f) return fallback;
  const hit = arr.find((x) => flat(x) === f);
  return hit !== undefined ? hit : fallback;
}

/* --------- Dates : bornes de journee, formats d'affichage --------- */

function toDate(v) {
  const iso = parseDateLoose(v);
  const d = iso ? new Date(iso) : new Date(v);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** "aaaa-mm-jj" local (et non UTC : une vente de 23h reste datee du jour). */
function dayKey(v) {
  const d = v instanceof Date ? v : toDate(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function monthKey(v) {
  return dayKey(v).slice(0, 7);
}

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

/** Date lisible : 05/08/2026 */
function fmtDate(v) {
  const d = toDate(v);
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
}

/** Date et heure lisibles : 05/08/2026 14:32 */
function fmtDateTime(v) {
  const d = toDate(v);
  const p = (n) => String(n).padStart(2, '0');
  return fmtDate(d) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/** Ecart lisible : "il y a 3 min", "hier". */
function fmtAgo(v) {
  const d = toDate(v);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "a l’instant";
  if (min < 60) return 'il y a ' + min + ' min';
  const h = Math.floor(min / 60);
  if (h < 24) return 'il y a ' + h + ' h';
  const j = Math.floor(h / 24);
  if (j === 1) return 'hier';
  if (j < 31) return 'il y a ' + j + ' j';
  return fmtDate(d);
}

/** Montant avec devise. */
function fmtMoney(v, currency) {
  const n = M(v, 0);
  const cur = S(currency, 'EUR') || 'EUR';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const fixed = abs.toFixed(2);
  const [intPart, dec] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const symbol = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', MAD: 'MAD', XOF: 'FCFA' }[cur] || cur;
  return sign + grouped + ',' + dec + ' ' + symbol;
}

function fmtQty(v) { return String(I(v, 0, 0)); }

/** Copie profonde tolerante (structures JSON uniquement). */
function deepClone(v) {
  try { return JSON.parse(JSON.stringify(v)); } catch (e) { return Array.isArray(v) ? [] : {}; }
}

/** Rend uniques les identifiants d'une liste ; renomme les doublons. */
function uniquifyIds(list, prefix) {
  const seen = new Set();
  A(list).forEach((item, idx) => {
    const o = O(item);
    let id = S(o.id);
    if (!id || seen.has(id)) {
      id = uid(prefix || 'x');
      let guard = 0;
      while (seen.has(id) && guard++ < 50) id = uid(prefix || 'x');
      o.id = id;
    }
    seen.add(o.id);
    if (list[idx] !== o) list[idx] = o;
  });
  return list;
}

/** Anti-rebond. */
function debounce(fn, ms) {
  let t = null;
  return function () {
    const args = arguments, self = this;
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn.apply(self, args); }, ms || 200);
  };
}

/** Cellule CSV : guillemets doubles, separateur point-virgule (Excel FR). */
function csvCell(v) {
  const s = S(v).replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
  return '"' + s + '"';
}

function csvLine(cells) { return A(cells).map(csvCell).join(';'); }

/** Construit un document CSV avec BOM pour Excel. */
function csvDoc(rows) {
  return '﻿' + A(rows).map(csvLine).join('\r\n') + '\r\n';
}

MS.util = {
  S, N, I, M, A, O, B, D, uid, esc, deaccent, flat, norm, digits, clamp, pick,
  parseDateLoose, buildDate, toDate, dayKey, monthKey, startOfDay, endOfDay, addDays,
  fmtDate, fmtDateTime, fmtAgo, fmtMoney, fmtQty, deepClone, uniquifyIds, debounce,
  csvCell, csvLine, csvDoc,
};
})();
