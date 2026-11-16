/**
 * Types partagés entre le serveur et l'interface.
 * Ce fichier ne contient que des types et des constantes sans dépendance.
 */
import type { Analysis } from "./schemas.js";

export type AspectRatio = "1:1" | "9:16" | "16:9" | "4:5" | "3:2";
export const ASPECT_RATIOS: readonly AspectRatio[] = ["1:1", "9:16", "16:9", "4:5", "3:2"];

export type StyleId =
  | "aucun"
  | "photorealiste"
  | "cinematographique"
  | "3d"
  | "cartoon"
  | "anime"
  | "illustration"
  | "peinture"
  | "crayon"
  | "publicite"
  | "architecture"
  | "motion-design";

export type QualityId = "brouillon" | "standard" | "haute";

export type EngineKind = "api" | "local";

export type Capability =
  | "generate" // texte → image
  | "reference" // image de référence (image-to-image)
  | "negative" // prompt négatif natif
  | "seed" // graine reproductible
  | "upscale" // agrandissement
  | "vision" // analyse d'image
  | "text"; // amélioration / traduction de prompts

export interface EnginePricing {
  paid: boolean;
  /** Résumé en français, honnête et daté. */
  summary: string;
  url?: string;
}

export interface EngineInfo {
  id: string;
  name: string;
  vendor: string;
  kind: EngineKind;
  capabilities: Capability[];
  pricing: EnginePricing;
  /** Le moteur a la configuration minimale (clé ou adresse) pour être utilisé. */
  configured: boolean;
  /** Résultat de la dernière vérification de disponibilité. */
  available: boolean;
  statusMessage: string;
  model?: string;
  models?: string[];
  setupHint: string;
  docsUrl?: string;
  /** Contraintes utiles à l'interface (formats, nombre d'images, options avancées). */
  limits?: {
    maxImages: number;
    qualities: QualityId[];
    advanced: Array<"seed" | "steps" | "guidance" | "strength">;
    notes: string[];
  };
}

export interface StatusResponse {
  engines: EngineInfo[];
  usage: { date: string; images: number; maxImagesPerDay: number };
  version: string;
}

export interface GenerationParams {
  engineId: string;
  prompt: string;
  negativePrompt: string;
  style: StyleId;
  aspectRatio: AspectRatio;
  quality: QualityId;
  count: number;
  seed?: number | null;
  steps?: number | null;
  guidance?: number | null;
  /** Force de transformation de l'image de référence (0 = identique, 1 = libre). */
  strength?: number | null;
}

export interface StoredFile {
  name: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
}

export type ItemType = "image" | "analysis" | "prompt";

export interface LibraryItem {
  id: string;
  type: ItemType;
  createdAt: string;
  updatedAt: string;
  title: string;
  prompt: string;
  negativePrompt: string;
  file: StoredFile | null;
  /** Paramètres de génération (images générées). */
  generation: (GenerationParams & {
    engineName: string;
    model: string;
    finalPrompt: string;
    seed: number | null;
    referenceFile: string | null;
    operation: "generation" | "variante" | "agrandissement";
  }) | null;
  /** Analyse détaillée (images analysées). */
  analysis: Analysis | null;
  analysisMeta: {
    engineName: string;
    model: string;
    promptLanguage: "en" | "fr";
    palette: string[];
    aspect: { exact: string; nearest: string; orientation: string };
  } | null;
  favorite: boolean;
  tags: string[];
  notes: string;
  projectId: string | null;
  category: string;
  parentId: string | null;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export interface LibraryQuery {
  q?: string;
  type?: ItemType;
  projectId?: string;
  favorite?: boolean;
  tag?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; hint?: string };
}

export const STYLE_LABELS: Record<StyleId, string> = {
  aucun: "Aucun",
  photorealiste: "Photoréaliste",
  cinematographique: "Cinématographique",
  "3d": "3D",
  cartoon: "Cartoon",
  anime: "Anime",
  illustration: "Illustration",
  peinture: "Peinture",
  crayon: "Dessin au crayon",
  publicite: "Publicité commerciale",
  architecture: "Architecture",
  "motion-design": "Motion design",
};

export const QUALITY_LABELS: Record<QualityId, string> = {
  brouillon: "Brouillon (rapide)",
  standard: "Standard",
  haute: "Haute qualité",
};
