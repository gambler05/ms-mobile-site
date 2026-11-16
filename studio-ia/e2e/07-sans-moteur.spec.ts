import { expect, test } from "@playwright/test";
import { EMPTY_APP, pngFile } from "./helpers.js";

test.describe("Sans moteur connecté : aucun résultat simulé", () => {
  test.use({ baseURL: EMPTY_APP });

  test("chaque écran explique quoi connecter, sans rien générer", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("card-generate")).toContainText("Aucun moteur connecté");

    await page.goto("/generer");
    await expect(page.getByTestId("no-engine-generate")).toContainText("Le studio ne simule jamais de résultat");
    await page.getByTestId("prompt").fill("Une image qui ne doit pas être inventée");
    await expect(page.getByTestId("generate")).toBeDisabled();
    await expect(page.getByTestId("tool-ameliorer")).toBeDisabled();

    await page.goto("/analyser");
    await expect(page.getByTestId("no-engine-vision")).toBeVisible();
    await page.getByTestId("dropzone-input").setInputFiles(pngFile("sans-moteur.png", 300, 200));
    await expect(page.getByTestId("analyze")).toBeDisabled();

    await page.goto("/ameliorer");
    await expect(page.getByTestId("no-engine-text")).toBeVisible();

    await page.goto("/parametres");
    await expect(page.getByTestId("capability-matrix").getByRole("row", { name: /Générer une image/ })).toContainText("Aucun moteur connecté");
    await expect(page.getByTestId("engine-ollama-status")).toContainText("ne répond pas");
  });

  test("une clé saisie dans Paramètres active le moteur sans être réaffichée", async ({ page }) => {
    await page.goto("/parametres");
    await page.getByTestId("configure-stability").click();
    await page.getByTestId("input-stabilityApiKey").fill("sk-saisie-interface-4321");
    await page.getByTestId("save-stability").click();
    await expect(page.getByText("Stability AI : réglages enregistrés.")).toBeVisible();
    await expect(page.getByTestId("engine-stability-status")).toContainText("Connecté");
    await expect(page.getByTestId("input-stabilityApiKey")).toHaveValue("");
    await expect(page.getByTestId("input-stabilityApiKey")).toHaveAttribute("placeholder", /••••4321/);
    expect(await page.content()).not.toContain("sk-saisie-interface-4321");

    await page.goto("/generer");
    await page.getByTestId("prompt").fill("Une montgolfière au-dessus des nuages");
    await page.getByTestId("generate").click();
    await expect(page.getByTestId("results").getByTestId("image-card")).toHaveCount(1);

    // Nettoyage : la clé est retirée.
    await page.goto("/parametres");
    await page.getByTestId("configure-stability").click();
    await page.getByRole("button", { name: "Effacer la clé" }).click();
    await expect(page.getByTestId("engine-stability-status")).toContainText("Non configuré");
  });
});
