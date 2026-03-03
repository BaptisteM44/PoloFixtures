import { prisma } from "@/lib/db";
import { TournamentBrowser } from "@/components/TournamentBrowser";

export default async function TournamentsPage() {
  const tournaments = await prisma.tournament.findMany({
    where: { approved: true },
    include: { teams: true, freeAgents: true },
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
    freeAgentCount: t.freeAgents.length,
    registrationFeePerTeam: t.registrationFeePerTeam,
    registrationFeeCurrency: t.registrationFeeCurrency,
    bannerPath: t.bannerPath,
  }));

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 24 }}>
        <div>
          <h1>Tous les tournois</h1>
          <p>Filtre par continent, pays ou statut</p>
        </div>
      </div>
      <TournamentBrowser tournaments={data} />
    </div>
  );
}
