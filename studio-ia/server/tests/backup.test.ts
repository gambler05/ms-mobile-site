import fs from "node:fs";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { makePng } from "../../e2e/stubs/png.js";
import { createBackup, restoreBackup } from "../src/store/backup.js";
import { Library } from "../src/store/library.js";
import { tempDir } from "./helpers.js";

async function filledLibrary() {
  const lib = new Library(tempDir());
  const project = await lib.createProject("Portraits");
  const file = await lib.saveFile(makePng(64, 48), "image/png", 64, 48);
  const image = await lib.add({ type: "image", title: "Portrait", prompt: "portrait", file, projectId: project.id, tags: ["studio"] });
  const prompt = await lib.add({ type: "prompt", title: "Favori", prompt: "a cozy cabin", favorite: true });
  return { lib, file, image, prompt, project };
}

describe("sauvegarde et restauration", () => {
  it("exporte puis restaure toute la bibliothèque (remplacement) dans un dossier vide", async () => {
    const { lib, file, image, prompt } = await filledLibrary();
    const { zip, manifest } = await createBackup(lib);
    expect(manifest).toMatchObject({ items: 2, projects: 1, files: 1 });

    const target = new Library(tempDir());
    const res = await restoreBackup(target, zip, "remplacement");
    expect(res).toMatchObject({ itemsAdded: 2, projectsAdded: 1, filesRestored: 1 });
    expect((await target.get(image.id)).projectId).toBe(image.projectId);
    expect((await target.get(prompt.id)).favorite).toBe(true);
    expect(fs.readFileSync(target.filePath(file.name)).equals(fs.readFileSync(lib.filePath(file.name)))).toBe(true);
  });

  it("fusionne sans dupliquer les éléments déjà présents", async () => {
    const { lib } = await filledLibrary();
    const { zip } = await createBackup(lib);
    await lib.add({ type: "prompt", prompt: "ajouté après la sauvegarde" });
    const res = await restoreBackup(lib, zip, "fusion");
    expect(res).toMatchObject({ itemsAdded: 0, itemsSkipped: 2 });
    expect((await lib.list()).total).toBe(3);
  });

  it("en remplacement, supprime les éléments et images absents de la sauvegarde", async () => {
    const { lib } = await filledLibrary();
    const { zip } = await createBackup(lib);
    const extraFile = await lib.saveFile(makePng(20, 20), "image/png", 20, 20);
    await lib.add({ type: "image", prompt: "à effacer", file: extraFile });
    await restoreBackup(lib, zip, "remplacement");
    expect((await lib.list()).total).toBe(2);
    expect(fs.existsSync(lib.filePath(extraFile.name))).toBe(false);
  });

  it("n'inclut jamais les réglages (clés API)", async () => {
    const { lib } = await filledLibrary();
    fs.writeFileSync(`${lib.dataDir}/settings.json`, JSON.stringify({ engines: { openaiApiKey: "sk-secret" } }));
    const { zip } = await createBackup(lib);
    expect(Buffer.from(zip).includes(Buffer.from("sk-secret"))).toBe(false);
  });

  it("refuse un ZIP étranger, un fichier non ZIP et une image piégée", async () => {
    const lib = new Library(tempDir());
    await expect(restoreBackup(lib, strToU8("pas un zip"), "fusion")).rejects.toThrow(/n'est pas une sauvegarde Studio IA valide/);
    const foreign = zipSync({ "manifest.json": strToU8(JSON.stringify({ format: "autre" })), "library.json": strToU8("{}") });
    await expect(restoreBackup(lib, foreign, "fusion")).rejects.toThrow(/n'a pas été créé par Studio IA/);
    const name = "0e8b2b7a-5b8a-4f7e-9d3c-1a2b3c4d5e6f.png";
    const trapped = zipSync({
      "manifest.json": strToU8(JSON.stringify({ format: "studio-ia-sauvegarde", version: 1 })),
      "library.json": strToU8(JSON.stringify({ items: [], projects: [] })),
      [`files/${name}`]: strToU8("#!/bin/sh\necho piégé"),
    });
    await expect(restoreBackup(lib, trapped, "fusion")).rejects.toThrow(/n'est pas une image valide/);
  });

  it("ignore les chemins dangereux contenus dans l'archive", async () => {
    const lib = new Library(tempDir());
    const evil = zipSync({
      "manifest.json": strToU8(JSON.stringify({ format: "studio-ia-sauvegarde", version: 1 })),
      "library.json": strToU8(JSON.stringify({ items: [], projects: [] })),
      "../../evil.png": makePng(20, 20),
      "files/../../evil2.png": makePng(20, 20),
    });
    const res = await restoreBackup(lib, evil, "fusion");
    expect(res.filesRestored).toBe(0);
    expect(fs.existsSync(`${lib.dataDir}/../evil.png`)).toBe(false);
  });
});
