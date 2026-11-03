import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/db";
import { getTranslations, getLocale } from "next-intl/server";
import { TournamentCard } from "@/components/TournamentCard";
import { CalendarGrid } from "@/components/CalendarGrid";
import type { CalendarTournament } from "@/components/CalendarGrid";
import { auth } from "@/lib/auth";
import TournamentMapClient from "@/components/TournamentMapClient";
import type { MapTournament } from "@/components/TournamentMap";
import { HomeBento, type BentoMyTournament, type BentoOpenTournament } from "@/components/HomeBento";
import { HomeInstallBanner } from "@/components/HomeInstallBanner";
import type { TrainingTileData } from "@/components/NextTrainingCard";
import { ensureRecurringSessions } from "@/lib/club-sessions";
import { syncLiveTournamentsCompletion } from "@/lib/tournament-status";
import { countryToContinent } from "@/lib/country-utils";
import { localeAlternates } from "@/lib/seo";

export async function generateMetadata({ params }: { params: { locale: string } }) {
  return { alternates: localeAlternates(params.locale, "/") };
}

const CONTINENT_CODES = ["NA", "SA", "EU", "AF", "AS", "OC"] as const;

export default async function HomePage() {
  await syncLiveTournamentsCompletion();

  const t = await getTranslations("home");
  const tc = await getTranslations("common");
  const locale = await getLocale();

  const session = await auth();
  const currentPlayerId = (session?.user as any)?.playerId ?? null;

  // Séries d'entraînement de mes clubs : dates des 4 prochaines semaines créées
  // au passage (plus d'entraînements qui « disparaissent » faute de clic).
  if (currentPlayerId) {
    const myClubs = await prisma.clubMember.findMany({ where: { playerId: currentPlayerId, status: "MEMBER" }, select: { clubId: true } });
    await ensureRecurringSessions(myClubs.map((c) => c.clubId));
  }

  const now = new Date();
  const in14Days = new Date(now.getTime() + 14 * 86_400_000);
  // Ce qu'il faut de chaque tournoi où je suis inscrit pour les tuiles de la home.
  const myTournamentSelect = {
    id: true, slug: true, name: true, city: true, country: true, dateStart: true, dateEnd: true, format: true,
    maxTeams: true, bannerPath: true, selectionLocked: true,
    _count: { select: { teams: { where: { selected: true } } } },
  } as const;

  const [
    activeTournaments, allTournaments, countryCounts, mapTournaments, recentPlayers, totalPlayers, totalCountries,
    me, teamEntries, soloEntries, followsRaw, clubSessionsRaw, trainingsIn14Days, openRegistrationsRaw,
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
            startYear: true, activeCard: true, whbpcCard: true, coachCard: true,
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
                tournament: { select: myTournamentSelect },
              },
            },
          },
        })
      : Promise.resolve([]),
    // Solo entries
    currentPlayerId
      ? prisma.tournamentSoloEntry.findMany({
          where: { playerId: currentPlayerId, tournament: { status: { in: ["UPCOMING", "LIVE"] }, approved: true }, waitlisted: false },
          include: { tournament: { select: myTournamentSelect } },
        })
      : Promise.resolve([]),
    // Followed tournament IDs
    currentPlayerId
      ? (prisma as any).tournamentFollow.findMany({
          where: { playerId: currentPlayerId },
          select: { tournamentId: true },
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
            id: true, title: true, date: true, location: true, duration: true, color: true,
            club: { select: { id: true, name: true } },
            venue: { select: { name: true, mapLink: true, color: true } },
            attendees: {
              where: { status: { in: ["CONFIRMED", "PENDING"] } },
              select: { status: true, player: { select: { id: true, name: true, photoPath: true } } },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { content: true, player: { select: { name: true } } },
            },
            _count: { select: { messages: true } },
          },
          orderBy: { date: "asc" },
          take: 1, // seul le prochain entraînement est affiché
        })
      : Promise.resolve([]),
    // Nombre d'entraînements de mes clubs dans les 14 prochains jours (résumé sous « Salut »)
    currentPlayerId
      ? prisma.clubSession.count({
          where: {
            date: { gte: now, lte: in14Days },
            status: "ACTIVE",
            club: { members: { some: { playerId: currentPlayerId, status: "MEMBER" } } },
          },
        })
      : Promise.resolve(0),
    // Tuile « Inscriptions ouvertes » : même règle que getTournamentStatusBadge (début ET fin
    // d'inscription renseignés, maintenant entre les deux), hors tournois où je suis déjà inscrit.
    // On en prend plus que 3 pour pouvoir remonter ceux de mon continent.
    currentPlayerId
      ? prisma.tournament.findMany({
          where: {
            approved: true, hidden: false, status: "UPCOMING",
            registrationStart: { lte: now }, registrationEnd: { gte: now },
            NOT: [
              { teams: { some: { players: { some: { playerId: currentPlayerId } } } } },
              { soloEntries: { some: { playerId: currentPlayerId } } },
            ],
          },
          select: {
            id: true, slug: true, name: true, city: true, country: true, continentCode: true, dateStart: true, maxTeams: true,
            _count: { select: { teams: { where: { selected: true } } } },
          },
          orderBy: { dateStart: "asc" },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  const playerContinent = me ? countryToContinent(me.country) : null;

  // Mes tournois à venir / en cours : UNE entrée par tournoi (équipe ou solo), avec son
  // statut — plus de liste « tirage en attente » à part qui doublonnait l'agenda.
  const myUpcomingTournaments: BentoMyTournament[] = [];
  {
    const seen = new Set<string>();
    const push = (tr: (typeof teamEntries)[number]["team"]["tournament"], teamName: string | null) => {
      if (seen.has(tr.id)) return;
      seen.add(tr.id);
      myUpcomingTournaments.push({
        id: tr.id, slug: tr.slug, name: tr.name, city: tr.city, country: tr.country,
        dateStart: tr.dateStart, dateEnd: tr.dateEnd, format: tr.format,
        maxTeams: tr.maxTeams, teamCount: tr._count.teams, bannerPath: tr.bannerPath,
        awaitingDraw: !tr.selectionLocked, teamName,
      });
    };
    for (const e of teamEntries) push(e.team.tournament, e.team.name);
    for (const e of soloEntries) push(e.tournament, null);
    myUpcomingTournaments.sort((a, b) => a.dateStart.getTime() - b.dateStart.getTime());
  }

  // Mon continent d'abord (AP couvre l'Asie et l'Océanie), puis par date.
  const inMyContinent = (code: string) =>
    !!playerContinent && (code === playerContinent || (code === "AP" && (playerContinent === "AS" || playerContinent === "OC")));
  const openRegistrations: BentoOpenTournament[] = [...openRegistrationsRaw]
    .sort((a, b) => Number(inMyContinent(b.continentCode)) - Number(inMyContinent(a.continentCode)) || a.dateStart.getTime() - b.dateStart.getTime())
    .slice(0, 3)
    .map((o) => ({
      id: o.id, slug: o.slug, name: o.name, city: o.city, country: o.country,
      dateStart: o.dateStart, maxTeams: o.maxTeams, teamCount: o._count.teams,
    }));

  const tournamentsIn14Days = myUpcomingTournaments.filter(
    (tour) => tour.dateStart <= in14Days && tour.dateEnd.getTime() + 86_400_000 > now.getTime(),
  ).length;

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

  // Prochain entraînement de mes clubs (30 jours) : UNE tuile, à côté du prochain tournoi.
  const trainingTiles: TrainingTileData[] = currentPlayerId
    ? (clubSessionsRaw as any[])
        .filter((s) => s.date.getTime() - now.getTime() <= 30 * 86_400_000)
        .slice(0, 1)
        .map((s) => {
          const mine = s.attendees.find((a: any) => a.player.id === currentPlayerId);
          return {
            id: s.id,
            clubId: s.club.id,
            clubName: s.club.name,
            title: s.title,
            date: s.date.toISOString(),
            duration: s.duration,
            place: s.venue?.name ?? s.location ?? null,
            mapLink: s.venue?.mapLink ?? null,
            color: s.color ?? s.venue?.color ?? null,
            attendees: s.attendees.filter((a: any) => a.status === "CONFIRMED").map((a: any) => a.player),
            myStatus: mine?.status ?? null,
            lastMessage: s.messages[0] ? { name: s.messages[0].player.name, content: s.messages[0].content } : null,
            messageCount: s._count.messages,
          };
        })
    : [];

  const mapData: MapTournament[] = mapTournaments.map((t) => ({
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
  }));
  const showMap = process.env.NEXT_PUBLIC_MAP_ENABLED === "true" && mapData.length > 0;

  return (
    <div className="home">
      {/* ---- Connecté : home en tuiles · visiteur : hero marketing ---- */}
      {me ? (
        <HomeBento
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
            coachData: (me as any).coachCard ?? null,
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
          upcoming={myUpcomingTournaments}
          training={trainingTiles[0] ?? null}
          open={openRegistrations}
          community={{
            players: totalPlayers,
            countries: countryCount,
            tournaments: totalTournamentsSeason,
            byContinent: CONTINENT_CODES
              .map((code) => ({ code, count: playerCountByContinent[code] ?? 0 }))
              .sort((a, b) => b.count - a.count),
          }}
          recentPlayers={recentPlayers}
          summary={{ tournaments: tournamentsIn14Days, trainings: trainingsIn14Days }}
          mapSlot={showMap ? <TournamentMapClient variant="bento" tournaments={mapData} userContinent={playerContinent ?? undefined} /> : null}
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

      <div className="home-banners">
        <HomeInstallBanner />
      </div>

      {/* ---- MAP SECTION (visiteur ; en tuile dans la home connectée) ---- */}
      {!me && showMap && (
        <TournamentMapClient
          tournaments={mapData}
          stats={{ players: totalPlayers, tournaments: totalTournamentsSeason, countries: countryCount, labels: { players: t("stats_players"), tournaments: t("stats_tournaments"), countries: t("stats_countries") } }}
        />
      )}

      <div className="home-reorder">

      {/* ---- CONTINENTS (visiteur ; tuile « La communauté » si connecté) ---- */}
      {!me && (
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
      )}

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

      {/* ---- RECENT PLAYERS (visiteur ; tuile dans la home connectée) ---- */}
      {!me && recentPlayers.length > 0 && (
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
