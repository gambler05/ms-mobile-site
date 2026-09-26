import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("affichage mobile : navigation basse, fiches au lieu de tableaux, pas de débordement horizontal", async ({ page }) => {
  test.skip(test.info().project.name !== "mobile");
  await login(page);
  for (const path of ["/", "/repairs", "/inventory", "/customers", "/pos"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `débordement sur ${path}`).toBeLessThanOrEqual(1);
  }
  await page.goto("/repairs");
  await expect(page.locator("nav[aria-label='Navigation mobile']")).toBeVisible();
  await expect(page.locator("table")).toBeHidden();
  await page.locator("ul li a").first().click();
  await expect(page).toHaveURL(/\/repairs\/(?!new)[a-z0-9]+$/);
});
