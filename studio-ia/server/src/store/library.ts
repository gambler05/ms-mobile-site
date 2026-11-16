import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { badRequest, notFound } from "../lib/errors.js";
import { extensionFor, type ImageMime } from "../lib/images.js";
import type { ItemType, LibraryItem, LibraryQuery, Project, StoredFile } from "../shared/types.js";
import { JsonFile } from "./json-file.js";

export interface LibraryDoc {
  version: 1;
  items: LibraryItem[];
  projects: Project[];
}

export const FILE_NAME_RE = /^[a-f0-9-]{36}\.(png|jpg|webp)$/;

export type NewItem = Partial<Omit<LibraryItem, "id" | "createdAt" | "updatedAt">> & { type: ItemType };

export type ItemPatch = Partial<Pick<LibraryItem, "title" | "prompt" | "negativePrompt" | "favorite" | "tags" | "notes" | "projectId" | "category">>;

export function emptyLibrary(): LibraryDoc {
  return { version: 1, items: [], projects: [] };
}

/** Rend un document de bibliothèque sûr à utiliser, quelle que soit sa provenance. */
export function normalizeLibrary(raw: unknown): LibraryDoc {
  const doc = (raw ?? {}) as Partial<LibraryDoc>;
  const items = Array.isArray(doc.items) ? doc.items.filter(isItemLike).map(normalizeItem) : [];
  const projects = Array.isArray(doc.projects)
    ? doc.projects
        .filter((p): p is Project => !!p && typeof p.id === "string" && typeof p.name === "string")
        .map((p) => ({ id: p.id, name: p.name.slice(0, 80), createdAt: String(p.createdAt ?? new Date().toISOString()) }))
    : [];
  return { version: 1, items, projects };
}

function isItemLike(x: unknown): x is LibraryItem {
  const it = x as LibraryItem;
  return !!it && typeof it.id === "string" && ["image", "analysis", "prompt"].includes(it.type);
}

function normalizeItem(it: LibraryItem): LibraryItem {
  const now = new Date().toISOString();
  const file = it.file && typeof it.file.name === "string" && FILE_NAME_RE.test(it.file.name) ? it.file : null;
  return {
    id: it.id,
    type: it.type,
    createdAt: typeof it.createdAt === "string" ? it.createdAt : now,
    updatedAt: typeof it.updatedAt === "string" ? it.updatedAt : now,
    title: typeof it.title === "string" ? it.title : "",
    prompt: typeof it.prompt === "string" ? it.prompt : "",
    negativePrompt: typeof it.negativePrompt === "string" ? it.negativePrompt : "",
    file,
    generation: it.generation ?? null,
    analysis: it.analysis ?? null,
    analysisMeta: it.analysisMeta ?? null,
    favorite: it.favorite === true,
    tags: Array.isArray(it.tags) ? it.tags.filter((t) => typeof t === "string") : [],
    notes: typeof it.notes === "string" ? it.notes : "",
    projectId: typeof it.projectId === "string" ? it.projectId : null,
    category: typeof it.category === "string" ? it.category : "",
    parentId: typeof it.parentId === "string" ? it.parentId : null,
  };
}

/** Normalise pour la recherche : minuscules, sans accents. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out = new Set<string>();
  for (const t of tags) {
    if (typeof t !== "string") continue;
    const tag = t.trim().replace(/\s+/g, " ").slice(0, 40);
    if (tag) out.add(tag);
  }
  return [...out].slice(0, 30);
}

/**
 * Bibliothèque locale : un document JSON (data/library.json) + les images (data/files/).
 */
export class Library {
  readonly doc: JsonFile<LibraryDoc>;
  readonly filesDir: string;

  constructor(readonly dataDir: string) {
    this.doc = new JsonFile(path.join(dataDir, "library.json"), emptyLibrary, normalizeLibrary);
    this.filesDir = path.join(dataDir, "files");
  }

  filePath(name: string): string {
    if (!FILE_NAME_RE.test(name)) throw badRequest("Nom de fichier invalide.");
    return path.join(this.filesDir, name);
  }

  async saveFile(data: Buffer, mime: ImageMime, width: number, height: number): Promise<StoredFile> {
    await fs.mkdir(this.filesDir, { recursive: true });
    const name = `${randomUUID()}.${extensionFor(mime)}`;
    await fs.writeFile(path.join(this.filesDir, name), data);
    return { name, mime, width, height, bytes: data.length };
  }

