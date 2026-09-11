// Charge les modules de MS-MOBILE dans un contexte Node, avec un localStorage simule.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class MemStorage {
  constructor(limit = Infinity) { this.map = new Map(); this.limit = limit; }
  get length() { return this.map.size; }
  getItem(k) { return this.map.has(String(k)) ? this.map.get(String(k)) : null; }
  setItem(k, v) {
    const next = new Map(this.map); next.set(String(k), String(v));
    let size = 0; next.forEach((val, key) => { size += val.length + key.length; });
    if (size > this.limit) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    this.map = next;
  }
  removeItem(k) { this.map.delete(String(k)); }
  clear() { this.map.clear(); }
  key(i) { return Array.from(this.map.keys())[i] ?? null; }
}

const FILES = fs.readdirSync(path.join(root, 'src/js')).filter((f) => f.endsWith('.js')).sort();

export function loadMS(config = {}, opts = {}) {
  const storage = new MemStorage(opts.quota ?? Infinity);
  const session = new MemStorage();
  const g = globalThis;
  const prev = { MS: g.MS, localStorage: g.localStorage, sessionStorage: g.sessionStorage };
  Object.defineProperty(g, 'localStorage', { value: storage, configurable: true, writable: true });
  Object.defineProperty(g, 'sessionStorage', { value: session, configurable: true, writable: true });
  g.MS = {
    config: Object.assign({
      shopId: 'test', shopName: 'MS MOBILE Test', storageKey: 'msmobile.test.v1',
      syncDoc: 'shops/test', address: '', phone: '', email: '', siret: '', logo: '',
    }, config),
  };
  for (const f of FILES) {
    if (f.startsWith('00-')) continue; // config injectee au build
    if (f.startsWith('99-')) continue; // amorcage navigateur : demande un document
    const code = fs.readFileSync(path.join(root, 'src/js', f), 'utf8');
    try {
      (0, eval)(code + '\n//# sourceURL=' + f);
    } catch (e) {
      throw new Error('Erreur de chargement de ' + f + ' : ' + e.message);
    }
  }
  const MS = g.MS;
  MS.__storage = storage;
  MS.__restore = () => { g.MS = prev.MS; };
  return MS;
}

export { MemStorage };
