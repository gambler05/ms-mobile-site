import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./helpers.js";

test.describe("Interface générale", () => {
  test("le tableau de bord présente les trois entrées principales", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("card-generate")).toContainText("GÉNÉRER UNE IMAGE");
    await expect(page.getByTestId("card-generate")).toContainText("Décris ton idée et transforme-la en image grâce à l’IA.");
    await expect(page.getByTestId("card-analyze")).toContainText("ANALYSER UNE IMAGE");
    await expect(page.getByTestId("card-analyze")).toContainText("Importe une image et obtiens un prompt détaillé pour recréer son style et sa composition.");
    await expect(page.getByTestId("card-enhance")).toContainText("AMÉLIORER UN PROMPT");
    await expect(page.getByTestId("card-enhance")).toContainText("Transforme tes idées en instructions visuelles professionnelles.");
    await expect(page.getByTestId("card-generate")).toContainText("Prêt");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  });

  test("la navigation latérale mène à chaque écran", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("complementary", { name: "Navigation principale" });
    for (const [label, heading] of [
      ["Générer une image", "Générer une image"],
      ["Analyser une image", "Analyser une image"],
      ["Améliorer un prompt", "Améliorer un prompt"],
      ["Bibliothèque", "Bibliothèque"],
      ["Paramètres", "Paramètres"],
      ["Tableau de bord", "Que voulez-vous créer aujourd’hui ?"],
    ]) {
      await nav.getByRole("link", { name: label }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    }
  });

  for (const viewport of [
    { name: "mobile", width: 375, height: 812 },
    { name: "tablette", width: 820, height: 1180 },
  ]) {
    test(`affichage ${viewport.name} sans débordement horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const url of ["/", "/generer", "/analyser", "/ameliorer", "/bibliotheque", "/parametres"]) {
        await page.goto(url);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expectNoHorizontalOverflow(page);
      }
      if (viewport.width < 760) {
        const tabbar = page.getByRole("navigation", { name: "Navigation", exact: true });
        await expect(tabbar).toBeVisible();
        await tabbar.getByRole("link", { name: "Analyser" }).click();
        await expect(page).toHaveURL(/\/analyser$/);
      }
    });
  }

  test("une adresse inconnue affiche une page claire", async ({ page }) => {
    await page.goto("/page-qui-n-existe-pas");
    await expect(page.getByText("Cette page n’existe pas")).toBeVisible();
  });
});
