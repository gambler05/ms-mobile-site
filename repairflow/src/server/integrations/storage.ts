import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Stockage objet privé. Deux pilotes :
 * - `local` : dossier ./storage (démonstration, mono-serveur), servi uniquement via URL signée.
 * - `s3` : compatible S3 (à configurer, voir docs/INTEGRATIONS.md). Non actif sans identifiants.
 * Les fichiers ne sont jamais servis en statique : /api/files/[key] vérifie la signature et l'expiration.
 */
const ROOT = path.resolve(process.cwd(), "storage");
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export function storageDriver(): "local" | "s3" {
  return process.env.STORAGE_DRIVER === "s3" ? "s3" : "local";
}

export function storageStatus() {
  const s3Missing = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].filter((k) => !process.env[k]);
  return { driver: storageDriver(), configured: storageDriver() === "local" || s3Missing.length === 0, missing: storageDriver() === "s3" ? s3Missing : [] };
}

function safeKey(orgId: string, ext: string) {
  return `${orgId}/${new Date().toISOString().slice(0, 7)}/${randomBytes(16).toString("hex")}.${ext}`;
}

export async function storeBuffer(orgId: string, buffer: Buffer, mime: string, filename: string) {
  if (!ALLOWED_MIME.has(mime)) throw new Error(`Type de fichier non autorisé : ${mime}`);
  if (buffer.length > MAX_UPLOAD_BYTES) throw new Error("Fichier trop volumineux (8 Mo max)");
  if (storageDriver() === "s3") throw new Error("Stockage S3 non configuré dans cette version : utilisez STORAGE_DRIVER=local ou voir docs/INTEGRATIONS.md");
  const ext = mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "pdf";
  const key = safeKey(orgId, ext);
  const full = path.join(ROOT, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buffer);
  return { storageKey: key, mime, size: buffer.length, filename: filename.slice(0, 120) };
}

export async function storeDataUrl(orgId: string, dataUrl: string, filename: string) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("Image invalide");
  return storeBuffer(orgId, Buffer.from(m[2]!, "base64"), m[1]!, filename);
}

export async function readStored(storageKey: string): Promise<{ buffer: Buffer; size: number } | null> {
  if (storageKey.includes("..")) return null;
  const full = path.join(ROOT, storageKey);
  if (!full.startsWith(ROOT)) return null;
  try {
    const s = await stat(full);
    return { buffer: await readFile(full), size: s.size };
  } catch {
    return null;
  }
}
