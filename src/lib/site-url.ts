/**
 * URL de base publique du site, pour les liens absolus (sitemap, Open Graph,
 * metadataBase…). Priorité : NEXT_PUBLIC_BASE_URL, puis NEXTAUTH_URL, puis le
 * domaine de prod par défaut. Toujours sans slash final.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_BASE_URL ??
  process.env.NEXTAUTH_URL ??
  "https://poloperator.app"
).replace(/\/$/, "");

/** Construit une URL absolue à partir d'un chemin (`/tournament/x` → `https://…/tournament/x`). */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
