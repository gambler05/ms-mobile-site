import type { Analysis, EnhanceResult, SeriesResult } from "../../../server/src/shared/schemas";
import type {
  ApiErrorBody,
  GenerationParams,
  ItemType,
  LibraryItem,
  Project,
  StatusResponse,
} from "../../../server/src/shared/types";

export type { Analysis, EnhanceResult, SeriesResult, GenerationParams, ItemType, LibraryItem, Project, StatusResponse };
export type { EngineInfo, AspectRatio, StyleId, QualityId, Capability } from "../../../server/src/shared/types";

/** Erreur renvoyée par le serveur, avec un message en français et une piste de solution. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { "x-studio": "1" };
  let payload: BodyInit | undefined;
  if (body instanceof Blob || body instanceof ArrayBuffer) {
    payload = body;
    headers["content-type"] = "application/zip";
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers["content-type"] = "application/json";
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload, ...init });
  } catch {
    throw new ApiError("Le serveur du studio ne répond pas. Est-il toujours lancé ?", 0, "serveur_injoignable", "Relancez « npm start » dans le dossier studio-ia.");
  }
  if (!res.ok) {
    let err: ApiErrorBody["error"] | undefined;
    try {
      err = ((await res.json()) as ApiErrorBody).error;
    } catch {
      // réponse non JSON
    }
    throw new ApiError(err?.message ?? `Erreur ${res.status}.`, res.status, err?.code ?? "erreur", err?.hint);
  }
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return (await res.json()) as T;
  return (await res.blob()) as unknown as T;
}

export const api = {
  status: (refresh = false) => request<StatusResponse>("GET", `/status${refresh ? "?refresh=1" : ""}`),
  settings: () => request<{ settings: SettingView[]; server: ServerInfo }>("GET", "/settings"),
  saveSettings: (patch: Record<string, unknown>) => request<{ settings: SettingView[] }>("PUT", "/settings", patch),

  generate: (body: GenerateBody) => request<{ items: LibraryItem[]; notes: string[] }>("POST", "/generate", body),
  regenerate: (itemId: string) => request<{ items: LibraryItem[]; notes: string[] }>("POST", "/generate/regenerate", { itemId }),
  variations: (itemId: string, count: number, engineId?: string) =>
    request<{ items: LibraryItem[]; notes: string[] }>("POST", "/generate/variations", { itemId, count, engineId }),
  upscale: (itemId: string, engineId?: string) => request<{ item: LibraryItem }>("POST", "/upscale", { itemId, engineId }),

  analyze: (body: AnalyzeBody) => request<{ item: LibraryItem }>("POST", "/analyze", body),

  enhance: (prompt: string, options: EnhanceOptions, engineId?: string) =>
    request<EnhanceResult & EngineMeta>("POST", "/prompts/enhance", { prompt, options, engineId }),
  translate: (text: string, target: "en" | "fr", engineId?: string) =>
    request<{ text: string } & EngineMeta>("POST", "/prompts/translate", { text, target, engineId }),
  rewrite: (text: string, mode: "reecrire" | "enrichir", engineId?: string) =>
    request<{ text: string } & EngineMeta>("POST", "/prompts/rewrite", { text, mode, engineId }),
  series: (body: SeriesBody) => request<SeriesResult & EngineMeta>("POST", "/prompts/series", body),
  character: (image: string, language: "en" | "fr", engineId?: string) =>
    request<{ description: string; invariants: string[] } & EngineMeta>("POST", "/prompts/character", { image, language, engineId }),

  library: (query: Record<string, string | number | boolean | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "" && v !== false) params.set(k, v === true ? "1" : String(v));
    return request<{ items: LibraryItem[]; total: number }>("GET", `/library?${params}`);
  },
  libraryMeta: () =>
    request<{ tags: Array<{ tag: string; count: number }>; categories: string[]; projects: Array<Project & { count: number }> }>("GET", "/library-meta"),
  item: (id: string) => request<{ item: LibraryItem }>("GET", `/library/${encodeURIComponent(id)}`),
  patchItem: (id: string, patch: Partial<LibraryItem>) => request<{ item: LibraryItem }>("PATCH", `/library/${encodeURIComponent(id)}`, patch),
  savePrompt: (body: { title?: string; prompt: string; negativePrompt?: string; tags?: string[]; notes?: string; category?: string; projectId?: string | null }) =>
    request<{ item: LibraryItem }>("POST", "/library/prompts", body),
  bulk: (body: { ids: string[]; projectId?: string | null; favorite?: boolean; addTags?: string[] }) =>
    request<{ updated: number }>("POST", "/library/bulk", body),
  deleteItems: (ids: string[]) => request<{ deleted: number }>("POST", "/library/delete", { ids }),
  downloadItems: (ids: string[]) => request<Blob>("POST", "/library/download", { ids }),

  createProject: (name: string) => request<{ project: Project }>("POST", "/projects", { name }),
  renameProject: (id: string, name: string) => request<{ project: Project }>("PATCH", `/projects/${id}`, { name }),
  deleteProject: (id: string) => request<{ ok: true }>("DELETE", `/projects/${id}`),

  backup: () => request<Blob>("GET", "/backup"),
  restore: (file: Blob, mode: "fusion" | "remplacement") =>
    request<{ mode: string; itemsAdded: number; itemsSkipped: number; projectsAdded: number; filesRestored: number }>(
      "POST",
      `/restore?mode=${mode}`,
      file,
    ),
};

export interface EngineMeta {
  engineName: string;
  model: string;
}

export interface GenerateBody extends GenerationParams {
  reference?: string | null;
  referenceItemId?: string | null;
  projectId?: string | null;
}

export interface AnalyzeBody {
  engineId?: string;
  image: string;
  analysisImage?: string | null;
  palette: string[];
  promptLanguage: "en" | "fr";
  notes: string;
  projectId?: string | null;
}

export interface EnhanceOptions {
  detail: number;
  style: string;
  lighting: string;
  mood: string;
  vertical: boolean;
  character: string;
  language: "en" | "fr";
}

export interface SeriesBody {
  story: string;
  count: number;
  character: string;
  style: string;
  vertical: boolean;
  language: "en" | "fr";
  engineId?: string;
}

export interface SettingView {
  key: string;
  env: string;
  secret: boolean;
  source: "env" | "ui" | "defaut";
  value: string | number | boolean;
  isSet: boolean;
  editable: boolean;
}

export interface ServerInfo {
  host: string;
  port: number;
  dataDir: string;
  maxImagesPerDay: number;
}

export function fileUrl(name: string): string {
  return `/api/files/${encodeURIComponent(name)}`;
}

export function downloadUrl(name: string, title: string): string {
  return `/api/files/${encodeURIComponent(name)}?download=1&title=${encodeURIComponent(title.slice(0, 80))}`;
}

/** Déclenche le téléchargement d'un Blob dans le navigateur. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function errorText(err: unknown): { message: string; hint?: string } {
  if (err instanceof ApiError) return { message: err.message, hint: err.hint };
  if (err instanceof Error) return { message: err.message };
  return { message: "Une erreur inattendue est survenue." };
}
