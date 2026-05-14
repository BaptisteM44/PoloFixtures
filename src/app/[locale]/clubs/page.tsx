import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ClubsPageTabs } from "@/components/ClubsPageTabs";
import { ClubMapClient } from "@/components/ClubMapClient";
import type { MapClub } from "@/components/ClubMapClient";
import { countryToContinent } from "@/lib/country-utils";

export default async function ClubsPage() {
  const t = await getTranslations("clubs");
  const session = await auth();
  const playerId = (session?.user as any)?.playerId ?? null;
  const hasPlayer = !!playerId;

  let playerContinent: string | null = null;
  if (playerId) {
    const player = await prisma.player.findUnique({ where: { id: playerId }, select: { country: true } });
    if (player?.country) playerContinent = countryToContinent(player.country);
  }

  const clubs = await prisma.club.findMany({
    where: { approved: true },
    include: {
      manager: { select: { id: true, name: true, slug: true } },
      _count: { select: { members: { where: { status: "MEMBER", player: { status: { not: "REJECTED" } } } } } },
    },
    orderBy: [{ continentCode: "asc" }, { country: "asc" }, { name: "asc" }],
  });

  const mapped = clubs.map((c) => ({
    id: c.id,
    name: c.name,
    city: c.city,
    country: c.country,
    continentCode: c.continentCode,
    logoPath: c.logoPath,
    memberCount: c._count.members,
  }));

  const mapClubs: MapClub[] = clubs
    .filter((c) => c.lat != null && c.lng != null)
    .map((c) => ({
      id: c.id,
      name: c.name,
      city: c.city,
      country: c.country,
      continentCode: c.continentCode,
      logoPath: c.logoPath,
      memberCount: c._count.members,
      lat: c.lat as number,
      lng: c.lng as number,
    }));

  return (
    <div className="clubs-page">
      <div className="clubs-page__hero">
        <div>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        {hasPlayer && (
          <Link className="primary" href="/club/new">{t("create_club")}</Link>
        )}
      </div>

      {mapClubs.length > 0 && (
        <section>
          <ClubMapClient clubs={mapClubs} userContinent={playerContinent ?? undefined} />
        </section>
      )}

      <ClubsPageTabs clubs={mapped} userContinent={playerContinent ?? undefined} />
    </div>
  );
}
