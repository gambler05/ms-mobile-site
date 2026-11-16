import fs from "node:fs/promises";
import path from "node:path";
import { strToU8, strFromU8, unzipSync, zipSync, type Zippable } from "fflate";
import { badRequest } from "../lib/errors.js";
import { MAX_IMAGE_BYTES, sniffImageMime } from "../lib/images.js";
import { FILE_NAME_RE, type Library, type LibraryDoc, normalizeLibrary, referencedFiles } from "./library.js";

export const BACKUP_FORMAT = "studio-ia-sauvegarde";
const MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024; // 4 Go décompressés au maximum

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: 1;
  createdAt: string;
  items: number;
  projects: number;
  files: number;
}

/**
 * Crée une archive ZIP contenant la bibliothèque et toutes les images.
 * Les réglages (qui peuvent contenir des clés API) ne sont JAMAIS inclus.
 */
export async function createBackup(library: Library): Promise<{ zip: Uint8Array; manifest: BackupManifest }> {
  const doc = await library.doc.read();
  const files: Zippable = {};
  const names = new Set(doc.items.flatMap(referencedFiles));
  let fileCount = 0;
  for (const name of names) {
    try {
      const data = await fs.readFile(library.filePath(name));
      // Les images sont déjà compressées : on les stocke telles quelles (plus rapide).
      files[name] = [data, { level: 0 }];
      fileCount++;
    } catch {
      // Fichier manquant sur le disque : l'élément sera sauvegardé sans son image.
    }
  }
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: 1,
    createdAt: new Date().toISOString(),
    items: doc.items.length,
    projects: doc.projects.length,
    files: fileCount,
  };
  const zip = zipSync({
    "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
    "library.json": strToU8(JSON.stringify(doc, null, 2)),
    files,
  });
  return { zip, manifest };
}

export interface RestoreResult {
  mode: "fusion" | "remplacement";
  itemsAdded: number;
  itemsSkipped: number;
  projectsAdded: number;
  filesRestored: number;
}

/**
 * Restaure une sauvegarde.
 * - « fusion » : ajoute les éléments absents, conserve l'existant ;
 * - « remplacement » : remplace toute la bibliothèque par la sauvegarde.
 * L'archive est entièrement vérifiée avant toute écriture.
 */
export async function restoreBackup(library: Library, zipData: Uint8Array, mode: "fusion" | "remplacement"): Promise<RestoreResult> {
  let entries: Record<string, Uint8Array>;
  let total = 0;
  try {
    entries = unzipSync(zipData, {
      filter: (file) => {
        total += file.originalSize;
        if (total > MAX_TOTAL_BYTES) throw new Error("trop volumineux");
        const ok = file.name === "manifest.json" || file.name === "library.json" || isFileEntry(file.name);
        if (ok && isFileEntry(file.name) && file.originalSize > MAX_IMAGE_BYTES) throw new Error("image trop lourde");
        return ok;
      },
    });
  } catch {
    throw badRequest("Ce fichier n'est pas une sauvegarde Studio IA valide (archive ZIP illisible ou trop volumineuse).");
  }
  const manifestRaw = entries["manifest.json"];
  const libraryRaw = entries["library.json"];
  if (!manifestRaw || !libraryRaw) throw badRequest("Sauvegarde incomplète : manifest.json ou library.json manquant.");
  let manifest: BackupManifest;
  let incoming: LibraryDoc;
  try {
    manifest = JSON.parse(strFromU8(manifestRaw)) as BackupManifest;
    incoming = normalizeLibrary(JSON.parse(strFromU8(libraryRaw)));
  } catch {
    throw badRequest("Sauvegarde corrompue : contenu JSON illisible.");
  }
  if (manifest.format !== BACKUP_FORMAT) throw badRequest("Ce fichier ZIP n'a pas été créé par Studio IA.");

  // Vérifie que chaque fichier image est bien une image.
  const images = new Map<string, Uint8Array>();
  for (const [entryName, data] of Object.entries(entries)) {
    if (!isFileEntry(entryName)) continue;
    const name = entryName.slice("files/".length);
    if (!sniffImageMime(Buffer.from(data.buffer, data.byteOffset, data.byteLength))) {
      throw badRequest(`Sauvegarde refusée : « ${name} » n'est pas une image valide.`);
    }
    images.set(name, data);
  }

  const result: RestoreResult = { mode, itemsAdded: 0, itemsSkipped: 0, projectsAdded: 0, filesRestored: 0 };
  await fs.mkdir(library.filesDir, { recursive: true });

  let toWrite: string[] = [];
  await library.doc.update((doc) => {
    if (mode === "remplacement") {
      doc.items = incoming.items;
      doc.projects = incoming.projects;
      result.itemsAdded = incoming.items.length;
      result.projectsAdded = incoming.projects.length;
    } else {
      const knownProjects = new Set(doc.projects.map((p) => p.id));
      for (const p of incoming.projects) {
        if (!knownProjects.has(p.id)) {
          doc.projects.push(p);
          result.projectsAdded++;
        }
      }
      const knownItems = new Set(doc.items.map((i) => i.id));
      for (const it of incoming.items) {
        if (knownItems.has(it.id)) {
          result.itemsSkipped++;
        } else {
          doc.items.push(it);
          result.itemsAdded++;
        }
      }
    }
    toWrite = [...new Set(doc.items.flatMap(referencedFiles))].filter((n) => images.has(n));
  });

  for (const name of toWrite) {
    await fs.writeFile(path.join(library.filesDir, name), images.get(name)!);
    result.filesRestored++;
  }

  if (mode === "remplacement") {
    // Nettoie les images qui ne sont plus référencées.
    const keep = new Set((await library.doc.read()).items.flatMap(referencedFiles));
    for (const name of await fs.readdir(library.filesDir).catch(() => [] as string[])) {
      if (FILE_NAME_RE.test(name) && !keep.has(name)) await fs.rm(path.join(library.filesDir, name), { force: true });
    }
  }
  return result;
}

function isFileEntry(name: string): boolean {
  return name.startsWith("files/") && FILE_NAME_RE.test(name.slice("files/".length));
}
