import Link from "next/link";
import { prisma } from "@/lib/db";
import { TournamentCard } from "@/components/TournamentCard";
import { PlayerCard } from "@/components/PlayerCard";
import { Pagination } from "@/components/Pagination";

const PLAYERS_PER_PAGE = 24;

const continentNames: Record<string, string> = {
  NA: "North America", SA: "South America", EU: "Europe",
  AF: "Africa", AS: "Asia", OC: "Oceania",
};

// Full country names as stored in the Player model
const continentCountries: Record<string, string[]> = {
  EU: ["France","Germany","United Kingdom","Spain","Italy","Netherlands","Belgium","Portugal",
       "Switzerland","Austria","Poland","Sweden","Norway","Denmark","Finland","Czech Republic",
       "Hungary","Romania","Slovakia","Croatia","Slovenia","Estonia","Latvia","Lithuania",
       "Bulgaria","Greece","Ireland","Luxembourg","Serbia","Ukraine","Turkey","Iceland"],
  NA: ["USA","Canada","Mexico"],
  SA: ["Brazil","Argentina","Chile","Colombia","Peru","Uruguay","Ecuador","Bolivia","Venezuela","Paraguay"],
  AS: ["Japan","Singapore","South Korea","China","India","Thailand","Taiwan","Philippines",
       "Indonesia","Vietnam","Malaysia","Pakistan","Bangladesh","Hong Kong"],
  OC: ["Australia","New Zealand","Fiji","Papua New Guinea"],
  AF: ["South Africa","Nigeria","Kenya","Morocco","Ghana","Egypt","Tanzania","Ethiopia",
       "Senegal","Côte d'Ivoire","Cameroon","Madagascar","Zimbabwe","Zambia"],
};

const statusOrder: Record<string, number> = { LIVE: 0, UPCOMING: 1, COMPLETED: 2 };

export default async function ContinentPage({
  params,
  searchParams,
}: {
  params: { code: string };
  searchParams: { page?: string };
}) {
  const code = params.code.toUpperCase();
  const countriesForContinent = continentCountries[code] ?? [];
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  const playerWhere = {
    status: "ACTIVE" as const,
    ...(countriesForContinent.length > 0 ? { country: { in: countriesForContinent } } : {}),
  };

  const [tournaments, players, playerCount] = await Promise.all([
    prisma.tournament.findMany({
      where: { continentCode: code },
      include: { teams: true },
      orderBy: { dateStart: "asc" },
    }),
    prisma.player.findMany({
      where: playerWhere,
      select: { id: true, slug: true, name: true, country: true, city: true, photoPath: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PLAYERS_PER_PAGE,
      take: PLAYERS_PER_PAGE,
    }),
    prisma.player.count({ where: playerWhere }),
  ]);

  const totalPages = Math.max(1, Math.ceil(playerCount / PLAYERS_PER_PAGE));

  const sorted = [...tournaments].sort((a, b) => {
    const diff = statusOrder[a.status] - statusOrder[b.status];
    return diff !== 0 ? diff : new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime();
  });

  return (
    <div className="continent-page">
      <div className="section-title">
        <h1>{continentNames[code] ?? code}</h1>
        <Link className="ghost" href="/">← Back</Link>
      </div>

      {/* Tournaments */}
      <section className="section" style={{ marginTop: 32 }}>
        <div className="section-header">
          <div>
            <h2>Tournaments</h2>
            <p>Live and upcoming first</p>
          </div>
          <Link className="primary" href="/tournament/new">+ New</Link>
        </div>
        {sorted.length > 0 ? (
          <div className="tournament-grid">
            {sorted.map((t) => (
              <TournamentCard key={t.id} tournament={t} teamCount={t.teams.length} />
            ))}
          </div>
        ) : (
          <div className="empty-state"><p>No tournaments yet for this continent.</p></div>
        )}
      </section>

      {/* Players */}
      <section className="section">
        <div className="section-header">
          <div>
            <h2>Players</h2>
            <p>{playerCount} joueur{playerCount > 1 ? "s" : ""} actif{playerCount > 1 ? "s" : ""}</p>
          </div>
        </div>
        {players.length > 0 ? (
          <>
            <div className="player-grid">
              {players.map((p) => (
                <PlayerCard
                  key={p.id}
                  id={p.id}
                  slug={p.slug}
                  name={p.name}
                  country={p.country}
                  city={p.city}
                  photoPath={p.photoPath}
                />
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} basePath={`/continent/${code}`} />
          </>
        ) : (
          <div className="empty-state"><p>No active players registered yet.</p></div>
        )}
      </section>
    </div>
  );
}
