import fs from "node:fs";
import { unzipSync } from "fflate";
import { expect, test } from "@playwright/test";

const H = { "content-type": "application/json", "x-studio": "1" };
// Marqueur unique : les données de chaque exécution ne se mélangent pas.
const RUN = `n${Date.now().toString(36)}`;

test.describe("Bibliothèque", () => {
  test.beforeAll(async () => {
    for (const prompt of [`Bibliothèque ${RUN} : marché flottant au lever du soleil`, `Bibliothèque ${RUN} : désert de sel infini`]) {
      await fetch("http://127.0.0.1:5310/api/library/prompts", { method: "POST", headers: H, body: JSON.stringify({ prompt, title: prompt }) });
    }
    // Deux images générées (moteur local simulé pour les tests) pour le téléchargement groupé.
    await fetch("http://127.0.0.1:5310/api/generate", { method: "POST", headers: H, body: JSON.stringify({ engineId: "sdwebui", prompt: `Lot ${RUN} à télécharger`, count: 2 }) });
  });

  test("recherche, filtre, annote et organise en projet", async ({ page }) => {
    await page.goto("/bibliotheque");
    await page.getByTestId("search").fill(`${RUN} marche flottant`);
    await expect(page.getByTestId("library-card")).toHaveCount(1);

    await page.getByTestId("library-card").first().click();
    const drawer = page.getByTestId("drawer");
    await expect(drawer).toBeVisible();
    await drawer.getByTestId("detail-title").fill("Marché flottant — version finale");
    await drawer.getByTestId("detail-tag-input").fill("voyage");
    await drawer.getByTestId("detail-tag-input").press("Enter");
    await drawer.getByTestId("detail-notes").fill("Tester aussi en 9:16 pour Reels");
    await drawer.getByTestId("detail-save").click();
    await expect(page.getByText("Modifications enregistrées.")).toBeVisible();
    await drawer.getByRole("button", { name: "Fermer" }).click();

    // Recherche dans les notes et les étiquettes.
    await page.getByTestId("search").fill(`${RUN} reels`);
    await expect(page.getByTestId("library-card")).toHaveCount(1);
    await expect(page.getByTestId("library-card")).toContainText("version finale");
    await page.getByTestId("search").fill("");

    // Projet : création puis rattachement par sélection multiple.
    await page.getByTestId("new-project").click();
    await page.getByTestId("project-name").fill(`Carnet de voyage ${RUN}`);
    await page.getByTestId("project-name").press("Enter");
    await expect(page.getByTestId("project-item").filter({ hasText: `Carnet de voyage ${RUN}` })).toBeVisible();
    await page.getByRole("button", { name: /^Tout$/ }).first().click();
    await page.getByTestId("search").fill(`Bibliothèque ${RUN}`);
    await expect(page.getByTestId("library-card")).toHaveCount(2);
    for (const card of await page.getByTestId("library-card").all()) await card.getByRole("checkbox").check();
    await expect(page.getByTestId("selection-bar")).toContainText("2 sélectionnés");
    await page.getByLabel("Déplacer vers un projet").selectOption({ label: `Carnet de voyage ${RUN}` });
    await expect(page.getByText("Sélection mise à jour.")).toBeVisible();
    await page.getByTestId("search").fill("");
    await page.getByTestId("project-item").filter({ hasText: `Carnet de voyage ${RUN}` }).click();
    await expect(page.getByTestId("library-card")).toHaveCount(2);
  });

  test("réutilise un ancien prompt pour une nouvelle génération", async ({ page }) => {
    await page.goto("/bibliotheque");
    await page.getByTestId("search").fill(`${RUN} désert de sel`);
    await page.getByTestId("library-card").first().click();
    await page.getByTestId("reuse-prompt").click();
    await expect(page).toHaveURL(/\/generer$/);
    await expect(page.getByTestId("prompt")).toHaveValue(`Bibliothèque ${RUN} : désert de sel infini`);
  });

  test("télécharge une sélection en ZIP puis supprime avec confirmation", async ({ page }) => {
    await page.goto("/bibliotheque");
    await page.getByRole("group", { name: "Type" }).getByRole("button", { name: "Images" }).click();
    await page.getByTestId("search").fill(`Lot ${RUN}`);
    const cards = page.getByTestId("library-card");
    await expect(cards).toHaveCount(2);
    await cards.nth(0).getByRole("checkbox").check();
    await cards.nth(1).getByRole("checkbox").check();
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("bulk-download").click();
    const download = await downloadPromise;
    const zip = unzipSync(new Uint8Array(fs.readFileSync((await download.path())!)));
    expect(Object.keys(zip).filter((n) => n.endsWith(".png"))).toHaveLength(2);
    expect(Object.keys(zip)).toContain("prompts.txt");

    await page.getByTestId("bulk-delete").click();
    await expect(page.getByRole("alertdialog")).toContainText("2 éléments seront supprimés");
    await page.getByTestId("confirm").click();
    await expect(page.getByText("2 éléments supprimés.")).toBeVisible();
    await expect(page.getByTestId("library-count")).toHaveText("0 élément");
    await expect(cards).toHaveCount(0);
  });

  test("filtre les favoris", async ({ page }) => {
    await page.goto("/bibliotheque");
    await page.getByTestId("filter-favorites").click();
    const cards = page.getByTestId("library-card");
    await expect(cards.first()).toBeVisible();
    for (const card of await cards.all()) await expect(card.getByLabel("Favori")).toBeVisible();
  });
});
