/**
 * Environnement des tests navigateur :
 * - un serveur de doublures de protocole (moteurs simulés POUR LES TESTS UNIQUEMENT) ;
 * - studio « équipé » : tous les moteurs pointent vers les doublures ;
 * - studio « sans moteur » : aucun moteur connecté, pour vérifier qu'aucun résultat n'est simulé.
 */
import fs from "node:fs";
import path from "node:path";
import { createApp } from "../server/src/app.js";
import { ROOT_DIR } from "../server/src/config.js";
import { startStubServer } from "./stubs/server.js";

export const STUB_PORT = 5301;
export const APP_PORT = 5310;
export const EMPTY_APP_PORT = 5311;

const dataRoot = path.join(ROOT_DIR, "test-results", "e2e-data");
fs.rmSync(dataRoot, { recursive: true, force: true });

const stub = await startStubServer(STUB_PORT);

const equipped = createApp({
  dataDir: path.join(dataRoot, "equipe"),
  quiet: true,
  envSettings: {
    anthropicApiKey: "sk-ant-test-0000",
    anthropicBaseUrl: `${stub.url}/anthropic`,
    ollamaUrl: `${stub.url}/ollama`,
    openaiApiKey: "sk-test-openai-0000",
    openaiBaseUrl: `${stub.url}/openai/v1`,
    stabilityApiKey: "sk-test-stability-0000",
    stabilityBaseUrl: `${stub.url}/stability`,
    sdwebuiUrl: `${stub.url}/sdwebui`,
  },
});
equipped.app.listen(APP_PORT, "127.0.0.1");

const empty = createApp({
  dataDir: path.join(dataRoot, "vide"),
  quiet: true,
  // Aucune clé ; ports fermés : les moteurs locaux sont « non joignables ».
  envSettings: {
    ollamaUrl: "http://127.0.0.1:9",
    sdwebuiUrl: "http://127.0.0.1:9",
    // Adresse technique uniquement : la clé Stability peut être saisie dans l'interface pendant un test.
    stabilityBaseUrl: `${stub.url}/stability`,
  },
});
empty.app.listen(EMPTY_APP_PORT, "127.0.0.1");

console.log(`Doublures : ${stub.url} — studio équipé : http://127.0.0.1:${APP_PORT} — studio sans moteur : http://127.0.0.1:${EMPTY_APP_PORT}`);
