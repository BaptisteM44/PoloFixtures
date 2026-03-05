/**
 * Rate limiter in-memory à fenêtre glissante.
 * ⚠️ Fonctionne par instance serverless — pour un déploiement multi-instance
 *    à grande échelle, préférer Upstash Redis (@upstash/ratelimit).
 */
const store = new Map<string, number[]>();

/**
 * Retourne `true` si la clé dépasse la limite.
 * @param key      Identifiant unique (IP, email, etc.)
 * @param limit    Nombre de requêtes max dans la fenêtre
 * @param windowMs Taille de la fenêtre en millisecondes
 */
export function isRateLimited(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const timestamps = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  if (timestamps.length >= limit) return true;
  timestamps.push(now);
  store.set(key, timestamps);
  return false;
}

/** Extrait l'IP réelle derrière un proxy/CDN (Vercel, Cloudflare, etc.) */
export function getIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}
