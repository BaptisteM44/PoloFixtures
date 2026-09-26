import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/**
 * Titre (et description pour les pages publiques) d'une page, traduits.
 * Le layout ajoute « | Poloperator ». Avant, 45 pages sur 51 s'affichaient
 * simplement « Poloperator » dans l'onglet et dans l'aperçu d'un lien partagé.
 */
export async function pageMetadata(key: string, withDescription = false): Promise<Metadata> {
  const t = await getTranslations("page_titles");
  const title = t(key as never);
  if (!withDescription) return { title };
  const description = t(`${key}_desc` as never);
  return { title, description, openGraph: { title, description }, twitter: { title, description } };
}
