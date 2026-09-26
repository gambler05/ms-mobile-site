import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("vente en caisse avec paiement mixte et ticket PDF", async ({ page }) => {
  test.skip(test.info().project.name === "mobile");
  await login(page, "lea@msmobile.example.test");
  await page.goto("/pos");
  await page.getByPlaceholder(/SKU/).fill("ACC-CABLE-C");
  await page.getByRole("button", { name: /Câble USB-C 1 m tressé/ }).click();
  await page.getByRole("button", { name: /Câble USB-C 1 m tressé/ }).click();
  await expect(page.getByText("25,80 €").first()).toBeVisible();
  await page.getByRole("button", { name: "Encaisser" }).click();
  await page.getByRole("button", { name: "Paiement mixte" }).click();
  const amounts = page.getByRole("dialog").getByLabel("Total");
  await amounts.nth(0).fill("10,00");
  await amounts.nth(0).blur();
  await amounts.nth(1).fill("15,80");
  await amounts.nth(1).blur();
  await page.getByRole("button", { name: "Valider la vente" }).click();
  await expect(page.getByText(/Vente VTE-\d{4}-\d{5} enregistrée/)).toBeVisible();
  const first = page.locator("section ul li").filter({ hasText: "VTE-" }).first();
  await expect(first).toContainText("25,80 €");
  const [pdf] = await Promise.all([page.waitForEvent("popup"), first.getByLabel("Ticket PDF").click()]);
  await pdf.waitForLoadState();
  expect(pdf.url()).toMatch(/\/api\/receipts\//);
});
