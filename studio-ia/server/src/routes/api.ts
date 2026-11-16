import express, { type Request, type Response, Router } from "express";
import { strToU8, zipSync, type Zippable } from "fflate";
import { z } from "zod";
import { serverConfig } from "../config.js";
import type { EngineRegistry } from "../engines/registry.js";
import { badRequest } from "../lib/errors.js";
import { extensionFor, type ImageMime } from "../lib/images.js";
import type { StudioService } from "../services/studio.js";
import { LIGHTING_OPTIONS, MOOD_OPTIONS } from "../services/styles.js";
import { ASPECT_RATIOS, type ItemType, type StatusResponse } from "../shared/types.js";
import { createBackup, restoreBackup } from "../store/backup.js";
import type { Library } from "../store/library.js";
import type { SettingsStore } from "../store/settings.js";
import type { UsageStore } from "../store/usage.js";

export interface ApiDeps {
  library: Library;
  settings: SettingsStore;
  engines: EngineRegistry;
  studio: StudioService;
  usage: UsageStore;
  version: string;
}

// ───────────── Schémas de validation des requêtes ─────────────

const Style = z.enum(["aucun", "photorealiste", "cinematographique", "3d", "cartoon", "anime", "illustration", "peinture", "crayon", "publicite", "architecture", "motion-design"]);
const Lang = z.enum(["en", "fr"]);
const Id = z.string().min(1).max(100);
const OptionalNumber = z.number().finite().nullable().optional();

const GenerateBody = z.object({
  engineId: z.string().min(1, "Choisissez un moteur de génération."),
  prompt: z.string().trim().min(3, "Décrivez l'image souhaitée (au moins quelques mots).").max(8000, "Le prompt est trop long (8 000 caractères maximum)."),
  negativePrompt: z.string().max(4000).default(""),
  style: Style.default("aucun"),
  aspectRatio: z.enum(ASPECT_RATIOS as unknown as [string, ...string[]]).default("1:1"),
  quality: z.enum(["brouillon", "standard", "haute"]).default("standard"),
  count: z.number().int().min(1).max(4).default(1),
  seed: z.number().int().min(0).max(4_294_967_294).nullable().optional(),
  steps: z.number().int().min(1).max(150).nullable().optional(),
  guidance: z.number().min(0).max(30).nullable().optional(),
  strength: z.number().min(0).max(1).nullable().optional(),
  reference: z.string().nullable().optional(),
  referenceItemId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
});

const AnalyzeBody = z.object({
  engineId: z.string().optional(),
  image: z.string().min(1, "Aucune image fournie."),
  analysisImage: z.string().nullable().optional(),
  palette: z.array(z.string()).max(12).default([]),
  promptLanguage: Lang.default("en"),
  notes: z.string().max(2000).default(""),
  projectId: z.string().nullable().optional(),
});

const EnhanceBody = z.object({
  engineId: z.string().optional(),
  prompt: z.string().max(8000),
  options: z
    .object({
      detail: z.number().int().min(1).max(5).default(3),
      style: Style.default("aucun"),
      lighting: z.string().refine((v) => v in LIGHTING_OPTIONS, "Éclairage inconnu.").default("conserver"),
      mood: z.string().refine((v) => v in MOOD_OPTIONS, "Ambiance inconnue.").default("conserver"),
      vertical: z.boolean().default(false),
      character: z.string().max(3000).default(""),
      language: Lang.default("en"),
    })
    .prefault({}),
});

const LibraryPatch = z.object({
  title: z.string().max(200).optional(),
  prompt: z.string().max(20000).optional(),
  negativePrompt: z.string().max(5000).optional(),
  favorite: z.boolean().optional(),
  tags: z.array(z.string()).max(50).optional(),
  notes: z.string().max(10000).optional(),
  projectId: z.string().nullable().optional(),
  category: z.string().max(60).optional(),
});

function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue.path.length ? ` (champ « ${issue.path.join(".")} »)` : "";
    throw badRequest(`${issue.message}${where}`);
  }
  return result.data;
}

