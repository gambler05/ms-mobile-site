import { chromium, devices } from "@playwright/test";
const base = "http://localhost:3100";
const out = process.argv[2] ?? "/tmp/shots";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errors = [];
async function login(ctx, email = "admin@msmobile.example.test") {
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[${page.url()}] ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`[${page.url()}] ${e.message}`));
  await page.goto(`${base}/login`);
  await page.fill("#email", email);
  await page.fill("#password", "demo1234");
  await page.click("button[type=submit]");
  await page.waitForURL(`${base}/`, { timeout: 30000 });
  return page;
}
const routes = ["/", "/repairs", "/repairs?view=kanban", "/repairs?view=planning", "/repairs/new", "/customers", "/inventory", "/inventory?view=catalog", "/inventory/purchasing", "/inventory/import", "/pos", "/notifications", "/notifications?tab=queue", "/reports", "/reports?tab=workshop", "/settings", "/settings?tab=integrations", "/assistant"];
// Desktop dark
let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
let page = await login(ctx);
for (const r of routes) {
  await page.goto(base + r, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}/desktop-dark${r.replace(/[\/?=&]/g, "_") || "_home"}.png`, fullPage: r === "/" });
}
// ticket detail
await page.goto(base + "/repairs", { waitUntil: "networkidle" });
const firstTicket = await page.locator("tbody tr").first();
await firstTicket.click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/desktop-dark_repairs_sheet.png` });
await page.locator("a:has-text('Ouvrir la vue complète')").click();
await page.waitForURL(/\/repairs\/[a-z0-9]+$/);
await page.waitForLoadState("networkidle");
await page.screenshot({ path: `${out}/desktop-dark_ticket_detail.png`, fullPage: true });
const ticketUrl = page.url();
// Light theme
await page.context().addCookies([{ name: "rf_theme", value: "light", url: base }]);
for (const r of ["/", "/repairs", "/pos", "/inventory"]) {
  await page.goto(base + r, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}/desktop-light${r.replace(/[\/?=&]/g, "_") || "_home"}.png`, fullPage: r === "/" });
}
await page.goto(ticketUrl, { waitUntil: "networkidle" });
await page.screenshot({ path: `${out}/desktop-light_ticket_detail.png`, fullPage: true });
// Command palette
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.keyboard.press("Control+k");
await page.waitForTimeout(300);
await page.keyboard.type("iphone");
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/desktop-light_palette.png` });
// Arabic RTL
await page.context().addCookies([{ name: "rf_locale", value: "ar", url: base }, { name: "rf_theme", value: "dark", url: base }]);
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.screenshot({ path: `${out}/desktop-rtl_home.png`, fullPage: true });
await page.goto(base + "/repairs", { waitUntil: "networkidle" });
await page.screenshot({ path: `${out}/desktop-rtl_repairs.png` });
await ctx.close();
// Tablet
ctx = await browser.newContext({ ...devices["iPad Mini"], locale: "fr-FR" });
page = await login(ctx);
for (const r of ["/", "/repairs", "/pos"]) { await page.goto(base + r, { waitUntil: "networkidle" }); await page.screenshot({ path: `${out}/tablet${r.replace(/[\/?=&]/g, "_") || "_home"}.png` }); }
await ctx.close();
// Mobile
ctx = await browser.newContext({ ...devices["Pixel 7"], locale: "fr-FR" });
page = await login(ctx);
for (const r of ["/", "/repairs", "/repairs/new", "/pos", "/inventory", "/customers"]) { await page.goto(base + r, { waitUntil: "networkidle" }); await page.screenshot({ path: `${out}/mobile${r.replace(/[\/?=&]/g, "_") || "_home"}.png`, fullPage: r === "/" }); }
await page.goto(ticketUrl, { waitUntil: "networkidle" });
await page.screenshot({ path: `${out}/mobile_ticket_detail.png`, fullPage: true });
await ctx.close();
// Public tracking page (needs token) : get via admin regenerate action is complex; use API from db
await browser.close();
console.log("console errors:", errors.length);
for (const e of [...new Set(errors)].slice(0, 30)) console.log(" -", e.slice(0, 300));
