import type { EngineSettings } from "../config.js";
import { AppError } from "../lib/errors.js";
import { httpJson, joinUrl } from "../lib/http.js";
import { sniffImageMime } from "../lib/images.js";
import type { StyleId } from "../shared/types.js";
import type { EngineStatus, GenerateRequest, GenerateResult, GeneratedImage, ImageEngine, ImageInput } from "./types.js";

const PROVIDER = "Stability AI";

interface StabilityImageResponse {
  image?: string;
  finish_reason?: string;
  seed?: number;
}

/** Préréglages de style natifs de Stable Image Core, quand il existe une correspondance claire. */
const STYLE_PRESETS: Partial<Record<StyleId, string>> = {
  photorealiste: "photographic",
  cinematographique: "cinematic",
  "3d": "3d-model",
  cartoon: "comic-book",
  anime: "anime",
  illustration: "digital-art",
  crayon: "line-art",
};

/**
 * Stability AI — API « Stable Image » (v2beta).
 * - core / ultra : /v2beta/stable-image/generate/{core|ultra}
 * - sd3.x : /v2beta/stable-image/generate/sd3 (avec image de référence possible)
 * - agrandissement ×4 : /v2beta/stable-image/upscale/fast
 */
export class StabilityEngine implements ImageEngine {
  readonly id = "stability";

  describe(s: EngineSettings) {
    return {
      id: this.id,
      name: "Stability AI",
      vendor: "Stability AI",
      kind: "api" as const,
      capabilities: ["generate" as const, "reference" as const, "negative" as const, "seed" as const, "upscale" as const],
      configured: s.stabilityApiKey !== "",
      model: s.stabilityModel,
      pricing: {
        paid: true,
        summary:
          "Service payant à crédits (1 crédit ≈ 0,01 $). Barème relevé en 2026, à vérifier : Stable Image Core ≈ 3 crédits par image, Ultra ≈ 8, agrandissement rapide ≈ 2. Une image de référence utilise SD 3.5 (≈ 6,5 crédits).",
        url: "https://platform.stability.ai/pricing",
      },
      setupHint: "Créez une clé sur platform.stability.ai (Account › API Keys), puis renseignez STABILITY_API_KEY.",
      docsUrl: "https://platform.stability.ai/docs/api-reference",
      limits: {
        maxImages: 4,
        qualities: ["standard"] as Array<"standard">,
        advanced: ["seed", "strength"] as Array<"seed" | "strength">,
        notes: [
          "Une requête par image : 4 images = 4 fois le coût unitaire.",
          "Avec une image de référence, le format de sortie suit celui de la référence.",
        ],
      },
    };
  }

  private headers(s: EngineSettings): Record<string, string> {
    return { authorization: `Bearer ${s.stabilityApiKey}`, accept: "application/json" };
  }

  async probe(s: EngineSettings): Promise<EngineStatus> {
    if (!s.stabilityApiKey) return { available: false, message: "Clé API non renseignée." };
    try {
      const bal = await httpJson<{ credits?: number }>(
        joinUrl(s.stabilityBaseUrl, "/v1/user/balance"),
        { method: "GET", headers: this.headers(s) },
        { provider: PROVIDER, timeoutMs: 15_000 },
      );
      const credits = typeof bal.credits === "number" ? ` — solde : ${bal.credits.toFixed(1)} crédits` : "";
      return { available: true, message: `Connecté — modèle ${s.stabilityModel}${credits}.` };
    } catch (err) {
      return { available: false, message: err instanceof AppError ? err.message : "Vérification impossible." };
    }
  }

