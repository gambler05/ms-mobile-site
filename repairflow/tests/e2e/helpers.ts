import { expect, type Page } from "@playwright/test";

export async function login(page: Page, email = "admin@msmobile.example.test", password = "demo1234") {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/\/$/);
}
