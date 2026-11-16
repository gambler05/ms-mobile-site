import fs from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { makePng } from "./stubs/png.js";

export const STUB = "http://127.0.0.1:5301";
export const EMPTY_APP = "http://127.0.0.1:5311";

/** Écrit une image PNG de test sur disque et renvoie son chemin. */
export function pngFile(name: string, width: number, height: number, seed = 1): string {
  const dir = path.resolve("test-results", "fixtures");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, makePng(width, height, seed));
  return file;
}

export async function stubRequests(): Promise<Array<{ provider: string; path: string; form?: Record<string, string>; json?: Record<string, unknown> }>> {
  return (await fetch(`${STUB}/__requests`)).json();
}

export async function clipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

/** Vérifie qu'aucun élément ne dépasse horizontalement la fenêtre. */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

export async function waitForEngines(page: Page) {
  await expect(page.locator(".mode-pill, .topbar").first()).toBeVisible();
  await page.waitForFunction(() => !document.body.innerText.includes("Vérification…"));
}