export function apiRouter(deps: ApiDeps): Router {
  const { library, settings, engines, studio, usage } = deps;
  const r = Router();

  r.use(express.json({ limit: "60mb" }));

  r.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  r.get("/status", async (req, res) => {
    const body: StatusResponse = {
      engines: await engines.status(req.query.refresh === "1"),
      usage: { ...(await usage.current()), maxImagesPerDay: usage.maxImagesPerDay },
      version: deps.version,
    };
    res.json(body);
  });

  r.get("/settings", async (_req, res) => {
    res.json({
      settings: await settings.describe(),
      server: {
        host: serverConfig.host,
        port: serverConfig.port,
        dataDir: library.dataDir,
        maxImagesPerDay: usage.maxImagesPerDay,
      },
    });
  });

  r.put("/settings", async (req, res) => {
    const patch = parse(z.record(z.string(), z.unknown()), req.body);
    await settings.update(patch);
    engines.resetProbes();
    res.json({ settings: await settings.describe() });
  });

  // ───────────── Génération ─────────────

  r.post("/generate", async (req, res) => {
    const body = parse(GenerateBody, req.body);
    res.json(await studio.generate(body as Parameters<StudioService["generate"]>[0]));
  });

  r.post("/generate/regenerate", async (req, res) => {
    const { itemId } = parse(z.object({ itemId: Id }), req.body);
    res.json(await studio.regenerate(itemId));
  });

  r.post("/generate/variations", async (req, res) => {
    const body = parse(z.object({ itemId: Id, count: z.number().int().min(1).max(4).default(2), engineId: z.string().optional() }), req.body);
    res.json(await studio.variations(body.itemId, body.count, body.engineId));
  });

  r.post("/upscale", async (req, res) => {
    const body = parse(z.object({ itemId: Id, engineId: z.string().optional() }), req.body);
    res.json({ item: await studio.upscale(body.itemId, body.engineId) });
  });

  // ───────────── Analyse ─────────────

  r.post("/analyze", async (req, res) => {
    const body = parse(AnalyzeBody, req.body);
    res.json({ item: await studio.analyze(body) });
  });

  // ───────────── Prompts ─────────────

  r.post("/prompts/enhance", async (req, res) => {
    const body = parse(EnhanceBody, req.body);
    res.json(await studio.enhance(body.prompt, body.options as Parameters<StudioService["enhance"]>[1], body.engineId));
  });

  r.post("/prompts/translate", async (req, res) => {
    const body = parse(z.object({ text: z.string().max(10000), target: Lang, engineId: z.string().optional() }), req.body);
    res.json(await studio.translate(body.text, body.target, body.engineId));
  });

  r.post("/prompts/rewrite", async (req, res) => {
    const body = parse(z.object({ text: z.string().max(10000), mode: z.enum(["reecrire", "enrichir"]), engineId: z.string().optional() }), req.body);
    res.json(await studio.rewrite(body.text, body.mode, body.engineId));
  });

  r.post("/prompts/series", async (req, res) => {
    const body = parse(
      z.object({
        story: z.string().max(6000),
        count: z.number().int().min(2).max(12).default(4),
        character: z.string().max(3000).default(""),
        style: Style.default("aucun"),
        vertical: z.boolean().default(false),
        language: Lang.default("en"),
        engineId: z.string().optional(),
      }),
      req.body,
    );
    res.json(await studio.series(body, body.engineId));
  });

  r.post("/prompts/character", async (req, res) => {
    const body = parse(z.object({ image: z.string().min(1), language: Lang.default("en"), engineId: z.string().optional() }), req.body);
    res.json(await studio.character(body.image, body.language, body.engineId));
  });

  // ───────────── Bibliothèque ─────────────

  r.get("/library", async (req, res) => {
    const q = req.query;
    const type = typeof q.type === "string" && ["image", "analysis", "prompt"].includes(q.type) ? (q.type as ItemType) : undefined;
    res.json(
      await library.list({
        q: typeof q.q === "string" ? q.q.slice(0, 200) : undefined,
        type,
        projectId: typeof q.projectId === "string" ? q.projectId : undefined,
        favorite: q.favorite === "1",
        tag: typeof q.tag === "string" ? q.tag : undefined,
        category: typeof q.category === "string" ? q.category : undefined,
        limit: Number(q.limit) || 100,
        offset: Number(q.offset) || 0,
      }),
    );
  });

  r.get("/library-meta", async (_req, res) => {
    res.json({ tags: await library.tags(), categories: await library.categories(), projects: await library.projects() });
  });

  r.get("/library/:id", async (req, res) => {
    res.json({ item: await library.get(req.params.id) });
  });

  r.patch("/library/:id", async (req, res) => {
    res.json({ item: await library.patch(req.params.id, parse(LibraryPatch, req.body)) });
  });

  r.post("/library/prompts", async (req, res) => {
    const body = parse(
      z.object({
        title: z.string().max(200).default(""),
        prompt: z.string().trim().min(1, "Le prompt est vide.").max(20000),
        negativePrompt: z.string().max(5000).default(""),
        tags: z.array(z.string()).max(50).default([]),
        notes: z.string().max(10000).default(""),
        category: z.string().max(60).default(""),
        favorite: z.boolean().default(true),
        projectId: z.string().nullable().optional(),
      }),
      req.body,
    );
    const item = await library.add({
      type: "prompt",
      ...body,
      title: body.title.trim() || body.prompt.slice(0, 70),
      projectId: body.projectId ?? null,
    });
    res.status(201).json({ item });
  });

  r.post("/library/bulk", async (req, res) => {
    const body = parse(
      z.object({
        ids: z.array(Id).min(1).max(1000),
        projectId: z.string().nullable().optional(),
        favorite: z.boolean().optional(),
        addTags: z.array(z.string()).max(20).optional(),
      }),
      req.body,
    );
    let updated = 0;
    for (const id of body.ids) {
      const item = await library.get(id);
      await library.patch(id, {
        ...(body.projectId !== undefined ? { projectId: body.projectId } : {}),
        ...(body.favorite !== undefined ? { favorite: body.favorite } : {}),
        ...(body.addTags ? { tags: [...item.tags, ...body.addTags] } : {}),
      });
      updated++;
    }
    res.json({ updated });
  });

  r.post("/library/delete", async (req, res) => {
    const { ids } = parse(z.object({ ids: z.array(Id).min(1, "Aucun élément sélectionné.").max(5000) }), req.body);
    res.json({ deleted: await library.remove(ids) });
  });

  r.post("/library/download", async (req, res) => {
    const { ids } = parse(z.object({ ids: z.array(Id).min(1, "Aucun élément sélectionné.").max(1000) }), req.body);
    const files: Zippable = {};
    const lines: string[] = [];
    for (const id of ids) {
      const item = await library.get(id);
      const base = downloadName(item.title, item.id);
      lines.push(`## ${item.title || item.id}`, `Type : ${item.type}`, `Prompt : ${item.prompt}`);
      if (item.negativePrompt) lines.push(`Prompt négatif : ${item.negativePrompt}`);
      if (item.analysis) {
        const p = item.analysis.prompts;
        lines.push(`Prompt détaillé : ${p.detailed}`, `Prompt court : ${p.short}`, `Prompt cinématographique : ${p.cinematic}`);
      }
      lines.push("");
      if (item.file) {
        try {
          files[`${base}.${extensionFor(item.file.mime as ImageMime)}`] = [await library.readFile(item.file.name), { level: 0 }];
        } catch {
          // image manquante : on garde au moins le prompt
        }
      }
    }
    files["prompts.txt"] = strToU8(lines.join("\n"));
    const zip = zipSync(files);
    res.setHeader("content-type", "application/zip");
    res.setHeader("content-disposition", contentDisposition(`studio-ia-selection-${dateStamp()}.zip`));
    res.end(Buffer.from(zip));
  });

  // ───────────── Projets ─────────────

  r.get("/projects", async (_req, res) => {
    res.json({ projects: await library.projects() });
  });
  r.post("/projects", async (req, res) => {
    const { name } = parse(z.object({ name: z.string() }), req.body);
    res.status(201).json({ project: await library.createProject(name) });
  });
  r.patch("/projects/:id", async (req, res) => {
    const { name } = parse(z.object({ name: z.string() }), req.body);
    res.json({ project: await library.renameProject(req.params.id, name) });
  });
  r.delete("/projects/:id", async (req, res) => {
    await library.deleteProject(req.params.id);
    res.json({ ok: true });
  });

  // ───────────── Fichiers ─────────────

  r.get("/files/:name", async (req: Request, res: Response) => {
    const name = String(req.params.name);
    const data = await library.readFile(name);
    const ext = name.split(".").pop();
    res.setHeader("content-type", ext === "png" ? "image/png" : ext === "jpg" ? "image/jpeg" : "image/webp");
    res.setHeader("cache-control", "private, max-age=31536000, immutable");
    if (req.query.download === "1") {
      const title = typeof req.query.title === "string" ? req.query.title : "image";
      res.setHeader("content-disposition", contentDisposition(`${downloadName(title, name)}.${ext}`));
    }
    res.end(data);
  });

  // ───────────── Sauvegarde ─────────────

  r.get("/backup", async (_req, res) => {
    const { zip } = await createBackup(library);
    res.setHeader("content-type", "application/zip");
    res.setHeader("content-disposition", contentDisposition(`studio-ia-sauvegarde-${dateStamp()}.zip`));
    res.end(Buffer.from(zip));
  });

  r.post("/restore", express.raw({ type: ["application/zip", "application/octet-stream"], limit: "2gb" }), async (req, res) => {
    const mode = req.query.mode === "remplacement" ? "remplacement" : "fusion";
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw badRequest("Aucun fichier de sauvegarde reçu.");
    res.json(await restoreBackup(library, new Uint8Array(req.body), mode));
  });

  return r;
}

export function downloadName(title: string, id: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return `studio-ia-${slug || "image"}-${id.slice(0, 8)}`;
}

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}
