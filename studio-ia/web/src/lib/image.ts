/**
 * Traitement des images dans le navigateur :
 * - validation (type réel, poids) avant tout envoi ;
 * - réduction pour l'analyse (≤ 1568 px, recommandé par les modèles de vision) ;
 * - mesure de la palette dominante et du rapport largeur/hauteur.
 */

export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const ACCEPT_ATTR = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";
export const MAX_BYTES = 20 * 1024 * 1024;
export const ANALYSIS_MAX_SIDE = 1568;

export type ImageMime = (typeof ACCEPTED_TYPES)[number];

export interface LoadedImage {
  name: string;
  mime: ImageMime;
  bytes: number;
  width: number;
  height: number;
  dataUrl: string;
  /** Version réduite (JPEG ≤ 1568 px) envoyée aux modèles de vision. */
  analysisDataUrl: string;
  palette: string[];
}

/** Détecte le type réel d'un fichier à partir de ses premiers octets. */
export function sniffMime(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "RIFF" &&
    String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export class ImageFileError extends Error {}

export function checkFileBasics(file: { name: string; size: number }): void {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["png", "jpg", "jpeg", "webp"].includes(ext)) {
    throw new ImageFileError(`« ${file.name} » n'est pas accepté. Formats acceptés : PNG, JPG, JPEG, WEBP.`);
  }
  if (file.size === 0) throw new ImageFileError(`« ${file.name} » est vide.`);
  if (file.size > MAX_BYTES) {
    throw new ImageFileError(`« ${file.name} » pèse ${(file.size / 1024 / 1024).toFixed(1)} Mo : la limite est de 20 Mo.`);
  }
}

/** Lit, vérifie et prépare une image importée par l'utilisateur. */
export async function loadImageFile(file: File): Promise<LoadedImage> {
  checkFileBasics(file);
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const mime = sniffMime(head);
  if (!mime) {
    throw new ImageFileError(`« ${file.name} » n'est pas une image PNG, JPG ou WEBP valide (le contenu ne correspond pas à l'extension).`);
  }
  const dataUrl = await readAsDataUrl(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageFileError(`« ${file.name} » est corrompue ou illisible.`);
  }
  try {
    const { width, height } = bitmap;
    if (width < 16 || height < 16) throw new ImageFileError("Image trop petite (16 px de côté minimum).");
    if (width > 8192 || height > 8192) throw new ImageFileError("Image trop grande (8192 px de côté maximum).");
    const analysisDataUrl = await downscale(bitmap, ANALYSIS_MAX_SIDE);
    const palette = paletteFromBitmap(bitmap);
    return { name: file.name, mime, bytes: file.size, width, height, dataUrl, analysisDataUrl, palette };
  } finally {
    bitmap.close();
  }
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageFileError("Lecture du fichier impossible."));
    reader.readAsDataURL(blob);
  });
}

async function downscale(bitmap: ImageBitmap, maxSide: number): Promise<string> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  // Fond blanc : les zones transparentes restent lisibles une fois en JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function paletteFromBitmap(bitmap: ImageBitmap): string[] {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, size, size);
  return extractPalette(ctx.getImageData(0, 0, size, size).data, 6);
}

/**
 * Palette dominante par k-moyennes (déterministe).
 * `pixels` : tableau RGBA. Les pixels transparents sont ignorés.
 */
export function extractPalette(pixels: Uint8ClampedArray | Uint8Array, k = 6): string[] {
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    pts.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
  }
  if (!pts.length) return [];
  // Initialisation déterministe : quantiles de luminance.
  const sorted = [...pts].sort((a, b) => lum(a) - lum(b));
  const kk = Math.min(k, sorted.length);
  let centers = Array.from({ length: kk }, (_, i) => [...sorted[Math.floor(((i + 0.5) / kk) * sorted.length)]] as [number, number, number]);
  let assign = new Array<number>(pts.length).fill(0);
  for (let iter = 0; iter < 10; iter++) {
    assign = pts.map((p) => nearest(p, centers));
    const sums = centers.map(() => [0, 0, 0, 0]);
    pts.forEach((p, i) => {
      const s = sums[assign[i]];
      s[0] += p[0];
      s[1] += p[1];
      s[2] += p[2];
      s[3]++;
    });
    centers = sums.map((s, i) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centers[i]) as [number, number, number]);
  }
  const counts = centers.map((_, i) => assign.filter((a) => a === i).length);
  const ordered = centers.map((c, i) => ({ c, n: counts[i] })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const out: Array<[number, number, number]> = [];
  for (const { c } of ordered) {
    if (out.every((o) => dist(o, c) > 24)) out.push(c);
  }
  return out.map(rgbToHex);
}

function lum([r, g, b]: [number, number, number]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function dist(a: [number, number, number], b: [number, number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function nearest(p: [number, number, number], centers: Array<[number, number, number]>) {
  let best = 0;
  let bestD = Infinity;
  centers.forEach((c, i) => {
    const d = dist(p, c);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
}

/** Rapport largeur/hauteur exact, standard le plus proche et orientation. */
export function aspectInfo(width: number, height: number): { exact: string; nearest: string; orientation: string } {
  const g = gcd(width, height);
  const ratio = width / height;
  const standards: Array<[string, number]> = [
    ["1:1", 1],
    ["4:5", 0.8],
    ["5:4", 1.25],
    ["3:4", 0.75],
    ["4:3", 4 / 3],
    ["2:3", 2 / 3],
    ["3:2", 1.5],
    ["9:16", 9 / 16],
    ["16:9", 16 / 9],
    ["21:9", 21 / 9],
    ["9:21", 9 / 21],
  ];
  let best = standards[0];
  for (const s of standards) if (Math.abs(Math.log(ratio / s[1])) < Math.abs(Math.log(ratio / best[1]))) best = s;
  return {
    exact: `${width / g}:${height / g}`,
    nearest: best[0],
    orientation: ratio > 1.02 ? "paysage" : ratio < 0.98 ? "portrait" : "carré",
  };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Récupère la première image d'un glisser-déposer ou d'un collage. */
export function firstImageFile(list: FileList | DataTransferItemList | null | undefined): File | null {
  if (!list) return null;
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    const file = entry instanceof File ? entry : (entry as DataTransferItem).kind === "file" ? (entry as DataTransferItem).getAsFile() : null;
    if (file) return file;
  }
  return null;
}
