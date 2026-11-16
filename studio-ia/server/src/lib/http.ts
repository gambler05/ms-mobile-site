import { AppError, providerHttpError } from "./errors.js";

export interface HttpOptions {
  provider: string;
  timeoutMs: number;
  /** Message affiché si le service est injoignable (réseau, logiciel local éteint…). */
  unreachableHint?: string;
}

/**
 * fetch avec délai maximal et traduction des erreurs réseau / HTTP.
 * Ne journalise jamais les en-têtes (ils peuvent contenir des clés API).
 */
export async function httpRequest(url: string, init: RequestInit, opts: HttpOptions): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(opts.timeoutMs) });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new AppError(
        504,
        "delai_depasse",
        `${opts.provider} n'a pas répondu dans le délai imparti (${Math.round(opts.timeoutMs / 1000)} s).`,
        "Réessayez. En mode local, la première exécution charge le modèle en mémoire et peut être longue.",
      );
    }
    throw new AppError(
      503,
      "moteur_injoignable",
      `Impossible de joindre ${opts.provider}.`,
      opts.unreachableHint ?? "Vérifiez votre connexion Internet.",
    );
  }
  if (!res.ok) {
    const detail = await readErrorDetail(res);
    throw providerHttpError(opts.provider, res.status, detail, retryAfter(res));
  }
  return res;
}

export async function httpJson<T>(url: string, init: RequestInit, opts: HttpOptions): Promise<T> {
  const res = await httpRequest(url, init, opts);
  try {
    return (await res.json()) as T;
  } catch {
    throw new AppError(502, "reponse_illisible", `${opts.provider} a renvoyé une réponse illisible.`);
  }
}

function retryAfter(res: Response): number | undefined {
  const raw = res.headers.get("retry-after");
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : undefined;
}

/** Extrait un message d'erreur lisible d'une réponse JSON ou texte d'un fournisseur. */
async function readErrorDetail(res: Response): Promise<string | undefined> {
  let text: string;
  try {
    text = await res.text();
  } catch {
    return undefined;
  }
  if (!text) return undefined;
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    const err = body.error;
    if (typeof err === "string") return err;
    if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
      return (err as { message: string }).message;
    }
    if (Array.isArray(body.errors)) return body.errors.map(String).join(" ; ");
    if (typeof body.message === "string") return body.message;
    if (typeof body.detail === "string") return body.detail;
    return text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

/** Joint une URL de base et un chemin sans doubler les barres obliques. */
export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
