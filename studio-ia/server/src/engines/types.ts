import type { z } from "zod";
import type { EngineSettings } from "../config.js";
import type { ImageMime } from "../lib/images.js";
import type { AspectRatio, Capability, EngineInfo, QualityId, StyleId } from "../shared/types.js";

export interface ImageInput {
  data: Buffer;
  mime: ImageMime;
  width: number;
  height: number;
}

export interface GeneratedImage {
  data: Buffer;
  mime: ImageMime;
  seed: number | null;
}

export interface GenerateRequest {
  prompt: string;
  negativePrompt: string;
  style: StyleId;
  aspectRatio: AspectRatio;
  quality: QualityId;
  count: number;
  seed: number | null;
  steps: number | null;
  guidance: number | null;
  reference: ImageInput | null;
  strength: number | null;
}

export interface GenerateResult {
  images: GeneratedImage[];
  model: string;
  /** Prompt réellement transmis (utile quand le prompt négatif est intégré au texte). */
  sentPrompt: string;
  notes: string[];
}

export interface EngineStatus {
  available: boolean;
  message: string;
  models?: string[];
}

/** Partie commune à tous les moteurs. */
export interface EngineBase {
  readonly id: string;
  /** Description statique + configuration actuelle (sans appel réseau). */
  describe(settings: EngineSettings): Omit<EngineInfo, "available" | "statusMessage" | "models">;
  /** Vérifie réellement que le moteur répond (appel réseau léger, sans coût). */
  probe(settings: EngineSettings): Promise<EngineStatus>;
}

export interface ImageEngine extends EngineBase {
  generate(settings: EngineSettings, req: GenerateRequest): Promise<GenerateResult>;
  upscale?(settings: EngineSettings, image: ImageInput): Promise<GeneratedImage & { model: string; factor: number }>;
}

export interface StructuredRequest<T extends z.ZodType> {
  system: string;
  text: string;
  image?: ImageInput | null;
  schema: T;
  /** Nom court du schéma (utilisé par certains moteurs). */
  schemaName: string;
}

export interface VisionTextEngine extends EngineBase {
  /** Demande une réponse JSON conforme au schéma ; la réponse est validée. */
  structured<T extends z.ZodType>(settings: EngineSettings, req: StructuredRequest<T>): Promise<{ data: z.infer<T>; model: string }>;
}

export type AnyEngine = ImageEngine | VisionTextEngine;

export function hasCapability(info: { capabilities: Capability[] }, cap: Capability): boolean {
  return info.capabilities.includes(cap);
}

export function isImageEngine(e: AnyEngine): e is ImageEngine {
  return typeof (e as ImageEngine).generate === "function";
}

export function isVisionTextEngine(e: AnyEngine): e is VisionTextEngine {
  return typeof (e as VisionTextEngine).structured === "function";
}

/** Dimensions conseillées pour un format donné, à partir d'une surface cible. */
export function dimensionsFor(aspect: AspectRatio, megapixels: number, multiple: number): { width: number; height: number } {
  const [w, h] = aspect.split(":").map(Number);
  const area = megapixels * 1024 * 1024;
  const width = Math.sqrt((area * w) / h);
  const height = width * (h / w);
  const round = (v: number) => Math.max(multiple, Math.round(v / multiple) * multiple);
  return { width: round(width), height: round(height) };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 4_294_967_294);
}
