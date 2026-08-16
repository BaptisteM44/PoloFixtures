import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";

export const revalidate = 3600; // régénéré au plus une fois par heure

/**
 * Sitemap dynamique : pages statiques publiques + tournois approuvés + clubs
 * validés + joueurs (non suspendus). Aide Google à indexer le contenu réel.
 * Locale par défaut (fr) — next-intl sert les autres via le préfixe.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPaths = ["", "/tournaments", "/clubs", "/calendar", "/about"].map((p) => ({
    url: `${SITE_URL}${p}`,
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
    url: `${SITE_URL}/tournament/${t.slug ?? t.id}`,
    lastModified: t.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const clubUrls = clubs.map((c) => ({
    url: `${SITE_URL}/club/${c.id}`,
    lastModified: c.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));

  const playerUrls = players.map((p) => ({
    url: `${SITE_URL}/player/${p.slug}`,
    lastModified: p.createdAt,
    changeFrequency: "monthly" as const,
    priority: 0.4,
  }));

  return [...staticPaths, ...tournamentUrls, ...clubUrls, ...playerUrls];
}
