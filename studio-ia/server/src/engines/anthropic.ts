import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import type { EngineSettings } from "../config.js";
import { AppError, providerHttpError } from "../lib/errors.js";
import type { EngineStatus, StructuredRequest, VisionTextEngine } from "./types.js";

const PROVIDER = "Claude (Anthropic)";

/**
 * Claude via l'API Anthropic : analyse d'images et ingénierie de prompts.
 * Utilise le SDK officiel, les sorties structurées (JSON Schema) et le repli
 * automatique côté serveur si le modèle décline une demande.
 */
export class AnthropicEngine implements VisionTextEngine {
  readonly id = "claude";
  private client: Anthropic | null = null;
  private clientKey = "";

  describe(s: EngineSettings) {
    return {
      id: this.id,
      name: "Claude",
      vendor: "Anthropic",
      kind: "api" as const,
      capabilities: ["vision" as const, "text" as const],
      configured: s.anthropicApiKey !== "",
      model: s.anthropicModel,
      pricing: {
        paid: true,
        summary:
          "Service payant, facturé à l'usage par Anthropic. Tarif public relevé en novembre 2026 pour Claude Opus 5.5 : 4 $ par million de jetons en entrée et 20 $ par million en sortie. Une analyse d'image coûte en général quelques centimes ; une amélioration de prompt, moins d'un centime à quelques centimes.",
        url: "https://www.anthropic.com/pricing",
      },
      setupHint:
        "Créez une clé API sur console.anthropic.com, puis renseignez-la dans Paramètres › Moteurs ou dans ANTHROPIC_API_KEY (fichier .env).",
      docsUrl: "https://docs.anthropic.com",
    };
  }

  private getClient(s: EngineSettings): Anthropic {
    const key = `${s.anthropicApiKey}|${s.anthropicBaseUrl}|${s.timeoutApiMs}`;
    if (!this.client || this.clientKey !== key) {
      this.client = new Anthropic({
        apiKey: s.anthropicApiKey,
        // On ignore volontairement ANTHROPIC_AUTH_TOKEN et ANTHROPIC_BASE_URL de l'environnement :
        // seule la configuration du studio fait foi.
        authToken: null,
        baseURL: s.anthropicBaseUrl,
        timeout: s.timeoutApiMs,
        maxRetries: 2,
      });
      this.clientKey = key;
    }
    return this.client;
  }

  async probe(s: EngineSettings): Promise<EngineStatus> {
    if (!s.anthropicApiKey) return { available: false, message: "Clé API non renseignée." };
    try {
      const model = await this.getClient(s).models.retrieve(s.anthropicModel, {}, { timeout: 15_000, maxRetries: 0 });
      return { available: true, message: `Connecté — modèle ${model.display_name ?? model.id}.`, models: [model.id] };
    } catch (err) {
      return { available: false, message: mapError(err).message };
    }
  }

  async structured<T extends z.ZodType>(s: EngineSettings, req: StructuredRequest<T>): Promise<{ data: z.infer<T>; model: string }> {
    if (!s.anthropicApiKey) {
      throw new AppError(503, "moteur_non_configure", "Claude n'est pas configuré : aucune clé API.", this.describe(s).setupHint);
    }
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (req.image) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: req.image.mime, data: req.image.data.toString("base64") },
      });
    }
    content.push({ type: "text", text: req.text });

    let response;
    try {
      response = await this.getClient(s).beta.messages.parse({
        model: s.anthropicModel,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: req.system,
        output_config: { effort: s.anthropicEffort, format: betaZodOutputFormat(req.schema) },
        messages: [{ role: "user", content }],
      });
    } catch (err) {
      throw mapError(err);
    }

    if (response.stop_reason === "refusal") {
      throw new AppError(
        422,
        "demande_declinee",
        "Claude a décliné cette demande (filtre de sécurité du fournisseur).",
        "Reformulez la demande ou utilisez une autre image.",
      );
    }
    if (response.stop_reason === "max_tokens") {
      throw new AppError(502, "reponse_tronquee", "La réponse de Claude a été coupée avant la fin.", "Réessayez avec une demande plus courte.");
    }
    if (response.parsed_output == null) {
      throw new AppError(502, "reponse_illisible", "Claude a renvoyé une réponse qui ne respecte pas le format attendu.", "Réessayez.");
    }
    // Validation finale avec le schéma (le SDK a déjà vérifié, on reste prudent).
    const checked = req.schema.safeParse(response.parsed_output);
    if (!checked.success) {
      throw new AppError(502, "reponse_illisible", "Claude a renvoyé une réponse incomplète.", "Réessayez.");
    }
    return { data: checked.data, model: response.model };
  }
}

function mapError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new AppError(504, "delai_depasse", "Claude n'a pas répondu dans le délai imparti.", "Réessayez dans un instant.");
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AppError(503, "moteur_injoignable", "Impossible de joindre l'API Anthropic.", "Vérifiez votre connexion Internet.");
  }
  if (err instanceof Anthropic.APIError && typeof err.status === "number") {
    const retry = Number(err.headers?.get?.("retry-after"));
    const detail = extractMessage(err);
    return providerHttpError(PROVIDER, err.status, detail, Number.isFinite(retry) && retry > 0 ? retry : undefined);
  }
  if (err instanceof Anthropic.AnthropicError && /structured output/i.test(err.message)) {
    return new AppError(502, "reponse_illisible", "Claude a renvoyé une réponse qui ne respecte pas le format attendu.", "Réessayez.");
  }
  // Erreur imprévue (réponse mal formée, bogue…) : journalisée côté serveur pour diagnostic.
  console.error("[Claude] erreur inattendue :", err instanceof Error ? `${err.name}: ${err.message}` : err);
  return new AppError(500, "erreur_interne", "Erreur inattendue lors de l'appel à Claude.");
}

function extractMessage(err: InstanceType<typeof Anthropic.APIError>): string | undefined {
  const body = err.error as { error?: { message?: unknown } } | undefined;
  const msg = body?.error?.message;
  return typeof msg === "string" ? msg : undefined;
}