  async generate(s: EngineSettings, req: GenerateRequest): Promise<GenerateResult> {
    if (!s.stabilityApiKey) throw new AppError(503, "moteur_non_configure", "Stability AI n'est pas configuré : aucune clé API.");
    const notes: string[] = [];
    const isSd3 = s.stabilityModel.startsWith("sd3");
    let endpoint: string;
    let model = s.stabilityModel;
    if (req.reference) {
      // L'image-à-image passe par l'API SD 3.5.
      model = isSd3 ? s.stabilityModel : "sd3.5-large";
      endpoint = "/v2beta/stable-image/generate/sd3";
      if (!isSd3) notes.push(`Image de référence : génération avec ${model} (Stable Image ${s.stabilityModel} ne l'accepte pas).`);
    } else if (isSd3) {
      endpoint = "/v2beta/stable-image/generate/sd3";
    } else if (s.stabilityModel === "core" || s.stabilityModel === "ultra") {
      endpoint = `/v2beta/stable-image/generate/${s.stabilityModel}`;
    } else {
      throw new AppError(400, "modele_inconnu", `Modèle Stability inconnu : « ${s.stabilityModel} ».`, "Valeurs possibles : core, ultra, sd3.5-large, sd3.5-large-turbo, sd3.5-medium.");
    }

    const count = Math.min(4, Math.max(1, req.count));
    const images: GeneratedImage[] = [];
    let filtered = 0;
    for (let i = 0; i < count; i++) {
      const form = new FormData();
      form.append("prompt", req.prompt);
      if (req.negativePrompt.trim()) form.append("negative_prompt", req.negativePrompt.trim());
      form.append("output_format", "png");
      if (req.seed !== null) form.append("seed", String((req.seed + i) % 4_294_967_295));
      if (endpoint.endsWith("/sd3")) form.append("model", model);
      if (req.reference) {
        form.append("mode", "image-to-image");
        form.append("strength", String(clamp(req.strength ?? 0.6, 0, 1)));
        form.append("image", new Blob([new Uint8Array(req.reference.data)], { type: req.reference.mime }), "reference");
      } else {
        form.append("aspect_ratio", req.aspectRatio);
        const preset = STYLE_PRESETS[req.style];
        if (preset && s.stabilityModel === "core") form.append("style_preset", preset);
      }
      const res = await httpJson<StabilityImageResponse>(
        joinUrl(s.stabilityBaseUrl, endpoint),
        { method: "POST", headers: this.headers(s), body: form },
        { provider: PROVIDER, timeoutMs: s.timeoutApiMs },
      );
      if (res.finish_reason === "CONTENT_FILTERED") {
        filtered++;
        continue;
      }
      const img = decode(res);
      if (img) images.push(img);
    }
    if (filtered) notes.push(`${filtered} image(s) bloquée(s) par le filtre de contenu de Stability AI.`);
    if (!images.length) {
      throw new AppError(
        422,
        "contenu_filtre",
        filtered ? "Stability AI a bloqué le résultat (filtre de contenu)." : "Stability AI n'a renvoyé aucune image.",
        "Reformulez le prompt.",
      );
    }
    return { images, model, sentPrompt: req.prompt, notes };
  }

  async upscale(s: EngineSettings, image: ImageInput) {
    if (!s.stabilityApiKey) throw new AppError(503, "moteur_non_configure", "Stability AI n'est pas configuré.");
    if (image.width * image.height > 1024 * 1024 * 1.05) {
      throw new AppError(
        400,
        "image_trop_grande",
        `L'agrandissement rapide de Stability AI accepte jusqu'à environ 1 mégapixel (image actuelle : ${image.width}×${image.height}).`,
      );
    }
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(image.data)], { type: image.mime }), "image");
    form.append("output_format", "png");
    const res = await httpJson<StabilityImageResponse>(
      joinUrl(s.stabilityBaseUrl, "/v2beta/stable-image/upscale/fast"),
      { method: "POST", headers: this.headers(s), body: form },
      { provider: PROVIDER, timeoutMs: s.timeoutApiMs },
    );
    const img = decode(res);
    if (!img) throw new AppError(502, "aucune_image", "Stability AI n'a pas renvoyé l'image agrandie.");
    return { ...img, model: "upscale/fast", factor: 4 };
  }
}

function decode(res: StabilityImageResponse): GeneratedImage | null {
  if (!res.image) return null;
  const data = Buffer.from(res.image, "base64");
  const mime = sniffImageMime(data);
  return mime ? { data, mime, seed: typeof res.seed === "number" ? res.seed : null } : null;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
