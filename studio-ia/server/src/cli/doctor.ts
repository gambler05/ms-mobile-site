/**
 * Diagnostic : npm run doctor
 * Vérifie chaque moteur configuré (appels légers et gratuits : liste des modèles, solde…).
 * Aucune image n'est générée et aucun coût n'est engagé.
 */
import { serverConfig } from "../config.js";
import { EngineRegistry } from "../engines/registry.js";
import { SettingsStore } from "../store/settings.js";

const registry = new EngineRegistry(new SettingsStore(serverConfig.dataDir));
const status = await registry.status(true);
console.log("\nDiagnostic des moteurs Studio IA\n");
for (const e of status) {
  const mark = e.available ? "✔ disponible " : e.configured ? "✖ en erreur  " : "· non configuré";
  console.log(`${mark}  ${e.name} [${e.kind === "api" ? "API" : "local"}] — ${e.statusMessage}`);
  if (!e.available) console.log(`               → ${e.setupHint}`);
}
const can = (cap: string) => status.some((e) => e.available && e.capabilities.includes(cap as never));
console.log("\nFonctionnalités utilisables maintenant :");
console.log(`  Texte → image        : ${can("generate") ? "oui" : "non"}`);
console.log(`  Image → prompt       : ${can("vision") ? "oui" : "non"}`);
console.log(`  Amélioration prompts : ${can("text") ? "oui" : "non"}`);
console.log(`  Agrandissement       : ${can("upscale") ? "oui" : "non"}\n`);
