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

/**
 * Nombre d'événements enregistrés pour `key` dans la fenêtre, SANS en ajouter.
 * Avec recordHit, permet de ne compter que certains événements (ex. les
 * connexions ratées) au lieu de chaque appel.
 */
export function recentHits(key: string, windowMs: number): number {
  const now = Date.now();
  const timestamps = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  store.set(key, timestamps);
  return timestamps.length;
}

/** Enregistre un événement pour `key` (cf. recentHits). */
export function recordHit(key: string): void {
  const timestamps = store.get(key) ?? [];
  timestamps.push(Date.now());
  store.set(key, timestamps);
}

/** Extrait l'IP réelle derrière un proxy/CDN (Coolify, Cloudflare, etc.) */
export function getIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}
