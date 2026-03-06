import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notify";
import { BADGE_CATALOG } from "@/lib/badge-catalog";

// ---------------------------------------------------------------------------
// Per-tournament helpers (used for live display on tournament page)
// These are lightweight, computed from already-loaded data.
// ---------------------------------------------------------------------------

export function computePlayerBadgesForTournament(
  playerId: string,
  events: { type: string; payload: unknown }[]
): string[] {
  const goals = events.filter(
    (e) => (e.type === "GOAL" || e.type === "GOLDEN_GOAL") && (e.payload as { playerId?: string }).playerId === playerId
  ).length;
  const penalties = events.filter(
    (e) => e.type === "PENALTY" && (e.payload as { playerId?: string }).playerId === playerId
  ).length;

  const badges: string[] = [];
  if (goals >= 1) badges.push("first_blood");
  if (goals >= 3) badges.push("hat_trick");
  if (penalties === 0 && goals > 0) badges.push("clean_ride");
  if (penalties >= 3) badges.push("hard_edge");
  return badges;
}

export function computeTeamBadgesForTournament(
  teamId: string,
  matches: { teamAId: string | null; teamBId: string | null; scoreA: number; scoreB: number }[]
): string[] {
  const badges: string[] = [];
  let wins = 0, goalsFor = 0, goalsAgainst = 0;

  for (const match of matches) {
    if (match.teamAId !== teamId && match.teamBId !== teamId) continue;
    if (match.teamAId === teamId) {
      goalsFor += match.scoreA; goalsAgainst += match.scoreB;
      if (match.scoreA > match.scoreB) wins++;
    } else {
      goalsFor += match.scoreB; goalsAgainst += match.scoreA;
      if (match.scoreB > match.scoreA) wins++;
    }
  }

  if (wins >= 3) badges.push("winning_streak");
  if (goalsAgainst === 0 && goalsFor > 0) badges.push("brick_wall");
  if (goalsFor >= 10) badges.push("goal_surge");
  return badges;
}

// Legacy export aliases for backward compat in tournament page
export const computePlayerBadges = computePlayerBadgesForTournament;
export const computeTeamBadges = computeTeamBadgesForTournament;

// ---------------------------------------------------------------------------
// Global career badge computation (server-side only, hits DB)
// Call this after tournaments are completed or from admin endpoint.
// ---------------------------------------------------------------------------

const CONTINENT_MAP: Record<string, string> = {
  // Europe
  France: "EU", Germany: "EU", Belgium: "EU", Netherlands: "EU",
  "United Kingdom": "EU", Spain: "EU", Italy: "EU", Sweden: "EU",
  Switzerland: "EU", Poland: "EU", Portugal: "EU", Norway: "EU",
  Denmark: "EU", Finland: "EU", Austria: "EU", Czech_Republic: "EU",
  Hungary: "EU", Romania: "EU", "Czech Republic": "EU",
  // Americas
  USA: "AM", Canada: "AM", Brazil: "AM", Argentina: "AM", Mexico: "AM",
  Colombia: "AM", Chile: "AM", Peru: "AM",
  // Asia
  Japan: "AS", China: "AS", "South Korea": "AS", India: "AS",
  Thailand: "AS", Vietnam: "AS", Indonesia: "AS", Taiwan: "AS",
  Singapore: "AS", Philippines: "AS",
  // Oceania
  Australia: "OC", "New Zealand": "OC",
  // Africa
  "South Africa": "AF", Morocco: "AF", Kenya: "AF", Nigeria: "AF",
  Egypt: "AF", Ghana: "AF", Senegal: "AF",
};

function getContinent(country: string): string {
  return CONTINENT_MAP[country] ?? "OTHER";
}

