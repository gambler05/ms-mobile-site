import type { EngineSettings } from "../config.js";
import { AppError } from "../lib/errors.js";
import type { Capability, EngineInfo } from "../shared/types.js";
import type { SettingsStore } from "../store/settings.js";
import { AnthropicEngine } from "./anthropic.js";
import { OllamaEngine } from "./ollama.js";
import { OpenAIImageEngine } from "./openai-images.js";
import { SdWebUiEngine } from "./sdwebui.js";
import { StabilityEngine } from "./stability.js";
import { type AnyEngine, type EngineStatus, type ImageEngine, isImageEngine, isVisionTextEngine, type VisionTextEngine } from "./types.js";

const PROBE_TTL_MS = 30_000;

/**
 * Point d'entrée unique vers les moteurs d'IA.
 * Pour ajouter un moteur : implémenter ImageEngine ou VisionTextEngine (voir types.ts)
 * puis l'ajouter à la liste `engines` ci-dessous.
 */
export class EngineRegistry {
  readonly engines: AnyEngine[];
  private probes = new Map<string, { at: number; key: string; status: EngineStatus }>();

  constructor(
    private readonly settings: SettingsStore,
    engines?: AnyEngine[],
  ) {
    this.engines = engines ?? [new AnthropicEngine(), new OllamaEngine(), new OpenAIImageEngine(), new StabilityEngine(), new SdWebUiEngine()];
  }

  /** Décrit tous les moteurs, avec une vérification réelle de leur disponibilité. */
  async status(force = false): Promise<EngineInfo[]> {
    const s = await this.settings.effective();
    return Promise.all(
      this.engines.map(async (engine) => {
        const base = engine.describe(s);
        const status = base.configured ? await this.probe(engine, s, force) : { available: false, message: "Non configuré." };
        return { ...base, available: status.available, statusMessage: status.message, models: status.models };
      }),
    );
  }

  private async probe(engine: AnyEngine, s: EngineSettings, force: boolean): Promise<EngineStatus> {
    const key = JSON.stringify(engine.describe(s)) + s.anthropicApiKey + s.openaiApiKey + s.stabilityApiKey;
    const cached = this.probes.get(engine.id);
    if (!force && cached && cached.key === key && Date.now() - cached.at < PROBE_TTL_MS) return cached.status;
    let status: EngineStatus;
    try {
      status = await engine.probe(s);
    } catch {
      status = { available: false, message: "Vérification impossible." };
    }
    this.probes.set(engine.id, { at: Date.now(), key, status });
    return status;
  }

  /** Oublie les vérifications en cache (après un changement de réglages). */
  resetProbes(): void {
    this.probes.clear();
  }

  async settingsSnapshot(): Promise<EngineSettings> {
    return this.settings.effective();
  }

  async imageEngine(id: string): Promise<{ engine: ImageEngine; settings: EngineSettings; info: ReturnType<AnyEngine["describe"]> }> {
    const engine = this.engines.find((e) => e.id === id);
    if (!engine || !isImageEngine(engine)) throw new AppError(400, "moteur_inconnu", "Ce moteur de génération n'existe pas.");
    const s = await this.settings.effective();
    const info = engine.describe(s);
    if (!info.configured) {
      throw new AppError(503, "moteur_non_configure", `${info.name} n'est pas configuré : aucune image ne peut être générée avec lui.`, info.setupHint);
    }
    return { engine, settings: s, info };
  }

  /**
   * Choisit un moteur de vision / texte : celui demandé, sinon le premier disponible.
   * Aucun résultat n'est jamais simulé : sans moteur, une erreur explicite est renvoyée.
   */
  async visionTextEngine(id: string | undefined, need: Capability): Promise<{ engine: VisionTextEngine; settings: EngineSettings; info: ReturnType<AnyEngine["describe"]> }> {
    const s = await this.settings.effective();
    const candidates = this.engines.filter((e): e is VisionTextEngine => isVisionTextEngine(e) && e.describe(s).capabilities.includes(need));
    if (id) {
      const engine = candidates.find((e) => e.id === id);
      if (!engine) throw new AppError(400, "moteur_inconnu", "Ce moteur ne peut pas effectuer cette tâche.");
      const info = engine.describe(s);
      if (!info.configured) throw new AppError(503, "moteur_non_configure", `${info.name} n'est pas configuré.`, info.setupHint);
      return { engine, settings: s, info };
    }
    for (const engine of candidates) {
      const info = engine.describe(s);
      if (info.configured && (await this.probe(engine, s, false)).available) return { engine, settings: s, info };
    }
    throw new AppError(
      503,
      "aucun_moteur",
      need === "vision"
        ? "Aucun moteur d'analyse d'image n'est connecté. L'analyse n'est donc pas possible pour le moment."
        : "Aucun moteur de texte n'est connecté. L'amélioration de prompts n'est donc pas possible pour le moment.",
      "Ajoutez une clé Claude (API) ou installez Ollama (local) : voir Paramètres › Moteurs.",
    );
  }

  async upscaleEngine(id: string | undefined): Promise<{ engine: ImageEngine; settings: EngineSettings; info: ReturnType<AnyEngine["describe"]> }> {
    const s = await this.settings.effective();
    const candidates = this.engines.filter((e): e is ImageEngine => isImageEngine(e) && typeof e.upscale === "function");
    const ordered = id ? candidates.filter((e) => e.id === id) : candidates;
    for (const engine of ordered) {
      const info = engine.describe(s);
      if (!info.configured) continue;
      if (id || (await this.probe(engine, s, false)).available) return { engine, settings: s, info };
    }
    throw new AppError(
      503,
      "agrandissement_indisponible",
      "Aucun moteur connecté ne sait agrandir les images.",
      "L'agrandissement est proposé par Stability AI (API) et Stable Diffusion WebUI (local).",
    );
  }
}
