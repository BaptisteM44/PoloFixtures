import Link from "next/link";
import { prisma } from "@/lib/db";
import { TournamentCard } from "@/components/TournamentCard";
import { ClubCard } from "@/components/ClubCard";

const continentNames: Record<string, string> = {
  NA: "North America", SA: "South America", EU: "Europe",
  AF: "Africa", AS: "Asia", OC: "Oceania",
};

export default async function ContinentPage({
  params,
}: {
  params: { code: string };
}) {
  const code = params.code.toUpperCase();

  const [tournaments, clubs, clubCountByCountry] = await Promise.all([
    prisma.tournament.findMany({
      where: { continentCode: code, status: { in: ["LIVE", "UPCOMING"] } },
      include: { teams: true },
      orderBy: [{ status: "asc" }, { dateStart: "asc" }],
    }),
    prisma.club.findMany({
      where: { continentCode: code, approved: true },
      include: { _count: { select: { members: { where: { status: "MEMBER" } } } } },
      orderBy: { name: "asc" },
    }),
    prisma.club.groupBy({
      by: ["country"],
      where: { continentCode: code, approved: true },
      _count: { _all: true },
    }),
  ]);

  const countryMap: Record<string, number> = {};
  for (const row of clubCountByCountry) countryMap[row.country] = row._count._all;

  const countries = [...new Set(clubs.map((c) => c.country))].sort();

  return (
    <div className="continent-page">
      <div className="section-title">
        <h1>{continentNames[code] ?? code}</h1>
        <Link className="ghost" href="/">← Back</Link>
      </div>

      {/* Tournaments — live & upcoming uniquement */}
      <section className="section" style={{ marginTop: 32 }}>
        <div className="section-header">
          <div>
            <h2>Tournaments</h2>
            <p>Événements live et à venir</p>
          </div>
          <Link className="primary" href="/tournament/new">+ New</Link>
        </div>
        {tournaments.length > 0 ? (
          <div className="tournament-grid">
            {tournaments.map((t) => (
              <TournamentCard key={t.id} tournament={t} teamCount={t.teams.length} />
            ))}
          </div>
        ) : (
          <div className="empty-state"><p>Aucun tournoi à venir pour ce continent.</p></div>
        )}
      </section>

      {/* Clubs par pays */}
      <section className="section">
        <div className="section-header">
          <div>
            <h2>Clubs</h2>
            <p>{clubs.length} club{clubs.length > 1 ? "s" : ""} au total</p>
          </div>
          <Link className="primary" href="/club/new">+ Ajouter un club</Link>
        </div>

        {countries.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {countries.map((country) => {
              const countryClubs = clubs.filter((c) => c.country === country);
              return (
                <div key={country}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <h3 style={{ margin: 0 }}>{country}</h3>
                    <Link href={`/continent/${code}/${encodeURIComponent(country)}`} className="ghost" style={{ fontSize: 13 }}>
                      Voir tout ({countryMap[country] ?? 0}) →
                    </Link>
                  </div>
                  <div className="club-grid">
                    {countryClubs.slice(0, 4).map((c) => (
                      <ClubCard
                        key={c.id}
                        id={c.id}
                        name={c.name}
                        city={c.city}
                        country={c.country}
                        logoPath={c.logoPath ?? undefined}
                        memberCount={c._count.members}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <p>Aucun club pour ce continent.</p>
            <Link className="primary" href="/club/new" style={{ marginTop: 12, display: "inline-flex" }}>
              Créer le premier club
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
