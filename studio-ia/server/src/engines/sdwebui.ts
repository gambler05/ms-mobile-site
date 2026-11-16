import type { EngineSettings } from "../config.js";
import { AppError } from "../lib/errors.js";
import { httpJson, joinUrl } from "../lib/http.js";
import { sniffImageMime } from "../lib/images.js";
import type { QualityId } from "../shared/types.js";
import { dimensionsFor, type EngineStatus, type GenerateRequest, type GenerateResult, type GeneratedImage, type ImageEngine, type ImageInput } from "./types.js";

const PROVIDER = "Stable Diffusion WebUI";

interface SdModel {
  title: string;
  model_name: string;
}
interface Txt2ImgResponse {
  images?: string[];
  info?: string;
}

const STEPS: Record<QualityId, number> = { brouillon: 16, standard: 28, haute: 40 };

/**
 * Stable Diffusion en local via l'API d'AUTOMATIC1111 / SD WebUI Forge
 * (lancé avec l'option --api). Fonctionne entièrement hors ligne.
 */
export class SdWebUiEngine implements ImageEngine {
  readonly id = "sdwebui";

  describe(s: EngineSettings) {
    return {
      id: this.id,
      name: "Stable Diffusion (local)",
      vendor: "AUTOMATIC1111 / Forge",
      kind: "local" as const,
      capabilities: ["generate" as const, "reference" as const, "negative" as const, "seed" as const, "upscale" as const],
      configured: s.sdwebuiUrl !== "",
      pricing: {
        paid: false,
        summary:
          "Gratuit : tout s'exécute sur votre ordinateur. Carte graphique recommandée (NVIDIA 8 Go+ pour SDXL, 4–6 Go pour SD 1.5). Prévoir 7 Go par modèle SDXL.",
        url: "https://github.com/lllyasviel/stable-diffusion-webui-forge",
      },
      setupHint: `Installez Stable Diffusion WebUI Forge ou AUTOMATIC1111, placez un modèle (.safetensors) dans models/Stable-diffusion, puis lancez-le avec l'option --api. Adresse attendue : ${s.sdwebuiUrl || "http://127.0.0.1:7860"}.`,
      docsUrl: "https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/API",
      limits: {
        maxImages: 4,
        qualities: ["brouillon", "standard", "haute"] as QualityId[],
        advanced: ["seed", "steps", "guidance", "strength"] as Array<"seed" | "steps" | "guidance" | "strength">,
        notes: [
          "Les modèles Stable Diffusion comprennent mieux les prompts en anglais.",
          `Taille de base : ${s.sdwebuiBaseSize} px (SD_WEBUI_BASE_SIZE ; 1024 pour SDXL, 512 pour SD 1.5).`,
        ],
      },
    };
  }

  async probe(s: EngineSettings): Promise<EngineStatus> {
    if (!s.sdwebuiUrl) return { available: false, message: "Adresse de Stable Diffusion WebUI non renseignée." };
    try {
      const models = await httpJson<SdModel[]>(joinUrl(s.sdwebuiUrl, "/sdapi/v1/sd-models"), { method: "GET" }, { provider: PROVIDER, timeoutMs: 4000 });
      if (!Array.isArray(models) || !models.length) {
        return { available: false, message: "WebUI répond mais aucun modèle n'est installé (dossier models/Stable-diffusion vide)." };
      }
      return { available: true, message: `Connecté — ${models.length} modèle(s) installé(s).`, models: models.map((m) => m.title) };
    } catch (err) {
      if (err instanceof AppError && err.status === 404) {
        return { available: false, message: "WebUI répond mais son API est désactivée : relancez-le avec l'option --api." };
      }
      return { available: false, message: `Stable Diffusion WebUI ne répond pas à ${s.sdwebuiUrl}. Est-il lancé avec --api ?` };
    }
  }

  async generate(s: EngineSettings, req: GenerateRequest): Promise<GenerateResult> {
    if (!s.sdwebuiUrl) throw new AppError(503, "moteur_non_configure", "Stable Diffusion WebUI n'est pas configuré.");
    const megapixels = (s.sdwebuiBaseSize * s.sdwebuiBaseSize) / (1024 * 1024);
    const { width, height } = dimensionsFor(req.aspectRatio, megapixels, 8);
    const count = Math.min(4, Math.max(1, req.count));
    const body: Record<string, unknown> = {
      prompt: req.prompt,
      negative_prompt: req.negativePrompt,
      width,
      height,
      steps: req.steps ?? STEPS[req.quality],
      cfg_scale: req.guidance ?? 7,
      seed: req.seed ?? -1,
      batch_size: count,
      n_iter: 1,
      sampler_name: "DPM++ 2M",
      send_images: true,
      save_images: false,
    };
    let path = "/sdapi/v1/txt2img";
    if (req.reference) {
      path = "/sdapi/v1/img2img";
      body.init_images = [req.reference.data.toString("base64")];
      body.denoising_strength = Math.min(1, Math.max(0, req.strength ?? 0.6));
      body.resize_mode = 1; // recadrer pour remplir le format demandé
    }
    const res = await httpJson<Txt2ImgResponse>(
      joinUrl(s.sdwebuiUrl, path),
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
      { provider: PROVIDER, timeoutMs: s.timeoutLocalMs, unreachableHint: `Vérifiez que WebUI est lancé avec --api à ${s.sdwebuiUrl}.` },
    );
    let seeds: number[] = [];
    let modelName = "Stable Diffusion";
    try {
      const info = JSON.parse(res.info ?? "{}") as { all_seeds?: number[]; seed?: number; sd_model_name?: string };
      seeds = info.all_seeds ?? (typeof info.seed === "number" ? [info.seed] : []);
      if (info.sd_model_name) modelName = info.sd_model_name;
    } catch {
      // Les informations sont facultatives.
    }
    const images: GeneratedImage[] = [];
    (res.images ?? []).slice(0, count).forEach((b64, i) => {
      const data = Buffer.from(b64.replace(/^data:[^,]+,/, ""), "base64");
      const mime = sniffImageMime(data);
      if (mime) images.push({ data, mime, seed: seeds[i] ?? null });
    });
    if (!images.length) throw new AppError(502, "aucune_image", "Stable Diffusion WebUI n'a renvoyé aucune image.");
    return { images, model: modelName, sentPrompt: req.prompt, notes: [] };
  }

  async upscale(s: EngineSettings, image: ImageInput) {
    if (!s.sdwebuiUrl) throw new AppError(503, "moteur_non_configure", "Stable Diffusion WebUI n'est pas configuré.");
    const factor = 2;
    const res = await httpJson<{ image?: string }>(
      joinUrl(s.sdwebuiUrl, "/sdapi/v1/extra-single-image"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image: image.data.toString("base64"),
          resize_mode: 0,
          upscaling_resize: factor,
          upscaler_1: s.sdwebuiUpscaler,
        }),
      },
      { provider: PROVIDER, timeoutMs: s.timeoutLocalMs },
    );
    const data = res.image ? Buffer.from(res.image.replace(/^data:[^,]+,/, ""), "base64") : null;
    const mime = data ? sniffImageMime(data) : null;
    if (!data || !mime) throw new AppError(502, "aucune_image", "WebUI n'a pas renvoyé l'image agrandie.");
    return { data, mime, seed: null, model: s.sdwebuiUpscaler, factor };
  }
}
