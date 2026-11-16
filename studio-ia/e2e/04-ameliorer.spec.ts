import { expect, test } from "@playwright/test";
import { stubRequests } from "./helpers.js";

test.describe("Éditeur de prompts", () => {
  test("transforme une idée simple en prompt professionnel avec les options choisies", async ({ page }) => {
    await page.goto("/ameliorer");
    await page.getByTestId("idea").fill("Un renard dans une forêt.");
    await page.getByRole("button", { name: "Cinématographique" }).click();
    await page.getByLabel("Éclairage").selectOption("volumetrique");
    await page.getByLabel("Ambiance").selectOption("mysterieux");
    await page.getByTestId("vertical").check();
    await page.getByLabel(/Personnage de référence/).fill("Renard roux avec une tache blanche en forme d'étoile sur le front");
    await page.getByTestId("enhance").click();

    await expect(page.getByTestId("enhanced-text")).toContainText("Un renard dans une forêt.");
    await expect(page.getByTestId("enhance-result")).toContainText("Ce qui a été amélioré");

    const call = (await stubRequests()).filter((r) => r.path === "/v1/messages").pop()!;
    const text = String((call.json!.messages as Array<{ content: Array<{ text: string }> }>)[0].content[0].text);
    expect(text).toContain("Style artistique imposé : Cinématographique");
    expect(text).toContain("lumière volumétrique");
    expect(text).toContain("ambiance mystérieuse");
    expect(text).toContain("TikTok / Instagram Reels");
    expect(text).toContain("tache blanche en forme d'étoile");

    // Enregistrement puis envoi au générateur (le format vertical suit).
    await page.getByTestId("enhanced").getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Prompt enregistré dans la bibliothèque.")).toBeVisible();
    await page.getByTestId("enhanced-send").click();
    await expect(page.getByTestId("prompt")).toHaveValue(/enhanced/);
    await expect(page.getByTestId("ratio-9:16")).toHaveAttribute("aria-pressed", "true");
  });

  test("crée une série de prompts cohérents pour une même histoire", async ({ page }) => {
    await page.goto("/ameliorer");
    await page.getByTestId("tab-series").click();
    await page.getByTestId("story").fill("Une exploratrice découvre un phare abandonné, y passe la nuit pendant une tempête, puis repart à l'aube.");
    await page.getByRole("group", { name: "Nombre d'images" }).getByRole("button", { name: "3", exact: true }).click();
    await page.getByTestId("make-series").click();
    await expect(page.getByTestId("series-result")).toContainText("Fiche personnage et guide de style");
    for (const i of [0, 1, 2]) await expect(page.getByTestId(`scene-${i}`)).toBeVisible();
    await expect(page.getByTestId("scene-3")).toHaveCount(0);
    await page.getByRole("button", { name: "Enregistrer la série" }).click();
    await expect(page.getByText(/3 prompts enregistrés/)).toBeVisible();
  });
});
