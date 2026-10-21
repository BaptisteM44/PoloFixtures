import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { routing } from "@/i18n/routing";

// Le site impose le préfixe de langue : une URL sans préfixe redirige. On liste
// la version par défaut (fr) et on déclare les autres langues en hreflang.
const localized = (path: string) => ({
  url: `${SITE_URL}/${routing.defaultLocale}${path}`,
  alternates: {
    languages: Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}${path}`])),
  },
});

export const revalidate = 3600; // régénéré au plus une fois par heure

/**
 * Sitemap dynamique : pages statiques publiques + tournois approuvés + clubs
 * validés + joueurs (non suspendus). Aide Google à indexer le contenu réel.
 * Chaque URL porte le préfixe de langue, avec ses variantes hreflang.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPaths = ["", "/tournaments", "/clubs", "/calendar", "/about", "/polls", "/labs"].map((p) => ({
    ...localized(p),
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: p === "" ? 1 : 0.8,
  }));

  const [tournaments, clubs, players] = await Promise.all([
    prisma.tournament.findMany({
      where: { approved: true, hidden: false, testMode: false, createdViaSandbox: false } as never,
      select: { id: true, slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 2000,
    }),
    prisma.club.findMany({
      where: { approved: true } as never,
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 2000,
    }),
    prisma.player.findMany({
      where: { slug: { not: null }, suspendedAt: null } as never,
      select: { slug: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
  ]);

  const tournamentUrls = tournaments.map((t) => ({
    ...localized(`/tournament/${t.slug ?? t.id}`),
    lastModified: t.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const clubUrls = clubs.map((c) => ({
    ...localized(`/club/${c.id}`),
    lastModified: c.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));

  const playerUrls = players.map((p) => ({
    ...localized(`/player/${p.slug}`),
    lastModified: p.createdAt,
    changeFrequency: "monthly" as const,
    priority: 0.4,
  }));

  return [...staticPaths, ...tournamentUrls, ...clubUrls, ...playerUrls];
}
