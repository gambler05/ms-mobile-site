import fs from "node:fs";
import { expect, test } from "@playwright/test";

test.describe("Paramètres, modes et sauvegarde", () => {
  test("affiche les fonctionnalités disponibles dans chaque mode, avec coûts", async ({ page }) => {
    await page.goto("/parametres");
    const matrix = page.getByTestId("capability-matrix");
    await expect(matrix.getByRole("row", { name: /Générer une image/ })).toContainText("OpenAI Images");
    await expect(matrix.getByRole("row", { name: /Générer une image/ })).toContainText("Stable Diffusion (local)");
    await expect(matrix.getByRole("row", { name: /Analyser une image/ })).toContainText("Ollama (local)");
    await expect(page.getByTestId("engine-openai")).toContainText("Service payant");
    await expect(page.getByTestId("engine-ollama")).toContainText("Gratuit");
    await expect(page.getByTestId("engine-stability-status")).toContainText("42.5 crédits");
  });

  test("le mode local ne propose que les moteurs installés sur l'ordinateur", async ({ page }) => {
    await page.goto("/parametres");
    await page.getByRole("group", { name: "Mode" }).getByRole("button", { name: "Local" }).click();
    await expect(page.getByText(/Aucune donnée ne quitte votre machine/)).toBeVisible();
    await page.goto("/generer");
    await expect(page.getByTestId("engine-select").locator("option")).toHaveText([/Stable Diffusion/]);
    await page.goto("/analyser");
    await expect(page.getByTestId("vision-engine").locator("option")).toHaveText([/Ollama/]);
    // Retour au mode automatique.
    await page.goto("/parametres");
    await page.getByRole("group", { name: "Mode" }).getByRole("button", { name: "Auto" }).click();
  });

  test("exporte une sauvegarde puis restaure la bibliothèque après suppression", async ({ page }) => {
    const H = { "content-type": "application/json", "x-studio": "1" };
    const marker = `Sauvegarde ${Date.now()}`;
    const created = await (await fetch("http://127.0.0.1:5310/api/library/prompts", { method: "POST", headers: H, body: JSON.stringify({ prompt: marker }) })).json();

    await page.goto("/parametres");
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("export-backup").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^studio-ia-sauvegarde-.*\.zip$/);
    const zipPath = "test-results/fixtures/sauvegarde.zip";
    fs.mkdirSync("test-results/fixtures", { recursive: true });
    await download.saveAs(zipPath);

    await fetch("http://127.0.0.1:5310/api/library/delete", { method: "POST", headers: H, body: JSON.stringify({ ids: [created.item.id] }) });
    expect((await fetch(`http://127.0.0.1:5310/api/library/${created.item.id}`)).status).toBe(404);

    await page.getByTestId("restore-input").setInputFiles(zipPath);
    await page.getByRole("group", { name: "Mode de restauration" }).getByRole("button", { name: "Remplacer tout" }).click();
    await page.getByTestId("restore").click();
    await expect(page.getByRole("alertdialog")).toContainText("Remplacer toute la bibliothèque");
    await page.getByTestId("confirm").click();
    await expect(page.getByTestId("restore-result")).toContainText("Restauration (remplacement) terminée");

    await page.goto("/bibliotheque");
    await page.getByTestId("search").fill(marker);
    await expect(page.getByTestId("library-card")).toHaveCount(1);
  });
});
