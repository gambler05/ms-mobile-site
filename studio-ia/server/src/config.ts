import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
/** Racine du projet studio-ia (fonctionne depuis server/src et server/dist). */
export const ROOT_DIR = path.resolve(here, "..", "..");

dotenv.config({ path: path.join(ROOT_DIR, ".env"), quiet: true });

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function str(name: string, fallback = ""): string {
  const raw = process.env[name];
  return raw === undefined ? fallback : raw.trim();
}

/** Paramètres réseau et stockage du serveur (lus une seule fois au démarrage). */
export const serverConfig = {
  host: str("HOST", "127.0.0.1"),
  port: num("PORT", 5174),
  dataDir: path.resolve(ROOT_DIR, str("DATA_DIR", "data")),
  webDir: path.join(ROOT_DIR, "web", "dist"),
  /** Noms d'hôte acceptés dans l'en-tête Host (protection contre le « DNS rebinding »). */
  allowedHosts: str("ALLOWED_HOSTS", "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
  /** Nombre maximal d'images générées par jour (0 = illimité). Protège contre les dépenses imprévues. */
  maxImagesPerDay: num("MAX_IMAGES_PER_DAY", 0),
};

/**
 * Réglages des moteurs. Chaque valeur peut venir du fichier .env (prioritaire)
 * ou de l'écran Paramètres (enregistrée côté serveur dans data/settings.json).
 */
export interface EngineSettings {
  anthropicApiKey: string;
  anthropicModel: string;
  anthropicEffort: "low" | "medium" | "high" | "xhigh" | "max";
  anthropicBaseUrl: string;
  openaiApiKey: string;
  openaiImageModel: string;
  openaiBaseUrl: string;
  openaiFlexibleSizes: boolean;
  stabilityApiKey: string;
  stabilityModel: string;
  stabilityBaseUrl: string;
  ollamaUrl: string;
  ollamaVisionModel: string;
  ollamaTextModel: string;
  sdwebuiUrl: string;
  sdwebuiUpscaler: string;
  sdwebuiBaseSize: number;
  timeoutApiMs: number;
  timeoutLocalMs: number;
}

export const SETTING_DEFAULTS: EngineSettings = {
  anthropicApiKey: "",
  anthropicModel: "claude-opus-5-5",
  anthropicEffort: "medium",
  anthropicBaseUrl: "https://api.anthropic.com",
  openaiApiKey: "",
  openaiImageModel: "gpt-image-2",
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiFlexibleSizes: true,
  stabilityApiKey: "",
  stabilityModel: "core",
  stabilityBaseUrl: "https://api.stability.ai",
  ollamaUrl: "http://127.0.0.1:11434",
  ollamaVisionModel: "qwen2.5vl:7b",
  ollamaTextModel: "",
  sdwebuiUrl: "http://127.0.0.1:7860",
  sdwebuiUpscaler: "R-ESRGAN 4x+",
  sdwebuiBaseSize: 1024,
  timeoutApiMs: 180_000,
  timeoutLocalMs: 600_000,
};

/** Correspondance réglage → variable d'environnement. */
export const SETTING_ENV: Record<keyof EngineSettings, string> = {
  anthropicApiKey: "ANTHROPIC_API_KEY",
  anthropicModel: "ANTHROPIC_MODEL",
  anthropicEffort: "ANTHROPIC_EFFORT",
  // Variable dédiée : ANTHROPIC_BASE_URL est parfois définie par d'autres outils.
  anthropicBaseUrl: "STUDIO_ANTHROPIC_BASE_URL",
  openaiApiKey: "OPENAI_API_KEY",
  openaiImageModel: "OPENAI_IMAGE_MODEL",
  openaiBaseUrl: "OPENAI_BASE_URL",
  openaiFlexibleSizes: "OPENAI_FLEXIBLE_SIZES",
  stabilityApiKey: "STABILITY_API_KEY",
  stabilityModel: "STABILITY_MODEL",
  stabilityBaseUrl: "STABILITY_BASE_URL",
  ollamaUrl: "OLLAMA_URL",
  ollamaVisionModel: "OLLAMA_VISION_MODEL",
  ollamaTextModel: "OLLAMA_TEXT_MODEL",
  sdwebuiUrl: "SD_WEBUI_URL",
  sdwebuiUpscaler: "SD_WEBUI_UPSCALER",
  sdwebuiBaseSize: "SD_WEBUI_BASE_SIZE",
  timeoutApiMs: "TIMEOUT_API_MS",
  timeoutLocalMs: "TIMEOUT_LOCAL_MS",
};

export const SECRET_SETTINGS: ReadonlyArray<keyof EngineSettings> = [
  "anthropicApiKey",
  "openaiApiKey",
  "stabilityApiKey",
];

/** Valeurs lues dans l'environnement (seules les variables effectivement définies). */
export function settingsFromEnv(env: NodeJS.ProcessEnv = process.env): Partial<EngineSettings> {
  const out: Partial<EngineSettings> = {};
  for (const key of Object.keys(SETTING_ENV) as Array<keyof EngineSettings>) {
    const raw = env[SETTING_ENV[key]];
    if (raw === undefined || raw.trim() === "") continue;
    const parsed = coerceSetting(key, raw.trim());
    if (parsed !== undefined) (out as Record<string, unknown>)[key] = parsed;
  }
  return out;
}

export function coerceSetting(key: keyof EngineSettings, raw: unknown): unknown {
  const def = SETTING_DEFAULTS[key];
  if (typeof def === "number") {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  if (typeof def === "boolean") {
    if (typeof raw === "boolean") return raw;
    const s = String(raw).toLowerCase();
    if (["1", "true", "oui", "yes"].includes(s)) return true;
    if (["0", "false", "non", "no"].includes(s)) return false;
    return undefined;
  }
  if (key === "anthropicEffort") {
    return ["low", "medium", "high", "xhigh", "max"].includes(String(raw)) ? String(raw) : undefined;
  }
  return String(raw);
}
