import { prisma } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import { TournamentBrowser } from "@/components/TournamentBrowser";

export default async function TournamentsPage() {
  const t = await getTranslations("tournaments");
  const tournaments = await prisma.tournament.findMany({
    where: { approved: true },
    include: { teams: true },
    orderBy: { dateStart: "asc" }
  });

  const data = tournaments.map((t) => ({
    id: t.id,
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
      <TournamentBrowser tournaments={data} />
    </div>
  );
}
