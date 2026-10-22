import { routing } from "@/i18n/routing";
import { absoluteUrl } from "@/lib/site-url";

/**
 * Canonique + variantes de langue (hreflang) d'une page publique. `path` sans
 * préfixe de locale (« /tournaments », « / »). Les URLs sont relatives :
 * metadataBase (layout) les rend absolues.
 */
export function localeAlternates(locale: string, path: string) {
  const p = path === "/" ? "" : path;
  const languages: Record<string, string> = {};
  for (const l of routing.locales) languages[l] = `/${l}${p}`;
  languages["x-default"] = `/${routing.defaultLocale}${p}`;
  return { canonical: `/${locale}${p}`, languages };
}

/** Image d'aperçu par défaut (liens partagés sans affiche / photo / logo) : le logo Poloperator. */
export const DEFAULT_OG_IMAGE = { url: "/icons/icon-512.png", width: 512, height: 512, alt: "Poloperator" };

/** Image absolue pour les données structurées (chemins locaux ou URLs déjà absolues). */
export function absoluteAsset(path: string) {
  return /^https?:\/\//.test(path) ? path : absoluteUrl(path);
}

/** JSON-LD sûr à injecter dans un <script> (pas de « </script> » possible). */
export function jsonLd(data: object) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
