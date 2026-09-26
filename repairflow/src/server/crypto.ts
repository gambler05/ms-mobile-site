import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Chiffrement des données sensibles (codes de déverrouillage) : AES-256-GCM avec IV aléatoire.
 * Clé : ENCRYPTION_KEY (32 octets en base64). Format stocké : v1.<iv>.<tag>.<ciphertext> (base64url).
 * Rotation : chiffrer à nouveau avec la nouvelle clé (script docs/SECURITE.md).
 */
function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY manquante");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("ENCRYPTION_KEY doit faire 32 octets (base64)");
  return buf;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(payload: string): string {
  const [v, ivB, tagB, ctB] = payload.split(".");
  if (v !== "v1" || !ivB || !tagB || !ctB) throw new Error("format chiffré invalide");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB, "base64url")), decipher.final()]).toString("utf8");
}

/** Jeton opaque (URL de suivi, session) : 32 octets aléatoires. Seul le hachage est stocké. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET manquant");
  return s;
}

/** Signature HMAC d'une chaîne (URLs signées de fichiers privés). */
export function sign(value: string): string {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

export function verifySignature(value: string, signature: string): boolean {
  const expected = Buffer.from(sign(value));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** URL signée temporaire vers un fichier privé : /api/files/<key>?exp=<ts>&sig=<hmac>. */
export function signedFileUrl(storageKey: string, ttlSeconds = 600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = sign(`${storageKey}:${exp}`);
  return `/api/files/${encodeURIComponent(storageKey)}?exp=${exp}&sig=${sig}`;
}

export function verifyFileUrl(storageKey: string, exp: string, sig: string): boolean {
  if (!/^\d+$/.test(exp) || Number(exp) < Math.floor(Date.now() / 1000)) return false;
  return verifySignature(`${storageKey}:${exp}`, sig);
}

/** Code PIN court (4 chiffres) pour l'accès aux documents personnels sur la page publique. */
export function generatePin(): string {
  return String(randomBytes(2).readUInt16BE(0) % 10_000).padStart(4, "0");
}
