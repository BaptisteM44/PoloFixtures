import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { localeAlternates } from "@/lib/seo";

/**
 * Titre (et description pour les pages publiques) d'une page, traduits.
 * Le layout ajoute « | Poloperator ». Avant, 45 pages sur 51 s'affichaient
 * simplement « Poloperator » dans l'onglet et dans l'aperçu d'un lien partagé.
 */
export async function pageMetadata(key: string, withDescription = false, path?: string): Promise<Metadata> {
  const t = await getTranslations("page_titles");
  const title = t(key as never);
  // `path` (pages publiques) : canonique + variantes de langue pour Google
  const alternates = path ? localeAlternates(await getLocale(), path) : undefined;
  if (!withDescription) return { title, alternates };
  const description = t(`${key}_desc` as never);
  return { title, description, alternates, openGraph: { title, description }, twitter: { title, description } };
}
