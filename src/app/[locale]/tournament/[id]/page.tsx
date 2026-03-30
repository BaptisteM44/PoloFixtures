// @ts-nocheck
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { Tabs } from "@/components/Tabs";
import { ScheduleBoard } from "@/components/ScheduleBoard";
import { PoolTables } from "@/components/PoolTables";
import { BracketView } from "@/components/BracketView";
import { PokemonCard } from "@/components/PokemonCard";
import { toYoutubeEmbed } from "@/lib/youtube";
import { computePlayerBadges } from "@/lib/achievements";
import { auth } from "@/lib/auth";
import { FreeAgentForm } from "@/components/FreeAgentForm";
import { FreeAgentList } from "@/components/FreeAgentList";
import { RegisterTeamForm } from "@/components/RegisterTeamForm";
import { computeStandings } from "@/lib/standings";
import { deleteFreeAgentAction, toggleTeamSelectedAction, drawTeamsAction, toggleTeamGuaranteedAction, drawOneTeamAction, drawOneWaitlistAction, removeFromWaitlistAction, renameTeamAction, deleteTeamAction, removePlayerFromTeamAction, addPlayerToTeamAction, createTeamAction } from "./edit/actions";
import { TeamManager } from "@/components/TeamManager";
import { SelectionManager } from "@/components/SelectionManager";
import { TournamentChat } from "@/components/TournamentChat";
import { TelegramWidget } from "@/components/TelegramWidget";
import { LiveMatchTile } from "@/components/LiveMatchTile";
import { OrgaNoteEditor } from "@/components/OrgaNoteEditor";
import { OrgaTaskBoard } from "@/components/OrgaTaskBoard";
import { OrgaNoteBoard } from "@/components/OrgaNoteBoard";
import { OrgaLinkBoard } from "@/components/OrgaLinkBoard";
import { HeroCountdown } from "@/components/HeroCountdown";
import { TournamentRecap } from "@/components/TournamentRecap";
import { FollowButton } from "@/components/FollowButton";
import { SoloRegisterForm } from "@/components/SoloRegisterForm";
import { DrawPanel } from "@/components/DrawPanel";
import { syncTournamentCompletionById } from "@/lib/tournament-status";
import { TournamentCompletionWatcher } from "@/components/TournamentCompletionWatcher";
import { BracketActions } from "@/components/BracketActions";

