import { imageSize } from "image-size";
import { badRequest } from "./errors.js";

export type ImageMime = "image/png" | "image/jpeg" | "image/webp";

export const ACCEPTED_MIMES: readonly ImageMime[] = ["image/png", "image/jpeg", "image/webp"];
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 Mo
export const MAX_IMAGE_SIDE = 8192;
export const MIN_IMAGE_SIDE = 16;

export interface ValidatedImage {
  data: Buffer;
  mime: ImageMime;
  width: number;
  height: number;
  bytes: number;
}

/** Détecte le vrai type d'une image à partir de ses premiers octets (« nombre magique »). */
export function sniffImageMime(buf: Buffer): ImageMime | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

export function extensionFor(mime: ImageMime): "png" | "jpg" | "webp" {
  return mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "webp";
}

export function mimeForExtension(ext: string): ImageMime | null {
  switch (ext.toLowerCase()) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return null;
  }
}

/**
 * Décode une image transmise en base64 (avec ou sans préfixe data:) et la valide :
 * type réel PNG/JPEG/WEBP, poids maximal, dimensions lisibles et raisonnables.
 */
export function decodeAndValidateImage(input: string, label = "L'image"): ValidatedImage {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(input);
  const declared = match?.[1]?.toLowerCase();
  const b64 = (match ? match[2] : input).replace(/\s+/g, "");
  if (!b64 || !/^[A-Za-z0-9+/]+=*$/.test(b64)) {
    throw badRequest(`${label} est illisible (encodage invalide).`);
  }
  const data = Buffer.from(b64, "base64");
  return validateImageBuffer(data, label, declared);
}

export function validateImageBuffer(data: Buffer, label = "L'image", declaredMime?: string): ValidatedImage {
  if (data.length === 0) throw badRequest(`${label} est vide.`);
  if (data.length > MAX_IMAGE_BYTES) {
    throw badRequest(
      `${label} pèse ${(data.length / 1024 / 1024).toFixed(1)} Mo : la limite est de 20 Mo.`,
      "Réduisez la taille de l'image avant de l'importer.",
    );
  }
  const mime = sniffImageMime(data);
  if (!mime) {
    throw badRequest(`${label} n'est pas au format PNG, JPG/JPEG ou WEBP.`, "Formats acceptés : PNG, JPG, JPEG, WEBP.");
  }
  if (declaredMime && declaredMime !== mime && !(declaredMime === "image/jpg" && mime === "image/jpeg")) {
    throw badRequest(`${label} est déclarée comme ${declaredMime} mais son contenu est ${mime}.`);
  }
  let width = 0;
  let height = 0;
  try {
    const size = imageSize(data);
    width = size.width ?? 0;
    height = size.height ?? 0;
  } catch {
    throw badRequest(`${label} est corrompue ou incomplète.`);
  }
  if (width < MIN_IMAGE_SIDE || height < MIN_IMAGE_SIDE) {
    throw badRequest(`${label} est trop petite (${width}×${height} px). Minimum : ${MIN_IMAGE_SIDE} px de côté.`);
  }
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) {
    throw badRequest(`${label} est trop grande (${width}×${height} px). Maximum : ${MAX_IMAGE_SIDE} px de côté.`);
  }
  return { data, mime, width, height, bytes: data.length };
}

/** Rapport largeur/hauteur simplifié et rapport standard le plus proche. */
export function describeAspectRatio(width: number, height: number): { exact: string; nearest: string; orientation: string } {
  const g = gcd(width, height);
  const exact = `${width / g}:${height / g}`;
  const ratio = width / height;
  const standards: Array<[string, number]> = [
    ["1:1", 1],
    ["4:5", 4 / 5],
    ["5:4", 5 / 4],
    ["3:4", 3 / 4],
    ["4:3", 4 / 3],
    ["2:3", 2 / 3],
    ["3:2", 3 / 2],
    ["9:16", 9 / 16],
    ["16:9", 16 / 9],
    ["21:9", 21 / 9],
    ["9:21", 9 / 21],
  ];
  let nearest = standards[0];
  for (const s of standards) {
    if (Math.abs(Math.log(ratio / s[1])) < Math.abs(Math.log(ratio / nearest[1]))) nearest = s;
  }
  const orientation = ratio > 1.02 ? "paysage" : ratio < 0.98 ? "portrait" : "carré";
  return { exact, nearest: nearest[0], orientation };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
