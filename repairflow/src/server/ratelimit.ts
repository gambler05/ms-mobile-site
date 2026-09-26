/**
 * Limiteur de débit en mémoire (fenêtre glissante) pour les endpoints publics.
 * Suffisant pour une instance ; en multi-instances, remplacer par un compteur partagé (Redis).
 */
const buckets = new Map<string, number[]>();
export function publicRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { buckets.set(key, arr); return false; }
  arr.push(now);
  buckets.set(key, arr);
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.every((t) => now - t > windowMs)) buckets.delete(k);
  return true;
}