function summarizeCities(players: { player: { city: string | null } }[]): string {
  const counts = new Map<string, number>();
  for (const tp of players) {
    const city = tp.player.city || "—";
    counts.set(city, (counts.get(city) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([city, n]) => (n > 1 ? `${city} (${n})` : city))
    .join(", ");
}

export default async function TournamentPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { tab?: string; view?: string };
}) {
  const view = searchParams.view ?? "cards";

  // ── Query principale — adaptée selon l'onglet actif ───────────────────
  // On récupère d'abord le tab depuis searchParams AVANT la query pour
  // ne charger les données lourdes (players, events) que si nécessaire.
  const activeTab = searchParams.tab;

  // Les onglets "equipes", "orga" et "recap" ont besoin des joueurs complets.
  // Pas de tab = page chargée sans ?tab= : on charge les players par précaution (recap default pour COMPLETED).
  const needsPlayers = !activeTab || activeTab === "equipes" || activeTab === "orga" || activeTab === "recap";
  // L'onglet "equipes" a besoin des events pour les badges.
  const needsEvents = activeTab === "equipes";
  // Les onglets sans matches : info, inscription, recap, communaute, equipes (matches via events)
  const noMatchesNeeded = ["inscription", "recap", "communaute"].includes(activeTab ?? "");

  const tournament = await prisma.tournament.findFirst({
    where: { OR: [{ id: params.id }, { slug: params.id }] },
    include: {
      sponsors: true,
      coOrganizers: { include: { player: { select: { id: true, name: true } } } },
      teams: needsPlayers
        ? { include: { players: { include: { player: { include: { account: { select: { id: true } } } } } } } }
        : { select: { id: true, name: true, seed: true, selected: true, guaranteed: true, waitlistPosition: true, city: true, country: true, registrationNote: true, orgaNote: true, tournamentId: true, color: true, playerALevel: true, playerBLevel: true, playerCLevel: true } },
      pools: activeTab === "pools"
        ? { include: { teams: { include: { team: true } } } }
        : false,
      matches: noMatchesNeeded ? false : {
        include: {
          teamA: true,
          teamB: true,
          ...(needsEvents ? { events: true } : {}),
        },
        orderBy: { startAt: "asc" },
      },
      freeAgents: (activeTab === "info" || activeTab === "communaute" || !activeTab)
        ? true
        : { select: { id: true } },
      soloEntries: (activeTab === "inscription" || activeTab === "orga")
        ? { include: { player: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" as const } }
        : false,
    }
  }) as any;

  if (!tournament) {
    return <div>Tournament not found</div>;
  }

  const syncedStatus = await syncTournamentCompletionById(tournament.id);
  if (syncedStatus && tournament.status !== syncedStatus) {
    tournament.status = syncedStatus;
  }

  const t = await getTranslations("tournament");
  const r = await getTranslations("registration");
  const tm = await getTranslations("team");
  const fa = await getTranslations("free_agent");
  const session = await auth();
  const role = (session?.user as any)?.role ?? null;
  const currentPlayerId = (session?.user as any)?.playerId ?? null;

  const t_ = tournament;
  const isCompleted = tournament.status === "COMPLETED";
  const tab = activeTab ?? (isCompleted ? "recap" : "info");

  const isFollowing = currentPlayerId
    ? await (prisma as any).tournamentFollow.findUnique({
        where: { playerId_tournamentId: { playerId: currentPlayerId, tournamentId: tournament.id } },
      }) !== null
    : false;
  const currentPlayerName = session?.user?.name ?? null;
  const charterAccepted = !!((session?.user as { charterAccepted?: boolean } | undefined)?.charterAccepted);
  const canEdit =
    role === "ADMIN" ||
    (role === "ORGA" && session?.user?.tournamentId === tournament.id) ||
    (!!currentPlayerId && currentPlayerId === tournament.creatorId) ||
    tournament.coOrganizers.some((co) => co.playerId === currentPlayerId);
  const isOrga = canEdit;

  // Bouton arbitrage : REF (global ou lié à ce tournoi), orga, admin, co-organisateur
  const canRef =
    canEdit ||
    (role === "REF" && (!session?.user?.tournamentId || session.user.tournamentId === tournament.id)) ||
    tournament.coOrganizers.some((co) => co.playerId === currentPlayerId);

  const swissMatches = (tournament.matches ?? []).filter((m: any) => m.phase === "SWISS");
  const hasSwiss = swissMatches.length > 0 || tournament.saturdayFormat === "SWISS";
  const allEvents = (tournament.matches ?? []).flatMap((m: any) => m.events ?? []);

  // When tournament is launched (LIVE/COMPLETED), show selected teams count instead of total registered
  const isLaunched = tournament.status === "LIVE" || tournament.status === "COMPLETED";
  const selectedTeams = tournament.teams.filter((t: any) => t.selected !== false);
  const displayTeamCount = isLaunched && selectedTeams.length > 0 ? selectedTeams.length : tournament.teams.length;

  const dateStart = new Date(tournament.dateStart).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const dateEnd = new Date(tournament.dateEnd).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

  const hasCommunity = tournament.freeAgents.length > 0 || t_.chatMode !== "DISABLED";
  const youtubeEmbed = toYoutubeEmbed(t_.streamYoutubeUrl);

  const now = new Date();
  const registrationOpen =
    (!tournament.registrationStart || now >= new Date(tournament.registrationStart)) &&
    (!tournament.registrationEnd || now <= new Date(tournament.registrationEnd));
  const registrationClosed = !!tournament.registrationEnd && now > new Date(tournament.registrationEnd);

  const tabs = [
    ...(isCompleted ? [{ label: t("tab_recap"), value: "recap", href: `/tournament/${params.id}?tab=recap` }] : []),
    { label: t("tab_info"), value: "info", href: `/tournament/${params.id}?tab=info` },
    ...(!registrationClosed ? [{ label: t("tab_registration"), value: "inscription", href: `/tournament/${params.id}?tab=inscription` }] : []),
    ...(isLaunched ? [{ label: t("tab_schedule"), value: "schedule", href: `/tournament/${params.id}?tab=schedule` }] : []),
    ...(isLaunched && tournament.saturdayFormat !== "SWISS" ? [{ label: t("tab_pools"), value: "pools", href: `/tournament/${params.id}?tab=pools` }] : []),
    ...(isLaunched && hasSwiss ? [{ label: t("tab_swiss"), value: "swiss", href: `/tournament/${params.id}?tab=swiss` }] : []),
    ...(isLaunched ? [{ label: t("tab_bracket"), value: "bracket", href: `/tournament/${params.id}?tab=bracket` }] : []),
    { label: t("tab_teams", { count: displayTeamCount }), value: "equipes", href: `/tournament/${params.id}?tab=equipes` },
    ...(youtubeEmbed || t_.chatMode !== "DISABLED" ? [{ label: t("tab_live"), value: "live", href: `/tournament/${params.id}?tab=live` }] : []),
    ...(hasCommunity ? [{ label: `${t("tab_free_agent")}${tournament.freeAgents.length > 0 ? ` (${tournament.freeAgents.length})` : ""}`, value: "communaute", href: `/tournament/${params.id}?tab=communaute` }] : []),
    ...(isOrga ? [{ label: t("tab_orga"), value: "orga", href: `/tournament/${params.id}?tab=orga` }] : []),
  ];


  // Orga dashboard data (only fetched when needed)
  let orgaTasks: { id: string; title: string; description: string | null; deadline: string | null; completed: boolean; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; assignedTo: { id: string; name: string } | null; createdBy: { id: string; name: string }; createdAt: string }[] = [];
  let orgaNotes: { id: string; content: string; author: { id: string; name: string }; createdAt: string; updatedAt: string }[] = [];
  let orgaLinks: { id: string; label: string; url: string; addedBy: { id: string; name: string }; createdAt: string }[] = [];

  if (isOrga && tab === "orga") {
    const [tasks, notes, links] = await Promise.all([
      prisma.orgaTask.findMany({
        where: { tournamentId: tournament.id },
        include: { assignedTo: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.orgaNote.findMany({
        where: { tournamentId: tournament.id },
        include: { author: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.orgaLink.findMany({
        where: { tournamentId: tournament.id },
        include: { addedBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    orgaTasks = tasks.map((t) => ({ ...t, priority: t.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT", deadline: t.deadline?.toISOString() ?? null, createdAt: t.createdAt.toISOString() }));
    orgaNotes = notes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString() }));
    orgaLinks = links.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }));
  }

  // Podium (extrait du bracket si tournoi terminé)
  type PodiumPlayer = { id: string; name: string; country: string; city?: string | null; photoPath?: string | null; badges?: string[]; startYear?: number | null; hand?: string | null; gender?: string | null; slug?: string | null };
  type PodiumTeam = { id: string; name: string; players?: PodiumPlayer[] } | null;
  let podium: { first: PodiumTeam; second: PodiumTeam; third: PodiumTeam } = { first: null, second: null, third: null };

  if (isCompleted) {
    const bracketMatches = await prisma.match.findMany({
      where: { tournamentId: tournament.id, phase: "BRACKET", status: "FINISHED" },
      include: {
        teamA: { include: { players: { include: { player: { select: { id: true, name: true, country: true, city: true, photoPath: true, badges: true, pinnedBadges: true, startYear: true, hand: true, gender: true, slug: true } } } } } },
        teamB: { include: { players: { include: { player: { select: { id: true, name: true, country: true, city: true, photoPath: true, badges: true, pinnedBadges: true, startYear: true, hand: true, gender: true, slug: true } } } } } },
      },
      orderBy: { roundIndex: "desc" },
    });
    const extractPlayers = (team: any): PodiumPlayer[] =>
      (team?.players ?? []).map((tp: any) => ({ id: tp.player.id, name: tp.player.name, country: tp.player.country ?? "", city: tp.player.city ?? null, photoPath: tp.player.photoPath ?? null, badges: tp.player.pinnedBadges?.length ? tp.player.pinnedBadges : (tp.player.badges ?? []), startYear: tp.player.startYear ?? null, hand: tp.player.hand ?? null, gender: tp.player.gender ?? null, slug: tp.player.slug ?? null }));
    const toTeam = (t: any): PodiumTeam => t ? { id: t.id, name: t.name, players: extractPlayers(t) } : null;
    // GF : en cas de reset (plusieurs matchs G), prendre celui avec le roundIndex le plus élevé
    const gfMatches = bracketMatches.filter((m) => m.bracketSide === "G");
    const grandFinal = gfMatches[0]; // déjà trié par roundIndex desc
    if (grandFinal) {
      const isAWinner = grandFinal.winnerTeamId === grandFinal.teamAId;
      podium.first  = toTeam(isAWinner ? grandFinal.teamA : grandFinal.teamB);
      podium.second = toTeam(isAWinner ? grandFinal.teamB : grandFinal.teamA);
    }
    // 3ème : perdant du Lower Final — bracketSide "L", roundIndex le plus élevé
    const lowerFinal = bracketMatches.filter((m) => m.bracketSide === "L")[0];
    if (lowerFinal) {
      const isAWinner = lowerFinal.winnerTeamId === lowerFinal.teamAId;
      podium.third = toTeam(isAWinner ? lowerFinal.teamB : lowerFinal.teamA);
    }
  }

  const deleteFreeAgent = async (id: string) => {
    "use server";
    return await deleteFreeAgentAction(id, tournament.id);
  };

  const toggleTeamSelected = async (teamId: string, tId: string, selected: boolean) => {
    "use server";
    return await toggleTeamSelectedAction(teamId, tId, selected);
  };

  const drawTeams = async (tId: string, count: number, preDrawnIds?: string[]) => {
    "use server";
    return await drawTeamsAction(tId, count, preDrawnIds);
  };

  const guaranteeTeam = async (teamId: string, tId: string, guaranteed: boolean) => {
    "use server";
    return await toggleTeamGuaranteedAction(teamId, tId, guaranteed);
  };

  const drawOneTeam = async (tId: string, candidateIds: string[]) => {
    "use server";
    return await drawOneTeamAction(tId, candidateIds);
  };

  const drawOneWaitlist = async (tId: string, candidateIds: string[]) => {
    "use server";
    return await drawOneWaitlistAction(tId, candidateIds);
  };

  const removeFromWaitlist = async (tId: string, teamId: string) => {
    "use server";
    return await removeFromWaitlistAction(tId, teamId);
  };

  const renameTeam = async (teamId: string, name: string, tId: string) => {
    "use server";
    return await renameTeamAction(teamId, name, tId);
  };

  const deleteTeam = async (teamId: string, tId: string) => {
    "use server";
    return await deleteTeamAction(teamId, tId);
  };

  const removePlayer = async (teamPlayerId: string, tId: string) => {
    "use server";
    return await removePlayerFromTeamAction(teamPlayerId, tId);
  };

  const addPlayer = async (teamId: string, tId: string, playerData: { type: "existing"; playerId: string } | { type: "manual"; name: string; city?: string | null; country: string }) => {
    "use server";
    return await addPlayerToTeamAction(teamId, tId, playerData);
  };

  const createTeam = async (tId: string, name: string) => {
    "use server";
    return await createTeamAction(tId, name);
  };

  // Info tab: tiles content
  const hasLogistique = !!(
    tournament.venueName || tournament.venueAddress ||
    tournament.fridayWelcomeName || tournament.fridayWelcomeAddress ||
    tournament.saturdayEventName || tournament.saturdayEventAddress ||
    tournament.saturdayEveningName || tournament.saturdayEveningAddress ||
    tournament.accommodationAvailable ||
    tournament.otherNotes || tournament.registrationStart || tournament.registrationEnd
  );
  const meals = (tournament.meals as { day: number; breakfast: boolean; lunch: boolean; dinner: boolean }[] | null) ?? [];
  const hasMeals = meals.some((m) => m.breakfast || m.lunch || m.dinner);
  const faq = (tournament.faq as { question: string; answer: string }[] | null) ?? [];

  return (
    <div className="tournament-page">
      {tournament.status === "LIVE" && (
        <TournamentCompletionWatcher tournamentId={tournament.id} />
      )}
      {/* ── Barre retour + actions ── */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link href="/tournaments" style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-display)" }}>
          ← {t("back_tournaments")}
        </Link>
      </div>

      {/* ── HERO ── */}
      <section className="tournament-hero">
        <div className="tournament-hero__main">
          <h1>{tournament.name}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="tournament-hero__dates">
              <span>📅 {dateStart} — {dateEnd}</span>
            </div>
            <FollowButton
              tournamentId={tournament.id}
              initialFollowing={isFollowing}
              isLoggedIn={!!currentPlayerId}
            />
          </div>
          <p style={{ color: "var(--text-muted)", margin: "4px 0 8px", fontSize: 14 }}>
            {tournament.city}, {tournament.country} · {tournament.format} · {tournament.courtsCount === 1 ? t("courts_count_one", { count: tournament.courtsCount }) : t("courts_count_other", { count: tournament.courtsCount })}
          </p>
          <HeroCountdown
            dateStart={tournament.dateStart.toISOString()}
            dateEnd={tournament.dateEnd.toISOString()}
            registrationEnd={tournament.registrationEnd?.toISOString() ?? null}
            teamCount={displayTeamCount}
            maxTeams={tournament.maxTeams}
          />
        </div>

        <div className="tournament-hero__sponsors">
          {tournament.sponsors.length > 0 ? (
            <>
              <span className="tournament-hero__sponsors-title">{t("sponsors_title")}</span>
              <div className="sponsors-strip">
                {tournament.sponsors.map((sponsor) =>
                  sponsor.logoPath ? (
                    <a key={sponsor.id} href={sponsor.url ?? "#"} target="_blank" rel="noopener noreferrer" className="sponsor-logo-link">
                      <img src={sponsor.logoPath} alt={sponsor.name} className="sponsor-logo" />
                    </a>
                  ) : (
                    <span key={sponsor.id} className="sponsor-name-badge">{sponsor.name}</span>
                  )
                )}
              </div>
            </>
          ) : canEdit ? (
            <div className="sponsors-empty">
              <span>🤝</span>
              <Link href={`/tournament/${params.id}/edit`} style={{ color: "var(--teal)" }}>
                {t("sponsors_add")}
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <Tabs
        items={tabs}
        active={tab}
        rightSlot={(canEdit || canRef) ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {canEdit && (
              <Link className="ghost" href={`/tournament/${params.id}/edit`} style={{ fontSize: 12, padding: "5px 14px", marginBottom: 2 }}>
                {t("btn_edit")}
              </Link>
            )}
            {canRef && (
              <Link className="primary" href={`/tournament/${params.id}/referee`} style={{ fontSize: 12, padding: "5px 14px", marginBottom: 2 }}>
                {t("btn_referee")}
              </Link>
            )}
          </div>
        ) : undefined}
      />

      {/* ── RECAP TAB ── */}
      {tab === "recap" && isCompleted && (() => {
        const allPlayers = (tournament.teams as any[])
          .filter((team: any) => team.selected)
          .flatMap((team: any) => (team.players ?? []).map((tp: any) => ({
            id: tp.player.id,
            name: tp.player.name,
            teamName: team.name,
            country: tp.player.country ?? "",
            city: tp.player.city ?? null,
            photoPath: tp.player.photoPath ?? null,
            badges: tp.player.pinnedBadges?.length ? tp.player.pinnedBadges : (tp.player.badges ?? []),
            startYear: tp.player.startYear ?? null,
            hand: tp.player.hand ?? null,
            gender: tp.player.gender ?? null,
            showGender: tp.player.showGender ?? false,
            slug: tp.player.slug ?? null,
          })));
        return (
          <TournamentRecap
            tournament={{
              id: tournament.id,
              name: tournament.name,
              bannerPath: tournament.bannerPath,
              recapText: tournament.recapText ?? null,
              photoFinishPath: tournament.photoFinishPath ?? null,
              photoFinishCredit: (tournament as any).photoFinishCredit ?? null,
              podiumNote: tournament.podiumNote ?? null,
              recapAnecdote: (tournament as any).recapAnecdote ?? null,
              bannerCredit: (tournament as any).bannerCredit ?? null,
              mvpPlayerId: (tournament as any).mvpPlayerId ?? null,
              mvpTitle: (tournament as any).mvpTitle ?? null,
            }}
            podium={podium}
            players={allPlayers}
            isOrga={isOrga}
          />
        );
      })()}

      {/* ── INFO TAB — 12-column flexible grid ── */}
      {tab === "info" && (
        <div className="info-layout">

          {/* ── LEFT COLUMN (span 6) — Lieux, FAQ, Live ── */}
          <div className="info-tile col-span-6">

            {hasLogistique && (
              <div className="panel">
                <h3 style={{ marginBottom: 14 }}>{t("section_logistics")}</h3>

                <div className="logistics-grid">
                  {(tournament.venueName || tournament.venueAddress) && (
                    <div className="logistics-section">
                      <h4>{t("venue_court")}</h4>
                      <p style={{ fontWeight: 600, margin: "4px 0" }}>{tournament.venueName}</p>
                      {tournament.venueAddress && <p style={{ margin: "2px 0", fontSize: 13 }}>{tournament.venueAddress}</p>}
                      {tournament.venueMapsUrl && (
                        <a href={tournament.venueMapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>{t("venue_maps")}</a>
                      )}
                    </div>
                  )}
                  {(tournament.fridayWelcomeName || tournament.fridayWelcomeAddress) && (
                    <div className="logistics-section">
                      <h4>{t("venue_friday")}</h4>
                      <p style={{ fontWeight: 600, margin: "4px 0" }}>{tournament.fridayWelcomeName}</p>
                      {tournament.fridayWelcomeAddress && <p style={{ margin: "2px 0", fontSize: 13 }}>{tournament.fridayWelcomeAddress}</p>}
                      {tournament.fridayWelcomeMapsUrl && (
                        <a href={tournament.fridayWelcomeMapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>{t("venue_maps")}</a>
                      )}
                    </div>
                  )}
                  {(tournament.saturdayEveningName || tournament.saturdayEveningAddress) && (
                    <div className="logistics-section">
                      <h4>{t("venue_saturday_evening")}</h4>
                      <p style={{ fontWeight: 600, margin: "4px 0" }}>{tournament.saturdayEveningName}</p>
                      {tournament.saturdayEveningAddress && <p style={{ margin: "2px 0", fontSize: 13 }}>{tournament.saturdayEveningAddress}</p>}
                      {tournament.saturdayEveningMapsUrl && (
                        <a href={tournament.saturdayEveningMapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>{t("venue_maps")}</a>
                      )}
                    </div>
                  )}
                </div>

                {tournament.accommodationAvailable && (
                  <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border-light)" }}>
                    <span className="logistics-badge logistics-badge--teal">{t("accommodation_available")}</span>
                    {tournament.accommodationType && (
                      <p style={{ margin: "6px 0 0", fontSize: 13 }}>{tournament.accommodationType}</p>
                    )}
                    {tournament.accommodationCapacity && (
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{t("accommodation_places", { count: tournament.accommodationCapacity })}</p>
                    )}
                  </div>
                )}

                {hasMeals && (
                  <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border-light)" }}>
                    <p style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{t("meals_title")}</p>
                    <div style={{ display: "grid", gap: 4 }}>
                      {meals.filter((m) => m.breakfast || m.lunch || m.dinner).map((m) => {
                        const d = new Date(tournament.dateStart);
                        d.setDate(d.getDate() + m.day - 1);
                        const label = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
                        const parts = [];
                        if (m.breakfast) parts.push(t("meal_breakfast_short"));
                        if (m.lunch) parts.push(t("meal_lunch_short"));
                        if (m.dinner) parts.push(t("meal_dinner_short"));
                        return (
                          <div key={m.day} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                            <span style={{ fontWeight: 600, minWidth: 140, textTransform: "capitalize" }}>{label}</span>
                            <span style={{ color: "var(--text-muted)" }}>{parts.join(" · ")}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(tournament.registrationStart || tournament.registrationEnd) && (
                  <p style={{ marginTop: 12, fontSize: 13, paddingTop: 10, borderTop: "1px solid var(--border-light)" }}>
                    <strong>{t("registration_period")}</strong>{" "}
                    {tournament.registrationStart
                      ? new Date(tournament.registrationStart).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
                      : "?"}{" "}
                    — {tournament.registrationEnd
                      ? new Date(tournament.registrationEnd).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
                      : "?"}
                  </p>
                )}

                <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  {tournament.contactEmail && (
                    <a href={`mailto:${tournament.contactEmail}`} className="ghost" style={{ fontSize: 14 }}>
                      {t("btn_contact_organizers")}
                    </a>
                  )}
                  {registrationClosed ? (
                    <span className="primary" style={{ fontSize: 14, opacity: 0.45, cursor: "not-allowed", pointerEvents: "none" }}>
                      {t("reg_closed_title", { date: tournament.registrationEnd ? new Date(tournament.registrationEnd).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "" })}
                    </span>
                  ) : (
                    <Link href={`/tournament/${params.id}?tab=inscription`} className="primary" style={{ fontSize: 14 }}>
                      {t("btn_register_cta")}
                    </Link>
                  )}
                </div>
              </div>
            )}

            {tournament.kitList && (
              <div className="panel">
                <h3 style={{ marginBottom: 10 }}>{t("section_kit")}</h3>
                <p style={{ fontSize: 13, whiteSpace: "pre-line", margin: 0, color: "var(--text-muted)" }}>{tournament.kitList}</p>
              </div>
            )}

            {tournament.additionalInfo && (
              <div className="panel">
                <h3 style={{ marginBottom: 10 }}>{t("section_info")}</h3>
                <p style={{ fontSize: 13, whiteSpace: "pre-line", margin: 0 }}>{tournament.additionalInfo}</p>
              </div>
            )}

            {faq.length > 0 && (
              <div className="panel">
                <h3 style={{ marginBottom: 14 }}>{t("section_faq")}</h3>
                <div style={{ display: "grid", gap: 12 }}>
                  {faq.map((item, i) => (
                    <div key={i}>
                      <p style={{ fontWeight: 700, fontSize: 14, margin: "0 0 4px" }}>{item.question}</p>
                      <p style={{ fontSize: 13, margin: 0, color: "var(--text-muted)", whiteSpace: "pre-line" }}>{item.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tournament.freeAgents.length > 0 && (
              <div className="panel">
                <h3 style={{ marginBottom: 4 }}>
                  {t("tab_free_agent")}{" "}
                  <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text-muted)" }}>
                    ({tournament.freeAgents.length})
                  </span>
                </h3>
                <p className="meta" style={{ marginBottom: 14 }}>
                  {t("info_free_agents_desc")}
                </p>
                <FreeAgentList
                  agents={tournament.freeAgents}
                  canDelete={false}
                  title=""
                  publicView
                />
              </div>
            )}

            {tournament.matches.length > 0 && (
              <div className="panel">
                <LiveMatchTile
                  tournamentId={tournament.id}
                  initialMatches={tournament.matches}
                  gameDurationMin={tournament.gameDurationMin}
                />
              </div>
            )}
          </div>

          {/* ── RIGHT COLUMN (span 6) — Affiche, Liens, Telegram, Stream ── */}
          <div className="info-tile col-span-6">

            {/* Affiche + Telegram side by side */}
            <div className="info-inner-grid">
              {/* Affiche */}
              <div>
                {tournament.bannerPath && (
                  <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
                    <img src={tournament.bannerPath} alt={`Affiche ${tournament.name}`} style={{ width: "100%", display: "block", borderRadius: "var(--radius)" }} />
                  </div>
                )}
              </div>

              {/* Telegram */}
              <div>
                {(tournament as { telegramUrl?: string | null }).telegramUrl && (
                  <TelegramWidget telegramUrl={(tournament as { telegramUrl?: string | null }).telegramUrl!} />
                )}
              </div>
            </div>

            {/* Stream — full width of right column */}
            {youtubeEmbed && (
              <div className="panel">
                <h3 style={{ marginBottom: 10 }}>{t("section_stream")}</h3>
                <iframe
                  src={youtubeEmbed}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="Stream"
                  style={{ width: "100%", aspectRatio: "16/9", height: "auto", borderRadius: "var(--radius)", border: "2px solid var(--border)", display: "block" }}
                />
              </div>
            )}
          </div>

        </div>
      )}

      {tab === "inscription" && (
        <div>
          <div className="inscription-grid">
            {/* Inscrire mon équipe */}
            <div className="panel">
              <h3>{r("section_title")}</h3>
              {!tournament.approved ? (
                <p className="meta">{t("not_approved")}</p>
              ) : registrationOpen ? (
                <>
                  {tournament.registrationEnd && (
                    <p className="meta" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ background: "color-mix(in srgb, var(--teal) 15%, transparent)", color: "var(--teal)", borderRadius: "var(--radius-sm)", padding: "2px 10px", fontWeight: 700, fontSize: 12, fontFamily: "var(--font-display)" }}>
                        {t("reg_closes_on", { date: new Date(tournament.registrationEnd).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) })}
                      </span>
                    </p>
                  )}
                  <p className="meta" style={{ marginBottom: 16 }}>
                    {tournament.teams.length === 1 ? r("reg_open_teams_one", { count: tournament.teams.length }) : r("reg_open_teams_other", { count: tournament.teams.length })}
                    {tournament.teams.length > tournament.maxTeams
                      ? ` · ${tournament.teams.length - tournament.maxTeams} ${t("teams_on_waitlist")}`
                      : ` · ${tournament.maxTeams - tournament.teams.length === 1 ? t("teams_spots_available_one", { count: tournament.maxTeams - tournament.teams.length }) : t("teams_spots_available_other", { count: tournament.maxTeams - tournament.teams.length })}`}
                  </p>
                  {tournament.format === "ABC Chapeau" ? (() => {
                    const soloEntries = (t_ as { soloEntries?: { id: string; player: { id: string; name: string }; level: string; teamId: string | null; waitlisted: boolean }[] }).soloEntries ?? [];
                    const currentEntry = currentPlayerId ? soloEntries.find((e) => e.player.id === currentPlayerId) : null;
                    return (
                      <SoloRegisterForm
                        tournamentId={tournament.id}
                        currentPlayerId={currentPlayerId}
                        maxSoloPlayers={(t_ as { maxSoloPlayers?: number | null }).maxSoloPlayers ?? null}
                        soloCount={soloEntries.filter((e) => !e.waitlisted).length}
                        alreadyRegistered={!!currentEntry}
                        alreadyLevel={currentEntry?.level ?? null}
                      />
                    );
                  })() : (
                    <RegisterTeamForm tournamentId={tournament.id} format={tournament.format} currentPlayerId={currentPlayerId} accommodationAvailable={tournament.accommodationAvailable} />
                  )}
                </>
              ) : registrationClosed ? (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <p style={{ fontWeight: 700, fontFamily: "var(--font-display)", margin: 0 }}>
                    {t("reg_closed_title", { date: tournament.registrationEnd ? new Date(tournament.registrationEnd).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "" })}
                  </p>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <p style={{ fontWeight: 700, fontFamily: "var(--font-display)", margin: 0 }}>
                    {t("reg_not_open_title")}
                  </p>
                  {tournament.registrationStart && (
                    <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--text-muted)" }}>
                      {t("reg_opens_on", { date: new Date(tournament.registrationStart).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) })}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Renvoi vers Zone free agent */}
            <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 12, justifyContent: "center", textAlign: "center" }}>
              <div style={{ fontSize: 32 }}>🤝</div>
              <h3 style={{ margin: 0 }}>{r("no_team_title")}</h3>
              <p className="meta" style={{ margin: 0 }}>
                {r("no_team_desc")}
              </p>
              {tournament.freeAgents.length > 0 && (
                <p className="meta" style={{ margin: 0, fontWeight: 700 }}>
                  {tournament.freeAgents.length === 1 ? r("free_agents_one", { count: tournament.freeAgents.length }) : r("free_agents_other", { count: tournament.freeAgents.length })}
                </p>
              )}
              <Link href={`/tournament/${params.id}?tab=communaute`} className="ghost" style={{ fontSize: 13 }}>
                {r("btn_view_free_agent")}
              </Link>
            </div>
          </div>

          {/* Sélection orga déplacée vers l'onglet Orga */}
        </div>
      )}

      {tab === "schedule" && (
        <ScheduleBoard tournamentId={tournament.id} initialMatches={tournament.matches} teams={tournament.teams} isOrganizer={isOrga} />
      )}

      {tab === "pools" && (
        <PoolTables pools={tournament.pools} matches={tournament.matches} tournamentId={tournament.id} scoringSystem={tournament.scoringSystem} />
      )}

      {tab === "bracket" && (() => {
        const bracketMatches = tournament.matches.filter((m) => m.phase === "BRACKET");
        const swissAll = tournament.matches.filter((m) => m.phase === "SWISS");
        const bracketTeams = (() => {
          const selectedTeams = tournament.teams.filter((t) => t.selected);
          if (tournament.saturdayFormat === "SWISS" && swissAll.length > 0) {
            const standings = computeStandings(selectedTeams, swissAll, tournament.scoringSystem);
            const rankByTeamId = new Map(standings.map((row, index) => [row.teamId, index + 1]));
            return selectedTeams.map((team) => ({
              id: team.id,
              name: team.name,
              bracketNumber: rankByTeamId.get(team.id) ?? team.seed,
            }));
          }

          return selectedTeams.map((team) => ({
            id: team.id,
            name: team.name,
            bracketNumber: team.seed,
          }));
        })();

        const isRR = tournament.sundayFormat === "RR";
        const formatLabel = tournament.sundayFormat === "DE" ? "Double élimination" : tournament.sundayFormat === "RR" ? "Round Robin" : "Simple élimination";
        const hasQualifyingMatches = [...tournament.matches.filter((m: any) => m.phase === "POOL" || m.phase === "SWISS")].length > 0;

        const bracketReturnPath = `/tournament/${tournament.slug ?? tournament.id}?tab=bracket`;

        if (bracketMatches.length > 0) {
          // RR: show standings table instead of bracket tree
          if (isRR) {
            const rrStandings = computeStandings(
              tournament.teams.filter((t: any) => t.selected),
              bracketMatches,
              tournament.scoringSystem
            );
            return (
              <div>
                {isOrga && (
                  <BracketActions
                    tournamentId={tournament.id}
                    returnPath={bracketReturnPath}
                    hasQualifyingMatches={hasQualifyingMatches}
                    isRR
                    mode="buttons"
                  />
                )}
                <div className="panel" style={{ overflowX: "auto" }}>
                  <table className="standings-table" style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Équipe</th>
                        <th>J</th><th>V</th><th>N</th><th>D</th>
                        <th>BP</th><th>BC</th><th>Diff</th><th>Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rrStandings.map((row: any, i: number) => (
                        <tr key={row.teamId}>
                          <td style={{ fontWeight: 700, color: "var(--text-muted)", width: 28 }}>{i + 1}</td>
                          <td style={{ fontWeight: 600 }}>{row.name}</td>
                          <td>{row.played}</td>
                          <td style={{ color: "var(--teal)" }}>{row.wins}</td>
                          <td>{row.draws}</td>
                          <td style={{ color: "var(--danger)" }}>{row.losses}</td>
                          <td>{row.goalsFor}</td>
                          <td>{row.goalsAgainst}</td>
                          <td style={{ color: row.goalDiff > 0 ? "var(--teal)" : row.goalDiff < 0 ? "var(--danger)" : undefined }}>
                            {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
                          </td>
                          <td style={{ fontWeight: 700 }}>{row.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          }

          return (
            <>
              {isOrga && (
                <BracketActions
                  tournamentId={tournament.id}
                  returnPath={bracketReturnPath}
                  hasQualifyingMatches={hasQualifyingMatches}
                  mode="buttons"
                />
              )}
              <BracketView matches={bracketMatches} tournamentId={tournament.id} teams={bracketTeams} isOrganizer={isOrga} />
            </>
          );
        }
        const maxSwissRound = swissAll.length > 0 ? Math.max(...swissAll.map((m: any) => m.roundIndex)) : 0;
        const swissDone = maxSwissRound >= (t_.swissRounds ?? 5) && swissAll.every((m: any) => m.status === "FINISHED");
        const canLaunch = isOrga && isLaunched && (swissDone || tournament.saturdayFormat !== "SWISS");
        return (
          <div className="panel" style={{ textAlign: "center", padding: 48, marginTop: 16 }}>
            {canLaunch ? (
              <>
                <p style={{ fontWeight: 700, fontFamily: "var(--font-display)", marginBottom: 8, fontSize: 18 }}>
                  {isRR ? "Round Robin" : `Top ${t_.bracketSize ?? 16} qualifiés`}
                </p>
                <p className="meta" style={{ marginBottom: 20 }}>{formatLabel}</p>
                <BracketActions
                  tournamentId={tournament.id}
                  returnPath={bracketReturnPath}
                  hasQualifyingMatches={false}
                  isRR={isRR}
                  mode="launch"
                />
              </>
            ) : (
              <p className="meta">
                {swissDone ? "Le bracket sera lancé par l\u2019organisateur." : "Le bracket sera disponible une fois les rounds Swiss terminés."}
              </p>
            )}
          </div>
        );
      })()}

      {tab === "swiss" && (
        <div style={{ padding: "24px 0" }}>
          {swissMatches.length === 0 ? (
            <div className="panel" style={{ textAlign: "center", padding: 48 }}>
              <p className="meta">{t("swiss_empty")}</p>
            </div>
          ) : (() => {
            const standings = computeStandings(tournament.teams.filter(t => t.selected), swissMatches, tournament.scoringSystem);
            const maxRound = Math.max(...swissMatches.map((m) => m.roundIndex));
            return (
              <>
                {/* Round summaries */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
                  {Array.from({ length: maxRound }, (_, i) => i + 1).map((r) => {
                    const rMatches = swissMatches.filter((m) => m.roundIndex === r);
                    const done = rMatches.filter((m) => m.status === "FINISHED").length;
                    return (
                      <span
                        key={r}
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 12,
                          padding: "4px 12px",
                          borderRadius: 20,
                          background: done === rMatches.length ? "var(--teal)" : "var(--gray)",
                          border: "1.5px solid var(--border)",
                          fontWeight: 700
                        }}
                      >
                        {t("swiss_round_header", { n: r, done, total: rMatches.length })}
                      </span>
                    );
                  })}
                </div>

                {/* Standings table */}
                <div className="panel">
                  <h3 style={{ marginBottom: 16 }}>{t("swiss_standings_title")}</h3>
                  <div className="swiss-standings-wrap">
                  <table className="swiss-standings">
                    <thead>
                      <tr>
                        <th>{t("swiss_col_rank")}</th>
                        <th>{t("swiss_col_team")}</th>
                        <th>{t("swiss_col_pts")}</th>
                        <th>{t("swiss_col_played")}</th>
                        <th>{t("swiss_col_wins")}</th>
                        <th>{t("swiss_col_draws")}</th>
                        <th>{t("swiss_col_losses")}</th>
                        <th>{t("swiss_col_diff")}</th>
                        <th title="Buchholz (force adversaires)">Buch.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((row, i) => (
                        <tr key={row.teamId}>
                          <td className="swiss-standing-rank">{i + 1}</td>
                          <td style={{ fontWeight: 600 }}>{row.name}</td>
                          <td style={{ fontFamily: "var(--font-display)", fontWeight: 900 }}>{row.points}</td>
                          <td>{row.played}</td>
                          <td style={{ color: "var(--success)" }}>{row.wins}</td>
                          <td style={{ color: "var(--text-muted)" }}>{row.draws}</td>
                          <td style={{ color: "var(--danger)" }}>{row.losses}</td>
                          <td style={{ color: row.goalDiff >= 0 ? "var(--success)" : "var(--danger)" }}>
                            {row.goalDiff >= 0 ? "+" : ""}{row.goalDiff}
                          </td>
                          <td style={{ color: "var(--text-muted)" }}>{row.buchholz}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {tab === "equipes" && (() => {
        const sortedTeams = [...tournament.teams].sort((a, b) => a.seed - b.seed);
        const selected = sortedTeams.filter((t) => t.selected);
        const waitlist = sortedTeams.filter((t) => !t.selected);
        // Hide waitlist when tournament is launched — only show selected (IN) teams
        const hasWaitlist = !isLaunched && waitlist.length > 0;

        if (tournament.teams.length === 0) {
          return (
            <div className="panel" style={{ textAlign: "center", padding: 48, marginTop: 16 }}>
              <p className="meta">{t("empty_no_teams")}</p>
            </div>
          );
        }

        return (
          <div>
            {/* Toggle view */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center" }}>
              <Link
                href={`/tournament/${params.id}?tab=equipes&view=cards`}
                className={view === "cards" ? "primary" : "ghost"}
                style={{ fontSize: 12, padding: "5px 14px" }}
              >
                {t("view_cards")}
              </Link>
              <Link
                href={`/tournament/${params.id}?tab=equipes&view=list`}
                className={view === "list" ? "primary" : "ghost"}
                style={{ fontSize: 12, padding: "5px 14px" }}
              >
                {t("view_list")}
              </Link>
              <span className="meta" style={{ marginLeft: 8 }}>
                {selected.length === 1 ? t("teams_retained_count_one", { count: selected.length }) : t("teams_retained_count_other", { count: selected.length })}
                {hasWaitlist && t("teams_waitlist_suffix", { count: waitlist.length })}
              </span>
            </div>

            {view === "list" ? (
              /* ---- VUE LISTE ---- */
              <div className="teams-list-view">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("teams_col_team")}</th>
                      <th>{t("teams_col_cities")}</th>
                      <th>{t("teams_col_players")}</th>
                      {hasWaitlist && <th>{t("teams_col_status")}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.map((team) => (
                      <tr key={team.id}>
                        <td style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>#{team.seed}</td>
                        <td style={{ fontWeight: 600 }}>{team.name}</td>
                        <td className="meta">{summarizeCities(team.players)}</td>
                        <td>
                          {team.players.map((tp, i) => {
                            const abcLevel = tournament.format === "ABC"
                              ? (tp.player.id === (team as { playerALevel?: string | null }).playerALevel ? "A"
                                : tp.player.id === (team as { playerBLevel?: string | null }).playerBLevel ? "B"
                                : tp.player.id === (team as { playerCLevel?: string | null }).playerCLevel ? "C"
                                : null)
                              : null;
                            return (
                              <span key={tp.player.id}>
                                {i > 0 && ", "}
                                {(tp.player as { slug?: string | null }).slug ? (
                                  <Link href={`/player/${(tp.player as { slug?: string | null }).slug}`} style={{ color: "var(--teal)", textDecoration: "none", fontWeight: 500 }}>
                                    {tp.player.name}
                                  </Link>
                                ) : (
                                  tp.player.name
                                )}
                                {abcLevel && (
                                  <span className="level-badge" data-level={abcLevel} style={{ marginLeft: 4, fontSize: 10 }}>{abcLevel}</span>
                                )}
                              </span>
                            );
                          })}
                        </td>
                        {hasWaitlist && <td><span style={{ color: "var(--teal)", fontWeight: 700, fontSize: 11, fontFamily: "var(--font-display)" }}>{t("badge_retained")}</span></td>}
                      </tr>
                    ))}
                    {hasWaitlist && (
                      <>
                        <tr className="teams-divider-row">
                          <td colSpan={5} className="teams-divider">{t("waitlist_divider", { count: waitlist.length })}</td>
                        </tr>
                        {waitlist.map((team) => (
                          <tr key={team.id} className="team-row--waitlist">
                            <td style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>WL{team.waitlistPosition ?? "?"}</td>
                            <td style={{ fontWeight: 600 }}>{team.name}</td>
                            <td className="meta">{summarizeCities(team.players)}</td>
                            <td>
                              {team.players.map((tp, i) => (
                                <span key={tp.player.id}>
                                  {i > 0 && ", "}
                                  {(tp.player as { slug?: string | null }).slug ? (
                                    <Link href={`/player/${(tp.player as { slug?: string | null }).slug}`} style={{ color: "var(--teal)", textDecoration: "none", fontWeight: 500 }}>
                                      {tp.player.name}
                                    </Link>
                                  ) : (
                                    tp.player.name
                                  )}
                                </span>
                              ))}
                            </td>
                            <td><span style={{ color: "var(--text-muted)", fontWeight: 700, fontSize: 11, fontFamily: "var(--font-display)" }}>{t("badge_waiting")}</span></td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>

              {/* Récap orga déplacé vers l'onglet Orga */}
              </div>
            ) : (
              /* ---- VUE CARTES ---- */
              <div style={{ display: "grid", gap: 32 }}>
                {selected.map((team) => {
                  return (
                    <div key={team.id}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, background: "var(--border)", padding: "3px 8px", borderRadius: 4 }}>#{team.seed}</span>
                        <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 20 }}>{team.name}</h3>
                        {(team.city || team.country) && <span className="meta">{team.city ? `${team.city}, ` : ""}{team.country}</span>}
                      </div>
                      <div className="team-cards-row">
                        {team.players.map((tp) => {
                          const extraBadges = computePlayerBadges(tp.player.id, allEvents);
                          const playerSlug = (tp.player as { slug?: string | null }).slug;
                          const card = (
                            <PokemonCard
                              key={tp.player.id}
                              name={tp.player.name}
                              country={tp.player.country}
                              city={tp.player.city}
                              photoPath={tp.player.photoPath}
                              badges={[...(tp.player.pinnedBadges?.length ? tp.player.pinnedBadges : tp.player.badges), ...extraBadges.filter((b: string) => !(tp.player.pinnedBadges?.length ? tp.player.pinnedBadges : tp.player.badges).includes(b))]}
                              startYear={tp.player.startYear}
                              hand={tp.player.hand}
                              gender={tp.player.gender ?? undefined}
                              showGender={tp.player.showGender}
                            />
                          );
                          return playerSlug ? (
                            <Link key={tp.player.id} href={`/player/${playerSlug}`} style={{ textDecoration: "none", display: "contents" }}>
                              {card}
                            </Link>
                          ) : card;
                        })}
                      </div>
                    </div>
                  );
                })}

                {hasWaitlist && (
                  <>
                    <div className="teams-divider">{t("waitlist_divider", { count: waitlist.length })}</div>
                    {waitlist.map((team) => {
                      return (
                        <div key={team.id} className="team-section--waitlist">
                          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                            <span style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, background: "var(--border)", padding: "3px 8px", borderRadius: 4 }}>WL{team.waitlistPosition ?? "?"}</span>
                            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 20 }}>{team.name}</h3>
                            {(team.city || team.country) && <span className="meta">{team.city ? `${team.city}, ` : ""}{team.country}</span>}
                            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-display)", fontWeight: 700 }}>{t("badge_waitlist")}</span>
                          </div>
                          <div className="team-cards-row">
                            {team.players.map((tp) => {
                              const extraBadges = computePlayerBadges(tp.player.id, allEvents);
                              const playerSlug = (tp.player as { slug?: string | null }).slug;
                              const card = (
                                <PokemonCard
                                  key={tp.player.id}
                                  name={tp.player.name}
                                  country={tp.player.country}
                                  city={tp.player.city}
                                  photoPath={tp.player.photoPath}
                                  badges={[...(tp.player.pinnedBadges?.length ? tp.player.pinnedBadges : tp.player.badges), ...extraBadges.filter((b: string) => !(tp.player.pinnedBadges?.length ? tp.player.pinnedBadges : tp.player.badges).includes(b))]}
                                  startYear={tp.player.startYear}
                                  hand={tp.player.hand}
                                  gender={tp.player.gender ?? undefined}
                                  showGender={tp.player.showGender}
                                />
                              );
                              return playerSlug ? (
                                <Link key={tp.player.id} href={`/player/${playerSlug}`} style={{ textDecoration: "none", display: "contents" }}>
                                  {card}
                                </Link>
                              ) : card;
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── ONGLET LIVE ── */}
      {tab === "live" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Stream en grand — pleine largeur */}
          {youtubeEmbed ? (
            <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
              <iframe
                src={youtubeEmbed}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="Stream live"
                style={{ width: "100%", aspectRatio: "16/9", height: "auto", display: "block", border: "none" }}
              />
            </div>
          ) : (
            <div className="panel" style={{ textAlign: "center", padding: "32px 0" }}>
              <p className="meta">{t("stream_empty")}</p>
              {canEdit && (
                <Link href={`/tournament/${params.id}/edit`} className="ghost" style={{ fontSize: 13, marginTop: 10, display: "inline-block" }}>
                  {t("stream_add")}
                </Link>
              )}
            </div>
          )}

          {/* Scores live + Chat — 2 colonnes */}
          <div className="two-col-grid">
            {/* Scores live */}
            <div className="panel">
              <LiveMatchTile
                tournamentId={tournament.id}
                initialMatches={tournament.matches}
                gameDurationMin={tournament.gameDurationMin}
              />
            </div>

            {/* Chat */}
            {t_.chatMode !== "DISABLED" ? (
              <div className="panel" style={{ minHeight: 400 }}>
                <TournamentChat
                  tournamentId={tournament.id}
                  chatMode={t_.chatMode}
                  currentPlayerId={currentPlayerId}
                  currentPlayerName={currentPlayerName}
                  isOrga={isOrga}
                  creatorId={tournament.creatorId}
                  charterAccepted={charterAccepted}
                  fullPage
                />
              </div>
            ) : (
              <div className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
                <p className="meta" style={{ textAlign: "center" }}>{t("chat_disabled")}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ONGLET ZONE FREE AGENT ── */}
      {tab === "communaute" && (
        <div className="two-col-grid">
          {/* Free agents publics */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="panel">
              <h3 style={{ marginBottom: 4 }}>{t("tab_free_agent")}</h3>
              <p className="meta" style={{ marginBottom: 16 }}>
                {t("communaute_free_agents_desc")}
              </p>

              {registrationOpen && (
                <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--border-light)" }}>
                  <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{t("communaute_looking")}</p>
                  <FreeAgentForm tournamentId={tournament.id} />
                </div>
              )}

              {tournament.freeAgents.length === 0 ? (
                <p className="meta">{fa("empty")}</p>
              ) : (
                <FreeAgentList
                  agents={tournament.freeAgents}
                  canDelete={isOrga}
                  deleteAction={deleteFreeAgent}
                  title=""
                  publicView
                />
              )}
            </div>
          </div>

          {/* Chat */}
          {t_.chatMode !== "DISABLED" ? (
            <div className="panel" style={{ minHeight: 400 }}>
              <TournamentChat
                tournamentId={tournament.id}
                chatMode={t_.chatMode}
                currentPlayerId={currentPlayerId}
                currentPlayerName={currentPlayerName}
                isOrga={isOrga}
                creatorId={tournament.creatorId}
                fullPage
              />
            </div>
          ) : (
            <div className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
              <p className="meta" style={{ textAlign: "center" }}>{t("chat_disabled")}</p>
            </div>
          )}
        </div>
      )}

      {/* ===== ONGLET ORGA ===== */}
      {tab === "orga" && isOrga && (() => {
        const sortedTeams = [...tournament.teams].sort((a, b) => a.seed - b.seed);
        const selected = sortedTeams.filter((t) => t.selected);
        const dietLabels: Record<string, string> = { OMNIVORE: tm("diet_omnivore"), VEGETARIAN: tm("diet_vegetarian"), VEGAN: tm("diet_vegan"), GLUTEN_FREE: tm("diet_gluten_free") };
        const dietCounts = new Map<string, number>();
        let nonPrecise = 0;
        let totalAccommodation = 0;
        for (const team of tournament.teams) {
          for (const tp of team.players) {
            const diets = (tp.player as { diets?: string[] }).diets ?? [];
            if (diets.length === 0) nonPrecise++;
            else for (const d of diets) dietCounts.set(d, (dietCounts.get(d) ?? 0) + 1);
            if ((tp as { needsAccommodation?: boolean }).needsAccommodation) totalAccommodation++;
          }
        }
        const totalPlayers = tournament.teams.reduce((s, t) => s + t.players.length, 0);
        const totalMatches = tournament.matches.length;
        const doneMatches = tournament.matches.filter((m) => m.status === "FINISHED").length;

        return (
          <div style={{ display: "grid", gap: 24 }}>
            {/* Stats bar */}
            <div className="orga-stats-bar">
              <span style={{ fontWeight: 700, fontFamily: "var(--font-display)" }}>{t("orga_stats_title")}</span>
              <span>🏑 <strong>{displayTeamCount}</strong>/{tournament.maxTeams} {t("orga_stats_teams_label")}</span>
              <span>👤 <strong>{totalPlayers}</strong> {t("orga_stats_players_label")}</span>
              <span>🏟️ <strong>{tournament.courtsCount}</strong> {t("orga_stats_courts_label")}</span>
              <span>⚡ {tournament.format} · {tournament.gameDurationMin} min</span>
              {totalMatches > 0 && (
                <span style={{ padding: "2px 10px", background: doneMatches === totalMatches ? "color-mix(in srgb, var(--teal) 20%, var(--surface))" : "color-mix(in srgb, var(--yellow) 20%, var(--surface))", borderRadius: 6, fontWeight: 700 }}>
                  🎯 {doneMatches}/{totalMatches} {t("orga_stats_matches_label")}
                </span>
              )}
              {tournament.accommodationAvailable && totalAccommodation > 0 && (
                <span style={{ padding: "2px 10px", background: "color-mix(in srgb, var(--teal) 15%, var(--surface))", borderRadius: 6, fontWeight: 700 }}>
                  🛏️ {totalAccommodation} {t("orga_stats_accommodation_label")}
                </span>
              )}
            </div>

            {/* Task board */}
            <OrgaTaskBoard
              tasks={orgaTasks}
              tournamentId={tournament.id}
              coOrganizers={tournament.coOrganizers.map((co) => ({
                playerId: co.playerId,
                playerName: co.player.name,
              }))}
            />

            {/* Note board */}
            <OrgaNoteBoard
              notes={orgaNotes}
              tournamentId={tournament.id}
              currentPlayerId={currentPlayerId ?? ""}
            />

            {/* Link board */}
            <OrgaLinkBoard
              links={orgaLinks}
              tournamentId={tournament.id}
            />

            {/* DrawPanel ABC Chapeau */}
            {tournament.format === "ABC Chapeau" && (() => {
              const soloEntries = (t_ as { soloEntries?: { id: string; player: { id: string; name: string }; level: string; teamId: string | null; waitlisted: boolean }[] }).soloEntries ?? [];
              const abcTeams = tournament.teams.map((t) => ({ id: t.id, name: t.name }));
              return (
                <DrawPanel
                  tournamentId={tournament.id}
                  soloEntries={soloEntries}
                  teams={abcTeams}
                />
              );
            })()}

            {/* Sélection / Tirage au sort */}
            {tournament.teams.length > 0 && tournament.format !== "ABC Chapeau" && (
              <div className="panel">
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 12 }}>{t("orga_selection_title")}</h3>
                <SelectionManager
                  teams={tournament.teams.map((t) => ({
                    id: t.id,
                    name: t.name,
                    seed: t.seed,
                    city: t.city,
                    country: t.country,
                    selected: t.selected,
                    guaranteed: t.guaranteed,
                    waitlistPosition: t.waitlistPosition,
                  }))}
                  maxTeams={tournament.maxTeams}
                  tournamentId={tournament.id}
                  toggleAction={toggleTeamSelected}
                  drawAction={drawTeams}
                  guaranteeAction={guaranteeTeam}
                  drawOneAction={drawOneTeam}
                  drawOneWaitlistAction={drawOneWaitlist}
                  removeFromWaitlistAction={removeFromWaitlist}
                />
              </div>
            )}

            {/* Gestion des équipes — ajout/modification/suppression */}
            <div className="panel">
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 12 }}>{t("orga_teams_title")}</h3>
              <TeamManager
                teams={tournament.teams.map((t) => ({
                  id: t.id,
                  name: t.name,
                  seed: t.seed,
                  city: t.city,
                  country: t.country,
                  players: t.players.map((tp) => ({
                    id: tp.id,
                    player: { id: tp.player.id, name: tp.player.name, country: tp.player.country },
                  })),
                  selected: t.selected,
                  waitlistPosition: t.waitlistPosition,
                }))}
                locked={tournament.locked}
                format={tournament.format}
                renameAction={renameTeam}
                deleteTeamAction={deleteTeam}
                removePlayerAction={removePlayer}
                addPlayerAction={addPlayer}
                createTeamAction={createTeam}
                tournamentId={tournament.id}
              />
            </div>

            {/* Récap par équipe — régimes, logement, notes */}
            {selected.length > 0 && (
              <div className="panel">
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 12 }}>{t("orga_recap_title")}</h3>
                <div style={{ display: "grid", gap: 12 }}>
                  {sortedTeams.map((team) => {
                    const hasInfo = team.players.some((tp) =>
                      (tp.player as { diets?: string[] }).diets?.length ||
                      (tp as { needsAccommodation?: boolean }).needsAccommodation
                    );
                    const hasNotes = (team as { registrationNote?: string | null }).registrationNote || (team as { orgaNote?: string | null }).orgaNote;
                    if (!hasInfo && !hasNotes) return null;
                    return (
                      <div key={team.id} style={{ padding: "12px 16px", background: "var(--surface-2)", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13 }}>
                        <div style={{ fontWeight: 700, fontFamily: "var(--font-display)", marginBottom: 8 }}>#{team.seed} {team.name}</div>
                        <div style={{ display: "grid", gap: 4, marginBottom: hasNotes ? 10 : 0 }}>
                          {team.players.map((tp) => {
                            const diets = (tp.player as { diets?: string[] }).diets ?? [];
                            const accom = (tp as { needsAccommodation?: boolean }).needsAccommodation;
                            if (!diets.length && !accom) return null;
                            return (
                              <div key={tp.player.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ minWidth: 120, fontWeight: 500 }}>{tp.player.name}</span>
                                {diets.length > 0
                                  ? diets.map((d) => (
                                      <span key={d} style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 4, background: "var(--yellow)", color: "var(--text)", border: "1.5px solid var(--border)" }}>
                                        {dietLabels[d] ?? d}
                                      </span>
                                    ))
                                  : <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("diet_not_specified")}</span>
                                }
                                {accom && (
                                  <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 4, background: "color-mix(in srgb, var(--teal) 20%, var(--surface))", border: "1.5px solid var(--teal)" }}>
                                    {t("orga_needs_accommodation")}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {(team as { registrationNote?: string | null }).registrationNote && (
                          <div style={{ marginTop: 8, padding: "8px 12px", background: "color-mix(in srgb, var(--yellow) 12%, var(--surface))", borderRadius: 6, borderLeft: "3px solid var(--yellow)" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginRight: 8 }}>{t("orga_registration_note")}</span>
                            <span>{(team as { registrationNote?: string | null }).registrationNote}</span>
                          </div>
                        )}
                        <OrgaNoteEditor teamId={team.id} initialNote={(team as { orgaNote?: string | null }).orgaNote ?? ""} label={t("orga_note_label")} placeholder={t("orga_note_placeholder")} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
