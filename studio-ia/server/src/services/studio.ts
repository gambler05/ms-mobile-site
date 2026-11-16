import { AppError, badRequest } from "../lib/errors.js";
import { decodeAndValidateImage, describeAspectRatio, type ValidatedImage, validateImageBuffer } from "../lib/images.js";
import type { EngineRegistry } from "../engines/registry.js";
import type { GenerateRequest, ImageInput } from "../engines/types.js";
import {
  AnalysisSchema,
  CharacterSheetSchema,
  EnhanceResultSchema,
  SeriesResultSchema,
  TextResultSchema,
} from "../shared/schemas.js";
import type { GenerationParams, LibraryItem, StyleId } from "../shared/types.js";
import type { Library } from "../store/library.js";
import type { UsageStore } from "../store/usage.js";
import {
  analysisSystem,
  analysisUserText,
  characterSystem,
  ENHANCE_SYSTEM,
  type EnhanceOptions,
  enhanceUserText,
  type PromptLanguage,
  REWRITE_SYSTEMS,
  SERIES_SYSTEM,
  seriesUserText,
  translateSystem,
} from "./instructions.js";
import { applyStyle } from "./styles.js";

/** Limite simple de concurrence : évite de saturer un moteur (et la facture). */
class Semaphore {
  private active = 0;
  private waiting: Array<() => void> = [];
  constructor(private readonly max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

export interface GenerateInput extends GenerationParams {
  /** Image de référence importée (data URL) — facultative. */
  reference?: string | null;
  /** Ou bien : image de référence prise dans la bibliothèque. */
  referenceItemId?: string | null;
  projectId?: string | null;
}

export interface AnalyzeInput {
  engineId?: string;
  image: string;
  analysisImage?: string | null;
  palette: string[];
  promptLanguage: PromptLanguage;
  notes: string;
  projectId?: string | null;
}

const MAX_VISION_BYTES = 5 * 1024 * 1024;

export class StudioService {
  private readonly locks = new Map<string, Semaphore>();

  constructor(
    readonly library: Library,
    readonly engines: EngineRegistry,
    readonly usage: UsageStore,
  ) {}

  private lock(engineId: string): Semaphore {
    let s = this.locks.get(engineId);
    if (!s) this.locks.set(engineId, (s = new Semaphore(2)));
    return s;
  }

  // ───────────────────────────── Génération ─────────────────────────────

  async generate(input: GenerateInput): Promise<{ items: LibraryItem[]; notes: string[] }> {
    let reference: ValidatedImage | null = null;
    let referenceFile: string | null = null;
    if (input.reference) {
      reference = decodeAndValidateImage(input.reference, "L'image de référence");
    } else if (input.referenceItemId) {
      const ref = await this.library.get(input.referenceItemId);
      if (!ref.file) throw badRequest("L'élément choisi comme référence n'a pas d'image.");
      reference = validateImageBuffer(await this.library.readFile(ref.file.name), "L'image de référence");
      referenceFile = ref.file.name;
    }
    return this.runGeneration(input, reference, referenceFile, "generation", null);
  }

  /** Relance une génération avec exactement les mêmes paramètres (nouvelle graine). */
  async regenerate(itemId: string): Promise<{ items: LibraryItem[]; notes: string[] }> {
    const item = await this.library.get(itemId);
    if (!item.generation) throw badRequest("Cet élément n'est pas une image générée.");
    const g = item.generation;
    let reference: ValidatedImage | null = null;
    if (g.referenceFile) reference = validateImageBuffer(await this.library.readFile(g.referenceFile), "L'image de référence");
    return this.runGeneration(
      { ...pickParams(g), count: 1, seed: null, projectId: item.projectId },
      reference,
      g.referenceFile,
      "generation",
      null,
    );
  }

  /** Crée des variantes d'une image en la réutilisant comme référence. */
  async variations(itemId: string, count: number, engineId?: string): Promise<{ items: LibraryItem[]; notes: string[] }> {
    const item = await this.library.get(itemId);
    if (!item.file) throw badRequest("Cet élément n'a pas d'image.");
    const source = validateImageBuffer(await this.library.readFile(item.file.name), "L'image source");
    const g = item.generation;
    const params: GenerateInput = {
      ...(g ? pickParams(g) : defaultParams(item.prompt, item.negativePrompt)),
      engineId: engineId ?? g?.engineId ?? "",
      count,
      seed: null,
      strength: g?.strength ?? 0.55,
      projectId: item.projectId,
    };
    if (!params.engineId) throw badRequest("Choisissez un moteur de génération pour créer des variantes.");
    if (!params.prompt.trim()) throw badRequest("Cette image n'a pas de prompt associé : impossible de créer des variantes.");
    return this.runGeneration(params, source, item.file.name, "variante", item.id);
  }

  private async runGeneration(
    input: GenerateInput,
    reference: ValidatedImage | null,
    referenceFile: string | null,
    operation: "generation" | "variante",
    parentId: string | null,
  ): Promise<{ items: LibraryItem[]; notes: string[] }> {
    const { engine, settings, info } = await this.engines.imageEngine(input.engineId);
    if (reference && !info.capabilities.includes("reference")) {
      throw badRequest(`${info.name} n'accepte pas d'image de référence.`);
    }
    const count = Math.min(info.limits?.maxImages ?? 4, Math.max(1, Math.round(input.count)));
    await this.usage.assertCanGenerate(count);

    const finalPrompt = applyStyle(input.prompt, input.style);
    const req: GenerateRequest = {
      prompt: finalPrompt,
      negativePrompt: input.negativePrompt ?? "",
      style: input.style,
      aspectRatio: input.aspectRatio,
      quality: input.quality,
      count,
      seed: input.seed ?? null,
      steps: input.steps ?? null,
      guidance: input.guidance ?? null,
      reference: reference ? toInput(reference) : null,
      strength: input.strength ?? null,
    };
    const result = await this.lock(engine.id).run(() => engine.generate(settings, req));

    if (reference && !referenceFile) {
      referenceFile = (await this.library.saveFile(reference.data, reference.mime, reference.width, reference.height)).name;
    }
    const items: LibraryItem[] = [];
    for (const img of result.images) {
      const checked = validateImageBuffer(img.data, "L'image générée");
      const file = await this.library.saveFile(checked.data, checked.mime, checked.width, checked.height);
      items.push(
        await this.library.add({
          type: "image",
          title: titleFrom(input.prompt),
          prompt: input.prompt,
          negativePrompt: input.negativePrompt ?? "",
          file,
          projectId: input.projectId ?? null,
          parentId,
          generation: {
            ...pickParams(input),
            count,
            engineName: info.name,
            model: result.model,
            finalPrompt: result.sentPrompt,
            seed: img.seed,
            referenceFile,
            operation,
          },
        }),
      );
    }
    await this.usage.record(engine.id, items.length);
    return { items, notes: result.notes };
  }

  async upscale(itemId: string, engineId?: string): Promise<LibraryItem> {
    const item = await this.library.get(itemId);
    if (!item.file) throw badRequest("Cet élément n'a pas d'image à agrandir.");
    const source = validateImageBuffer(await this.library.readFile(item.file.name), "L'image");
    const { engine, settings, info } = await this.engines.upscaleEngine(engineId);
    const out = await this.lock(engine.id).run(() => engine.upscale!(settings, toInput(source)));
    const checked = validateImageBuffer(out.data, "L'image agrandie");
    const file = await this.library.saveFile(checked.data, checked.mime, checked.width, checked.height);
    const g = item.generation;
    return this.library.add({
      type: "image",
      title: `${item.title || "Image"} (agrandie ×${out.factor})`,
      prompt: item.prompt,
      negativePrompt: item.negativePrompt,
      file,
      projectId: item.projectId,
      parentId: item.id,
      tags: item.tags,
      generation: {
        ...(g ? pickParams(g) : defaultParams(item.prompt, item.negativePrompt)),
        engineId: engine.id,
        engineName: info.name,
        model: out.model,
        finalPrompt: g?.finalPrompt ?? item.prompt,
        seed: g?.seed ?? null,
        referenceFile: null,
        operation: "agrandissement",
      },
    });
  }

  // ───────────────────────────── Analyse ─────────────────────────────

  async analyze(input: AnalyzeInput): Promise<LibraryItem> {
    const original = decodeAndValidateImage(input.image, "L'image importée");
    const forModel = input.analysisImage ? decodeAndValidateImage(input.analysisImage, "L'image d'analyse") : original;
    if (forModel.bytes > MAX_VISION_BYTES) {
      throw badRequest(
        "L'image est trop lourde pour être analysée (5 Mo maximum envoyés au modèle).",
        "Rechargez la page : l'interface réduit normalement l'image automatiquement avant l'analyse.",
      );
    }
    const palette = (input.palette ?? []).filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 8);
    const aspect = describeAspectRatio(original.width, original.height);
    const { engine, settings, info } = await this.engines.visionTextEngine(input.engineId, "vision");
    const { data, model } = await this.lock(engine.id).run(() =>
      engine.structured(settings, {
        system: analysisSystem(input.promptLanguage),
        text: analysisUserText({
          width: original.width,
          height: original.height,
          ratio: aspect.exact,
          nearest: aspect.nearest,
          orientation: aspect.orientation,
          palette,
          notes: input.notes ?? "",
        }),
        image: toInput(forModel),
        schema: AnalysisSchema,
        schemaName: "analyse_image",
      }),
    );
    const file = await this.library.saveFile(original.data, original.mime, original.width, original.height);
    return this.library.add({
      type: "analysis",
      title: titleFrom(data.subjects.main || data.prompts.short),
      prompt: data.prompts.professional,
      negativePrompt: data.prompts.negative,
      file,
      analysis: data,
      analysisMeta: { engineName: info.name, model, promptLanguage: input.promptLanguage, palette, aspect },
      projectId: input.projectId ?? null,
    });
  }

  // ───────────────────────────── Prompts ─────────────────────────────

  async enhance(prompt: string, options: EnhanceOptions, engineId?: string) {
    if (!prompt.trim()) throw badRequest("Écrivez d'abord une idée ou un prompt à améliorer.");
    const { engine, settings, info } = await this.engines.visionTextEngine(engineId, "text");
    const { data, model } = await engine.structured(settings, {
      system: ENHANCE_SYSTEM,
      text: enhanceUserText(prompt, options),
      schema: EnhanceResultSchema,
      schemaName: "prompt_ameliore",
    });
    return { ...data, engineName: info.name, model };
  }

  async translate(text: string, target: PromptLanguage, engineId?: string) {
    if (!text.trim()) throw badRequest("Il n'y a rien à traduire.");
    const { engine, settings, info } = await this.engines.visionTextEngine(engineId, "text");
    const { data, model } = await engine.structured(settings, {
      system: translateSystem(target),
      text: `Texte à traduire :\n"""\n${text.trim()}\n"""`,
      schema: TextResultSchema,
      schemaName: "traduction",
    });
    return { text: data.text, engineName: info.name, model };
  }

  async rewrite(text: string, mode: keyof typeof REWRITE_SYSTEMS, engineId?: string) {
    if (!text.trim()) throw badRequest("Écrivez d'abord un prompt.");
    const { engine, settings, info } = await this.engines.visionTextEngine(engineId, "text");
    const { data, model } = await engine.structured(settings, {
      system: REWRITE_SYSTEMS[mode],
      text: `Prompt :\n"""\n${text.trim()}\n"""`,
      schema: TextResultSchema,
      schemaName: mode,
    });
    return { text: data.text, engineName: info.name, model };
  }

  async series(input: { story: string; count: number; character: string; style: StyleId; vertical: boolean; language: PromptLanguage }, engineId?: string) {
    if (!input.story.trim()) throw badRequest("Décrivez l'histoire ou la scène à décliner.");
    const { engine, settings, info } = await this.engines.visionTextEngine(engineId, "text");
    const { data, model } = await engine.structured(settings, {
      system: SERIES_SYSTEM,
      text: seriesUserText(input),
      schema: SeriesResultSchema,
      schemaName: "serie",
    });
    if (!data.scenes.length) throw new AppError(502, "reponse_incomplete", "Le moteur n'a proposé aucune scène.", "Réessayez.");
    return { ...data, scenes: data.scenes.slice(0, input.count), engineName: info.name, model };
  }

  async character(image: string, language: PromptLanguage, engineId?: string) {
    const img = decodeAndValidateImage(image, "L'image du personnage");
    if (img.bytes > MAX_VISION_BYTES) throw badRequest("L'image du personnage est trop lourde (5 Mo maximum).");
    const { engine, settings, info } = await this.engines.visionTextEngine(engineId, "vision");
    const { data, model } = await engine.structured(settings, {
      system: characterSystem(language),
      text: "Rédige la fiche du personnage principal visible sur cette image.",
      image: toInput(img),
      schema: CharacterSheetSchema,
      schemaName: "fiche_personnage",
    });
    return { ...data, engineName: info.name, model };
  }
}

function toInput(img: ValidatedImage): ImageInput {
  return { data: img.data, mime: img.mime, width: img.width, height: img.height };
}

function pickParams(p: GenerationParams): GenerationParams {
  return {
    engineId: p.engineId,
    prompt: p.prompt,
    negativePrompt: p.negativePrompt ?? "",
    style: p.style,
    aspectRatio: p.aspectRatio,
    quality: p.quality,
    count: p.count,
    seed: p.seed ?? null,
    steps: p.steps ?? null,
    guidance: p.guidance ?? null,
    strength: p.strength ?? null,
  };
}

function defaultParams(prompt: string, negativePrompt: string): GenerationParams {
  return {
    engineId: "",
    prompt,
    negativePrompt,
    style: "aucun",
    aspectRatio: "1:1",
    quality: "standard",
    count: 1,
    seed: null,
    steps: null,
    guidance: null,
    strength: null,
  };
}

export function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 70) return clean;
  const cut = clean.slice(0, 70);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : 70)}…`;
}