  async readFile(name: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.filePath(name));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") throw notFound("Fichier image introuvable.");
      throw err;
    }
  }

  async add(input: NewItem): Promise<LibraryItem> {
    const now = new Date().toISOString();
    const item = normalizeItem({
      title: "",
      prompt: "",
      negativePrompt: "",
      file: null,
      generation: null,
      analysis: null,
      analysisMeta: null,
      favorite: false,
      notes: "",
      projectId: null,
      category: "",
      parentId: null,
      ...input,
      tags: cleanTags(input.tags ?? []),
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    } as LibraryItem);
    await this.doc.update((doc) => {
      if (item.projectId && !doc.projects.some((p) => p.id === item.projectId)) item.projectId = null;
      doc.items.push(item);
    });
    return item;
  }

  async get(id: string): Promise<LibraryItem> {
    const doc = await this.doc.read();
    const item = doc.items.find((i) => i.id === id);
    if (!item) throw notFound("Cet élément n'existe plus dans la bibliothèque.");
    return item;
  }

  async list(query: LibraryQuery = {}): Promise<{ items: LibraryItem[]; total: number }> {
    const doc = await this.doc.read();
    const terms = query.q ? fold(query.q).split(/\s+/).filter(Boolean) : [];
    const filtered = doc.items.filter((it) => {
      if (query.type && it.type !== query.type) return false;
      if (query.projectId === "none" ? it.projectId !== null : query.projectId && it.projectId !== query.projectId) return false;
      if (query.favorite && !it.favorite) return false;
      if (query.tag && !it.tags.some((t) => fold(t) === fold(query.tag!))) return false;
      if (query.category && fold(it.category) !== fold(query.category)) return false;
      if (terms.length) {
        const hay = fold(searchText(it));
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
    filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const offset = Math.max(0, query.offset ?? 0);
    const limit = Math.min(500, Math.max(1, query.limit ?? 100));
    return { items: filtered.slice(offset, offset + limit), total: filtered.length };
  }

  async patch(id: string, patch: ItemPatch): Promise<LibraryItem> {
    return this.doc.update((doc) => {
      const item = doc.items.find((i) => i.id === id);
      if (!item) throw notFound("Cet élément n'existe plus dans la bibliothèque.");
      if (patch.title !== undefined) item.title = String(patch.title).slice(0, 200);
      if (patch.prompt !== undefined) item.prompt = String(patch.prompt).slice(0, 20000);
      if (patch.negativePrompt !== undefined) item.negativePrompt = String(patch.negativePrompt).slice(0, 5000);
      if (patch.favorite !== undefined) item.favorite = patch.favorite === true;
      if (patch.tags !== undefined) item.tags = cleanTags(patch.tags);
      if (patch.notes !== undefined) item.notes = String(patch.notes).slice(0, 10000);
      if (patch.category !== undefined) item.category = String(patch.category).trim().slice(0, 60);
      if (patch.projectId !== undefined) {
        if (patch.projectId !== null && !doc.projects.some((p) => p.id === patch.projectId)) {
          throw badRequest("Ce projet n'existe pas.");
        }
        item.projectId = patch.projectId;
      }
      item.updatedAt = new Date().toISOString();
      return item;
    });
  }

  /** Supprime des éléments et les fichiers qui ne sont plus utilisés par aucun autre élément. */
  async remove(ids: string[]): Promise<number> {
    const wanted = new Set(ids);
    const orphanFiles: string[] = [];
    const removed = await this.doc.update((doc) => {
      const gone = doc.items.filter((i) => wanted.has(i.id));
      doc.items = doc.items.filter((i) => !wanted.has(i.id));
      const stillUsed = new Set(doc.items.flatMap(referencedFiles));
      for (const name of gone.flatMap(referencedFiles)) if (!stillUsed.has(name)) orphanFiles.push(name);
      for (const it of doc.items) if (it.parentId && wanted.has(it.parentId)) it.parentId = null;
      return gone.length;
    });
    await Promise.all(orphanFiles.map((n) => fs.rm(this.filePath(n), { force: true })));
    return removed;
  }

  async tags(): Promise<Array<{ tag: string; count: number }>> {
    const doc = await this.doc.read();
    const counts = new Map<string, number>();
    for (const it of doc.items) for (const t of it.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  async categories(): Promise<string[]> {
    const doc = await this.doc.read();
    return [...new Set(doc.items.map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  async projects(): Promise<Array<Project & { count: number }>> {
    const doc = await this.doc.read();
    return doc.projects
      .map((p) => ({ ...p, count: doc.items.filter((i) => i.projectId === p.id).length }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async createProject(name: string): Promise<Project> {
    const clean = name.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!clean) throw badRequest("Donnez un nom au projet.");
    return this.doc.update((doc) => {
      if (doc.projects.some((p) => fold(p.name) === fold(clean))) throw badRequest("Un projet porte déjà ce nom.");
      const project = { id: randomUUID(), name: clean, createdAt: new Date().toISOString() };
      doc.projects.push(project);
      return project;
    });
  }

  async renameProject(id: string, name: string): Promise<Project> {
    const clean = name.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!clean) throw badRequest("Donnez un nom au projet.");
    return this.doc.update((doc) => {
      const project = doc.projects.find((p) => p.id === id);
      if (!project) throw notFound("Ce projet n'existe plus.");
      if (doc.projects.some((p) => p.id !== id && fold(p.name) === fold(clean))) throw badRequest("Un projet porte déjà ce nom.");
      project.name = clean;
      return project;
    });
  }

  /** Supprime un projet ; ses éléments restent dans la bibliothèque, sans projet. */
  async deleteProject(id: string): Promise<void> {
    await this.doc.update((doc) => {
      if (!doc.projects.some((p) => p.id === id)) throw notFound("Ce projet n'existe plus.");
      doc.projects = doc.projects.filter((p) => p.id !== id);
      for (const it of doc.items) if (it.projectId === id) it.projectId = null;
    });
  }
}

export function referencedFiles(it: LibraryItem): string[] {
  const out: string[] = [];
  if (it.file?.name) out.push(it.file.name);
  if (it.generation?.referenceFile) out.push(it.generation.referenceFile);
  return out;
}

function searchText(it: LibraryItem): string {
  const parts = [it.title, it.prompt, it.negativePrompt, it.notes, it.category, it.tags.join(" ")];
  if (it.generation) parts.push(it.generation.engineName, it.generation.style);
  if (it.analysis) {
    const p = it.analysis.prompts;
    parts.push(p.detailed, p.short, it.analysis.subjects.main, it.analysis.style.artStyle);
  }
  return parts.join(" \n ");
}
