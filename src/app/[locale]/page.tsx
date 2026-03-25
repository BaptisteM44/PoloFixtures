import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/db";
import { getTranslations, getLocale } from "next-intl/server";
import { TournamentCard } from "@/components/TournamentCard";
import { CalendarGrid } from "@/components/CalendarGrid";
import type { CalendarTournament } from "@/components/CalendarGrid";
import { auth } from "@/lib/auth";
import TournamentMapClient from "@/components/TournamentMapClient";
import type { MapTournament } from "@/components/TournamentMap";
import { syncLiveTournamentsCompletion } from "@/lib/tournament-status";

const CONTINENT_CODES = ["NA", "SA", "EU", "AF", "AS", "OC"] as const;

export default async function HomePage() {
  await syncLiveTournamentsCompletion();

  const t = await getTranslations("home");
  const tc = await getTranslations("common");
  const locale = await getLocale();
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

  const session = await auth();
  const currentPlayerId = (session?.user as any)?.playerId ?? null;

  // Get player country for map auto-focus
  let playerContinent: string | null = null;
  if (currentPlayerId) {
    const player = await prisma.player.findUnique({ where: { id: currentPlayerId }, select: { country: true } });
    if (player) playerContinent = countryToContinent[player.country] ?? null;
  }

  // Fetch upcoming tournaments for logged-in player
  let myUpcomingTournaments: { id: string; slug: string | null; name: string; city: string; country: string; dateStart: Date; dateEnd: Date; format: string }[] = [];
  if (currentPlayerId) {
    const entries = await prisma.teamPlayer.findMany({
      where: { playerId: currentPlayerId, team: { tournament: { status: "UPCOMING", approved: true } } },
      include: { team: { include: { tournament: { select: { id: true, slug: true, name: true, city: true, country: true, dateStart: true, dateEnd: true, format: true } } } } },
    });
    const soloEntries = await prisma.tournamentSoloEntry.findMany({
      where: { playerId: currentPlayerId, tournament: { status: "UPCOMING", approved: true }, waitlisted: false },
      include: { tournament: { select: { id: true, slug: true, name: true, city: true, country: true, dateStart: true, dateEnd: true, format: true } } },
    });
    const seen = new Set<string>();
    for (const e of entries) {
      if (!seen.has(e.team.tournament.id)) { seen.add(e.team.tournament.id); myUpcomingTournaments.push(e.team.tournament); }
    }
    for (const e of soloEntries) {
      if (!seen.has(e.tournament.id)) { seen.add(e.tournament.id); myUpcomingTournaments.push(e.tournament); }
    }
    myUpcomingTournaments.sort((a, b) => a.dateStart.getTime() - b.dateStart.getTime());
  }

  const [activeTournaments, allTournaments, countryCounts, mapTournaments, recentPlayers, totalPlayers, totalCountries] = await Promise.all([
    prisma.tournament.findMany({
      where: { status: { in: ["LIVE", "UPCOMING"] }, approved: true },
      include: { teams: { where: { selected: true } } },
      orderBy: { dateStart: "asc" },
      take: 20,
    }),
    prisma.tournament.findMany({
      where: { approved: true },
      select: { id: true, slug: true, name: true, dateStart: true, dateEnd: true, status: true, city: true, country: true, format: true },
      orderBy: { dateStart: "asc" },
    }),
    prisma.player.groupBy({
      by: ["country"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    }),
    prisma.tournament.findMany({
      where: { status: { in: ["LIVE", "UPCOMING"] }, approved: true, lat: { not: null }, lng: { not: null } },
      select: { id: true, slug: true, name: true, city: true, country: true, continentCode: true, format: true, dateStart: true, dateEnd: true, status: true, registrationStart: true, registrationEnd: true, lat: true, lng: true },
      orderBy: [{ status: "asc" }, { dateStart: "asc" }],
    }),
    prisma.player.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, slug: true, name: true, photoPath: true, city: true, country: true },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.player.count({ where: { status: "ACTIVE" } }),
    prisma.player.findMany({
      where: { status: "ACTIVE" },
      select: { country: true },
      distinct: ["country"],
    }),
  ]);

  // Fetch followed tournament IDs for current player
  let followedTournamentIds = new Set<string>();
  if (currentPlayerId) {
    const follows = await (prisma as any).tournamentFollow.findMany({
      where: { playerId: currentPlayerId },
      select: { tournamentId: true },
    });
    followedTournamentIds = new Set(follows.map((f: any) => f.tournamentId));
  }

  // Merge followed tournaments into active list
  const activeIds = new Set(activeTournaments.map((t) => t.id));
  let followedExtra: typeof activeTournaments = [];
  if (followedTournamentIds.size > 0) {
    const followedNotInActive = [...followedTournamentIds].filter((id) => !activeIds.has(id));
    if (followedNotInActive.length > 0) {
      followedExtra = await prisma.tournament.findMany({
        where: { id: { in: followedNotInActive }, approved: true, status: { in: ["LIVE", "UPCOMING"] } },
        include: { teams: { where: { selected: true } } },
      });
    }
  }

  // Sort: LIVE first, then UPCOMING by dateStart asc, cap at 12
  const sortedActiveTournaments = [...activeTournaments, ...followedExtra].sort((a, b) => {
    if (a.status === b.status) return new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime();
    return a.status === "LIVE" ? -1 : 1;
  }).slice(0, 12);

  const totalTournamentsSeason = allTournaments.length;
  const countryCount = totalCountries.length;

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
          <h1>{t("hero_title")}</h1>
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
            <li>{t("feature_live")}</li>
            <li>{t("feature_players")}</li>
            <li>{t("feature_clubs")}</li>
            <li>{t("feature_map")}</li>
            <li>{t("feature_calendar")}</li>
            <li>{t("feature_notifications")}</li>
          </ul>
        </div>
      </section>

      {/* ---- MAP SECTION (WIP) ---- */}
      {process.env.NEXT_PUBLIC_MAP_ENABLED === "true" && mapTournaments.length > 0 && (
        <TournamentMapClient
          tournaments={mapTournaments.map((t): MapTournament => ({
            id: t.id,
            slug: t.slug,
            name: t.name,
            city: t.city,
            country: t.country,
            continentCode: t.continentCode,
            format: t.format,
            dateStart: t.dateStart.toISOString(),
            dateEnd: t.dateEnd.toISOString(),
            status: t.status,
            registrationStart: t.registrationStart?.toISOString() ?? null,
            registrationEnd: t.registrationEnd?.toISOString() ?? null,
            lat: t.lat as number,
            lng: t.lng as number,
          }))}
          stats={{ players: totalPlayers, tournaments: totalTournamentsSeason, countries: countryCount, labels: { players: t("stats_players"), tournaments: t("stats_tournaments"), countries: t("stats_countries") } }}
          userContinent={playerContinent ?? undefined}
        />
      )}

      <div className="home-reorder">

      {/* ---- MY UPCOMING TOURNAMENTS (logged in only) ---- */}
      {currentPlayerId && myUpcomingTournaments.length > 0 && (
        <section className="section home-reorder__upcoming" style={{ paddingBottom: 0 }}>
          <div className="section-header">
            <h2>{t("hero_upcoming_title")}</h2>
            <Link className="ghost" href="/my-tournaments">{t("hero_upcoming_see_all")}</Link>
          </div>
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
            {myUpcomingTournaments.slice(0, 5).map((tour) => {
              const ds = tour.dateStart;
              return (
                <Link
                  key={tour.id}
                  href={`/tournament/${tour.slug ?? tour.id}`}
                  className="panel"
                  style={{ minWidth: 220, padding: "14px 18px", textDecoration: "none", flexShrink: 0, display: "block" }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--teal)", fontFamily: "var(--font-display)", marginBottom: 4 }}>
                    {ds.toLocaleDateString(locale, { day: "numeric", month: "short" })}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{tour.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{tour.city}, {tour.country}</div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ---- CONTINENTS ---- */}
      <section className="section home-reorder__continents" style={{ paddingBottom: 0 }}>
        <div className="continent-grid">
          {CONTINENT_CODES.map((code) => (
            <Link key={code} className="continent-card" href={`/tournaments?continent=${code}`}>
              <h3>{t(`continent_${code.toLowerCase()}`)}</h3>
              {playerCountByContinent[code] ? (
                <span className="continent-stat">
                  {playerCountByContinent[code]} {tc("players")}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      </section>

      {/* ---- LIVE + UPCOMING TOURNAMENTS ---- */}
      <section className="section home-reorder__active">
        <div className="section-header">
          <div>
            <h2>{t("section_active_title")}</h2>
            <p>{t("section_active_subtitle")}</p>
          </div>
          <Link className="ghost" href="/tournaments">{tc("see_all")}</Link>
        </div>
        {sortedActiveTournaments.length > 0 ? (
          <div className="tournament-grid">
            {sortedActiveTournaments.map((tour) => (
              <TournamentCard
                key={tour.id}
                tournament={tour}
                teamCount={tour.teams.length}
                initialFollowing={followedTournamentIds.has(tour.id)}
                isLoggedIn={!!currentPlayerId}
              />
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

      </div>

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
            slug: t.slug,
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

      {/* ---- RECENT PLAYERS ---- */}
      {recentPlayers.length > 0 && (
        <section className="section">
          <div className="section-header">
            <h2>{t("section_recent_players")}</h2>
          </div>
          <div className="recent-players">
            {recentPlayers.map((p) => (
              <Link key={p.id} href={`/player/${p.slug ?? p.id}`} className="recent-player-card">
                <div className="recent-player-card__avatar">
                  {p.photoPath
                    ? <img src={p.photoPath} alt={p.name} />
                    : <span>{p.name[0]?.toUpperCase()}</span>
                  }
                </div>
                <div className="recent-player-card__name">{p.name}</div>
                <div className="recent-player-card__location">{p.city ? `${p.city}, ` : ""}{p.country}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
