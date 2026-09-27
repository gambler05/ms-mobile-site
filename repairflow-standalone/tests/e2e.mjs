// Parcours de bout en bout dans Chromium : le fichier dist/repairflow.html est ouvert en file://.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_MODULE || "playwright");
const shots = process.env.SHOTS || "tests/shots"; mkdirSync(shots, { recursive: true });
const url = "file://" + resolve("dist/repairflow.html");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium", args: ["--ignore-certificate-errors"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push("pageerror: " + e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
let failed = 0; const step = async (name, fn) => { try { await fn(); console.log("✔", name); } catch (e) { failed++; console.log("✘", name, "—", e.message.split("\n")[0]); await page.screenshot({ path: `${shots}/FAIL-${name.replace(/\W+/g, "_")}.png` }).catch(() => {}); } };
const overflow = []; const goto = async (hash) => { await page.evaluate((h) => (location.hash = h), hash); await page.waitForTimeout(150); const o = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth, window.scrollX]); if (o[0] > o[1] + 1) overflow.push(`${hash} : ${o[0]}>${o[1]}`); };
const shot = (n) => page.screenshot({ path: `${shots}/${n}.png`, fullPage: false });

await page.goto(url); await page.waitForSelector("main.login", { timeout: 15000 }); await page.waitForTimeout(1500); await shot("00-login");
await step("connexion", async () => { await page.fill("#email", "admin@msmobile.example.test"); await page.fill("#password", "demo1234"); await page.click("button[type=submit]"); await page.waitForSelector("section.kpis", { timeout: 5000 }); await shot("01-dashboard"); });
await step("réparations tableau/kanban/planning", async () => { await goto("/repairs"); await page.waitForSelector("table.tbl"); await shot("02-repairs"); await goto("/repairs?view=kanban"); await page.waitForSelector(".kanban"); await shot("03-kanban"); await goto("/repairs?view=planning"); await page.waitForSelector(".plan"); });
await step("fiche ticket + onglets", async () => { await goto("/repairs"); await page.waitForSelector("table.tbl tbody tr"); const id = await page.evaluate(() => RF.store.get().tickets.find((t) => t.status === "IN_REPAIR").id); await goto("/repairs/" + id); await page.waitForSelector(".detail-tabs"); await shot("04-ticket"); for (const t of ["quotes", "parts", "work", "qc", "photos"]) { await goto(`/repairs/${id}?tab=${t}`); await page.waitForSelector(".detail-tabs"); } });
await step("assistant de dépôt (6 étapes) → ticket créé", async () => {
  await goto("/repairs/new"); await page.waitForSelector(".wizard");
  await page.fill("input[placeholder='Nom, téléphone ou e-mail']", "Dupont"); await page.waitForTimeout(100);
  const found = await page.$(".wizard ul.list button.item"); if (found) await found.click(); else { const inputs = await page.$$(".wizard .grid input"); await inputs[0].fill("Test"); await inputs[1].fill("E2E"); await inputs[2].fill("0700000099"); }
  await page.click("text=Continuer"); await page.waitForTimeout(100);
  const brand = await page.$("input[list='rf-brands']"); await brand.fill("Apple"); const model = await page.$$(".wizard .grid input"); await model[1].fill("iPhone 13 test"); await shot("05-wizard");
  await page.click("text=Continuer"); await page.fill("textarea", "Écran cassé après chute — test E2E"); await page.click("text=Continuer");
  await page.click("text=Demain 18 h"); await page.click("text=Continuer");
  await page.click("text=Le client accepte les conditions"); await page.click("text=Continuer"); await page.waitForSelector("text=Créer le ticket");
  await page.evaluate(() => { window.print = () => {}; }); await page.click("text=Créer le ticket"); await page.waitForSelector("h1.mono", { timeout: 5000 });
  const num = await page.textContent("h1.mono"); if (!/REP-\d{4}-\d{5}/.test(num)) throw new Error("numéro inattendu " + num); await shot("06-ticket-new");
});
await step("cycle : devis → accepté → pièce → QC → prêt → encaissement → livré", async () => {
  const id = location => location; void id;
  const tid = await page.evaluate(() => { const s = RF.store.get(); return s.tickets[s.tickets.length - 1].id; });
  await page.evaluate((tid) => { const M = RF.model; M.createQuote(tid, { lines: [{ label: "Écran", qty: 1, unitCents: 12900, taxRateBp: 2000 }], discountCents: 0 }, true); const q = M.ticket(tid).quotes[0]; M.decideQuote(tid, q.id, true, "OK"); const p = RF.store.get().products.find((x) => x.sku === "SCR-IP13"); const part = M.reservePart(tid, p.id, 1); M.consumePart(tid, part.id); M.transition(tid, "QUALITY_CHECK"); M.updateQc(tid, M.ticket(tid).qc.map((i) => ({ ...i, done: true }))); M.transition(tid, "READY"); }, tid);
  await goto("/repairs/" + tid); await page.waitForSelector("text=Encaisser le solde");
  await page.click("div.note button:has-text('Encaisser le solde')"); await page.waitForSelector(".dialog"); await page.click(".dialog >> text=Enregistrer"); await page.waitForTimeout(150);
  const bal = await page.evaluate((tid) => RF.model.financials(RF.model.ticket(tid)).balanceDueCents, tid); if (bal !== 0) throw new Error("solde " + bal);
  await page.evaluate((tid) => { const t = RF.model.ticket(tid); RF.model.settlePayment(tid, t.payments[0].id, true); }, tid);
  await page.waitForTimeout(200); await page.click("div.note button:has-text('Restituer')"); await page.waitForTimeout(200); const st = await page.evaluate((tid) => RF.model.ticket(tid).status, tid); if (st !== "DELIVERED") throw new Error("statut " + st); await shot("07-ticket-delivered");
});
await step("suivi client (#/suivi/token)", async () => { const tok = await page.evaluate(() => RF.store.get().tickets.find((t) => t.quotes.some((q) => q.status === "SENT")).trackingToken); await goto("/suivi/" + tok); await page.waitForSelector("main.track"); await shot("08-tracking"); await page.click("text=J'accepte le devis"); await page.click(".dialog >> text=J'accepte"); await page.waitForTimeout(150); const ok = await page.evaluate((tok) => RF.store.get().tickets.find((t) => t.trackingToken === tok).status, tok); if (ok !== "IN_REPAIR") throw new Error("statut après acceptation : " + ok); });
await step("clients : liste, doublons, fiche", async () => { await goto("/customers"); await page.waitForSelector("table.tbl"); await shot("09-customers"); await goto("/customers?view=dups"); await page.waitForTimeout(100); const id = await page.evaluate(() => RF.store.get().customers[0].id); await goto("/customers/" + id); await page.waitForSelector("section.kpis"); });
await step("stock : catalogue, produit, achats, inventaire", async () => { await goto("/stock"); await page.waitForSelector("table.tbl"); await shot("10-stock"); const id = await page.evaluate(() => RF.store.get().products[0].id); await goto("/stock/" + id); await page.waitForSelector("section.kpis"); await goto("/stock?tab=po"); await page.waitForSelector("text=Commandes fournisseurs"); await shot("11-purchasing"); await goto("/stock?tab=counts"); await page.waitForTimeout(100); });
await step("caisse : vente carte + ticket", async () => { await goto("/pos"); await page.waitForSelector(".prods"); await shot("12-pos"); await page.click(".prods button.prod:not([disabled])"); await page.click(".prods button.prod:not([disabled]) >> nth=1"); await page.waitForSelector("aside.card >> text=Encaisser"); await shot("13-pos-cart"); await page.click("aside.card >> text=Encaisser"); await page.waitForSelector(".dialog"); await page.click(".dialog button:has-text('Carte ·')"); await page.click(".dialog >> text=Valider la vente"); await page.waitForSelector("text=enregistrée"); await shot("14-pos-done"); await page.click(".dialog >> text=Nouvelle vente"); await goto("/pos?tab=sales"); await page.waitForSelector("table.tbl"); await goto("/pos?tab=register"); await page.waitForSelector("text=Clôturer"); });
await step("notifications, rapports, réglages", async () => { await goto("/notifications"); await page.waitForSelector("h1"); await shot("15-notifications"); for (const t of ["", "?tab=workshop", "?tab=stock", "?tab=categories"]) { await goto("/reports" + t); await page.waitForSelector("section.kpis, .card"); } await shot("16-reports"); for (const t of ["", "?tab=users", "?tab=workflow", "?tab=appearance", "?tab=data", "?tab=audit", "?tab=about"]) { await goto("/settings" + t); await page.waitForSelector("h1"); } await shot("17-settings-about"); });
await step("palette de commandes", async () => { await goto("/"); await page.keyboard.press("Control+k"); await page.waitForSelector(".palette"); await page.fill(".palette input", "REP-"); await page.waitForTimeout(100); const n = await page.$$eval(".palette .it", (l) => l.length); if (!n) throw new Error("aucun résultat"); await shot("18-palette"); await page.keyboard.press("Escape"); });
await step("thème clair + mobile", async () => { await page.evaluate(() => RF.store.update((s) => (s.settings.theme = "light"))); await goto("/"); await page.waitForTimeout(150); await shot("19-light"); await page.setViewportSize({ width: 390, height: 844 }); await goto("/repairs"); await page.waitForTimeout(150); await shot("20-mobile-repairs"); await goto("/pos"); await page.waitForTimeout(150); await shot("21-mobile-pos"); await page.setViewportSize({ width: 1440, height: 900 }); await page.evaluate(() => RF.store.update((s) => (s.settings.theme = "dark"))); });
await step("persistance après rechargement", async () => { const before = await page.evaluate(() => RF.store.get().tickets.length); await page.reload(); await page.waitForSelector("main.content, main.login"); const after = await page.evaluate(() => RF.store.get().tickets.length); if (before !== after) throw new Error(`${before} → ${after}`); });
await step("export JSON", async () => { const json = await page.evaluate(() => RF.store.exportJson()); const o = JSON.parse(json); if (o.version !== 1 || !o.tickets.length) throw new Error("export invalide"); });
await step("déconnexion / permission vendeur", async () => { await page.evaluate(() => { RF.model.logout(); }); await goto("/login"); await page.waitForSelector("main.login"); await page.fill("#email", "lea@msmobile.example.test"); await page.fill("#password", "demo1234"); await page.click("button[type=submit]"); await page.waitForSelector("section.kpis"); await goto("/reports"); await page.waitForSelector("text=Accès réservé"); });
if (overflow.length) { console.log("Débordement horizontal :\n" + overflow.join("\n")); failed++; }
const bad = errors.filter((e) => !/favicon|net::ERR_FILE_NOT_FOUND|ERR_CERT|fonts\.g/.test(e));
console.log(bad.length ? "Erreurs JS :\n" + bad.join("\n") : "Aucune erreur JS."); if (bad.length) failed++;
await browser.close(); process.exit(failed ? 1 : 0);
