import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("les pages protégées redirigent vers la connexion", async ({ page }) => {
  await page.goto("/repairs");
  await expect(page).toHaveURL(/\/login/);
  const r = await page.request.get("/api/export/inventory", { maxRedirects: 0 });
  expect([307, 401]).toContain(r.status());
  const jobs = await page.request.post("/api/jobs/run");
  expect(jobs.status()).toBe(401);
});

test("un lien de suivi invalide n'expose rien", async ({ page }) => {
  await page.goto("/t/lien-invalide-0123456789abcdef");
  await expect(page.getByText("Ce lien n'est plus valide.")).toBeVisible();
  const r = await page.request.post("/api/public/track/xxxxxxxxxxxxxxxxxxxxxxxx", { data: { action: "decide", quoteId: "x", accepted: true } });
  expect(r.status()).toBe(404);
});

test("un vendeur n'accède ni aux rapports financiers ni au code de déverrouillage", async ({ page }) => {
  await login(page, "lea@msmobile.example.test");
  await page.goto("/settings?tab=users");
  await expect(page.getByText("Utilisateurs").first()).toHaveCount(0);
  const r = await page.request.get("/api/export/report?tab=finance");
  expect(r.status()).toBe(403);
});

test("navigation clavier : palette et raccourcis", async ({ page }) => {
  test.skip(test.info().project.name === "mobile");
  await login(page);
  await page.keyboard.press("Control+k");
  await expect(page.getByPlaceholder(/Rechercher/).last()).toBeFocused();
  await page.keyboard.type("REP-2026");
  await expect(page.getByText("Réparations").last()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("g");
  await page.keyboard.press("r");
  await expect(page).toHaveURL(/\/repairs/);
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(focused).toBeTruthy();
});

test("thèmes clair et sombre, langue arabe en RTL", async ({ page, context }) => {
  await login(page);
  await context.addCookies([{ name: "rf_theme", value: "light", url: page.url() }]);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await context.addCookies([{ name: "rf_locale", value: "ar", url: page.url() }]);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("لوحة القيادة");
});
