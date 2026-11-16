import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makePng } from "../../e2e/stubs/png.js";
import { Library } from "../src/store/library.js";
import { tempDir } from "./helpers.js";

async function libWithFiles() {
  const lib = new Library(tempDir());
  const file = await lib.saveFile(makePng(32, 32), "image/png", 32, 32);
  return { lib, file };
}

describe("bibliothèque locale", () => {
  it("enregistre, relit et persiste les éléments sur disque", async () => {
    const { lib, file } = await libWithFiles();
    const item = await lib.add({ type: "image", title: "Renard", prompt: "red fox in a forest", file, tags: ["animal", " animal ", "forêt"] });
    expect(item.tags).toEqual(["animal", "forêt"]);
    const again = new Library(lib.dataDir);
    expect((await again.get(item.id)).prompt).toBe("red fox in a forest");
    expect(fs.existsSync(path.join(lib.filesDir, file.name))).toBe(true);
  });

  it("recherche sans tenir compte des accents ni de la casse, et filtre par type, favori, étiquette", async () => {
    const lib = new Library(tempDir());
    await lib.add({ type: "prompt", title: "Forêt enchantée", prompt: "enchanted forest", tags: ["Nature"], favorite: true });
    await lib.add({ type: "prompt", title: "Ville", prompt: "neon city at night", notes: "idée pour la vidéo" });
    await lib.add({ type: "image", title: "Plage", prompt: "beach" });
    expect((await lib.list({ q: "FORET" })).total).toBe(1);
    expect((await lib.list({ q: "video" })).items[0].title).toBe("Ville");
    expect((await lib.list({ type: "prompt" })).total).toBe(2);
    expect((await lib.list({ favorite: true })).total).toBe(1);
    expect((await lib.list({ tag: "nature" })).total).toBe(1);
    expect((await lib.list({ q: "neon night" })).total).toBe(1);
    expect((await lib.list({ q: "neon beach" })).total).toBe(0);
  });

  it("modifie titre, étiquettes, notes, catégorie et projet", async () => {
    const lib = new Library(tempDir());
    const project = await lib.createProject("Campagne été");
    const item = await lib.add({ type: "prompt", prompt: "x" });
    const updated = await lib.patch(item.id, { title: "Nouveau", tags: ["a", "b"], notes: "note", category: "Pub", projectId: project.id, favorite: true });
    expect(updated).toMatchObject({ title: "Nouveau", tags: ["a", "b"], notes: "note", category: "Pub", projectId: project.id, favorite: true });
    await expect(lib.patch(item.id, { projectId: "inexistant" })).rejects.toThrow(/projet n'existe pas/);
    expect((await lib.list({ projectId: project.id })).total).toBe(1);
    expect((await lib.projects())[0].count).toBe(1);
  });

  it("supprime les éléments et seulement les fichiers qui ne servent plus", async () => {
    const { lib, file } = await libWithFiles();
    const a = await lib.add({ type: "image", prompt: "a", file });
    // Un second élément réutilise le même fichier comme image de référence.
    const b = await lib.add({
      type: "image",
      prompt: "b",
      parentId: a.id,
      generation: {
        engineId: "x", prompt: "b", negativePrompt: "", style: "aucun", aspectRatio: "1:1", quality: "standard", count: 1,
        engineName: "X", model: "m", finalPrompt: "b", seed: null, referenceFile: file.name, operation: "variante",
      },
    });
    expect(await lib.remove([a.id])).toBe(1);
    expect(fs.existsSync(lib.filePath(file.name))).toBe(true);
    expect((await lib.get(b.id)).parentId).toBeNull();
    await lib.remove([b.id]);
    expect(fs.existsSync(lib.filePath(file.name))).toBe(false);
  });

  it("refuse les noms de fichiers dangereux", () => {
    const lib = new Library(tempDir());
    expect(() => lib.filePath("../../etc/passwd")).toThrow(/invalide/);
    expect(() => lib.filePath("abc.png")).toThrow(/invalide/);
  });

  it("supprime un projet sans supprimer ses éléments, refuse les doublons de nom", async () => {
    const lib = new Library(tempDir());
    const p = await lib.createProject("Projet A");
    await expect(lib.createProject("projet a")).rejects.toThrow(/déjà/);
    const it1 = await lib.add({ type: "prompt", prompt: "x", projectId: p.id });
    await lib.deleteProject(p.id);
    expect((await lib.get(it1.id)).projectId).toBeNull();
  });

  it("récupère la version précédente si le fichier principal est corrompu", async () => {
    const lib = new Library(tempDir());
    await lib.add({ type: "prompt", prompt: "premier" });
    await lib.add({ type: "prompt", prompt: "second" }); // crée library.json.bak (avec « premier »)
    fs.writeFileSync(path.join(lib.dataDir, "library.json"), "{ corrompu");
    const reopened = new Library(lib.dataDir);
    const { items } = await reopened.list();
    expect(items.map((i) => i.prompt)).toContain("premier");
    expect(fs.readdirSync(lib.dataDir).some((f) => f.startsWith("library.json.corrompu-"))).toBe(true);
  });
});
