import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { pngSize } from "./stubs/png.js";
import { clipboard, pngFile, stubRequests } from "./helpers.js";

const RUN = `n${Date.now().toString(36)}`;

test.describe("Flux texte → image", () => {
  test("génère deux images au format 16:9, les affiche, puis les retrouve dans l'historique", async ({ page }) => {
    await page.goto("/generer");
    await page.getByTestId("engine-select").selectOption("openai");
    await page.getByTestId("prompt").fill(`Phare ${RUN} sous l'orage, vagues immenses, ciel électrique`);
    await page.getByTestId("negative").fill("texte, filigrane");
    await page.getByTestId("ratio-16:9").click();
    await page.getByTestId("style-cinematographique").click();
    await page.getByRole("group", { name: "Nombre d'images" }).getByRole("button", { name: "2" }).click();
    await expect(page.getByTestId("generate")).toHaveText(/Générer 2 images/);
    await page.getByTestId("generate").click();

    const cards = page.getByTestId("results").getByTestId("image-card");
    await expect(cards).toHaveCount(2);
    // L'image affichée a réellement le format demandé.
    const size = await cards.first().locator("img").evaluate((img: HTMLImageElement) => new Promise<[number, number]>((resolve) => {
      if (img.complete) resolve([img.naturalWidth, img.naturalHeight]);
      else img.onload = () => resolve([img.naturalWidth, img.naturalHeight]);
    }));
    expect(size).toEqual([1536, 864]);
    await expect(page.getByText("2 images générées et enregistrées dans la bibliothèque.")).toBeVisible();

    // Le prompt réellement envoyé contient le style et le prompt négatif (OpenAI n'a pas de négatif natif).
    const sent = (await stubRequests()).filter((r) => r.path === "/v1/images/generations").pop()!;
    expect(String(sent.json!.prompt)).toContain("cinematic film still");
    expect(String(sent.json!.prompt)).toContain("Avoid: texte, filigrane");
    expect(sent.json).toMatchObject({ size: "1536x864", n: 2 });

    // L'historique est conservé après rechargement.
    await page.reload();
    await expect(page.getByTestId("history").getByTestId("image-card").filter({ hasText: `Phare ${RUN}` })).toHaveCount(2);
  });

  test("télécharge une image, copie son prompt et l'ouvre en grand", async ({ page }) => {
    await page.goto("/generer");
    await page.getByTestId("engine-select").selectOption("sdwebui");
    await page.getByTestId("prompt").fill("Une cabane en bois dans la neige au crépuscule");
    await page.getByTestId("ratio-4:5").click();
    await page.getByTestId("generate").click();
    const card = page.getByTestId("results").getByTestId("image-card").first();
    await expect(card).toBeVisible();

    await card.hover();
    const downloadPromise = page.waitForEvent("download");
    await card.getByTestId("download").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^studio-ia-une-cabane-en-bois.*\.png$/);
    const file = await download.path();
    const data = fs.readFileSync(file!);
    expect(data.subarray(1, 4).toString()).toBe("PNG");
    const { width, height } = pngSize(data);
    expect(width / height).toBeCloseTo(4 / 5, 1);

    await card.hover();
    await card.getByTestId("copy-prompt").click();
    await expect(page.getByText("Prompt copié.")).toBeVisible();
    expect(await clipboard(page)).toBe("Une cabane en bois dans la neige au crépuscule");

    await card.locator("img").click();
    const lightbox = page.getByTestId("lightbox");
    await expect(lightbox).toBeVisible();
    await expect(lightbox).toContainText("Stable Diffusion (local)");
    await expect(lightbox).toContainText("4:5");
    await expect(lightbox).toContainText("Graine");
    await page.keyboard.press("Escape");
    await expect(lightbox).toBeHidden();
  });

  test("régénère, crée des variantes, agrandit et marque en favori", async ({ page }) => {
    await page.goto("/generer");
    await page.getByTestId("engine-select").selectOption("stability");
    await page.getByTestId("prompt").fill("Un robot jardinier arrosant des tournesols");
    await page.getByTestId("generate").click();
    const results = page.getByTestId("results").getByTestId("image-card");
    await expect(results).toHaveCount(1);

    await results.first().hover();
    await results.first().getByTestId("regenerate").click();
    await expect(results).toHaveCount(2);

    await results.first().hover();
    await results.first().getByTestId("variants").click();
    await expect(results).toHaveCount(4);
    await expect(results.first()).toContainText("variante");

    await results.first().hover();
    await results.first().getByTestId("upscale").click();
    await expect(results).toHaveCount(5);
    await expect(results.first()).toContainText("agrandie");

    await results.first().hover();
    await results.first().getByTestId("favorite").click();
    await expect(results.first().getByTestId("favorite")).toHaveAttribute("aria-pressed", "true");

    const reqs = await stubRequests();
    expect(reqs.some((r) => r.path === "/v2beta/stable-image/upscale/fast")).toBe(true);
    expect(reqs.some((r) => r.path === "/v2beta/stable-image/generate/sd3" && r.form?.mode === "image-to-image")).toBe(true);
  });

  test("améliore, traduit puis annule une modification du prompt", async ({ page }) => {
    await page.goto("/generer");
    const prompt = page.getByTestId("prompt");
    await prompt.fill("un chat sur un toit");
    await page.getByTestId("tool-ameliorer").click();
    await expect(prompt).toHaveValue(/un chat sur un toit.*enhanced/);
    await page.getByTestId("tool-en").click();
    await expect(prompt).toHaveValue(/^\[EN\]/);
    await page.getByRole("button", { name: "Annuler" }).click();
    await expect(prompt).toHaveValue(/enhanced/);
  });

  test("utilise une image de référence importée", async ({ page }) => {
    await page.goto("/generer");
    await page.getByTestId("engine-select").selectOption("openai");
    await page.getByTestId("reference-dropzone-input").setInputFiles(pngFile("reference.png", 400, 400, 9));
    await expect(page.getByTestId("reference-preview")).toBeVisible();
    await page.getByTestId("prompt").fill("Même composition, version aquarelle");
    await page.getByTestId("generate").click();
    await expect(page.getByTestId("results").getByTestId("image-card")).toHaveCount(1);
    const edit = (await stubRequests()).filter((r) => r.path === "/v1/images/edits").pop();
    expect(edit?.form?.prompt).toContain("Même composition, version aquarelle");
  });

  test("affiche une erreur compréhensible quand le fournisseur refuse", async ({ page }) => {
    await fetch("http://127.0.0.1:5301/__fail", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "openai", status: 401, body: { error: { message: "Incorrect API key provided" } } }),
    });
    await page.goto("/generer");
    await page.getByTestId("engine-select").selectOption("openai");
    await page.getByTestId("prompt").fill("Une image qui échouera");
    await page.getByTestId("generate").click();
    await expect(page.getByTestId("error-box")).toContainText("OpenAI Images a rejeté la clé API");
    await expect(page.getByTestId("error-box")).toContainText("Paramètres › Moteurs");
    await expect(page.getByTestId("results")).toHaveCount(0);
  });
});
