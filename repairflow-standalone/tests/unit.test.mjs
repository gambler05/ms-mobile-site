// Tests unitaires des règles métier, exécutés dans Node avec un environnement navigateur minimal (sans DOM réel).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { webcrypto } from "node:crypto";

const mem = new Map();
const noop = () => ({ appendChild() {}, append() {}, remove() {}, replaceChildren() {}, addEventListener() {}, setAttribute() {}, classList: { add() {}, toggle() {} }, style: {}, dataset: {}, querySelectorAll: () => [], querySelector: () => null });
globalThis.window = globalThis; if (!globalThis.crypto) globalThis.crypto = webcrypto;
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.document = { createElementNS: () => noop(), createTextNode: () => ({}), getElementById: () => noop(), head: noop(), body: noop(), documentElement: { dataset: {} }, addEventListener() {}, querySelector: () => null };
globalThis.location = { hash: "", href: "file:///repairflow.html" }; globalThis.history = { back() {} }; globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
if (!globalThis.navigator) globalThis.navigator = {}; globalThis.btoa = (s) => Buffer.from(s, "binary").toString("base64"); globalThis.atob = (s) => Buffer.from(s, "base64").toString("binary");
globalThis.addEventListener = () => {}; globalThis.setInterval = () => 0; globalThis.Node = class {}; globalThis.Image = class {}; globalThis.URL.createObjectURL = () => ""; globalThis.Blob = globalThis.Blob || class {};
for (const f of readdirSync("src/js").filter((x) => x.endsWith(".js") && !x.startsWith("99")).sort()) new Function(readFileSync("src/js/" + f, "utf8"))();
const RF = globalThis.RF; const M = RF.model;
RF.store.load(); await RF.seed.ensureHashes();
const as = (email) => RF.store.update((s) => (s.session.userId = s.users.find((u) => u.email === email).id));
as("admin@msmobile.example.test");

