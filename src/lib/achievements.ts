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
    (e) => (e.type === "GOAL" || e.type === "GOLDEN_GOAL") && e.payload != null && (e.payload as { playerId?: string }).playerId === playerId
  ).length;
  const penalties = events.filter(
    (e) => e.type === "PENALTY" && e.payload != null && (e.payload as { playerId?: string }).playerId === playerId
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
    include: { match: { select: { tournamentId: true, winnerTeamId: true, tournament: { select: { format: true, testMode: true } } } } },
  });

  // Filter out test tournaments
  const filteredEvents = allEvents.filter((e) => !e.match.tournament.testMode);

  const totalGoals     = filteredEvents.filter((e) => e.type === "GOAL" || e.type === "GOLDEN_GOAL").length;
  const totalPenalties = filteredEvents.filter((e) => e.type === "PENALTY").length;

  if (totalGoals >= 1)   badges.add("first_blood");
  if (totalGoals >= 3)   badges.add("hat_trick");
  if (totalGoals >= 15)  badges.add("sniper");
  if (totalGoals >= 75)  badges.add("goal_machine");
  if (totalGoals >= 150) badges.add("century_club");
  if (totalPenalties >= 3) badges.add("hard_edge");

  // clean_ride: a tournament where player scored ≥1 goal AND 0 penalties
  const tournamentGoals     = new Map<string, number>();
  const tournamentPenalties = new Map<string, number>();
  for (const e of filteredEvents) {
    const tid = e.match.tournamentId;
    if (e.type === "GOAL" || e.type === "GOLDEN_GOAL") tournamentGoals.set(tid, (tournamentGoals.get(tid) ?? 0) + 1);
    if (e.type === "PENALTY") tournamentPenalties.set(tid, (tournamentPenalties.get(tid) ?? 0) + 1);
  }
  for (const [tid, g] of tournamentGoals) {
    if (g > 0 && (tournamentPenalties.get(tid) ?? 0) === 0) { badges.add("clean_ride"); break; }
  }

  // ── All teams the player was part of ────────────────────────────────────
  const teamPlayers = await prisma.teamPlayer.findMany({
    where: { playerId },
    include: {
      team: {
        include: {
          tournament: {
            select: {
              id: true, status: true, dateStart: true, dateEnd: true,
              country: true, registrationEnd: true, testMode: true,
            },
          },
          matchesA: { select: { scoreA: true, scoreB: true, status: true, winnerTeamId: true, phase: true, bracketSide: true } },
          matchesB: { select: { scoreA: true, scoreB: true, status: true, winnerTeamId: true, phase: true, bracketSide: true } },
        },
      },
    },
  });

  const captainCount = teamPlayers.filter((tp) => tp.isCaptain).length;
  if (captainCount >= 3) badges.add("captain");

  const playerTeamIds    = teamPlayers.map((tp) => tp.teamId);
  const playerTeamIdSet  = new Set(playerTeamIds);

  // dicey / golden_double
  if (playerTeamIds.length > 0) {
    const ggWins = await prisma.match.findMany({
      where: { goldenGoal: true, winnerTeamId: { in: playerTeamIds } },
      select: { tournamentId: true, tournament: { select: { testMode: true } } },
    });
    const nonTestGgWins = ggWins.filter((m) => !m.tournament.testMode);
    if (nonTestGgWins.length >= 1) badges.add("dicey");
    // golden_double: 3+ golden goal wins dans un même tournoi
    const ggByTournament = new Map<string, number>();
    for (const m of nonTestGgWins) ggByTournament.set(m.tournamentId, (ggByTournament.get(m.tournamentId) ?? 0) + 1);
    if ([...ggByTournament.values()].some(c => c >= 3)) badges.add("golden_double");
  }

  const tournaments = teamPlayers.map((tp) => tp.team.tournament).filter((t) => !t.testMode);
  const uniqueTournamentIds = new Set(tournaments.map((t) => t.id));
  if (uniqueTournamentIds.size >= 1)  badges.add("team_player");
  if (uniqueTournamentIds.size >= 5)  badges.add("squad_up");
  if (uniqueTournamentIds.size >= 15) badges.add("veteran");

  // road_warrior / globe_trotter / five_continents
  const countries  = new Set(tournaments.map((t) => t.country));
  const continents = new Set([...countries].map(getContinent));
  if (countries.size  >= 3) badges.add("road_warrior");
  if (continents.size >= 3) badges.add("globe_trotter");
  if (continents.size >= 5) badges.add("five_continents");

  // into_the_storm: 5+ tournaments in winter (Dec, Jan, Feb)
  const winterCount = tournaments.filter((t) => {
    const m = new Date(t.dateStart).getMonth() + 1;
    return m === 12 || m === 1 || m === 2;
  }).length;
  if (winterCount >= 5) badges.add("into_the_storm");

  // champion / unbeaten / back_to_back
  const completedTournaments = teamPlayers.filter((tp) => tp.team.tournament.status === "COMPLETED" && !tp.team.tournament.testMode);
  const wonTournamentIds: string[] = [];

  for (const tp of completedTournaments) {
    const allMatches  = [...tp.team.matchesA, ...tp.team.matchesB];
    const played      = allMatches.filter((m) => m.status === "FINISHED");
    if (played.length === 0) continue;

    // Determine tournament champion: the Grand Final (bracketSide === "G")
    const finalMatch = played.find((m) => m.phase === "BRACKET" && m.bracketSide === "G");
    const isChampion = !!finalMatch && finalMatch.winnerTeamId === tp.teamId;
    if (isChampion) {
      badges.add("champion");
      wonTournamentIds.push(tp.team.tournament.id);
    }

    // Compute losses/unbeaten using explicit teamId comparison
    let losses = 0;
    for (const m of played) {
      const won = m.winnerTeamId === tp.teamId;
      if (!won) losses++;
    }
    if (losses === 0 && played.length > 0) badges.add("unbeaten");
  }

  if (wonTournamentIds.length >= 2) {
    const wonDates = completedTournaments
      .filter((tp) => wonTournamentIds.includes(tp.team.tournament.id))
      .map((tp) => ({ date: new Date(tp.team.tournament.dateEnd) }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    for (let i = 1; i < wonDates.length; i++) {
      if ((wonDates[i].date.getTime() - wonDates[i-1].date.getTime()) / 86400000 <= 90) {
        badges.add("back_to_back"); break;
      }
    }
  }

  // loyal_rider
  const coTeammates = new Map<string, Set<string>>();
  for (const tp of teamPlayers) {
    const mates = await prisma.teamPlayer.findMany({
      where: { teamId: tp.teamId, NOT: { playerId } },
      select: { playerId: true },
    });
    for (const mate of mates) {
      if (!coTeammates.has(mate.playerId)) coTeammates.set(mate.playerId, new Set());
      coTeammates.get(mate.playerId)!.add(tp.team.tournament.id);
    }
  }
  for (const [, tids] of coTeammates) {
    if (tids.size >= 3) { badges.add("loyal_rider"); break; }
  }

  // ── All finished matches for player's teams (used by many badges) ────────
  const allTeamMatches = playerTeamIds.length > 0
    ? await prisma.match.findMany({
        where: {
          status: "FINISHED",
          OR: [{ teamAId: { in: playerTeamIds } }, { teamBId: { in: playerTeamIds } }],
        },
        select: {
          id: true, tournamentId: true, phase: true, bracketSide: true, startAt: true,
          teamAId: true, teamBId: true,
          scoreA: true, scoreB: true,
          winnerTeamId: true, goldenGoal: true, nextMatchWinId: true,
        },
        orderBy: { startAt: "asc" },
      })
    : [];

  // stone_cold: 0 goals against in entire tournament run (≥3 matches)
  const matchesByTournament = new Map<string, typeof allTeamMatches>();
  for (const m of allTeamMatches) {
    if (!matchesByTournament.has(m.tournamentId)) matchesByTournament.set(m.tournamentId, []);
    matchesByTournament.get(m.tournamentId)!.push(m);
  }
  const playerTournamentTeam = new Map<string, string>();
  for (const tp of teamPlayers) playerTournamentTeam.set(tp.team.tournament.id, tp.teamId);

  for (const [tid, tMatches] of matchesByTournament) {
    const teamId = playerTournamentTeam.get(tid);
    if (!teamId) continue;
    const myMatches = tMatches.filter((m) => m.teamAId === teamId || m.teamBId === teamId);
    if (myMatches.length < 3) continue;
    const goalsAgainst = myMatches.reduce((acc, m) =>
      acc + (m.teamAId === teamId ? m.scoreB : m.scoreA), 0);
    if (goalsAgainst === 0) { badges.add("stone_cold"); break; }
  }

  // poulidor: 3+ finals lost, never won one
  const finals = allTeamMatches.filter((m) => m.phase === "BRACKET" && m.bracketSide === "G");
  let finalsWon = 0, finalsLost = 0;
  for (const m of finals) {
    const teamId = playerTeamIdSet.has(m.teamAId ?? "") ? m.teamAId : m.teamBId;
    if (!teamId) continue;
    if (m.winnerTeamId === teamId) finalsWon++; else finalsLost++;
  }
  if (finalsLost >= 3 && finalsWon === 0) badges.add("poulidor");

  // cthulhu: 10+ consecutive losses
  let streak = 0, maxStreak = 0;
  for (const m of allTeamMatches) {
    const teamId = playerTeamIdSet.has(m.teamAId ?? "") ? m.teamAId : m.teamBId;
    if (!teamId || m.winnerTeamId === null) continue;
    if (m.winnerTeamId !== teamId) { streak++; if (streak > maxStreak) maxStreak = streak; }
    else streak = 0;
  }
  if (maxStreak >= 10) badges.add("cthulhu");

  // grudge_match: same opponent 5+ times
  const opponentCounts = new Map<string, number>();
  for (const m of allTeamMatches) {
    const isA = playerTeamIdSet.has(m.teamAId ?? "");
    const opp = isA ? m.teamBId : m.teamAId;
    if (opp) opponentCounts.set(opp, (opponentCounts.get(opp) ?? 0) + 1);
  }
  if ([...opponentCounts.values()].some((c) => c >= 5)) badges.add("grudge_match");

  // chaos_agent: 3+ POOL matches with equalization (draw or golden goal triggered)
  if (allTeamMatches.filter((m) => m.phase === "POOL" && (m.goldenGoal || m.scoreA === m.scoreB)).length >= 3)
    badges.add("chaos_agent");

  // butterfly: scored the winning goal in a golden-goal match via last event
  // (approximated: any golden-goal win where player scored the golden goal)
  if (playerTeamIds.length > 0) {
    const ggWinMatches = await prisma.match.findMany({
      where: { goldenGoal: true, winnerTeamId: { in: playerTeamIds } },
      select: { id: true },
    });
    if (ggWinMatches.length > 0) {
      const ggMatchIds = ggWinMatches.map((m) => m.id);
      const playerGGGoal = await prisma.matchEvent.findFirst({
        where: {
          matchId: { in: ggMatchIds },
          type: "GOLDEN_GOAL",
          payload: { path: ["playerId"], equals: playerId },
        },
      });
      if (playerGGGoal) badges.add("butterfly");
    }
  }

  // ── Player profile ───────────────────────────────────────────────────────
  badges.add("welcome");

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      photoPath: true, bio: true, city: true, startYear: true,
      hand: true, createdAt: true, country: true,
    },
  });
  if (player && player.createdAt < new Date("2026-04-01")) badges.add("og");

  // tourist: at least one tournament in a country different from player's home country
  if (player?.country && tournaments.some((t) => t.country !== player.country))
    badges.add("tourist");

  // ── Chat / Messages ──────────────────────────────────────────────────────
  const allMessages = await prisma.tournamentMessage.findMany({
    where: { authorId: playerId },
    select: { content: true, createdAt: true, tournamentId: true },
  });
  const messageCount = allMessages.length;

  if (messageCount >= 50)  badges.add("chatterbox");
  if (messageCount >= 300) badges.add("hype_machine");

  // macgyver / flat_tire / duct_tape
  if (allMessages.some((m) => /réparation|répare|repair|macgyver/i.test(m.content)))
    badges.add("macgyver");
  if (allMessages.some((m) => /crevaison|flat[\s-]?tire|\bflat\b/i.test(m.content)))
    badges.add("flat_tire");
  if (allMessages.filter((m) => /tape|réparation|repair/i.test(m.content)).length >= 5)
    badges.add("duct_tape");

  // glhf
  if (allMessages.some((m) => /\bgl(hf)?\b/i.test(m.content))) badges.add("glhf");

  // afterparty: message sent between 4:00 and 5:00 AM
  if (allMessages.some((m) => { const h = m.createdAt.getHours(); return h >= 4 && h < 5; }))
    badges.add("afterparty");

  // night_owl: message sent between 4h55 and 5h05
  if (allMessages.some((m) => {
    const h = m.createdAt.getHours(), min = m.createdAt.getMinutes();
    return (h === 4 && min >= 55) || (h === 5 && min <= 5);
  })) badges.add("night_owl");

  // hype_train: 10+ messages in the 30 min before a tournament final
  const tournamentFinals = await prisma.match.findMany({
    where: { status: "FINISHED", phase: "BRACKET", bracketSide: "G" },
    select: { tournamentId: true, startAt: true },
  });
  hype: for (const tf of tournamentFinals) {
    const end   = new Date(tf.startAt);
    const start = new Date(end.getTime() - 30 * 60 * 1000);
    const count = allMessages.filter((m) =>
      m.tournamentId === tf.tournamentId &&
      m.createdAt >= start && m.createdAt <= end
    ).length;
    if (count >= 10) { badges.add("hype_train"); break hype; }
  }

  // oracle: predicted exact score before a match (pattern "X-Y" or "X–Y")
  const scoreRx = /\b(\d{1,2})\s*[-–:]\s*(\d{1,2})\b/;
  oracle: for (const msg of allMessages) {
    const hit = msg.content.match(scoreRx);
    if (!hit) continue;
    const [pA, pB] = [parseInt(hit[1]), parseInt(hit[2])];
    const found = allTeamMatches.some((m) =>
      m.tournamentId === msg.tournamentId &&
      m.startAt > msg.createdAt &&
      ((m.scoreA === pA && m.scoreB === pB) || (m.scoreA === pB && m.scoreB === pA))
    );
    if (found) { badges.add("oracle"); break oracle; }
  }

  // reverse_sweep: était mené de 3+ buts et gagne en golden goal
  const ggWinMatchesSweep = allTeamMatches.filter(
    (m) => m.goldenGoal && playerTeamIdSet.has(m.winnerTeamId ?? "")
  );
  if (ggWinMatchesSweep.length > 0) {
    const sweepEvents = await prisma.matchEvent.findMany({
      where: { matchId: { in: ggWinMatchesSweep.map((m) => m.id) }, type: { in: ["GOAL", "GOLDEN_GOAL"] } },
      select: { matchId: true, payload: true, matchClockSec: true },
      orderBy: { matchClockSec: "asc" },
    });
    const eventsByMatch = new Map<string, typeof sweepEvents>();
    for (const e of sweepEvents) {
      if (!eventsByMatch.has(e.matchId)) eventsByMatch.set(e.matchId, []);
      eventsByMatch.get(e.matchId)!.push(e);
    }
    reverseSweep: for (const m of ggWinMatchesSweep) {
      const myTeamId = playerTeamIdSet.has(m.teamAId ?? "") ? m.teamAId : m.teamBId;
      if (!myTeamId) continue;
      let myScore = 0, oppScore = 0;
      for (const e of (eventsByMatch.get(m.id) ?? [])) {
        const scorer = (e.payload as { teamId?: string }).teamId;
        if (scorer === myTeamId) myScore++; else oppScore++;
        if (oppScore - myScore >= 3) { badges.add("reverse_sweep"); break reverseSweep; }
      }
    }
  }

  // askip: perdre tous ses matchs dans un tournoi ET rejouer un autre tournoi après
  for (const tp of completedTournaments) {
    const allMatches = [...tp.team.matchesA, ...tp.team.matchesB].filter((m) => m.status === "FINISHED");
    if (allMatches.length === 0) continue;
    const allLost = allMatches.every((m) => m.winnerTeamId !== tp.teamId);
    if (!allLost) continue;
    const thisDate = new Date(tp.team.tournament.dateEnd);
    const hasReturn = teamPlayers.some(
      (other) => other.teamId !== tp.teamId && new Date(other.team.tournament.dateStart) > thisDate
    );
    if (hasReturn) { badges.add("askip"); break; }
  }

  // final_oracle: prédire le score exact de la finale avant qu'elle soit jouée
  const finalsForOracle = await prisma.match.findMany({
    where: { status: "FINISHED", phase: "BRACKET", bracketSide: "G" },
    select: { tournamentId: true, startAt: true, scoreA: true, scoreB: true },
  });
  finalOracle: for (const final of finalsForOracle) {
    const msgs = allMessages.filter(
      (m) => m.tournamentId === final.tournamentId && m.createdAt < final.startAt
    );
    for (const msg of msgs) {
      const hit = msg.content.match(scoreRx);
      if (!hit) continue;
      const [pA, pB] = [parseInt(hit[1]), parseInt(hit[2])];
      if ((final.scoreA === pA && final.scoreB === pB) || (final.scoreA === pB && final.scoreB === pA)) {
        badges.add("final_oracle"); break finalOracle;
      }
    }
  }

  // ── Organisation ─────────────────────────────────────────────────────────
  const organizedTournaments = await prisma.tournament.findMany({
    where: {
      status: "COMPLETED",
      OR: [{ creatorId: playerId }, { coOrganizers: { some: { playerId } } }],
    },
    include: { teams: { select: { id: true } } },
  });
  if (organizedTournaments.length >= 1)  badges.add("host");
  if (organizedTournaments.length >= 3)  badges.add("serial_organizer");
  if (organizedTournaments.length >= 10) badges.add("community_builder");
  if (organizedTournaments.length >= 20) badges.add("grand_architect");
  if (organizedTournaments.some((t) => t.teams.length >= 16)) badges.add("mega_event");

  // fashionably_late: very last registration, within 1 h before deadline
  for (const tp of teamPlayers) {
    const { tournament } = tp.team;
    if (!tournament.registrationEnd) continue;
    const deadline     = new Date(tournament.registrationEnd);
    const oneHourBefore = new Date(deadline.getTime() - 60 * 60 * 1000);
    const regAt        = (tp as { registeredAt?: Date }).registeredAt;
    if (!regAt || regAt < oneHourBefore || regAt > deadline) continue;

    const last = await prisma.teamPlayer.findFirst({
      where: { team: { tournamentId: tournament.id } },
      orderBy: { registeredAt: "desc" },
      select: { playerId: true },
    });
    if (last?.playerId === playerId) { badges.add("fashionably_late"); break; }
  }

  // schedule_head: awarded manually (requires frontend tracking — not automatable)

  // ── Vague 3 : 22 missing badges ──────────────────────────────────────────

  // bookmarked: player has pinned at least 5 badges on their card
  const playerFull = await prisma.player.findUnique({
    where: { id: playerId },
    select: { pinnedBadges: true, startYear: true },
  });
  if ((playerFull?.pinnedBadges ?? []).length >= 5) badges.add("bookmarked");

  // time_traveler: startYear before 2012
  if (playerFull?.startYear && playerFull.startYear < 2012) badges.add("time_traveler");

  // birthday_ride: no birthdate field on Player model — skip
  // addict / regular / no_days_off / full_year: no login-day tracking in DB — skip
  // broadcaster: no share/link tracking in DB — skip

  // pit_stop: mention food in a tournament chat message
  if (allMessages.some((m) =>
    /\b(pizza|burger|sandwich|tacos?|frite|snack|manger|bouffe|repas|food|nourriture|kebab|sushi|burritos?|naan|falafel)\b/i.test(m.content)
  )) badges.add("pit_stop");

  // free_agent: player registered as free agent for at least one tournament
  const freeAgentCount = await prisma.freeAgent.count({ where: { playerId } });
  if (freeAgentCount >= 1) badges.add("free_agent");

  // early_bird: first message ever sent in a tournament chat (first by createdAt in that tournament)
  earlyBird: for (const msg of allMessages) {
    const firstMsg = await prisma.tournamentMessage.findFirst({
      where: { tournamentId: msg.tournamentId },
      orderBy: { createdAt: "asc" },
      select: { authorId: true },
    });
    if (firstMsg?.authorId === playerId) { badges.add("early_bird"); break earlyBird; }
  }

  // patient_zero: first TeamPlayer registered in a tournament
  patientZero: for (const tp of teamPlayers) {
    const first = await prisma.teamPlayer.findFirst({
      where: { team: { tournamentId: tp.team.tournament.id } },
      orderBy: { registeredAt: "asc" },
      select: { playerId: true },
    });
    if (first?.playerId === playerId) { badges.add("patient_zero"); break patientZero; }
  }

  // circus_act: 3+ tournaments in the same calendar month
  const monthCounts = new Map<string, number>();
  for (const t of tournaments) {
    const d = new Date(t.dateStart);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
  }
  if ([...monthCounts.values()].some((c) => c >= 3)) badges.add("circus_act");

  // night_ride: played a match starting after 22:00
  if (allTeamMatches.some((m) => m.startAt.getHours() >= 22)) badges.add("night_ride");

  // eruption: 5+ goals by the player in a single match (3v3 or 4v4 only)
  if (playerTeamIds.length > 0) {
    const goalEventsByMatch = new Map<string, number>();
    for (const e of allEvents) {
      if (e.type === "GOAL" || e.type === "GOLDEN_GOAL") {
        const fmt = e.match?.tournament?.format ?? "";
        if (fmt !== "3v3" && fmt !== "4v4") continue;
        const mid = e.matchId;
        goalEventsByMatch.set(mid, (goalEventsByMatch.get(mid) ?? 0) + 1);
      }
    }
    if ([...goalEventsByMatch.values()].some((c) => c >= 5)) badges.add("eruption");
  }

  // tidal_wave: win a match by 5+ goals difference
  for (const m of allTeamMatches) {
    const isA = playerTeamIdSet.has(m.teamAId ?? "");
    const isB = playerTeamIdSet.has(m.teamBId ?? "");
    if (!isA && !isB) continue;
    const diff = isA ? m.scoreA - m.scoreB : m.scoreB - m.scoreA;
    if (diff >= 5 && m.winnerTeamId && (isA ? m.winnerTeamId === m.teamAId : m.winnerTeamId === m.teamBId)) {
      badges.add("tidal_wave"); break;
    }
  }

  // on_fire: 5 consecutive wins in a single tournament
  onFire: for (const [tid, tMatches] of matchesByTournament) {
    const teamId = playerTournamentTeam.get(tid);
    if (!teamId) continue;
    const myMatches = tMatches.filter((m) => m.teamAId === teamId || m.teamBId === teamId);
    let consec = 0;
    for (const m of myMatches) {
      if (m.winnerTeamId === teamId) { consec++; if (consec >= 5) { badges.add("on_fire"); break onFire; } }
      else consec = 0;
    }
  }

  // comeback_kid: win a match after being down 3+ goals (non-golden-goal)
  // Reuse ggWinMatchesSweep logic but for all won matches
  if (allTeamMatches.length > 0) {
    const wonMatches = allTeamMatches.filter((m) => playerTeamIdSet.has(m.winnerTeamId ?? ""));
    if (wonMatches.length > 0) {
      const comebackEvents = await prisma.matchEvent.findMany({
        where: { matchId: { in: wonMatches.map((m) => m.id) }, type: { in: ["GOAL", "GOLDEN_GOAL"] } },
        select: { matchId: true, payload: true, matchClockSec: true },
        orderBy: { matchClockSec: "asc" },
      });
      const cbEventsByMatch = new Map<string, typeof comebackEvents>();
      for (const e of comebackEvents) {
        if (!cbEventsByMatch.has(e.matchId)) cbEventsByMatch.set(e.matchId, []);
        cbEventsByMatch.get(e.matchId)!.push(e);
      }
      comebackKid: for (const m of wonMatches) {
        const myTeamId = playerTeamIdSet.has(m.teamAId ?? "") ? m.teamAId : m.teamBId;
        if (!myTeamId) continue;
        let myScore = 0, oppScore = 0;
        for (const e of (cbEventsByMatch.get(m.id) ?? [])) {
          const scorer = (e.payload as { teamId?: string }).teamId;
          if (scorer === myTeamId) myScore++; else oppScore++;
          if (oppScore - myScore >= 3) { badges.add("comeback_kid"); break comebackKid; }
        }
      }
    }
  }

  // dragon_slayer: beat the winner of the immediately preceding tournament
  // We look for each tournament's previous one (by dateEnd) and check if that winner is among opponents we beat
  if (playerTeamIds.length > 0) {
    const allCompletedTournaments = await prisma.tournament.findMany({
      where: { status: "COMPLETED" },
      select: { id: true, dateEnd: true },
      orderBy: { dateEnd: "asc" },
    });
    // Map tournament id -> winner team id (team that won the final)
    const tournamentWinners = new Map<string, string>();
    for (const ct of allCompletedTournaments) {
      const final = await prisma.match.findFirst({
        where: { tournamentId: ct.id, phase: "BRACKET", bracketSide: "G", status: "FINISHED" },
        select: { winnerTeamId: true },
      });
      if (final?.winnerTeamId) tournamentWinners.set(ct.id, final.winnerTeamId);
    }
    // For each tournament the player participated in, find the previous completed tournament's winner
    dragonSlayer: for (const tp of completedTournaments) {
      const tDate = new Date(tp.team.tournament.dateEnd);
      // Find latest tournament that ended before this one
      const prev = [...allCompletedTournaments]
        .filter((ct) => ct.id !== tp.team.tournament.id && new Date(ct.dateEnd) < tDate)
        .sort((a, b) => new Date(b.dateEnd).getTime() - new Date(a.dateEnd).getTime())[0];
      if (!prev) continue;
      const prevWinner = tournamentWinners.get(prev.id);
      if (!prevWinner) continue;
      // Check if player's team beat the defending champion in this tournament
      const beat = allTeamMatches.some(
        (m) => m.tournamentId === tp.team.tournament.id &&
          m.winnerTeamId === tp.teamId &&
          (m.teamAId === prevWinner || m.teamBId === prevWinner)
      );
      if (beat) { badges.add("dragon_slayer"); break dragonSlayer; }
    }
  }

  // united_nations: played in a team with 3+ different nationalities (including self)
  unitedNations: for (const tp of teamPlayers) {
    const mates = await prisma.teamPlayer.findMany({
      where: { teamId: tp.teamId },
      include: { player: { select: { country: true } } },
    });
    const nats = new Set(mates.map((m) => m.player.country).filter(Boolean));
    if (nats.size >= 3) { badges.add("united_nations"); break unitedNations; }
  }

  // wild_card: joined as free agent AND team finished top 3 in that tournament
  if (freeAgentCount >= 1) {
    const freeAgentTournaments = await prisma.freeAgent.findMany({
      where: { playerId },
      select: { tournamentId: true },
    });
    const faTournamentIds = new Set(freeAgentTournaments.map((fa) => fa.tournamentId).filter(Boolean) as string[]);
    wildCard: for (const tp of completedTournaments) {
      if (!faTournamentIds.has(tp.team.tournament.id)) continue;
      // Top 3: finalist (final + semi-final losers)
      // Simplified: team won at least one bracket match OR reached finals
      const bracketWins = allTeamMatches.filter(
        (m) => m.tournamentId === tp.team.tournament.id &&
          m.phase === "BRACKET" &&
          m.winnerTeamId === tp.teamId
      ).length;
      if (bracketWins >= 1) { badges.add("wild_card"); break wildCard; }
    }
  }

  // phantom: player participated in a tournament without appearing in the top 5 goal scorers,
  // then later won a tournament
  // top 5 scorers = top 5 players by goal count in that tournament's events
  if (wonTournamentIds.length > 0) {
    phantom: for (const tp of completedTournaments) {
      if (wonTournamentIds.includes(tp.team.tournament.id)) continue; // skip won ones
      // Get all goals in this tournament
      const tGoalEvents = await prisma.matchEvent.findMany({
        where: { match: { tournamentId: tp.team.tournament.id }, type: { in: ["GOAL", "GOLDEN_GOAL"] } },
        select: { payload: true },
      });
      const scorerCounts = new Map<string, number>();
      for (const e of tGoalEvents) {
        const pid = (e.payload as { playerId?: string }).playerId;
        if (pid) scorerCounts.set(pid, (scorerCounts.get(pid) ?? 0) + 1);
      }
      const top5 = [...scorerCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([pid]) => pid);
      if (!top5.includes(playerId)) {
        // Player was NOT in top 5 of this tournament — and they won another one
        badges.add("phantom"); break phantom;
      }
    }
  }

  // ── Collector / Completionist ────────────────────────────────────────────
  const total = badges.size;
  if (total >= 20) badges.add("collector");
  if (total >= 35) badges.add("completionist");

  // ── Vague 2 ──────────────────────────────────────────────────────────────

  // the_commentator: 50+ messages in a single tournament
  const msgByTournament = new Map<string, number>();
  for (const m of allMessages) {
    msgByTournament.set(m.tournamentId, (msgByTournament.get(m.tournamentId) ?? 0) + 1);
  }
  if ([...msgByTournament.values()].some((c) => c >= 50)) badges.add("the_commentator");

  // seven_nations: teammates of 7+ different nationalities across all tournaments
  const teammateNationalities = new Set<string>();
  for (const tp of teamPlayers) {
    const mates = await prisma.teamPlayer.findMany({
      where: { teamId: tp.teamId, NOT: { playerId } },
      include: { player: { select: { country: true } } },
    });
    for (const mate of mates) {
      if (mate.player.country) teammateNationalities.add(mate.player.country);
    }
  }
  if (teammateNationalities.size >= 7) badges.add("seven_nations");

  // the_historian: message sent in a chat of a tournament that ended 6+ months ago
  if (allMessages.length > 0) {
    const tournamentDates = await prisma.tournament.findMany({
      where: { id: { in: [...new Set(allMessages.map((m) => m.tournamentId))] } },
      select: { id: true, dateEnd: true },
    });
    const dateMap = new Map(tournamentDates.map((t) => [t.id, new Date(t.dateEnd)]));
    const historian = allMessages.some((m) => {
      const end = dateMap.get(m.tournamentId);
      if (!end) return false;
      return m.createdAt.getTime() - end.getTime() > 6 * 30 * 24 * 3600 * 1000;
    });
    if (historian) badges.add("the_historian");
  }

  // squeaky_clean: win a completed tournament conceding ≤1 goal per match
  for (const tp of completedTournaments) {
    const teamId = tp.teamId;
    const allMatches = [...tp.team.matchesA, ...tp.team.matchesB].filter((m) => m.status === "FINISHED");
    if (allMatches.length < 3) continue;
    const isChampion = allMatches.some((m) => m.winnerTeamId === teamId);
    if (!isChampion) continue;
    const clean = allMatches.every((m) => {
      const goalsAgainst = tp.team.matchesA.includes(m) ? m.scoreB : m.scoreA;
      return goalsAgainst <= 1;
    });
    if (clean) { badges.add("squeaky_clean"); break; }
  }

  // ref_duty (mythic 4★) + double_duty (legendary 5★)
  const refereedMatches = await prisma.match.findMany({
    where: { refereePlayerId: playerId, status: "FINISHED" },
    select: { startAt: true },
  });
  if (refereedMatches.length >= 3 && allTeamMatches.length >= 3) {
    const playDayCount = new Map<string, number>();
    for (const m of allTeamMatches) {
      const day = m.startAt.toISOString().slice(0, 10);
      playDayCount.set(day, (playDayCount.get(day) ?? 0) + 1);
    }
    const refDayCount = new Map<string, number>();
    for (const m of refereedMatches) {
      const day = m.startAt.toISOString().slice(0, 10);
      refDayCount.set(day, (refDayCount.get(day) ?? 0) + 1);
    }
    for (const [day, refCount] of refDayCount) {
      const playCount = playDayCount.get(day) ?? 0;
      if (refCount >= 3 && playCount >= 3) badges.add("ref_duty");
      if (refCount >= 5 && playCount >= 5) badges.add("double_duty");
    }
  }

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
