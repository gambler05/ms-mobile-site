import type { StyleId } from "../shared/types.js";

/**
 * Modificateurs de style ajoutés au prompt lors de la génération.
 * Rédigés en anglais : c'est la langue que les générateurs d'images comprennent le mieux.
 */
export const STYLE_MODIFIERS: Record<StyleId, string> = {
  aucun: "",
  photorealiste: "photorealistic, true-to-life detail, natural skin and material textures, shot on a full-frame camera, sharp focus",
  cinematographique: "cinematic film still, anamorphic lens look, dramatic motivated lighting, shallow depth of field, color graded, subtle film grain",
  "3d": "3D render, physically based materials, global illumination, soft ambient occlusion, crisp clean detail",
  cartoon: "cartoon style, bold clean outlines, flat vibrant colors, expressive simplified shapes",
  anime: "anime style, cel shading, clean line art, vibrant colors, detailed painted background",
  illustration: "digital illustration, refined linework, rich harmonious colors, editorial illustration style",
  peinture: "painting, visible brushstrokes, oil on canvas texture, painterly light and color",
  crayon: "pencil drawing, graphite on textured paper, fine hatching and cross-hatching, monochrome",
  publicite: "commercial advertising photography, controlled studio lighting, clean uncluttered background, hero product shot, high-end retouching",
  architecture: "architectural photography, straight verticals, wide-angle lens, balanced natural light, clean lines and materials",
  "motion-design": "motion design style frame, bold geometric shapes, smooth gradients, vibrant modern palette, clean graphic composition",
};

export function applyStyle(prompt: string, style: StyleId): string {
  const base = prompt.trim().replace(/[\s,.;]+$/, "");
  const mod = STYLE_MODIFIERS[style];
  return mod ? `${base}, ${mod}` : base;
}

/** Options de l'éditeur de prompts (libellés en français, consignes pour le modèle). */
export const LIGHTING_OPTIONS: Record<string, string> = {
  conserver: "",
  "heure-doree": "lumière dorée de fin de journée, soleil bas et chaud",
  "heure-bleue": "heure bleue, lumière froide et douce juste après le coucher du soleil",
  studio: "éclairage de studio maîtrisé (lumière principale douce, contre-jour de séparation)",
  dramatique: "éclairage dramatique en clair-obscur, ombres profondes et contrastées",
  neon: "éclairage néon coloré, reflets saturés, ambiance nocturne urbaine",
  volumetrique: "lumière volumétrique, rayons visibles dans la brume ou la poussière",
  naturel: "lumière naturelle douce et diffuse, rendu fidèle",
  nuit: "scène de nuit, sources de lumière pratiques (lampes, lune), faible luminosité",
};

export const MOOD_OPTIONS: Record<string, string> = {
  conserver: "",
  serein: "ambiance sereine et paisible",
  mysterieux: "ambiance mystérieuse et intrigante",
  epique: "ambiance épique et grandiose",
  joyeux: "ambiance joyeuse, lumineuse et énergique",
  melancolique: "ambiance mélancolique et contemplative",
  inquietant: "ambiance inquiétante et tendue",
  luxueux: "ambiance luxueuse et raffinée",
  onirique: "ambiance onirique et surréaliste",
};
