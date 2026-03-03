import Link from "next/link";
import { prisma } from "@/lib/db";
import { TournamentCard } from "@/components/TournamentCard";
import { CalendarGrid } from "@/components/CalendarGrid";
import type { CalendarTournament } from "@/components/CalendarGrid";

const continents = [
  { code: "NA", name: "North America", subtitle: "USA · Canada · Mexico" },
  { code: "SA", name: "South America", subtitle: "Brazil · Argentina" },
  { code: "EU", name: "Europe",        subtitle: "France · Germany · UK" },
  { code: "AF", name: "Africa",        subtitle: "Rising scenes" },
  { code: "AS", name: "Asia",          subtitle: "Japan · Singapore" },
  { code: "OC", name: "Oceania",       subtitle: "Australia · NZ" },
];

export default async function HomePage() {
  const [activeTournaments, countryCounts] = await Promise.all([
    prisma.tournament.findMany({
      where: { status: { in: ["LIVE", "UPCOMING"] }, approved: true },
      include: { teams: true },
      orderBy: [{ status: "asc" }, { dateStart: "asc" }],
      take: 8,
    }),
    prisma.player.groupBy({
      by: ["country"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    }),
  ]);

  // Map full country names (as stored in DB) to continent codes
  const countryToContinent: Record<string, string> = {
    // Europe
    France: "EU", Germany: "EU", "United Kingdom": "EU", Spain: "EU", Italy: "EU",
    Netherlands: "EU", Belgium: "EU", Portugal: "EU", Switzerland: "EU", Austria: "EU",
    Poland: "EU", Sweden: "EU", Norway: "EU", Denmark: "EU", Finland: "EU",
    "Czech Republic": "EU", Hungary: "EU", Romania: "EU", Slovakia: "EU", Croatia: "EU",
    Ireland: "EU", Greece: "EU", Serbia: "EU", Ukraine: "EU",
    // North America
    USA: "NA", Canada: "NA", Mexico: "NA",
    // South America
    Brazil: "SA", Argentina: "SA", Chile: "SA", Colombia: "SA", Peru: "SA",
    Uruguay: "SA", Ecuador: "SA", Bolivia: "SA", Venezuela: "SA",
    // Asia
    Japan: "AS", Singapore: "AS", "South Korea": "AS", China: "AS", India: "AS",
    Thailand: "AS", Taiwan: "AS", Philippines: "AS", Indonesia: "AS", Vietnam: "AS",
    Malaysia: "AS", Pakistan: "AS",
    // Oceania
    Australia: "OC", "New Zealand": "OC", Fiji: "OC",
    // Africa
    "South Africa": "AF", Nigeria: "AF", Kenya: "AF", Morocco: "AF", Ghana: "AF",
    Egypt: "AF", Tanzania: "AF", Senegal: "AF",
  };

  function getContinent(c: string) {
    return countryToContinent[c] ?? null;
  }

  const playerCountByContinent: Record<string, number> = {};
  for (const row of countryCounts) {
    const cont = getContinent(row.country);
    if (cont) playerCountByContinent[cont] = (playerCountByContinent[cont] ?? 0) + row._count._all;
  }

  return (
    <div className="home">
      {/* ---- HERO ---- */}
      <section className="hero">
        <div>
          <h1>
            The <em>Bike Polo</em><br />
            Tournament Platform
          </h1>
          <p>Poules, brackets, arbitrage en live — tout sur une seule plateforme.</p>
          <div className="hero-actions">
            <Link className="primary" href="/tournament/new">+ Créer un tournoi</Link>
            <Link className="ghost" href="/tournaments">Voir les tournois</Link>
          </div>
        </div>
        <div className="hero-feature-card">
          <h3>Built for organizers</h3>
          <ul>
            <li>Pool standings &amp; schedules</li>
            <li>Referee console</li>
            <li>Bracket generator (SE / DE)</li>
            <li>Live updates</li>
            <li>Player cards &amp; profiles</li>
          </ul>
        </div>
      </section>

      {/* ---- LIVE + UPCOMING TOURNAMENTS ---- */}
      <section className="section">
        <div className="section-header">
          <div>
            <h2>Active Tournaments</h2>
            <p>Live and upcoming events worldwide</p>
          </div>
          <Link className="ghost" href="/continent/EU">See all →</Link>
        </div>
        {activeTournaments.length > 0 ? (
          <div className="tournament-grid">
            {activeTournaments.map((t) => (
              <TournamentCard key={t.id} tournament={t} teamCount={t.teams.length} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>No active tournaments right now.</p>
            <Link className="primary" style={{ marginTop: 12, display: "inline-flex" }} href="/tournament/new">
              Create the first one
            </Link>
          </div>
        )}
      </section>

      {/* ---- MINI CALENDAR ---- */}
      <section className="section">
        <div className="section-header">
          <div>
            <h2>Calendrier</h2>
            <p>Tournois à venir ce mois-ci</p>
          </div>
          <Link className="ghost" href="/calendar">Voir tout →</Link>
        </div>
        <CalendarGrid
          tournaments={activeTournaments.map((t): CalendarTournament => ({
            id: t.id,
            name: t.name,
            dateStart: t.dateStart.toISOString(),
            dateEnd: t.dateEnd.toISOString(),
            status: t.status,
            city: t.city,
            country: t.country,
            format: t.format,
          }))}
          mini
        />
      </section>

      {/* ---- CONTINENTS ---- */}
      <section className="section">
        <div className="section-header">
          <div>
            <h2>Browse by Continent</h2>
            <p>Explore tournaments and players near you</p>
          </div>
        </div>
        <div className="continent-grid">
          {continents.map((c) => (
            <Link key={c.code} className="continent-card" href={`/continent/${c.code}`}>
              <h3>{c.name}</h3>
              <p>{c.subtitle}</p>
              {playerCountByContinent[c.code] ? (
                <span className="continent-stat">
                  {playerCountByContinent[c.code]} player{playerCountByContinent[c.code] > 1 ? "s" : ""}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
