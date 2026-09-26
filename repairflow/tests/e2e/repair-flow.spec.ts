import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Parcours critique : créer un client → recevoir l'appareil → devis → accord (portail client) →
 * pièce consommée → QC → prêt → règlement → restitution. Exécuté sur la base de démonstration.
 */
test.describe.configure({ mode: "serial" });

test("tranche complète de réparation", async ({ page, context, browserName }) => {
  test.skip(test.info().project.name === "mobile", "parcours desktop");
  await login(page);
  const stamp = Date.now().toString().slice(-6);

  // 1. Assistant de création
  await page.goto("/repairs/new");
  await page.getByRole("button", { name: "Nouveau client" }).click();
  await page.fill("#fn", "E2E");
  await page.fill("#ln", `Client${stamp}`);
  await page.fill("#ph", `07 00 00 ${stamp.slice(0, 2)} ${stamp.slice(2, 4)}`);
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.fill("#brand", "Apple");
  await page.fill("#model", "iPhone 13");
  await page.fill("#imei", "3500000000E2E");
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.fill("#issue", "Écran cassé — test E2E");
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("button", { name: "Suivant" }).click();
  // Accord : case à cocher obligatoire
  await page.getByRole("button", { name: "Créer le ticket" }).click();
  await expect(page.getByText("L'accord du client est requis")).toBeVisible();
  await page.getByRole("checkbox").last().click();
  await page.getByRole("button", { name: "Créer le ticket" }).click();
  await expect(page.getByRole("heading", { name: /Ticket REP-\d{4}-\d{5} créé/ })).toBeVisible({ timeout: 15000 });
  const trackingUrl = await page.locator("code").first().innerText();
  const pin = await page.locator("dd.mono").innerText();
  await page.getByRole("link", { name: "Ouvrir le ticket" }).click();
  await expect(page).toHaveURL(/\/repairs\/(?!new)[a-z0-9]+$/);
  const ticketUrl = page.url();

  // 2. Diagnostic + devis
  await page.locator("textarea").first().fill("Écran OLED HS, châssis OK");
  await page.getByRole("button", { name: "Enregistrer" }).first().click();
  await page.getByRole("tab", { name: /Devis/ }).click();
  await page.getByRole("button", { name: "Nouveau devis" }).click();
  await page.getByRole("button", { name: "Ajouter une ligne" }).click();
  const dialog = page.getByRole("dialog");
  // Ligne 1 : main-d'œuvre (30 €, par défaut). Ligne 2 : une pièce du catalogue.
  await dialog.locator("select").nth(1).selectOption("PART");
  await dialog.locator("select").nth(2).selectOption({ index: 1 });
  await page.getByRole("button", { name: "Envoyer le devis" }).click();
  await expect(page.getByText("Devis v1")).toBeVisible();

  // 3. Accord depuis l'espace client (lien opaque)
  const pub = await context.newPage();
  await pub.goto(trackingUrl);
  await expect(pub.getByText("Suivi de votre réparation")).toBeVisible();
  await expect(pub.getByText("Écran OLED HS")).toHaveCount(0); // note interne jamais exposée
  await pub.getByRole("button", { name: "Accepter le devis" }).click();
  await expect(pub.getByText("votre réponse a été enregistrée")).toBeVisible();
  // Documents protégés par PIN : mauvais code refusé, bon code accepté
  await pub.fill("input[inputmode=numeric]", pin === "0000" ? "1111" : "0000");
  await pub.getByRole("button", { name: "Confirmer" }).click();
  await expect(pub.getByText("Code incorrect")).toBeVisible();
  await pub.fill("input[inputmode=numeric]", pin.trim());
  await pub.getByRole("button", { name: "Confirmer" }).click();
  await expect(pub.locator("input[inputmode=numeric]")).toBeHidden(); // PIN accepté : la liste des documents remplace le formulaire
  await pub.close();

  // 4. Pièce : réserver puis consommer
  await page.goto(ticketUrl);
  await expect(page.getByText("En réparation").first()).toBeVisible();
  await page.getByRole("tab", { name: /Pièces/ }).click();
  await page.locator("select").filter({ hasText: "Choisir un produit" }).selectOption({ index: 1 });
  await page.getByRole("button", { name: "Réserver une pièce" }).click();
  await expect(page.getByText("Réservée")).toBeVisible();
  await page.getByRole("button", { name: "Consommer" }).click();
  await expect(page.getByText("Consommée")).toBeVisible();

  // 5. QC puis prêt
  await page.getByRole("button", { name: "Changer le statut" }).click();
  await page.getByRole("menuitem", { name: /Contrôle qualité/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmer" }).click();
  await page.getByRole("tab", { name: /Contrôle qualité/ }).click();
  await page.getByRole("button", { name: "Tout sélectionner" }).click();
  await page.getByRole("tabpanel").getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("tab", { name: "Contrôle qualité 9/9" })).toBeVisible();
  await page.getByRole("button", { name: "Changer le statut" }).click();
  await page.getByRole("menuitem", { name: /Prêt/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmer" }).click();
  await expect(page.locator("h1 ~ span, header").getByText("Prêt").first()).toBeVisible();

  // 6. Règlement puis restitution (la restitution est refusée tant que le solde est dû)
  await page.getByRole("button", { name: "Changer le statut" }).click();
  await page.getByRole("menuitem", { name: /Livré/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByText(/solde doit être réglé/)).toBeVisible();
  await page.getByRole("button", { name: "Encaisser le solde" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByText("Reste dû").locator("xpath=following-sibling::dd[1]")).toHaveText("0,00 €", { timeout: 15000 });
  await page.getByRole("button", { name: "Changer le statut" }).click();
  await page.getByRole("menuitem", { name: /Livré/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByText("Retour sous garantie")).toBeVisible();
  void browserName;
});
