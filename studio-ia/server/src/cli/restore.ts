/**
 * Restauration en ligne de commande :
 *   npm run restore -- fichier.zip            (fusion : ajoute ce qui manque)
 *   npm run restore -- fichier.zip --remplacer (remplace toute la bibliothèque)
 * Arrêtez le serveur avant une restauration en ligne de commande.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { serverConfig } from "../config.js";
import { AppError } from "../lib/errors.js";
import { restoreBackup } from "../store/backup.js";
import { Library } from "../store/library.js";

const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
const replace = process.argv.includes("--remplacer");
if (!file) {
  console.error("Usage : npm run restore -- chemin/sauvegarde.zip [--remplacer]");
  process.exit(1);
}
try {
  const data = await fs.readFile(path.resolve(file));
  const res = await restoreBackup(new Library(serverConfig.dataDir), new Uint8Array(data), replace ? "remplacement" : "fusion");
  console.log(`Restauration (${res.mode}) terminée : ${res.itemsAdded} élément(s) ajouté(s), ${res.itemsSkipped} déjà présent(s), ${res.projectsAdded} projet(s), ${res.filesRestored} image(s).`);
} catch (err) {
  console.error(err instanceof AppError ? err.message : err);
  process.exit(1);
}
