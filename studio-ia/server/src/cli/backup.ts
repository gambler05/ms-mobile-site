/**
 * Sauvegarde en ligne de commande : npm run backup [-- chemin/du/fichier.zip]
 * Crée une archive ZIP de la bibliothèque (prompts, analyses, images).
 * Les réglages et clés API ne sont jamais inclus.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { serverConfig } from "../config.js";
import { createBackup } from "../store/backup.js";
import { Library } from "../store/library.js";

const library = new Library(serverConfig.dataDir);
const target = path.resolve(
  process.argv[2] ?? path.join(serverConfig.dataDir, "..", `studio-ia-sauvegarde-${new Date().toISOString().slice(0, 10)}.zip`),
);
const { zip, manifest } = await createBackup(library);
await fs.writeFile(target, zip);
console.log(`Sauvegarde créée : ${target}`);
console.log(`  ${manifest.items} élément(s), ${manifest.projects} projet(s), ${manifest.files} image(s), ${(zip.length / 1024 / 1024).toFixed(1)} Mo`);
