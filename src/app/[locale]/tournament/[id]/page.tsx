// @ts-nocheck
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { Tabs } from "@/components/Tabs";
import { ScheduleBoard } from "@/components/ScheduleBoard";
import { PoolTables } from "@/components/PoolTables";
import { MtpFinalStandings } from "@/components/MtpFinalStandings";
import { BracketView } from "@/components/BracketView";
import { PokemonCard } from "@/components/PokemonCard";
import { toYoutubeEmbed } from "@/lib/youtube";
import { computePlayerBadges } from "@/lib/achievements";
import { auth } from "@/lib/auth";
import { FreeAgentForm } from "@/components/FreeAgentForm";
import { FreeAgentList } from "@/components/FreeAgentList";
import { RegisterTeamForm } from "@/components/RegisterTeamForm";
import { computeStandings } from "@/lib/standings";
import { splitMtpPools, combineMtpStandings } from "@/lib/mtp";
import { deleteFreeAgentAction } from "./edit/actions";
import { TournamentChat } from "@/components/TournamentChat";
import { TelegramWidget } from "@/components/TelegramWidget";
import { LiveMatchTile } from "@/components/LiveMatchTile";
import { HeroCountdown } from "@/components/HeroCountdown";
import { TournamentRecap } from "@/components/TournamentRecap";
import { FollowButton } from "@/components/FollowButton";
import { SoloRegisterForm } from "@/components/SoloRegisterForm";
import { WithdrawTeamPanel } from "@/components/WithdrawTeamPanel";
import { syncTournamentCompletionById } from "@/lib/tournament-status";
import { TournamentCompletionWatcher } from "@/components/TournamentCompletionWatcher";
import { BracketActions } from "@/components/BracketActions";
import { AccommodationPublicView } from "@/components/AccommodationPublicView";
import { LiveTabView } from "@/components/LiveTabView";

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
  params: { id: string; locale: string };
  searchParams: { tab?: string; view?: string };
}) {
  const view = searchParams.view ?? "cards";

  // ── Query principale — adaptée selon l'onglet actif ───────────────────
  // On récupère d'abord le tab depuis searchParams AVANT la query pour
  // ne charger les données lourdes (players, events) que si nécessaire.
  const activeTab = searchParams.tab;

  // Les onglets "equipes" et "recap" ont besoin des joueurs complets.
  // "hebergement" aussi : myTeam est calculé via team.players, nécessaire pour afficher le tab.
  // Pas de tab = page chargée sans ?tab= : on charge les players par précaution (recap default pour COMPLETED).
  const needsPlayers = !activeTab || activeTab === "equipes" || activeTab === "recap" || activeTab === "hebergement" || activeTab === "pools";
  // L'onglet "equipes" a besoin des events pour les badges.
  const needsEvents = activeTab === "equipes" || activeTab === "live";
  // Les onglets sans matches : info, inscription, recap, communaute, equipes (matches via events)
  const noMatchesNeeded = ["inscription", "recap", "communaute", "chat"].includes(activeTab ?? "");

  const tournament = await prisma.tournament.findFirst({
    where: { OR: [{ id: params.id }, { slug: params.id }] },
    include: {
      sponsors: true,
      coOrganizers: { include: { player: { select: { id: true, name: true } } } },
      teams: needsPlayers
        ? { include: { players: { include: { player: { include: { account: { select: { id: true } } } } } } } }
        : { select: { id: true, name: true, seed: true, selected: true, guaranteed: true, waitlistPosition: true, city: true, country: true, registrationNote: true, orgaNote: true, tournamentId: true, color: true, playerALevel: true, playerBLevel: true, playerCLevel: true } },
      pools: activeTab === "pools" || activeTab === "schedule"
        ? { include: { teams: { include: { team: true } } } }
        : false,
      matches: noMatchesNeeded ? false : {
        include: {
          teamA: true,
          teamB: true,
          referee: { select: { id: true, name: true } },
          coReferee: { select: { id: true, name: true } },
          ...(needsEvents ? { events: true } : {}),
        },
        orderBy: { startAt: "asc" },
      },
      freeAgents: (activeTab === "info" || activeTab === "communaute" || !activeTab)
        ? true
        : { select: { id: true } },
      soloEntries: (activeTab === "inscription" || activeTab === "equipes")
        ? { include: { player: { select: { id: true, name: true, country: true, city: true, photoPath: true, badges: true, pinnedBadges: true, startYear: true, hand: true, gender: true, showGender: true, slug: true } } }, orderBy: { createdAt: "asc" as const } }
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

  const locale = params.locale ?? "fr";
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
  // In test mode, matches are hidden from the public (orgas/refs still see everything)
  const isTestMode = !!(tournament as any).testMode && !isOrga;

  // Bouton arbitrage : REF (global ou lié à ce tournoi), orga, admin, co-organisateur
  const canRef =
    canEdit ||
    (role === "REF" && (!session?.user?.tournamentId || session.user.tournamentId === tournament.id)) ||
    tournament.coOrganizers.some((co) => co.playerId === currentPlayerId);

  const swissMatches = (tournament.matches ?? []).filter((m: any) => m.phase === "SWISS");
  const hasSwiss = swissMatches.length > 0 || tournament.saturdayFormat === "SWISS";
  const isBerlinMixed = tournament.saturdayFormat === "BERLIN_MIXED";
  const isGraz = tournament.saturdayFormat === "GRAZ";
  const isMtpOpen = tournament.saturdayFormat === "MTP_OPEN";
  const mtpBarrageMatches = (tournament.matches ?? []).filter((m: any) => m.phase === "MTP_BARRAGE");
  const hasMtpBarrage = mtpBarrageMatches.length > 0;
  const berlinFriMatches = (tournament.matches ?? []).filter((m: any) => m.phase === "FRIDAY_A" || m.phase === "FRIDAY_B");
  const berlinSatMatches = (tournament.matches ?? []).filter((m: any) => m.phase === "SATURDAY_A" || m.phase === "SATURDAY_B");
  const berlinSunSwissMatches = (tournament.matches ?? []).filter((m: any) => m.phase === "SUNDAY_SWISS");
  const berlinTop32Matches = (tournament.matches ?? []).filter((m: any) => m.phase === "TOP32");
  const berlinBottom16Matches = (tournament.matches ?? []).filter((m: any) => m.phase === "BOTTOM16");
  const swissSplitSeTop10 = (tournament.matches ?? []).filter((m: any) => m.phase === "BRACKET" && (m.bracketSide === "W" || m.bracketSide === "G" || m.bracketSide === "L") && tournament.sundayFormat === "SWISS_SPLIT_SE");
  const swissSplitSeBottom8 = (tournament.matches ?? []).filter((m: any) => m.phase === "BRACKET" && (m.bracketSide === "B" || m.bracketSide === "BG" || m.bracketSide === "BL") && tournament.sundayFormat === "SWISS_SPLIT_SE");
  const allEvents = (tournament.matches ?? []).flatMap((m: any) => m.events ?? []);

  // Find current player's team — lightweight separate query so tab visibility is
  // always correct regardless of which tab is active (needsPlayers or not).
  const myTeamRecord = currentPlayerId
    ? await (prisma as any).teamPlayer.findFirst({
        where: { playerId: currentPlayerId, team: { tournamentId: tournament.id } },
        select: { teamId: true, isCaptain: true },
      })
    : null;
  const myTeam = myTeamRecord
    ? (tournament.teams as any[]).find((team: any) => team.id === myTeamRecord.teamId) ?? null
    : null;
  const isCaptainOfMyTeam = myTeamRecord?.isCaptain ?? false;

  // When tournament is launched (LIVE/COMPLETED), show selected teams count instead of total registered
  const isLaunched = tournament.status === "LIVE" || tournament.status === "COMPLETED";
  const selectedTeams = tournament.teams.filter((t: any) => t.selected !== false);
  const displayTeamCount = isLaunched && selectedTeams.length > 0 ? selectedTeams.length : tournament.teams.length;

  const dateStart = new Date(tournament.dateStart).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const dateEnd = new Date(tournament.dateEnd).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

  const youtubeEmbed = toYoutubeEmbed(t_.streamYoutubeUrl);

  const now = new Date();
  const registrationOpen =
    (!tournament.registrationStart || now >= new Date(tournament.registrationStart)) &&
    (!tournament.registrationEnd || now <= new Date(tournament.registrationEnd));
  const registrationClosed = !!tournament.registrationEnd && now > new Date(tournament.registrationEnd);

  const hasCommunity = !registrationClosed && tournament.freeAgents.length > 0;

  const tabs = [
    ...(isCompleted ? [{ label: t("tab_recap"), value: "recap", href: `/tournament/${params.id}?tab=recap` }] : []),
    { label: t("tab_info"), value: "info", href: `/tournament/${params.id}?tab=info` },
    ...((!registrationClosed || tournament.format === "ABC Chapeau") ? [{ label: t("tab_registration"), value: "inscription", href: `/tournament/${params.id}?tab=inscription` }] : []),
    ...(isLaunched ? [{ label: t("tab_schedule"), value: "schedule", href: `/tournament/${params.id}?tab=schedule` }] : []),
    // Berlin Mixed tabs
    ...(isLaunched && isBerlinMixed && berlinFriMatches.length > 0 ? [{ label: "Vendredi", value: "berlin_fri", href: `/tournament/${params.id}?tab=berlin_fri` }] : []),
    ...(isLaunched && isBerlinMixed && berlinSatMatches.length > 0 ? [{ label: "Samedi", value: "berlin_sat", href: `/tournament/${params.id}?tab=berlin_sat` }] : []),
    ...(isLaunched && isBerlinMixed && berlinSunSwissMatches.length > 0 ? [{ label: "Dim. Swiss", value: "berlin_sun", href: `/tournament/${params.id}?tab=berlin_sun` }] : []),
    ...(isLaunched && isBerlinMixed && berlinTop32Matches.length > 0 ? [{ label: "Top 32", value: "berlin_top32", href: `/tournament/${params.id}?tab=berlin_top32` }] : []),
    ...(isLaunched && isBerlinMixed && berlinBottom16Matches.length > 0 ? [{ label: "Bottom 16", value: "berlin_bot16", href: `/tournament/${params.id}?tab=berlin_bot16` }] : []),
    // Standard tabs (hidden for Berlin Mixed)
    ...(isLaunched && !isBerlinMixed && !isMtpOpen && tournament.saturdayFormat !== "SWISS" ? [{ label: isGraz ? t("tab_rr_groups") : t("tab_pools"), value: "pools", href: `/tournament/${params.id}?tab=pools` }] : []),
    ...(isLaunched && isMtpOpen ? [{ label: t("tab_mtp_pools"), value: "pools", href: `/tournament/${params.id}?tab=pools` }] : []),
    ...(isLaunched && isMtpOpen && hasMtpBarrage ? [{ label: t("tab_mtp_standings"), value: "mtp_standings", href: `/tournament/${params.id}?tab=mtp_standings` }] : []),
    ...(isLaunched && !isBerlinMixed && hasSwiss ? [{ label: t("tab_swiss"), value: "swiss", href: `/tournament/${params.id}?tab=swiss` }] : []),
    ...(isLaunched && !isBerlinMixed && tournament.sundayFormat === "SWISS_SPLIT_SE" && swissSplitSeTop10.length > 0 ? [{ label: t("bracket_top10"), value: "top10", href: `/tournament/${params.id}?tab=top10` }] : []),
    ...(isLaunched && !isBerlinMixed && tournament.sundayFormat === "SWISS_SPLIT_SE" && swissSplitSeBottom8.length > 0 ? [{ label: t("bracket_bottom8"), value: "bottom8", href: `/tournament/${params.id}?tab=bottom8` }] : []),
    ...(isLaunched && !isBerlinMixed && tournament.sundayFormat !== "SWISS_SPLIT_SE" ? [{ label: t("tab_bracket"), value: "bracket", href: `/tournament/${params.id}?tab=bracket` }] : []),
    { label: t("tab_teams", { count: displayTeamCount }), value: "equipes", href: `/tournament/${params.id}?tab=equipes` },
    ...(youtubeEmbed || t_.chatMode !== "DISABLED" ? [{ label: t("tab_live"), value: "live", href: `/tournament/${params.id}?tab=live` }] : []),
    ...(hasCommunity ? [{ label: `${t("tab_free_agent")}${tournament.freeAgents.length > 0 ? ` (${tournament.freeAgents.length})` : ""}`, value: "communaute", href: `/tournament/${params.id}?tab=communaute` }] : []),
    ...(t_.chatMode !== "DISABLED" ? [{ label: t("tab_chat"), value: "chat", href: `/tournament/${params.id}?tab=chat` }] : []),
    ...(tournament.accommodationAvailable && !!myTeam ? [{ label: t("tab_accommodation"), value: "hebergement", href: `/tournament/${params.id}?tab=hebergement` }] : []),
  ];


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
    // 3ème : gagnant de la petite finale — bracketSide "L", roundIndex le plus élevé
    const lowerFinal = bracketMatches.filter((m) => m.bracketSide === "L")[0];
    if (lowerFinal) {
      const isAWinner = lowerFinal.winnerTeamId === lowerFinal.teamAId;
      podium.third = toTeam(isAWinner ? lowerFinal.teamA : lowerFinal.teamB);
    }
  }

  const deleteFreeAgent = async (id: string) => {
    "use server";
    return await deleteFreeAgentAction(id, tournament.id);
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
                        const label = d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "short" });
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
                      ? new Date(tournament.registrationStart).toLocaleString(locale, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
                      : "?"}{" "}
                    — {tournament.registrationEnd
                      ? new Date(tournament.registrationEnd).toLocaleString(locale, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
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
                      {t("reg_closed_title", { date: tournament.registrationEnd ? new Date(tournament.registrationEnd).toLocaleString(locale, { day: "numeric", month: "long", year: "numeric" }) : "" })}
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

            {!registrationClosed && tournament.freeAgents.length > 0 && (
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

            {tournament.matches.length > 0 && !isTestMode && (
              <div className="panel">
                <LiveMatchTile
                  tournamentId={tournament.id}
                  initialMatches={tournament.matches}
                  gameDurationMin={tournament.gameDurationMin}
                  isLive={tournament.status === "LIVE"}
                />
              </div>
            )}
            {isTestMode && tournament.matches.length > 0 && (
              <div className="panel" style={{ padding: "16px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                🧪 {t("test_mode_hidden")}
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
                        {t("reg_closes_on", { date: new Date(tournament.registrationEnd).toLocaleString(locale, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) })}
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
                  })() : myTeam ? (
                    <WithdrawTeamPanel
                      tournamentId={tournament.id}
                      teamName={myTeam.name}
                      waitlisted={!myTeam.selected}
                      isCaptain={isCaptainOfMyTeam}
                    />
                  ) : (
                    <RegisterTeamForm tournamentId={tournament.id} format={tournament.format} currentPlayerId={currentPlayerId} accommodationAvailable={tournament.accommodationAvailable} />
                  )}
                </>
              ) : registrationClosed ? (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <p style={{ fontWeight: 700, fontFamily: "var(--font-display)", margin: 0 }}>
                    {t("reg_closed_title", { date: tournament.registrationEnd ? new Date(tournament.registrationEnd).toLocaleString(locale, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "" })}
                  </p>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <p style={{ fontWeight: 700, fontFamily: "var(--font-display)", margin: 0 }}>
                    {t("reg_not_open_title")}
                  </p>
                  {tournament.registrationStart && (
                    <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--text-muted)" }}>
                      {t("reg_opens_on", { date: new Date(tournament.registrationStart).toLocaleString(locale, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) })}
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

          {/* Liste des inscrits ABC Chapeau — cartes joueurs */}
          {tournament.format === "ABC Chapeau" && (() => {
            const soloEntries = (t_ as { soloEntries?: { id: string; player: { id: string; name: string; country: string; city: string | null; photoPath: string | null; badges: string[]; pinnedBadges: string[]; startYear: number | null; hand: string | null; gender: string | null; showGender: boolean; slug: string | null }; level: string; waitlisted: boolean }[] }).soloEntries ?? [];
            const active = soloEntries.filter((e) => !e.waitlisted);
            const waitlist = soloEntries.filter((e) => e.waitlisted);
            if (active.length === 0) return null;
            return (
              <div style={{ marginTop: 24 }}>
                <h3 style={{ marginBottom: 16 }}>{t("abc_registered_title", { count: active.length })}</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                  {active.map((e) => {
                    const card = (
                      <div key={e.id} style={{ position: "relative" }}>
                        <PokemonCard
                          name={e.player.name}
                          country={e.player.country}
                          city={e.player.city}
                          photoPath={e.player.photoPath}
                          badges={e.player.badges}
                          pinnedBadges={e.player.pinnedBadges}
                          startYear={e.player.startYear}
                          hand={e.player.hand}
                          gender={e.player.gender ?? undefined}
                          showGender={e.player.showGender}
                        />
                        <div style={{ position: "absolute", top: 8, right: 8, fontWeight: 700, fontSize: 12, background: "rgba(0,0,0,0.7)", color: "#fff", borderRadius: 6, padding: "2px 7px" }}>
                          {e.level}
                        </div>
                      </div>
                    );
                    return e.player.slug ? (
                      <Link key={e.id} href={`/player/${e.player.slug}`} style={{ textDecoration: "none", display: "contents" }}>
                        {card}
                      </Link>
                    ) : card;
                  })}
                </div>
                {waitlist.length > 0 && (
                  <p className="meta" style={{ marginTop: 12, fontSize: 12 }}>
                    + {waitlist.length} {t("abc_on_waitlist")}
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {tab === "schedule" && (isTestMode
        ? <div className="panel" style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>🧪 {t("test_mode_hidden")}</div>
        : <ScheduleBoard tournamentId={tournament.id} initialMatches={tournament.matches} teams={tournament.teams} pools={(tournament.pools ?? []).map((p: any) => ({ id: p.id, name: p.name }))} isOrganizer={isOrga} poolRounds={(tournament as any).poolRounds ?? null} testMode={!!(tournament as any).testMode} />
      )}

      {tab === "pools" && (isTestMode
        ? <div className="panel" style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>🧪 {t("test_mode_hidden")}</div>
        : <PoolTables pools={tournament.pools} matches={tournament.matches} tournamentId={tournament.id} scoringSystem={tournament.scoringSystem} isLive={tournament.status === "LIVE"} poolRounds={(tournament as any).poolRounds ?? null} teamsWithPlayers={tournament.teams as any} />
      )}

      {tab === "mtp_standings" && (isTestMode
        ? <div className="panel" style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>🧪 {t("test_mode_hidden")}</div>
        : <MtpFinalStandings
            teams={tournament.teams.filter((t: any) => t.selected)}
            matches={tournament.matches}
            scoringSystem={tournament.scoringSystem}
            swissRounds={(tournament as any).swissRounds ?? 6}
          />
      )}

      {tab === "bracket" && isTestMode && (
        <div className="panel" style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>🧪 {t("test_mode_hidden")}</div>
      )}

      {tab === "bracket" && !isTestMode && isGraz && (() => {
        const grazSEMatches = tournament.matches.filter((m) => m.phase === "GRAZ_SE");
        const bracketTeams = tournament.teams.filter((t) => t.selected).map((team) => ({ id: team.id, name: team.name, bracketNumber: team.seed }));
        if (grazSEMatches.length === 0) {
          return <p style={{ padding: 24, color: "var(--text-muted)", fontSize: 14 }}>Le SE n&apos;a pas encore été généré.</p>;
        }
        return (
          <div>
            <BracketView matches={grazSEMatches as any} tournamentId={tournament.id} teams={bracketTeams} isOrganizer={isOrga} isLive={tournament.status === "LIVE"} />
          </div>
        );
      })()}

      {tab === "bracket" && !isTestMode && isMtpOpen && (() => {
        const mtpDeMatches = tournament.matches.filter((m: any) => m.phase === "MTP_DE");
        if (mtpDeMatches.length === 0) {
          return <p style={{ padding: 24, color: "var(--text-muted)", fontSize: 14 }}>{t("mtp_de_not_generated")}</p>;
        }
        // Compute DE seeding from combined Swiss standings + barrage results
        const selectedTeams = tournament.teams.filter((t: any) => t.selected);
        const poolAMs = tournament.matches.filter((m: any) => m.phase === "MTP_POOL_A");
        const poolBMs = tournament.matches.filter((m: any) => m.phase === "MTP_POOL_B");
        const barrageMs = tournament.matches.filter((m: any) => m.phase === "MTP_BARRAGE");
        const { poolA, poolB } = splitMtpPools(selectedTeams);
        const poolAStandings = computeStandings(poolA, poolAMs, tournament.scoringSystem);
        const poolBStandings = computeStandings(poolB, poolBMs, tournament.scoringSystem);
        const combined = combineMtpStandings(poolAStandings, poolBStandings);
        const teamMap = new Map(selectedTeams.map((t: any) => [t.id, t]));
        const seeds13to20 = combined.slice(12, 20);
        const barrageWinnerIds = new Set(barrageMs.filter((m: any) => m.winnerTeamId).map((m: any) => m.winnerTeamId as string));
        const barrageWinners = seeds13to20
          .filter((s) => barrageWinnerIds.has(s.teamId))
          .sort((a, b) => combined.findIndex((c) => c.teamId === a.teamId) - combined.findIndex((c) => c.teamId === b.teamId));
        const seeded16 = [
          ...combined.slice(0, 12).map((s) => s.teamId),
          ...barrageWinners.map((s) => s.teamId),
        ];
        const bracketTeams = seeded16.map((id, i) => {
          const team = teamMap.get(id);
          return { id, name: team?.name ?? id, bracketNumber: i + 1 };
        });
        return <BracketView matches={mtpDeMatches as any} tournamentId={tournament.id} teams={bracketTeams} isOrganizer={isOrga} isLive={tournament.status === "LIVE"} />;
      })()}

      {tab === "bracket" && !isTestMode && !isGraz && !isMtpOpen && (() => {
        const bracketMatches = tournament.matches.filter((m) => m.phase === "BRACKET");
        const swissAll = tournament.matches.filter((m) => m.phase === "SWISS");
        const poolRoundsLimit = (tournament as any).poolRounds ?? null;
        const poolAll = tournament.matches.filter((m) => m.phase === "POOL" && (poolRoundsLimit === null || m.roundIndex <= poolRoundsLimit));
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
          if ((tournament.saturdayFormat === "ALL_DAY" || tournament.saturdayFormat === "SPLIT_POOLS") && poolAll.length > 0) {
            const standings = computeStandings(selectedTeams, poolAll, tournament.scoringSystem);
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
              <BracketView matches={bracketMatches} tournamentId={tournament.id} teams={bracketTeams} isOrganizer={isOrga} isLive={tournament.status === "LIVE"} crossPool={tournament.crossPool} />
            </>
          );
        }
        const maxSwissRound = swissAll.length > 0 ? Math.max(...swissAll.map((m: any) => m.roundIndex)) : 0;
        const swissDone = maxSwissRound >= (t_.swissRounds ?? 5) && swissAll.every((m: any) => m.status === "FINISHED");
        const poolDone = poolRoundsLimit === null
          ? tournament.matches.filter((m: any) => m.phase === "POOL").every((m: any) => m.status === "FINISHED")
          : poolAll.every((m: any) => m.status === "FINISHED");
        const isPool = tournament.saturdayFormat === "ALL_DAY" || tournament.saturdayFormat === "SPLIT_POOLS";
        const canLaunch = isOrga && isLaunched && (swissDone || poolDone || (!isPool && tournament.saturdayFormat !== "SWISS"));
        return (
          <div className="panel" style={{ textAlign: "center", padding: 48, marginTop: 16 }}>
            {canLaunch ? (
              <>
                <p style={{ fontWeight: 700, fontFamily: "var(--font-display)", marginBottom: 8, fontSize: 18 }}>
                  {isRR ? "Round Robin" : `Top ${Math.min(t_.bracketSize ?? 16, tournament.teams.length)} qualifiés`}
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

      {/* ── Swiss Split SE: TOP 10 ── */}
      {tab === "top10" && (() => {
        const bracketMatches = swissSplitSeTop10;
        const swissAll = tournament.matches.filter((m) => m.phase === "SWISS");
        const bracketTeams = (() => {
          const selectedTeams = tournament.teams.filter((t) => t.selected);
          if (swissAll.length > 0) {
            const standings = computeStandings(selectedTeams, swissAll, tournament.scoringSystem);
            const rankByTeamId = new Map(standings.map((row, index) => [row.teamId, index + 1]));
            return selectedTeams.slice(0, 10).map((team) => ({
              id: team.id,
              name: team.name,
              bracketNumber: rankByTeamId.get(team.id) ?? team.seed,
            }));
          }
          return selectedTeams.slice(0, 10).map((team) => ({
            id: team.id,
            name: team.name,
            bracketNumber: team.seed,
          }));
        })();

        if (bracketMatches.length > 0) {
          return (
            <BracketView matches={bracketMatches} tournamentId={tournament.id} teams={bracketTeams} isOrganizer={isOrga} isLive={tournament.status === "LIVE"} />
          );
        }
        return (
          <div className="panel" style={{ textAlign: "center", padding: 48 }}>
            <p className="meta">{t("no_matches_for_day")}</p>
          </div>
        );
      })()}

      {/* ── Swiss Split SE: Bottom 8 ── */}
      {tab === "bottom8" && (() => {
        const bracketMatches = swissSplitSeBottom8;
        const swissAll = tournament.matches.filter((m) => m.phase === "SWISS");
        const bracketTeams = (() => {
          const selectedTeams = tournament.teams.filter((t) => t.selected);
          if (swissAll.length > 0) {
            const standings = computeStandings(selectedTeams, swissAll, tournament.scoringSystem);
            const rankByTeamId = new Map(standings.map((row, index) => [row.teamId, index + 1]));
            return selectedTeams.slice(10, 18).map((team) => ({
              id: team.id,
              name: team.name,
              bracketNumber: rankByTeamId.get(team.id) ?? team.seed,
            }));
          }
          return selectedTeams.slice(10, 18).map((team) => ({
            id: team.id,
            name: team.name,
            bracketNumber: team.seed,
          }));
        })();

        if (bracketMatches.length > 0) {
          return (
            <BracketView matches={bracketMatches} tournamentId={tournament.id} teams={bracketTeams} isOrganizer={isOrga} isLive={tournament.status === "LIVE"} />
          );
        }
        return (
          <div className="panel" style={{ textAlign: "center", padding: 48 }}>
            <p className="meta">{t("no_matches_for_day")}</p>
          </div>
        );
      })()}

      {/* ── Berlin Mixed views ── */}
      {(tab === "berlin_fri" || tab === "berlin_sat" || tab === "berlin_sun") && (() => {
        const isFri = tab === "berlin_fri";
        const isSat = tab === "berlin_sat";
        const phases = isFri
          ? ["FRIDAY_A", "FRIDAY_B"]
          : isSat
          ? ["SATURDAY_A", "SATURDAY_B"]
          : ["SUNDAY_SWISS"];
        const groupMatches = (tournament.matches ?? []).filter((m: any) => phases.includes(m.phase));
        const selectedTeams = tournament.teams.filter((t: any) => t.selected);

        if (groupMatches.length === 0) {
          return (
            <div className="panel" style={{ textAlign: "center", padding: 48 }}>
              <p className="meta">{t("no_matches_for_day")}</p>
            </div>
          );
        }

        const renderGroup = (phase: string, label: string) => {
          const gm = groupMatches.filter((m: any) => m.phase === phase);
          if (gm.length === 0) return null;
          const gTeamIds = new Set([...gm.map((m: any) => m.teamAId), ...gm.map((m: any) => m.teamBId)].filter(Boolean));
          const gTeams = selectedTeams.filter((t: any) => gTeamIds.has(t.id));
          const standings = computeStandings(gTeams, gm, tournament.scoringSystem);
          const maxRound = Math.max(...gm.map((m: any) => m.roundIndex));
          return (
            <div key={phase}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 10 }}>
                {label}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {Array.from({ length: maxRound }, (_, i) => i + 1).map((r) => {
                  const rMatches = gm.filter((m: any) => m.roundIndex === r);
                  const done = rMatches.filter((m: any) => m.status === "FINISHED").length;
                  return (
                    <span key={r} style={{ fontFamily: "var(--font-display)", fontSize: 12, padding: "4px 12px", borderRadius: 20, background: done === rMatches.length ? "var(--teal)" : "var(--gray)", border: "1.5px solid var(--border)", fontWeight: 700 }}>
                      Tour {r} — {done}/{rMatches.length}
                    </span>
                  );
                })}
              </div>
              <div className="panel" style={{ marginBottom: 24, overflowX: "auto" }}>
                <table className="swiss-standings" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th>#</th><th>Équipe</th><th>Pts</th><th>J</th><th>V</th><th>N</th><th>D</th><th>Diff</th><th title="Buchholz">Buch.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((row: any, i: number) => (
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
          );
        };

        return (
          <div style={{ padding: "24px 0" }}>
            {isFri && <>{renderGroup("FRIDAY_A", "Groupe A — Vendredi")}{renderGroup("FRIDAY_B", "Groupe B — Vendredi")}</>}
            {isSat && <>{renderGroup("SATURDAY_A", "Groupe A — Samedi")}{renderGroup("SATURDAY_B", "Groupe B — Samedi")}</>}
            {!isFri && !isSat && renderGroup("SUNDAY_SWISS", "Swiss Dimanche — Classement global")}
          </div>
        );
      })()}

      {(tab === "berlin_top32" || tab === "berlin_bot16") && (() => {
        const isTop32 = tab === "berlin_top32";
        const phase = isTop32 ? "TOP32" : "BOTTOM16";
        const bracketMatches = (tournament.matches ?? []).filter((m: any) => m.phase === phase);
        const selectedTeams = tournament.teams.filter((t: any) => t.selected);
        // Build team list seeded by globalRank
        const bracketTeams = [...selectedTeams]
          .sort((a: any, b: any) => (a.globalRank ?? 999) - (b.globalRank ?? 999))
          .map((team: any) => ({ id: team.id, name: team.name, bracketNumber: team.globalRank ?? team.seed }));

        if (bracketMatches.length === 0) {
          return (
            <div className="panel" style={{ textAlign: "center", padding: 48 }}>
              <p className="meta">{t("bracket_not_generated_yet")}</p>
            </div>
          );
        }

        return (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 16, paddingTop: 8 }}>
              {isTop32 ? "Top 32 — Élimination simple" : "Bottom 16 — Élimination simple"}
            </p>
            <BracketView
              matches={bracketMatches}
              tournamentId={tournament.id}
              teams={bracketTeams}
              isOrganizer={isOrga}
              isLive={tournament.status === "LIVE"}
            />
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
        <LiveTabView
          tournamentId={tournament.id}
          tournamentSlug={params.id}
          matches={tournament.matches}
          gameDurationMin={tournament.gameDurationMin}
          isLive={tournament.status === "LIVE"}
          courtsCount={tournament.courtsCount}
          youtubeEmbed={youtubeEmbed}
          chatMode={t_.chatMode as "OPEN" | "ORG_ONLY" | "DISABLED"}
          currentPlayerId={currentPlayerId}
          currentPlayerName={currentPlayerName}
          isOrga={isOrga}
          creatorId={tournament.creatorId}
          charterAccepted={charterAccepted}
          canEdit={canEdit}
        />
      )}

      {/* ── ONGLET ZONE FREE AGENT ── */}
      {tab === "communaute" && (
        <div className="panel" style={{ maxWidth: 600 }}>
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
      )}

      {/* ── ONGLET CHAT ── */}
      {tab === "hebergement" && tournament.accommodationAvailable && !!myTeam && (
        <AccommodationPublicView tournamentId={tournament.id} />
      )}

      {tab === "chat" && t_.chatMode !== "DISABLED" && (
        <div className="panel" style={{ minHeight: 500 }}>
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
      )}

    </div>
  );
}
