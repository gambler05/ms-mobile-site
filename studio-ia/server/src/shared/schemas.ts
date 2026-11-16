/**
 * Schémas des réponses structurées demandées aux modèles de vision / texte.
 * Ils servent à la fois à contraindre la sortie du modèle (JSON Schema)
 * et à valider ce qui revient avant de l'afficher.
 * Volontairement simples (chaînes, listes, objets) pour rester compatibles
 * avec tous les moteurs (Claude, Ollama).
 */
import { z } from "zod";

export const StructuredPromptSchema = z.object({
  subject: z.string().describe("Sujet principal et sujets secondaires"),
  setting: z.string().describe("Décor, environnement, objets"),
  composition: z.string().describe("Cadrage, composition, angle de caméra, perspective"),
  lighting: z.string().describe("Éclairage, ombres, reflets"),
  colors: z.string().describe("Palette de couleurs et ambiance"),
  style: z.string().describe("Style artistique, médium, niveau de réalisme"),
  technical: z.string().describe("Détails techniques : objectif, profondeur de champ, format, textures"),
});

export const AnalysisSchema = z.object({
  subjects: z.object({
    main: z.string(),
    secondary: z.array(z.string()),
  }),
  characters: z.array(
    z.object({
      description: z.string(),
      clothing: z.string(),
      expression: z.string(),
      pose: z.string(),
    }),
  ),
  environment: z.object({
    setting: z.string(),
    objects: z.array(z.string()),
  }),
  composition: z.object({
    framing: z.string(),
    layout: z.string(),
  }),
  camera: z.object({
    angle: z.string(),
    perspective: z.string(),
    depthOfField: z.string(),
    lens: z.string(),
  }),
  lighting: z.object({
    type: z.string(),
    direction: z.string(),
    shadows: z.string(),
    reflections: z.string(),
  }),
  colors: z.object({
    dominant: z.array(z.string()),
    mood: z.string(),
  }),
  style: z.object({
    artStyle: z.string(),
    realism: z.string(),
    medium: z.string(),
  }),
  textures: z.array(z.string()),
  visibleText: z.string(),
  keyElements: z.array(z.string()),
  uncertainties: z.array(z.string()),
  prompts: z.object({
    detailed: z.string(),
    professional: z.string(),
    short: z.string(),
    cinematic: z.string(),
    negative: z.string(),
    structured: StructuredPromptSchema,
  }),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export const EnhanceResultSchema = z.object({
  prompt: z.string(),
  negativePrompt: z.string(),
  changes: z.array(z.string()).describe("Liste courte, en français, des améliorations apportées"),
});
export type EnhanceResult = z.infer<typeof EnhanceResultSchema>;

export const TextResultSchema = z.object({ text: z.string() });
export type TextResult = z.infer<typeof TextResultSchema>;

export const SeriesResultSchema = z.object({
  characterSheet: z.string(),
  styleGuide: z.string(),
  scenes: z.array(
    z.object({
      title: z.string(),
      prompt: z.string(),
    }),
  ),
  negativePrompt: z.string(),
});
export type SeriesResult = z.infer<typeof SeriesResultSchema>;

export const CharacterSheetSchema = z.object({
  description: z.string(),
  invariants: z.array(z.string()),
});
export type CharacterSheet = z.infer<typeof CharacterSheetSchema>;
