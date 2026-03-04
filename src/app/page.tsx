import Link from "next/link";
import { prisma } from "@/lib/db";
import { TournamentCard } from "@/components/TournamentCard";
import { CalendarGrid } from "@/components/CalendarGrid";
import type { CalendarTournament } from "@/components/CalendarGrid";

const continents = [
  { code: "NA", name: "North America" },
  { code: "SA", name: "South America" },
  { code: "EU", name: "Europe" },
  { code: "AF", name: "Africa" },
  { code: "AS", name: "Asia" },
  { code: "OC", name: "Oceania" },
];

export default async function HomePage() {
  const [activeTournaments, allTournaments] = await Promise.all([
    prisma.tournament.findMany({
      where: { status: { in: ["LIVE", "UPCOMING"] }, approved: true },
      include: { teams: true },
      orderBy: [{ status: "asc" }, { dateStart: "asc" }],
      take: 8,
    }),
    prisma.tournament.findMany({
      where: { approved: true },
      select: { id: true, name: true, dateStart: true, dateEnd: true, status: true, city: true, country: true, format: true },
      orderBy: { dateStart: "asc" },
    }),
  ]);

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

      {/* ---- CALENDAR ---- */}
      <section className="section">
        <div className="section-header">
          <div>
            <h2>Calendrier des tournois</h2>
          </div>
        </div>
        <CalendarGrid
          tournaments={allTournaments.map((t): CalendarTournament => ({
            id: t.id,
            name: t.name,
            dateStart: t.dateStart.toISOString(),
            dateEnd: t.dateEnd.toISOString(),
            status: t.status,
            city: t.city,
            country: t.country,
            format: t.format,
          }))}
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
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
