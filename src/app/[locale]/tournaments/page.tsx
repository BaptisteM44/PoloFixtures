import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { TournamentBrowser } from "@/components/TournamentBrowser";
import { syncLiveTournamentsCompletion } from "@/lib/tournament-status";
import { countryToContinent } from "@/lib/country-utils";

export default async function TournamentsPage({ searchParams }: { searchParams: { continent?: string } }) {
  await syncLiveTournamentsCompletion();

  const t = await getTranslations("tournaments");

  const session = await auth();
  const playerId = session?.user?.playerId;
  let playerContinent: string | null = null;
  if (playerId) {
    const player = await prisma.player.findUnique({ where: { id: playerId }, select: { country: true } });
    if (player?.country) {
      playerContinent = countryToContinent(player.country);
    }
  }

  const [tournaments, followedTournamentIds] = await Promise.all([
    prisma.tournament.findMany({
      where: { approved: true, hidden: false, testMode: false },
      include: { teams: { where: { selected: true } } },
      orderBy: { dateStart: "asc" },
    }),
    playerId
      ? (prisma as any).tournamentFollow.findMany({ where: { playerId }, select: { tournamentId: true } }).then((r: any[]) => r.map((f: any) => f.tournamentId))
      : Promise.resolve([]),
  ]);

  const data = tournaments.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    continentCode: t.continentCode,
    country: t.country,
    city: t.city,
    dateStart: t.dateStart.toISOString(),
    dateEnd: t.dateEnd.toISOString(),
    format: t.format,
    status: t.status,
    maxTeams: t.maxTeams,
    teamCount: t.teams.length,
    registrationStart: t.registrationStart?.toISOString() ?? null,
    registrationEnd: t.registrationEnd?.toISOString() ?? null,
    bannerPath: t.bannerPath,
  }));

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 24 }}>
        <div>
          <h1>{t("page_title")}</h1>
          <p>{t("page_subtitle")}</p>
        </div>
      </div>
      <TournamentBrowser tournaments={data} defaultContinent={searchParams.continent ?? playerContinent} isLoggedIn={!!playerId} followedIds={followedTournamentIds} />
    </div>
  );
}
