import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/db";
import { getTranslations, getLocale } from "next-intl/server";
import { TournamentCard } from "@/components/TournamentCard";
import { CalendarGrid } from "@/components/CalendarGrid";
import type { CalendarTournament } from "@/components/CalendarGrid";
import { auth } from "@/lib/auth";
import TournamentMapClient from "@/components/TournamentMapClient";
import type { MapTournament } from "@/components/TournamentMap";
import { HomeHeroPersonal, type HeroNextTournament } from "@/components/HomeHeroPersonal";
import { syncLiveTournamentsCompletion } from "@/lib/tournament-status";
import { countryToContinent } from "@/lib/country-utils";

const CONTINENT_CODES = ["NA", "SA", "EU", "AF", "AS", "OC"] as const;

export default async function HomePage() {
  await syncLiveTournamentsCompletion();

  const t = await getTranslations("home");
  const tc = await getTranslations("common");
  const locale = await getLocale();

  const session = await auth();
  const currentPlayerId = (session?.user as any)?.playerId ?? null;

  const [
    activeTournaments, allTournaments, countryCounts, mapTournaments, recentPlayers, totalPlayers, totalCountries,
    me, teamEntries, soloEntries, followsRaw, squadInvites, mySquadsRaw, clubSessionsRaw, awaitingDrawRaw,
  ] = await Promise.all([
    prisma.tournament.findMany({
      where: { status: { in: ["LIVE", "UPCOMING"] }, approved: true, hidden: false },
      include: { teams: { where: { selected: true } } },
      orderBy: { dateStart: "asc" },
      take: 20,
    }),
    prisma.tournament.findMany({
      where: { approved: true, hidden: false },
      select: { id: true, slug: true, name: true, dateStart: true, dateEnd: true, status: true, city: true, country: true, continentCode: true, format: true },
      orderBy: { dateStart: "asc" },
    }),
    prisma.player.groupBy({
      by: ["country"],
      where: { status: "ACTIVE", account: { isNot: null } },
      _count: { _all: true },
    }),
    prisma.tournament.findMany({
      where: { status: { in: ["LIVE", "UPCOMING"] }, approved: true, hidden: false, lat: { not: null }, lng: { not: null } },
      select: { id: true, slug: true, name: true, city: true, country: true, continentCode: true, format: true, dateStart: true, dateEnd: true, status: true, registrationStart: true, registrationEnd: true, lat: true, lng: true },
      orderBy: [{ status: "asc" }, { dateStart: "asc" }],
    }),
    prisma.player.findMany({
      where: { status: "ACTIVE", account: { isNot: null } },
      select: { id: true, slug: true, name: true, photoPath: true, city: true, country: true },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.player.count({ where: { status: "ACTIVE", account: { isNot: null } } }),
    prisma.player.findMany({
      where: { status: "ACTIVE", account: { isNot: null } },
      select: { country: true },
      distinct: ["country"],
    }),
    // Player complet : pays (map auto-focus) + tout ce qu'il faut pour afficher
    // sa carte de collection dans le hero personnalisé
    currentPlayerId
      ? prisma.player.findUnique({
          where: { id: currentPlayerId },
          select: {
            id: true, name: true, country: true, city: true, photoPath: true,
            clubLogoPath: true, teamLogoPath: true, badges: true, pinnedBadges: true,
            startYear: true, activeCard: true, whbpcCard: true,
            clubMemberships: { where: { status: "MEMBER" }, take: 1, include: { club: { select: { id: true, name: true, logoPath: true } } } },
          },
        })
      : Promise.resolve(null),
    // Upcoming tournaments for logged-in player (team entries, avec coéquipiers)
    currentPlayerId
      ? prisma.teamPlayer.findMany({
          where: { playerId: currentPlayerId, team: { tournament: { status: { in: ["UPCOMING", "LIVE"] }, approved: true } } },
          include: {
            team: {
              include: {
                tournament: { select: { id: true, slug: true, name: true, city: true, country: true, dateStart: true, dateEnd: true, format: true } },
                players: { include: { player: { select: { id: true, name: true, photoPath: true } } } },
              },
            },
          },
        })
      : Promise.resolve([]),
    // Solo entries
    currentPlayerId
      ? prisma.tournamentSoloEntry.findMany({
          where: { playerId: currentPlayerId, tournament: { status: { in: ["UPCOMING", "LIVE"] }, approved: true }, waitlisted: false },
          include: { tournament: { select: { id: true, slug: true, name: true, city: true, country: true, dateStart: true, dateEnd: true, format: true } } },
        })
      : Promise.resolve([]),
    // Followed tournament IDs
    currentPlayerId
      ? (prisma as any).tournamentFollow.findMany({
          where: { playerId: currentPlayerId },
          select: { tournamentId: true },
        })
      : Promise.resolve([]),
    // Pending squad invitations (requests waiting for my action)
    currentPlayerId
      ? prisma.squadInvitation.findMany({
          where: { invitedPlayerId: currentPlayerId, status: "PENDING" },
          include: {
            squad: { select: { id: true, name: true, logoPath: true, color: true } },
            invitedBy: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    // My squads (long-term teams)
    currentPlayerId
      ? prisma.squadMember.findMany({
          where: { playerId: currentPlayerId },
          include: {
            squad: {
              select: {
                id: true, name: true, logoPath: true, color: true,
                _count: { select: { members: true } },
              },
            },
          },
          orderBy: { joinedAt: "desc" },
        })
      : Promise.resolve([]),
    // Prochaines sessions d'entraînement de mes clubs
    currentPlayerId
      ? prisma.clubSession.findMany({
          where: {
            date: { gte: new Date() },
            status: "ACTIVE",
            club: { members: { some: { playerId: currentPlayerId, status: "MEMBER" } } },
          },
          select: {
            id: true, title: true, date: true, location: true,
            club: { select: { id: true, name: true } },
            venue: { select: { name: true } },
            attendees: {
              where: { status: "CONFIRMED" },
              select: { player: { select: { id: true, name: true, photoPath: true } } },
              take: 6,
            },
          },
          orderBy: { date: "asc" },
          take: 4,
        })
      : Promise.resolve([]),
    // Tournois où je suis inscrit mais le tirage n'a pas encore été fait
    currentPlayerId
      ? prisma.teamPlayer.findMany({
          where: {
            playerId: currentPlayerId,
            team: { tournament: { status: "UPCOMING", approved: true, selectionLocked: false } },
          },
          select: {
            team: {
              select: {
                tournament: { select: { id: true, slug: true, name: true, city: true, country: true, dateStart: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const playerContinent = me ? countryToContinent(me.country) : null;

  const myUpcomingTournaments: { id: string; slug: string | null; name: string; city: string; country: string; dateStart: Date; dateEnd: Date; format: string }[] = [];
  {
    const seen = new Set<string>();
    for (const e of teamEntries) {
      if (!seen.has(e.team.tournament.id)) { seen.add(e.team.tournament.id); myUpcomingTournaments.push(e.team.tournament); }
    }
    for (const e of soloEntries) {
      if (!seen.has(e.tournament.id)) { seen.add(e.tournament.id); myUpcomingTournaments.push(e.tournament); }
    }
    myUpcomingTournaments.sort((a, b) => a.dateStart.getTime() - b.dateStart.getTime());
  }

  // Hero perso : le prochain tournoi avec mon équipe (et coéquipiers) si j'en ai une
  let heroNext: HeroNextTournament | null = null;
  if (myUpcomingTournaments.length > 0) {
    const nextTour = myUpcomingTournaments[0];
    const myEntry = (teamEntries as any[]).find((e) => e.team.tournament.id === nextTour.id);
    heroNext = {
      id: nextTour.id,
      slug: nextTour.slug,
      name: nextTour.name,
      city: nextTour.city,
      country: nextTour.country,
      dateStart: nextTour.dateStart.toISOString(),
      dateEnd: nextTour.dateEnd.toISOString(),
      teamName: myEntry?.team.name ?? null,
      teammates: myEntry
        ? myEntry.team.players
            .filter((p: any) => p.player.id !== currentPlayerId)
            .map((p: any) => ({ id: p.player.id, name: p.player.name, photoPath: p.player.photoPath }))
        : [],
    };
  }
  const heroOthers = myUpcomingTournaments.slice(1, 4).map((tour) => ({
    id: tour.id,
    slug: tour.slug,
    name: tour.name,
    city: tour.city,
    dateStart: tour.dateStart.toISOString(),
  }));

  const followedTournamentIds = new Set<string>((followsRaw as any[]).map((f: any) => f.tournamentId));

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
    const cont = countryToContinent(row.country);
    if (cont) playerCountByContinent[cont] = (playerCountByContinent[cont] ?? 0) + row._count._all;
  }

  return (
    <div className="home">
      {/* ---- HERO : perso si connecté, marketing sinon ---- */}
      {me ? (
        <HomeHeroPersonal
          me={{
            name: me.name,
            country: me.country,
            city: me.city,
            photoPath: me.photoPath,
            clubLogoPath: me.clubLogoPath,
            clubName: (me as any).clubMemberships?.[0]?.club?.name ?? null,
            teamLogoPath: me.teamLogoPath,
            badges: me.badges,
            pinnedBadges: me.pinnedBadges,
            startYear: me.startYear,
            activeCard: (me as any).activeCard ?? null,
            whbpcData: (me as any).whbpcCard
              ? {
                  teamName: (me as any).whbpcCard.teamName,
                  yearStarted: (me as any).whbpcCard.yearStarted,
                  countryCode: (me as any).whbpcCard.countryCode,
                  bestSkill: (me as any).whbpcCard.bestSkill,
                  pedals: (me as any).whbpcCard.pedals,
                  hand: (me as any).whbpcCard.hand,
                  wheelSize: (me as any).whbpcCard.wheelSize,
                  gearRatio: (me as any).whbpcCard.gearRatio,
                }
              : null,
          }}
          next={heroNext}
          others={heroOthers}
          sessions={(clubSessionsRaw as any[]).map((s) => ({
            id: s.id,
            title: s.title,
            date: s.date.toISOString(),
            clubId: s.club.id,
            clubName: s.club.name,
            place: s.venue?.name ?? s.location ?? null,
          }))}
          awaitingDraw={(() => {
            const seen = new Set<string>();
            const out: { id: string; slug: string | null; name: string; city: string; dateStart: string }[] = [];
            for (const e of awaitingDrawRaw as any[]) {
              const tr = e.team.tournament;
              if (seen.has(tr.id)) continue;
              seen.add(tr.id);
              out.push({ id: tr.id, slug: tr.slug, name: tr.name, city: tr.city, dateStart: tr.dateStart.toISOString() });
            }
            return out;
          })()}
          inviteCount={(squadInvites as any[]).length}
          squadCount={(mySquadsRaw as any[]).length}
          locale={locale}
        />
      ) : (
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
      )}

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
            continentCode: t.continentCode,
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
