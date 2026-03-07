import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/db";
import { getTranslations } from "next-intl/server";
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
  const t = await getTranslations("home");
  const tc = await getTranslations("common");
  const countryToContinent: Record<string, string> = {
    France: "EU", Germany: "EU", "United Kingdom": "EU", Spain: "EU", Italy: "EU",
    Netherlands: "EU", Belgium: "EU", Portugal: "EU", Switzerland: "EU", Austria: "EU",
    Poland: "EU", Sweden: "EU", Norway: "EU", Denmark: "EU", Finland: "EU",
    "Czech Republic": "EU", Hungary: "EU", Romania: "EU", Slovakia: "EU", Croatia: "EU",
    Ireland: "EU", Greece: "EU", Serbia: "EU", Ukraine: "EU",
    USA: "NA", Canada: "NA", Mexico: "NA",
    Brazil: "SA", Argentina: "SA", Chile: "SA", Colombia: "SA", Peru: "SA",
    Uruguay: "SA", Ecuador: "SA", Bolivia: "SA", Venezuela: "SA",
    Japan: "AS", Singapore: "AS", "South Korea": "AS", China: "AS", India: "AS",
    Thailand: "AS", Taiwan: "AS", Philippines: "AS", Indonesia: "AS", Vietnam: "AS",
    Malaysia: "AS", Pakistan: "AS",
    Australia: "OC", "New Zealand": "OC", Fiji: "OC",
    "South Africa": "AF", Nigeria: "AF", Kenya: "AF", Morocco: "AF", Ghana: "AF",
    Egypt: "AF", Tanzania: "AF", Senegal: "AF",
  };

  const [activeTournaments, allTournaments, countryCounts] = await Promise.all([
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
    prisma.player.groupBy({
      by: ["country"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    }),
  ]);

  const playerCountByContinent: Record<string, number> = {};
  for (const row of countryCounts) {
    const cont = countryToContinent[row.country];
    if (cont) playerCountByContinent[cont] = (playerCountByContinent[cont] ?? 0) + row._count._all;
  }

  return (
    <div className="home">
      {/* ---- HERO ---- */}
      <section className="hero">
        <div>
          <h1>
            <em>Bike Polo</em><br />
            {t("hero_title")}
          </h1>
          <p>{t("hero_subtitle")}</p>
          <div className="hero-actions">
            <Link className="primary" href="/tournament/new">{t("hero_create")}</Link>
            <Link className="ghost" href="/tournaments">{t("hero_browse")}</Link>
          </div>
        </div>
        <div className="hero-feature-card">
          <h3>{t("features_title")}</h3>
          <ul>
            <li>{t("feature_pools")}</li>
            <li>{t("feature_referee")}</li>
            <li>{t("feature_bracket")}</li>
            <li>{t("feature_live")}</li>
            <li>{t("feature_players")}</li>
          </ul>
        </div>
      </section>

      {/* ---- CONTINENTS ---- */}
      <section className="section" style={{ paddingBottom: 0 }}>
        <div className="continent-grid">
          {continents.map((c) => (
            <Link key={c.code} className="continent-card" href={`/continent/${c.code}`}>
              <h3>{c.name}</h3>
              {playerCountByContinent[c.code] ? (
                <span className="continent-stat">
                  {playerCountByContinent[c.code]} player{playerCountByContinent[c.code] > 1 ? "s" : ""}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      </section>

      {/* ---- LIVE + UPCOMING TOURNAMENTS ---- */}
      <section className="section">
        <div className="section-header">
          <div>
            <h2>{t("section_active_title")}</h2>
            <p>{t("section_active_subtitle")}</p>
          </div>
          <Link className="ghost" href="/tournaments">{tc("see_all")}</Link>
        </div>
        {activeTournaments.length > 0 ? (
          <div className="tournament-grid">
            {activeTournaments.map((tour) => (
              <TournamentCard key={tour.id} tournament={tour} teamCount={tour.teams.length} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>{t("empty_no_active")}</p>
            <Link className="primary" style={{ marginTop: 12, display: "inline-flex" }} href="/tournament/new">
              {t("btn_create_first")}
            </Link>
          </div>
        )}
      </section>

      {/* ---- CALENDAR ---- */}
      <section className="section">
        <div className="section-header">
          <div>
            <h2>{t("section_calendar_title")}</h2>
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

    </div>
  );
}