export async function computeCareerBadges(playerId: string): Promise<string[]> {
  const badges = new Set<string>();

  // ── All events involving this player ────────────────────────────────────
  const allEvents = await prisma.matchEvent.findMany({
    where: {
      OR: [
        { type: "GOAL",        payload: { path: ["playerId"], equals: playerId } },
        { type: "GOLDEN_GOAL", payload: { path: ["playerId"], equals: playerId } },
        { type: "PENALTY",     payload: { path: ["playerId"], equals: playerId } },
      ],
    },
    include: { match: { select: { tournamentId: true, winnerTeamId: true } } },
  });

  const totalGoals     = allEvents.filter((e) => e.type === "GOAL" || e.type === "GOLDEN_GOAL").length;
  const totalPenalties = allEvents.filter((e) => e.type === "PENALTY").length;

  // Performance
  if (totalGoals >= 1)   badges.add("first_blood");
  if (totalGoals >= 3)   badges.add("hat_trick");
  if (totalGoals >= 10)  badges.add("sniper");
  if (totalGoals >= 50)  badges.add("goal_machine");
  if (totalGoals >= 100) badges.add("century_club");
  if (totalPenalties >= 3) badges.add("hard_edge");

  // clean_ride: a tournament where player scored ≥1 goal AND 0 penalties
  const tournamentGoals    = new Map<string, number>();
  const tournamentPenalties = new Map<string, number>();
  for (const e of allEvents) {
    const tid = e.match.tournamentId;
    if (e.type === "GOAL" || e.type === "GOLDEN_GOAL") tournamentGoals.set(tid, (tournamentGoals.get(tid) ?? 0) + 1);
    if (e.type === "PENALTY") tournamentPenalties.set(tid, (tournamentPenalties.get(tid) ?? 0) + 1);
  }
  for (const [tid, g] of tournamentGoals) {
    if (g > 0 && (tournamentPenalties.get(tid) ?? 0) === 0) {
      badges.add("clean_ride");
      break;
    }
  }

  // dicey / golden_double: wins via golden goal — computed after teamPlayers are fetched below

  // ── All teams the player was part of ────────────────────────────────────
  const teamPlayers = await prisma.teamPlayer.findMany({
    where: { playerId },
    include: {
      team: {
        include: {
          tournament: { select: { id: true, status: true, dateEnd: true, country: true } },
          matchesA: { select: { scoreA: true, scoreB: true, status: true, winnerTeamId: true } },
          matchesB: { select: { scoreA: true, scoreB: true, status: true, winnerTeamId: true } },
        },
      },
    },
  });

  const captainCount = teamPlayers.filter((tp) => tp.isCaptain).length;
  if (captainCount >= 3) badges.add("captain");

  // dicey / golden_double: wins via golden goal
  const playerTeamIds = teamPlayers.map((tp) => tp.teamId);
  if (playerTeamIds.length > 0) {
    const goldenGoalWins = await prisma.match.count({
      where: { goldenGoal: true, winnerTeamId: { in: playerTeamIds } },
    });
    if (goldenGoalWins >= 1) badges.add("dicey");
    if (goldenGoalWins >= 3) badges.add("golden_double");
  }

  const tournaments = teamPlayers.map((tp) => tp.team.tournament);

  // team_player / squad_up / veteran
  const uniqueTournamentIds = new Set(tournaments.map((t) => t.id));
  if (uniqueTournamentIds.size >= 1)  badges.add("team_player");
  if (uniqueTournamentIds.size >= 3)  badges.add("squad_up");
  if (uniqueTournamentIds.size >= 10) badges.add("veteran");

  // road_warrior: played in 3+ different countries
  const countries = new Set(tournaments.map((t) => t.country));
  if (countries.size >= 3) badges.add("road_warrior");

  // globe_trotter: played on 3+ continents
  const continents = new Set([...countries].map(getContinent));
  if (continents.size >= 3) badges.add("globe_trotter");

  // champion: won a completed tournament
  // unbeaten: completed a tournament with no losses
  // back_to_back: won 2 consecutive tournaments (by dateEnd)
  const completedTournaments = teamPlayers.filter(
    (tp) => tp.team.tournament.status === "COMPLETED"
  );

  const wonTournamentIds: string[] = [];
  for (const tp of completedTournaments) {
    const allMatches = [...tp.team.matchesA, ...tp.team.matchesB];
    const playedMatches = allMatches.filter((m) => m.status === "FINISHED");
    if (playedMatches.length === 0) continue;

    const teamId = tp.teamId;
    let losses = 0;
    let isChampion = false;

    for (const m of playedMatches) {
      const isA = tp.team.matchesA.includes(m);
      const won = isA ? m.scoreA > m.scoreB : m.scoreB > m.scoreA;
      if (!won) losses++;
      if (m.winnerTeamId === teamId) isChampion = true;
    }

    if (isChampion) {
      badges.add("champion");
      wonTournamentIds.push(tp.team.tournament.id);
    }
    if (losses === 0 && playedMatches.length > 0) badges.add("unbeaten");
  }

  // back_to_back: check if any 2 won tournaments are consecutive in time
  if (wonTournamentIds.length >= 2) {
    const wonDates = completedTournaments
      .filter((tp) => wonTournamentIds.includes(tp.team.tournament.id))
      .map((tp) => ({ id: tp.team.tournament.id, date: new Date(tp.team.tournament.dateEnd) }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    for (let i = 1; i < wonDates.length; i++) {
      const diff = wonDates[i].date.getTime() - wonDates[i - 1].date.getTime();
      const daysDiff = diff / (1000 * 60 * 60 * 24);
      if (daysDiff <= 90) { // within 3 months
        badges.add("back_to_back");
        break;
      }
    }
  }

  // loyal_rider: played 3+ tournaments with the same teammate
  const coTeammates = new Map<string, Set<string>>(); // coplayerId → set of tournamentIds
  for (const tp of teamPlayers) {
    const teamMates = await prisma.teamPlayer.findMany({
      where: { teamId: tp.teamId, NOT: { playerId } },
      select: { playerId: true },
    });
    for (const mate of teamMates) {
      if (!coTeammates.has(mate.playerId)) coTeammates.set(mate.playerId, new Set());
      coTeammates.get(mate.playerId)!.add(tp.team.tournament.id);
    }
  }
  for (const [, tids] of coTeammates) {
    if (tids.size >= 3) { badges.add("loyal_rider"); break; }
  }

  // ── Engagement badges ────────────────────────────────────────────────────
  badges.add("welcome"); // always — just having a profile

  // say_cheese: has a photo
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { photoPath: true, bio: true, city: true, startYear: true, hand: true, createdAt: true },
  });

  if (player?.photoPath) badges.add("say_cheese");

  if (
    player?.photoPath &&
    player?.bio &&
    player?.city &&
    player?.startYear &&
    player?.hand
  ) badges.add("profile_complete");

  // og: account created before April 1, 2026
  if (player && player.createdAt < new Date("2026-04-01")) badges.add("og");

  // ── Social badges ───────────────────────────────────────────────────────
  // Note: free_agent badge is awarded manually (FreeAgent model has no playerId link)

  // host / serial_organizer / community_builder / mega_event
  // host / serial_organizer / community_builder / mega_event
  // Counts completed tournaments where player is creator OR co-organizer
  const organizedTournaments = await prisma.tournament.findMany({
    where: {
      status: "COMPLETED",
      OR: [
        { creatorId: playerId },
        { coOrganizers: { some: { playerId } } },
      ],
    },
    include: { teams: { select: { id: true } } },
  });
  if (organizedTournaments.length >= 1) badges.add("host");
  if (organizedTournaments.length >= 3) badges.add("serial_organizer");
  if (organizedTournaments.length >= 5) badges.add("community_builder");
  if (organizedTournaments.some((t) => t.teams.length >= 16)) badges.add("mega_event");

  // chatterbox / hype_machine
  const messageCount = await prisma.tournamentMessage.count({ where: { authorId: playerId } });
  if (messageCount >= 50)  badges.add("chatterbox");
  if (messageCount >= 200) badges.add("hype_machine");

  // collector / completionist (based on total badges earned)
  const total = badges.size;
  if (total >= 15) badges.add("collector");
  if (total >= 30) badges.add("completionist");

  return Array.from(badges);
}

// ---------------------------------------------------------------------------
// Recompute badges for ALL active players and persist to DB
// ---------------------------------------------------------------------------

export async function recomputeAllBadges(): Promise<{ updated: number; errors: number }> {
  const players = await prisma.player.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, badges: true, account: { select: { id: true } } },
  });

  let updated = 0;
  let errors = 0;

  for (const player of players) {
    try {
      const oldBadges = new Set<string>(player.badges);
      const newBadges = await computeCareerBadges(player.id);
      await prisma.player.update({ where: { id: player.id }, data: { badges: newBadges } });

      // Notifier les badges nouvellement débloqués (seulement si le joueur a un compte)
      if (player.account) {
        for (const badge of newBadges) {
          if (!oldBadges.has(badge)) {
            const info = BADGE_CATALOG[badge];
            await createNotification(player.id, "BADGE_UNLOCKED", {
              badge,
              badgeName: info ? `${info.emoji} ${info.name}` : badge,
            });
          }
        }
      }

      updated++;
    } catch {
      errors++;
    }
  }

  return { updated, errors };
}
