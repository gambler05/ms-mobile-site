import type { EngineSettings } from "../config.js";
import { AppError } from "../lib/errors.js";
import { httpJson, httpRequest, joinUrl } from "../lib/http.js";
import { sniffImageMime } from "../lib/images.js";
import type { AspectRatio, QualityId } from "../shared/types.js";
import type { EngineStatus, GenerateRequest, GenerateResult, GeneratedImage, ImageEngine } from "./types.js";

const PROVIDER = "OpenAI Images";

interface ImagesResponse {
  data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
}
interface ModelsResponse {
  data?: Array<{ id: string }>;
}

/** Tailles d'environ 1 mégapixel, multiples de 16, pour les modèles gpt-image récents. */
const FLEXIBLE_SIZES: Record<AspectRatio, string> = {
  "1:1": "1024x1024",
  "3:2": "1536x1024",
  "16:9": "1536x864",
  "9:16": "864x1536",
  "4:5": "1024x1280",
};
/** Tailles historiques acceptées par tous les modèles gpt-image. */
const LEGACY_SIZES: Record<AspectRatio, string> = {
  "1:1": "1024x1024",
  "3:2": "1536x1024",
  "16:9": "1536x1024",
  "9:16": "1024x1536",
  "4:5": "1024x1536",
};
const QUALITY: Record<QualityId, string> = { brouillon: "low", standard: "medium", haute: "high" };

/**
 * Génération d'images avec l'API Images d'OpenAI (modèles gpt-image).
 * - texte → image : POST /images/generations
 * - image de référence / variantes : POST /images/edits
 */
export class OpenAIImageEngine implements ImageEngine {
  readonly id = "openai";

  describe(s: EngineSettings) {
    return {
      id: this.id,
      name: "OpenAI Images",
      vendor: "OpenAI",
      kind: "api" as const,
      capabilities: ["generate" as const, "reference" as const],
      configured: s.openaiApiKey !== "",
      model: s.openaiImageModel,
      pricing: {
        paid: true,
        summary:
          "Service payant, facturé par OpenAI selon le modèle, la taille et la qualité. Ordre de grandeur relevé en novembre 2026 (à vérifier sur la grille officielle) : d'environ 0,01 $ par image en qualité basse à environ 0,20 $ en haute qualité.",
        url: "https://openai.com/api/pricing/",
      },
      setupHint:
        "Créez une clé sur platform.openai.com (la génération d'images peut exiger une vérification de l'organisation), puis renseignez OPENAI_API_KEY.",
      docsUrl: "https://platform.openai.com/docs/guides/image-generation",
      limits: {
        maxImages: 4,
        qualities: ["brouillon", "standard", "haute"] as QualityId[],
        advanced: ["strength"] as Array<"strength">,
        notes: [
          "Pas de prompt négatif natif : les éléments à éviter sont ajoutés à la fin du prompt (« Avoid: … »).",
          "Pas de graine (seed) : chaque génération est unique.",
          s.openaiFlexibleSizes
            ? "Tailles exactes par format (≈ 1 mégapixel)."
            : "Tailles historiques : 16:9 et 4:5 sont approchés par 3:2 et 2:3.",
        ],
      },
    };
  }

  async probe(s: EngineSettings): Promise<EngineStatus> {
    if (!s.openaiApiKey) return { available: false, message: "Clé API non renseignée." };
    try {
      const list = await httpJson<ModelsResponse>(
        joinUrl(s.openaiBaseUrl, "/models"),
        { method: "GET", headers: this.headers(s) },
        { provider: PROVIDER, timeoutMs: 15_000 },
      );
      const models = (list.data ?? []).map((m) => m.id).filter((id) => /^(gpt-image|dall-e|chatgpt-image)/.test(id)).sort();
      if (models.length && !models.includes(s.openaiImageModel)) {
        return {
          available: false,
          message: `Clé valide, mais le modèle « ${s.openaiImageModel} » n'est pas disponible pour ce compte. Modèles disponibles : ${models.join(", ")}.`,
          models,
        };
      }
      return { available: true, message: `Connecté — modèle ${s.openaiImageModel}.`, models };
    } catch (err) {
      return { available: false, message: err instanceof AppError ? err.message : "Vérification impossible." };
    }
  }

  private headers(s: EngineSettings): Record<string, string> {
    return { authorization: `Bearer ${s.openaiApiKey}` };
  }

  async generate(s: EngineSettings, req: GenerateRequest): Promise<GenerateResult> {
    if (!s.openaiApiKey) throw new AppError(503, "moteur_non_configure", "OpenAI n'est pas configuré : aucune clé API.");
    const size = (s.openaiFlexibleSizes ? FLEXIBLE_SIZES : LEGACY_SIZES)[req.aspectRatio];
    const prompt = req.negativePrompt.trim() ? `${req.prompt.trim()}\n\nAvoid: ${req.negativePrompt.trim()}` : req.prompt.trim();
    const n = Math.min(4, Math.max(1, req.count));
    const notes: string[] = [];
    if (req.seed !== null) notes.push("La graine (seed) est ignorée : OpenAI ne la prend pas en charge.");

    let res: ImagesResponse;
    const opts = { provider: PROVIDER, timeoutMs: s.timeoutApiMs };
    try {
      if (req.reference) {
        const form = new FormData();
        form.append("model", s.openaiImageModel);
        form.append("prompt", prompt);
        form.append("n", String(n));
        form.append("size", size);
        form.append("quality", QUALITY[req.quality]);
        const ext = req.reference.mime.split("/")[1];
        form.append("image", new Blob([new Uint8Array(req.reference.data)], { type: req.reference.mime }), `reference.${ext}`);
        res = await httpJson<ImagesResponse>(joinUrl(s.openaiBaseUrl, "/images/edits"), { method: "POST", headers: this.headers(s), body: form }, opts);
      } else {
        res = await httpJson<ImagesResponse>(
          joinUrl(s.openaiBaseUrl, "/images/generations"),
          {
            method: "POST",
            headers: { ...this.headers(s), "content-type": "application/json" },
            body: JSON.stringify({ model: s.openaiImageModel, prompt, n, size, quality: QUALITY[req.quality], output_format: "png" }),
          },
          opts,
        );
      }
    } catch (err) {
      if (err instanceof AppError && err.status === 400 && /size/i.test(err.message) && s.openaiFlexibleSizes) {
        throw new AppError(
          400,
          "taille_refusee",
          `Le modèle ${s.openaiImageModel} refuse la taille ${size}.`,
          "Réglez OPENAI_FLEXIBLE_SIZES=false (Paramètres › Moteurs) pour utiliser les tailles historiques.",
        );
      }
      throw err;
    }

    const images: GeneratedImage[] = [];
    for (const item of res.data ?? []) {
      let data: Buffer | null = null;
      if (item.b64_json) data = Buffer.from(item.b64_json, "base64");
      else if (item.url) data = Buffer.from(await (await httpRequest(item.url, { method: "GET" }, opts)).arrayBuffer());
      if (!data) continue;
      const mime = sniffImageMime(data);
      if (!mime) continue;
      images.push({ data, mime, seed: null });
    }
    if (!images.length) {
      throw new AppError(502, "aucune_image", "OpenAI n'a renvoyé aucune image exploitable.", "Le contenu a peut-être été filtré par la modération du fournisseur.");
    }
    return { images, model: s.openaiImageModel, sentPrompt: prompt, notes };
  }
}
