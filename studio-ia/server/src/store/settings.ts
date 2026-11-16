import path from "node:path";
import {
  coerceSetting,
  type EngineSettings,
  SECRET_SETTINGS,
  SETTING_DEFAULTS,
  SETTING_ENV,
  settingsFromEnv,
} from "../config.js";
import { badRequest } from "../lib/errors.js";
import { JsonFile } from "./json-file.js";

interface SettingsDoc {
  engines: Partial<EngineSettings>;
}

export type SettingSource = "env" | "ui" | "defaut";

export interface SettingView {
  key: keyof EngineSettings;
  env: string;
  secret: boolean;
  source: SettingSource;
  /** Valeur affichable. Pour un secret : jamais la valeur, seulement « ••••abcd ». */
  value: string | number | boolean;
  isSet: boolean;
  editable: boolean;
}

/**
 * Réglages des moteurs : défauts < écran Paramètres (data/settings.json) < fichier .env.
 * Les clés API ne sont jamais renvoyées au navigateur.
 */
export class SettingsStore {
  private readonly file: JsonFile<SettingsDoc>;

  constructor(
    dataDir: string,
    private readonly env: Partial<EngineSettings> = settingsFromEnv(),
  ) {
    this.file = new JsonFile<SettingsDoc>(
      path.join(dataDir, "settings.json"),
      () => ({ engines: {} }),
      (raw) => {
        const doc = (raw ?? {}) as Partial<SettingsDoc>;
        return { engines: typeof doc.engines === "object" && doc.engines ? doc.engines : {} };
      },
      0o600,
    );
  }

  async effective(): Promise<EngineSettings> {
    const doc = await this.file.read();
    const fromUi: Partial<EngineSettings> = {};
    for (const [k, v] of Object.entries(doc.engines)) {
      const key = k as keyof EngineSettings;
      if (!(key in SETTING_DEFAULTS)) continue;
      const parsed = coerceSetting(key, v);
      if (parsed !== undefined && parsed !== "") (fromUi as Record<string, unknown>)[key] = parsed;
    }
    const fromEnv = Object.fromEntries(Object.entries(this.env).filter(([, v]) => v !== undefined));
    return { ...SETTING_DEFAULTS, ...fromUi, ...fromEnv };
  }

  async describe(): Promise<SettingView[]> {
    const doc = await this.file.read();
    const eff = await this.effective();
    return (Object.keys(SETTING_DEFAULTS) as Array<keyof EngineSettings>).map((key) => {
      const secret = SECRET_SETTINGS.includes(key);
      const source: SettingSource =
        this.env[key] !== undefined ? "env" : doc.engines[key] !== undefined && doc.engines[key] !== "" ? "ui" : "defaut";
      const raw = eff[key];
      const isSet = raw !== "" && raw !== undefined;
      return {
        key,
        env: SETTING_ENV[key],
        secret,
        source,
        value: secret ? maskSecret(String(raw)) : raw,
        isSet,
        editable: source !== "env",
      };
    });
  }

  /**
   * Met à jour des réglages depuis l'écran Paramètres.
   * Une chaîne vide efface le réglage (retour à la valeur par défaut).
   */
  async update(patch: Record<string, unknown>): Promise<void> {
    const changes: Partial<Record<keyof EngineSettings, unknown>> = {};
    for (const [k, v] of Object.entries(patch)) {
      const key = k as keyof EngineSettings;
      if (!(key in SETTING_DEFAULTS)) throw badRequest(`Réglage inconnu : ${k}.`);
      if (this.env[key] !== undefined) {
        throw badRequest(
          `« ${SETTING_ENV[key]} » est défini dans le fichier .env : modifiez-le là-bas puis redémarrez.`,
        );
      }
      if (v === "" || v === null) {
        changes[key] = undefined;
        continue;
      }
      const parsed = coerceSetting(key, v);
      if (parsed === undefined) throw badRequest(`Valeur invalide pour ${SETTING_ENV[key]}.`);
      if (typeof parsed === "string" && parsed.length > 500) throw badRequest(`Valeur trop longue pour ${SETTING_ENV[key]}.`);
      if (key.endsWith("Url") && typeof parsed === "string" && !/^https?:\/\/[^\s]+$/i.test(parsed)) {
        throw badRequest(`${SETTING_ENV[key]} doit être une adresse http:// ou https://.`);
      }
      changes[key] = parsed;
    }
    await this.file.update((doc) => {
      for (const [k, v] of Object.entries(changes)) {
        const key = k as keyof EngineSettings;
        if (v === undefined) delete doc.engines[key];
        else (doc.engines as Record<string, unknown>)[key] = v;
      }
    });
  }
}

export function maskSecret(value: string): string {
  if (!value) return "";
  return value.length <= 8 ? "••••" : `••••${value.slice(-4)}`;
}