test("monnaie : TVA déduite du TTC, arrondi demi-supérieur, remise globale répartie", () => {
  assert.equal(RF.money.taxFromGross(12000, 2000), 2000);
  assert.equal(RF.money.taxFromGross(1, 2000), 0);
  const t = RF.money.computeTotals([{ qty: 2, unitCents: 1990, taxRateBp: 2000 }, { qty: 1, unitCents: 12900, discountCents: 900, taxRateBp: 2000 }], 1000);
  assert.deepEqual(t, { subtotalCents: 16880, discountCents: 1900, taxCents: RF.money.taxFromGross(3980, 2000) + RF.money.taxFromGross(12000, 2000) - RF.money.divRound((RF.money.taxFromGross(3980, 2000) + RF.money.taxFromGross(12000, 2000)) * 1000, 15980), totalCents: 14980 });
  assert.equal(RF.util.parseAmount("12,50"), 1250); assert.equal(RF.util.parseAmount("1 200"), 120000); assert.equal(RF.util.parseAmount("abc"), null); assert.equal(RF.util.parseAmount("1.999"), null);
});
test("transitions : garde-fous du cycle de vie", () => {
  assert.ok(M.canTransition("RECEIVED", "DIAGNOSIS")); assert.ok(!M.canTransition("RECEIVED", "READY")); assert.ok(!M.canTransition("DELIVERED", "CANCELLED")); assert.ok(M.canTransition("IN_REPAIR", "CANCELLED"));
  const s = RF.store.get(); const t = s.tickets.find((x) => x.status === "IN_REPAIR" && x.qc.some((i) => !i.done));
  assert.throws(() => M.transition(t.id, "READY"), /non autorisée/);
  M.transition(t.id, "QUALITY_CHECK"); assert.throws(() => M.transition(t.id, "READY"), /contrôle qualité/);
  M.updateQc(t.id, t.qc.map((i) => ({ ...i, done: true }))); M.transition(t.id, "READY"); assert.equal(M.ticket(t.id).status, "READY");
  if (M.financials(t).balanceDueCents > 0) assert.throws(() => M.transition(t.id, "DELIVERED"), /solde/);
});
test("devis : envoi, acceptation par le portail démarre la réparation", () => {
  const s = RF.store.get(); const t = s.tickets.find((x) => x.status === "DIAGNOSIS");
  const q = M.createQuote(t.id, { lines: [{ label: "Écran", qty: 1, unitCents: 12900, taxRateBp: 2000 }], discountCents: 0 }, true);
  assert.equal(M.ticket(t.id).status, "QUOTE_SENT"); assert.equal(q.totalCents, 12900);
  M.decideQuote(t.id, q.id, true, "", "PORTAL"); assert.equal(M.ticket(t.id).status, "IN_REPAIR"); assert.equal(M.financials(M.ticket(t.id)).totalCents, 12900);
  assert.throws(() => M.decideQuote(t.id, q.id, false), /plus en attente/);
});
test("stock : réservation, consommation, disponibilité et ajustements motivés", () => {
  const s = RF.store.get(); const p = s.products.find((x) => x.sku === "ACC-CABLE-C"); const t = s.tickets.find((x) => x.status === "IN_REPAIR");
  const avail = p.onHand - p.reserved; const part = M.reservePart(t.id, p.id, 2); assert.equal(p.onHand - p.reserved, avail - 2);
  assert.throws(() => M.reservePart(t.id, p.id, 10000), /insuffisante/);
  M.consumePart(t.id, part.id); assert.equal(p.reserved, 0); assert.equal(p.onHand, avail - 2 + 0 + (p.reserved)); assert.equal(s.movements[0].type, "CONSUMPTION");
  assert.throws(() => M.adjustStock(p.id, -1, ""), /motif/i); M.adjustStock(p.id, -1, "Casse"); assert.equal(s.movements[0].type, "ADJUSTMENT");
  assert.throws(() => M.createProduct({ sku: "ACC-CABLE-C", name: "Doublon" }), /existe déjà/);
});
test("caisse : paiements = total, espèces exigent une caisse ouverte, remise limitée pour un vendeur", () => {
  const s = RF.store.get(); const p = s.products.find((x) => x.sku === "ACC-GLASS-IP14");
  assert.throws(() => M.createSale({ lines: [{ productId: p.id, qty: 1, unitCents: p.priceCents }], payments: [{ method: "CARD", amountCents: 1 }] }), /égaler/);
  if (M.register()) M.closeRegister(M.registerSummary(M.register()).expectedCashCents, "");
  assert.throws(() => M.createSale({ lines: [{ productId: p.id, qty: 1, unitCents: p.priceCents }], payments: [{ method: "CASH", amountCents: p.priceCents }] }), /caisse/i);
  M.openRegister(10000);
  const sale = M.createSale({ lines: [{ productId: p.id, qty: 1, unitCents: p.priceCents }], payments: [{ method: "CASH", amountCents: p.priceCents }] }); assert.equal(sale.totalCents, p.priceCents);
  as("lea@msmobile.example.test");
  assert.throws(() => M.createSale({ lines: [{ productId: p.id, qty: 1, unitCents: p.priceCents, discountCents: Math.round(p.priceCents * 0.5) }], payments: [{ method: "CARD", amountCents: p.priceCents - Math.round(p.priceCents * 0.5) }] }), /10 %/);
  assert.throws(() => M.refundSale(sale.id, { lines: [{ lineId: sale.lines[0].id, qty: 1 }], method: "CASH", reason: "test", restock: true }), /permission/i);
  as("admin@msmobile.example.test");
  const ret = M.refundSale(sale.id, { lines: [{ lineId: sale.lines[0].id, qty: 1 }], method: "CASH", reason: "Article défectueux", restock: true }); assert.equal(ret.totalCents, -p.priceCents);
  const summary = M.registerSummary(M.register()); assert.equal(summary.expectedCashCents, 10000);
  assert.throws(() => M.closeRegister(9000, ""), /justifié/);
});
test("clients : détection de doublons et fusion", () => {
  const dups = M.findDuplicates(); assert.ok(dups.length >= 1);
  const [a, b] = dups[0].customers; const n = RF.store.get().tickets.filter((t) => t.customerId === b.id).length;
  M.mergeCustomers(a.id, b.id); assert.equal(b.mergedIntoId, a.id); assert.equal(RF.store.get().tickets.filter((t) => t.customerId === b.id).length, 0); void n;
});
test("ticket : création avec client inline, code chiffré côté navigateur, purge", () => {
  const t = M.createTicket({ newCustomer: { firstName: "Unit", lastName: "Test", phone: "0700000001" }, device: { kind: "PHONE", brand: "Test", model: "One" }, reportedIssue: "Ne s'allume plus", consentAccepted: true, unlockCode: "1234" });
  assert.match(t.number, /^REP-\d{4}-\d{5}$/); assert.notEqual(t.unlockCode, "1234"); assert.equal(M.revealUnlock(t.id), "1234");
  assert.throws(() => M.createTicket({ newCustomer: { firstName: "X", lastName: "Y" }, device: { brand: "A", model: "B" }, reportedIssue: "panne test", consentAccepted: false }), /accord/i);
  RF.store.update(() => { M.ticket(t.id).unlockExpiresAt = new Date(Date.now() - 1000).toISOString(); }); M.runJobs(); assert.equal(M.ticket(t.id).unlockCode, null);
});
test("export / import JSON : aller-retour sans perte", () => {
  const json = RF.store.exportJson(); const n = RF.store.get().tickets.length; RF.store.importJson(json); assert.equal(RF.store.get().tickets.length, n);
  assert.throws(() => RF.store.importJson('{"foo":1}'), /non reconnu/);
});
test("audit : les secrets sont masqués", () => { const a = RF.store.get().audit.find((x) => x.action === "ticket.create" && x.detail.includes("unlockCode")); assert.ok(a && a.detail.includes('"unlockCode":"***"')); });
