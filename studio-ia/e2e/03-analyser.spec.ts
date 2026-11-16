import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { clipboard, pngFile, stubRequests } from "./helpers.js";

const PROMPT_IDS = ["detailed", "professional", "short", "cinematic", "negative", "structured"];

test.describe("Flux image → prompt", () => {
  test("importe une image, l'analyse et affiche les six prompts et l'analyse détaillée", async ({ page }) => {
    await page.goto("/analyser");
    await page.getByTestId("dropzone-input").setInputFiles(pngFile("paysage.png", 800, 600, 4));
    await expect(page.getByTestId("dims")).toHaveText("800 × 600 px");
    await expect(page.getByTestId("ratio")).toContainText("4:3");
    await expect(page.getByTestId("palette").locator(".swatch").first()).toBeVisible();

    await page.getByTestId("vision-engine").selectOption("claude");
    await page.getByTestId("analyze").click();
    await expect(page.getByTestId("analysis-title")).toContainText("Un renard roux");
    for (const id of PROMPT_IDS) await expect(page.getByTestId(`prompt-${id}`)).toBeVisible();
    await expect(page.getByTestId("prompt-structured")).toContainText("Sujet : ");
    await expect(page.getByTestId("analysis")).toContainText("Points incertains");
    await expect(page.getByTestId("analysis")).toContainText("À préserver");

    // Le modèle a reçu les mesures exactes et la palette mesurée.
    const call = (await stubRequests()).filter((r) => r.provider === "anthropic" && r.path === "/v1/messages").pop()!;
    const content = (call.json!.messages as Array<{ content: Array<{ type: string; text?: string }> }>)[0].content;
    expect(content[0].type).toBe("image");
    expect(content.find((c) => c.type === "text")!.text).toContain("800 × 600 px");
    expect(content.find((c) => c.type === "text")!.text).toContain("Palette mesurée");

    // Copier
    await page.getByTestId("prompt-detailed-copy").click();
    expect(await clipboard(page)).toBe(await page.getByTestId("prompt-detailed-text").innerText());

    // Modifier
    await page.getByTestId("prompt-short-edit").click();
    await page.getByTestId("prompt-short-editor").fill("Red fox, misty forest, dawn, edited");
    await page.getByTestId("prompt-short-edit").click();
    await expect(page.getByTestId("prompt-short-text")).toHaveText("Red fox, misty forest, dawn, edited");
    await expect(page.getByTestId("prompt-short")).toContainText("Modifié");

    // Traduire
    await page.getByTestId("prompt-cinematic-translate").click();
    await expect(page.getByTestId("prompt-cinematic-text")).toHaveText(/^\[FR\] Cinematic wide shot/);
    await expect(page.getByTestId("prompt-cinematic")).toContainText("Français");

    // Envoyer au générateur : prompt, négatif et format le plus proche (4:3 → 3:2).
    await page.getByTestId("prompt-short-send").click();
    await expect(page).toHaveURL(/\/generer$/);
    await expect(page.getByTestId("prompt")).toHaveValue("Red fox, misty forest, dawn, edited");
    await expect(page.getByTestId("negative")).toHaveValue(/blurry, low resolution/);
    await expect(page.getByTestId("ratio-3:2")).toHaveAttribute("aria-pressed", "true");
  });

  test("accepte le glisser-déposer et l'analyse locale avec Ollama", async ({ page }) => {
    await page.goto("/analyser");
    const bytes = fs.readFileSync(pngFile("portrait.png", 540, 960, 7)).toString("base64");
    const dataTransfer = await page.evaluateHandle((b64) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bin], "portrait.png", { type: "image/png" }));
      return dt;
    }, bytes);
    await page.getByTestId("dropzone").dispatchEvent("dragenter", { dataTransfer });
    await page.getByTestId("dropzone").dispatchEvent("drop", { dataTransfer });
    await expect(page.getByTestId("dims")).toHaveText("540 × 960 px");
    await expect(page.getByTestId("ratio")).toContainText("9:16");
    await page.getByRole("button", { name: "Français" }).click();
    await page.getByTestId("vision-engine").selectOption("ollama");
    await page.getByTestId("analyze").click();
    await expect(page.getByText("Analysé par Ollama (local)")).toBeVisible();
    await expect(page.getByTestId("prompt-professional")).toContainText("Français");
  });

  test("refuse un fichier qui n'est pas une image, avec un message clair", async ({ page }) => {
    const dir = "test-results/fixtures";
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/faux.png`, "ceci est un texte, pas une image");
    fs.writeFileSync(`${dir}/document.pdf`, "%PDF-1.4");
    await page.goto("/analyser");
    await page.getByTestId("dropzone-input").setInputFiles(`${dir}/faux.png`);
    await expect(page.getByTestId("error-box")).toContainText("n'est pas une image PNG, JPG ou WEBP valide");
    await page.getByTestId("dropzone-input").setInputFiles(`${dir}/document.pdf`);
    await expect(page.getByTestId("error-box")).toContainText("Formats acceptés : PNG, JPG, JPEG, WEBP");
    await expect(page.getByTestId("analyze")).toHaveCount(0);
  });

  test("rouvre une analyse enregistrée depuis la bibliothèque", async ({ page }) => {
    await page.goto("/bibliotheque");
    await page.getByRole("group", { name: "Type" }).getByRole("button", { name: "Analyses" }).click();
    await page.getByTestId("library-card").first().click();
    await page.getByRole("button", { name: "Voir l’analyse" }).click();
    await expect(page).toHaveURL(/\/analyser\?item=/);
    await expect(page.getByTestId("prompt-detailed")).toBeVisible();
  });
});
