import { z } from "zod";
import type { EngineSettings } from "../config.js";
import { AppError } from "../lib/errors.js";
import { httpJson, joinUrl } from "../lib/http.js";
import type { EngineStatus, StructuredRequest, VisionTextEngine } from "./types.js";

const PROVIDER = "Ollama";

interface TagsResponse {
  models?: Array<{ name: string; model?: string }>;
}
interface ShowResponse {
  capabilities?: string[];
}
interface ChatResponse {
  model?: string;
  message?: { content?: string };
  done_reason?: string;
}

/**
 * Modèles de vision et de texte exécutés localement par Ollama (https://ollama.com).
 * Fonctionne hors ligne une fois les modèles téléchargés.
 */
export class OllamaEngine implements VisionTextEngine {
  readonly id = "ollama";

  describe(s: EngineSettings) {
    return {
      id: this.id,
      name: "Ollama (local)",
      vendor: "Ollama",
      kind: "local" as const,
      capabilities: ["vision" as const, "text" as const],
      configured: s.ollamaUrl !== "",
      model: s.ollamaVisionModel,
      pricing: {
        paid: false,
        summary:
          "Gratuit : les modèles tournent sur votre ordinateur. Prévoir de l'espace disque (≈ 6 Go pour qwen2.5vl:7b) et idéalement une carte graphique avec 8 Go de mémoire ; sur processeur seul, une analyse peut prendre plusieurs minutes.",
        url: "https://ollama.com/library",
      },
      setupHint: `Installez Ollama (ollama.com), puis exécutez « ollama pull ${s.ollamaVisionModel} ». Adresse attendue : ${s.ollamaUrl || "http://127.0.0.1:11434"}.`,
      docsUrl: "https://github.com/ollama/ollama/blob/main/docs/api.md",
    };
  }

  private textModel(s: EngineSettings): string {
    return s.ollamaTextModel || s.ollamaVisionModel;
  }

  async probe(s: EngineSettings): Promise<EngineStatus> {
    if (!s.ollamaUrl) return { available: false, message: "Adresse d'Ollama non renseignée." };
    let tags: TagsResponse;
    try {
      tags = await httpJson<TagsResponse>(joinUrl(s.ollamaUrl, "/api/tags"), { method: "GET" }, { provider: PROVIDER, timeoutMs: 4000 });
    } catch {
      return { available: false, message: `Ollama ne répond pas à ${s.ollamaUrl}. Est-il lancé ?` };
    }
    const installed = (tags.models ?? []).map((m) => m.name);
    const has = (name: string) => installed.some((n) => n === name || n === `${name}:latest`);
    if (!has(s.ollamaVisionModel)) {
      return {
        available: false,
        message: `Ollama répond, mais le modèle « ${s.ollamaVisionModel} » n'est pas installé. Exécutez : ollama pull ${s.ollamaVisionModel}`,
        models: installed,
      };
    }
    const text = this.textModel(s);
    if (!has(text)) {
      return { available: false, message: `Modèle de texte « ${text} » absent. Exécutez : ollama pull ${text}`, models: installed };
    }
    // Vérifie que le modèle choisi accepte les images (Ollama ≥ 0.6 expose « capabilities »).
    try {
      const show = await httpJson<ShowResponse>(
        joinUrl(s.ollamaUrl, "/api/show"),
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: s.ollamaVisionModel }) },
        { provider: PROVIDER, timeoutMs: 4000 },
      );
      if (Array.isArray(show.capabilities) && !show.capabilities.includes("vision")) {
        return {
          available: false,
          message: `Le modèle « ${s.ollamaVisionModel} » ne sait pas lire les images. Choisissez un modèle de vision (qwen2.5vl, llama3.2-vision, gemma3…).`,
          models: installed,
        };
      }
    } catch {
      // Ancienne version d'Ollama : on ne peut pas vérifier, on fait confiance au nom du modèle.
    }
    return { available: true, message: `Connecté — vision : ${s.ollamaVisionModel}, texte : ${text}.`, models: installed };
  }

  async structured<T extends z.ZodType>(s: EngineSettings, req: StructuredRequest<T>): Promise<{ data: z.infer<T>; model: string }> {
    if (!s.ollamaUrl) throw new AppError(503, "moteur_non_configure", "Ollama n'est pas configuré.", this.describe(s).setupHint);
    const model = req.image ? s.ollamaVisionModel : this.textModel(s);
    const schema = z.toJSONSchema(req.schema, { target: "draft-7", reused: "inline" });
    const userMessage: Record<string, unknown> = {
      role: "user",
      content: `${req.text}\n\nRéponds uniquement avec un objet JSON conforme au schéma demandé.`,
    };
    if (req.image) userMessage.images = [req.image.data.toString("base64")];

    const body = {
      model,
      stream: false,
      format: schema,
      keep_alive: "10m",
      options: { temperature: 0.3, num_ctx: 8192 },
      messages: [{ role: "system", content: req.system }, userMessage],
    };
    const res = await httpJson<ChatResponse>(
      joinUrl(s.ollamaUrl, "/api/chat"),
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
      {
        provider: PROVIDER,
        timeoutMs: s.timeoutLocalMs,
        unreachableHint: `Vérifiez qu'Ollama est lancé et accessible à ${s.ollamaUrl}.`,
      },
    );
    const raw = res.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AppError(
        502,
        "reponse_illisible",
        `Le modèle local « ${model} » n'a pas produit de JSON valide${res.done_reason === "length" ? " (réponse coupée)" : ""}.`,
        "Réessayez, ou choisissez un modèle plus récent (qwen2.5vl:7b, gemma3:12b).",
      );
    }
    const checked = req.schema.safeParse(parsed);
    if (!checked.success) {
      throw new AppError(
        502,
        "reponse_incomplete",
        `Le modèle local « ${model} » a renvoyé une réponse incomplète.`,
        "Réessayez ; les petits modèles locaux respectent parfois mal les formats complexes.",
      );
    }
    return { data: checked.data, model: res.model ?? model };
  }
}
