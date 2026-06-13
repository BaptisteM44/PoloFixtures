"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { computeStandings } from "@/lib/standings";
import {
  generateBerlinSwissRound,
  computeGlobalRanking,
  assignSaturdayGroups,
  generateSundaySwissRound,
  generateBerlinFinalBrackets,
  BerlinMatchInput,
} from "@/lib/berlin-mixed";
import { MatchPhase } from "@prisma/client";

// ─── Schedule helpers ─────────────────────────────────────────────────────────

/**
 * Compute the start time for the next round.
 * - Round 1: use the configured start time (fallbackStart).
 * - Round N+1: latest startAt in the completed round + gameDurationMin + 5 min buffer.
 */
function computeNextRoundStart(
  groupMatches: Array<{ roundIndex: number; startAt: Date | string }>,
  completedRound: number,
  gameDurationMin: number,
  fallbackStart: Date
): Date {
  if (completedRound === 0) return fallbackStart;
  const roundMatches = groupMatches.filter((m) => m.roundIndex === completedRound);
  if (roundMatches.length === 0) return fallbackStart;
  const lastMs = Math.max(...roundMatches.map((m) => new Date(m.startAt).getTime()));
  return new Date(lastMs + (gameDurationMin + 5) * 60 * 1000);
}

async function requireOrgaAccess(tournamentId: string) {
  const playerId = await getOrgaPlayerId(tournamentId);
  if (!playerId) return { error: "Accès refusé." };
  return null;
}

// ─── Friday: assign groups A/B ────────────────────────────────────────────────

/**
 * Save Friday group assignments.
 * groupA and groupB are arrays of teamIds.
 */
export async function saveFridayGroupsAction(
  tournamentId: string,
  groupA: string[],
  groupB: string[]
) {
  const denied = await requireOrgaAccess(tournamentId);
  if (denied) return denied;

  await prisma.$transaction([
    ...groupA.map((teamId) =>
      prisma.team.update({ where: { id: teamId }, data: { fridayGroup: "A" } })
    ),
    ...groupB.map((teamId) =>
      prisma.team.update({ where: { id: teamId }, data: { fridayGroup: "B" } })
    ),
  ]);

  revalidatePath(`/tournament/${tournamentId}`);
  return { ok: true };
}

// ─── Friday Swiss round ───────────────────────────────────────────────────────

/**
 * Generate the next Friday Swiss round for group A or B.
 */
export async function generateFridaySwissRoundAction(
  tournamentId: string,
  group: "A" | "B"
) {
  const denied = await requireOrgaAccess(tournamentId);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { teams: { where: { selected: true, fridayGroup: group } }, matches: true },
  });
  if (!tournament) return { error: "Tournoi introuvable" };

  const phase: MatchPhase = group === "A" ? "FRIDAY_A" : "FRIDAY_B";
  const groupMatches = tournament.matches.filter((m) => m.phase === phase);
  const existingRounds =
    groupMatches.length > 0 ? Math.max(...groupMatches.map((m) => m.roundIndex)) : 0;

  if (existingRounds > 0) {
    const latestRound = groupMatches.filter((m) => m.roundIndex === existingRounds);
    const unfinished = latestRound.filter((m) => m.status !== "FINISHED");
    if (unfinished.length > 0)
      return {
        error: `Le tour Vendredi-${group} ${existingRounds} a encore ${unfinished.length} match(es) non terminé(s).`,
      };
  }

  const maxRounds = (tournament as any).fridayRounds ?? 5;
  if (existingRounds >= maxRounds)
    return { error: `Tous les ${maxRounds} tours Vendredi-${group} sont terminés.` };

  const standings = computeStandings(
    tournament.teams,
    groupMatches as any,
    tournament.scoringSystem
  );
  const nextRound = existingRounds + 1;
  const courtNames = Array.from({ length: tournament.courtsCount }, (_, i) => `Court ${i + 1}`);
  const fallback = group === "A"
    ? new Date((tournament as any).fridayGroupAStart ?? tournament.dateStart)
    : new Date((tournament as any).fridayGroupBStart ?? tournament.dateStart);
  const roundStart = computeNextRoundStart(groupMatches, existingRounds, tournament.gameDurationMin, fallback);

  const newMatches = generateBerlinSwissRound(
    tournament.teams,
    standings,
    groupMatches as unknown as BerlinMatchInput[],
    nextRound,
    `Fri-${group}`,
    courtNames,
    roundStart,
    tournament.gameDurationMin,
    "FRI"
  );

  if (newMatches.length === 0)
    return { error: "Impossible de générer des pairings pour ce tour." };

  await prisma.$transaction(
    newMatches.map((match) =>
      prisma.match.create({
        data: {
          tournamentId,
          phase,
          poolId: null,
          bracketSide: null,
          roundIndex: match.roundIndex,
          courtName: match.courtName,
          startAt: match.startAt,
          dayIndex: "FRI",
          status: "SCHEDULED",
          teamAId: match.teamAId,
          teamBId: match.teamBId,
        },
      })
    )
  );

  revalidatePath(`/tournament/${tournamentId}`);
  return { ok: true, round: nextRound };
}

// ─── Compute global ranking & assign Saturday groups ─────────────────────────

/**
 * After all Friday rounds are done, compute global ranking and assign Saturday groups.
 * Updates team.saturdayGroup and team.globalRank.
 */
export async function computeSaturdayGroupsAction(tournamentId: string) {
  const denied = await requireOrgaAccess(tournamentId);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      teams: { where: { selected: true } },
      matches: { where: { phase: { in: ["FRIDAY_A", "FRIDAY_B"] }, status: "FINISHED" } },
    },
  });
  if (!tournament) return { error: "Tournoi introuvable" };

  const teamsA = tournament.teams.filter((t) => t.fridayGroup === "A");
  const teamsB = tournament.teams.filter((t) => t.fridayGroup === "B");
  const matchesA = tournament.matches.filter((m) => m.phase === "FRIDAY_A");
  const matchesB = tournament.matches.filter((m) => m.phase === "FRIDAY_B");

  console.log("[computeSaturdayGroups] teamsA:", teamsA.length, "teamsB:", teamsB.length, "matchesA:", matchesA.length, "matchesB:", matchesB.length);

  if (teamsA.length === 0 || teamsB.length === 0) {
    return { error: `Groupes vendredi incomplets: A=${teamsA.length}, B=${teamsB.length}` };
  }
  if (matchesA.length === 0 || matchesB.length === 0) {
    return { error: `Matchs vendredi incomplets: A=${matchesA.length}, B=${matchesB.length}` };
  }

  const globalRanking = computeGlobalRanking(
    teamsA,
    teamsB,
    matchesA as unknown as BerlinMatchInput[],
    matchesB as unknown as BerlinMatchInput[],
    tournament.scoringSystem
  );

  console.log("[computeSaturdayGroups] globalRanking:", globalRanking.slice(0, 10).map(r => `${r.globalRank}. ${r.team.name}`));

  const { satA, satB } = assignSaturdayGroups(globalRanking);
  console.log("[computeSaturdayGroups] satA:", satA.slice(0, 5).map(t => t.name), "satB:", satB.slice(0, 5).map(t => t.name));

  await prisma.$transaction([
    ...globalRanking.map(({ team, globalRank }) =>
      prisma.team.update({
        where: { id: team.id },
        data: { globalRank },
      })
    ),
    ...satA.map((team) =>
      prisma.team.update({ where: { id: team.id }, data: { saturdayGroup: "A" } })
    ),
    ...satB.map((team) =>
      prisma.team.update({ where: { id: team.id }, data: { saturdayGroup: "B" } })
    ),
  ]);

  revalidatePath(`/tournament/${tournamentId}`);
  return {
    ok: true,
    satA: satA.map((t) => t.id),
    satB: satB.map((t) => t.id),
    globalRanking: globalRanking.map(r => `${r.globalRank}. ${r.team.name}`),
  };
}

// ─── Saturday Swiss round ─────────────────────────────────────────────────────

export async function generateSaturdaySwissRoundAction(
  tournamentId: string,
  group: "A" | "B"
) {
  const denied = await requireOrgaAccess(tournamentId);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      teams: { where: { selected: true, saturdayGroup: group } },
      matches: true,
    },
  });
  if (!tournament) return { error: "Tournoi introuvable" };

  const phase: MatchPhase = group === "A" ? "SATURDAY_A" : "SATURDAY_B";
  const groupMatches = tournament.matches.filter((m) => m.phase === phase);
  const existingRounds =
    groupMatches.length > 0 ? Math.max(...groupMatches.map((m) => m.roundIndex)) : 0;

  if (existingRounds > 0) {
    const latestRound = groupMatches.filter((m) => m.roundIndex === existingRounds);
    const unfinished = latestRound.filter((m) => m.status !== "FINISHED");
    if (unfinished.length > 0)
      return {
        error: `Le tour Samedi-${group} ${existingRounds} a encore ${unfinished.length} match(es) non terminé(s).`,
      };
  }

  const maxRounds = (tournament as any).saturdayRounds ?? 5;
  if (existingRounds >= maxRounds)
    return { error: `Tous les ${maxRounds} tours Samedi-${group} sont terminés.` };

  // All prior matches (Fri + Sat) to avoid rematches
  const fridayMatches = tournament.matches.filter(
    (m) => m.phase === "FRIDAY_A" || m.phase === "FRIDAY_B"
  );
  const allPrior: BerlinMatchInput[] = [...fridayMatches, ...groupMatches] as unknown as BerlinMatchInput[];

  // Round 1 of Saturday: no sat matches yet → seed by globalRank (set from Friday standings).
  // Round 2+: use actual Saturday standings, with globalRank as tiebreaker.
  const satStandings = computeStandings(
    tournament.teams,
    groupMatches as any,
    tournament.scoringSystem
  );
  const standings = existingRounds === 0
    ? [...satStandings].sort((a, b) => {
        const ra = (tournament.teams.find((t) => t.id === a.teamId) as any)?.globalRank ?? 999;
        const rb = (tournament.teams.find((t) => t.id === b.teamId) as any)?.globalRank ?? 999;
        return ra - rb;
      })
    : satStandings;
  const nextRound = existingRounds + 1;
  const courtNames = Array.from({ length: tournament.courtsCount }, (_, i) => `Court ${i + 1}`);
  const satFallback = group === "A"
    ? new Date((tournament as any).saturdayPoolAStart ?? tournament.dateEnd)
    : new Date((tournament as any).saturdayPoolBStart ?? tournament.dateEnd);
  const roundStart = computeNextRoundStart(groupMatches, existingRounds, tournament.gameDurationMin, satFallback);

  const newMatches = generateBerlinSwissRound(
    tournament.teams,
    standings,
    allPrior,
    nextRound,
    `Sat-${group}`,
    courtNames,
    roundStart,
    tournament.gameDurationMin,
    "SAT"
  );

  if (newMatches.length === 0)
    return { error: "Impossible de générer des pairings pour ce tour." };

  await prisma.$transaction(
    newMatches.map((match) =>
      prisma.match.create({
        data: {
          tournamentId,
          phase,
          poolId: null,
          bracketSide: null,
          roundIndex: match.roundIndex,
          courtName: match.courtName,
          startAt: match.startAt,
          dayIndex: "SAT",
          status: "SCHEDULED",
          teamAId: match.teamAId,
          teamBId: match.teamBId,
        },
      })
    )
  );

  revalidatePath(`/tournament/${tournamentId}`);
  return { ok: true, round: nextRound };
}

// ─── Sunday Swiss round ───────────────────────────────────────────────────────

/**
 * Generate a Sunday big Swiss round (all 48 teams, no Fri/Sat rematches).
 */
export async function generateSundaySwissRoundAction(tournamentId: string) {
  const denied = await requireOrgaAccess(tournamentId);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { teams: { where: { selected: true } }, matches: true },
  });
  if (!tournament) return { error: "Tournoi introuvable" };

  const sundayMatches = tournament.matches.filter((m) => m.phase === "SUNDAY_SWISS");
  const existingRounds =
    sundayMatches.length > 0 ? Math.max(...sundayMatches.map((m) => m.roundIndex)) : 0;

  if (existingRounds > 0) {
    const latestRound = sundayMatches.filter((m) => m.roundIndex === existingRounds);
    const unfinished = latestRound.filter((m) => m.status !== "FINISHED");
    if (unfinished.length > 0)
      return {
        error: `Le tour Dimanche ${existingRounds} a encore ${unfinished.length} match(es) non terminé(s).`,
      };
  }

  const maxRounds = (tournament as any).sundayRounds ?? 2;
  if (existingRounds >= maxRounds)
    return { error: `Tous les ${maxRounds} tours Dimanche Swiss sont terminés.` };

  // All prior matches: Fri + Sat + Sunday so far
  const fridaySatMatches = tournament.matches.filter((m) =>
    ["FRIDAY_A", "FRIDAY_B", "SATURDAY_A", "SATURDAY_B"].includes(m.phase)
  );
  const allPrior: BerlinMatchInput[] = [...fridaySatMatches, ...sundayMatches] as unknown as BerlinMatchInput[];

  // Sunday standings: start fresh (only Sunday matches count for the ranking)
  const standings = computeStandings(
    tournament.teams,
    sundayMatches as any,
    tournament.scoringSystem
  );

  const nextRound = existingRounds + 1;
  const courtNames = Array.from({ length: tournament.courtsCount }, (_, i) => `Court ${i + 1}`);
  const sunFallback = new Date(tournament.dateEnd);
  const roundStart = computeNextRoundStart(sundayMatches, existingRounds, tournament.gameDurationMin, sunFallback);

  const newMatches = generateSundaySwissRound(
    tournament.teams,
    standings,
    allPrior,
    nextRound,
    courtNames,
    roundStart,
    tournament.gameDurationMin
  );

  if (newMatches.length === 0)
    return { error: "Impossible de générer des pairings pour ce tour." };

  await prisma.$transaction(
    newMatches.map((match) =>
      prisma.match.create({
        data: {
          tournamentId,
          phase: "SUNDAY_SWISS",
          poolId: null,
          bracketSide: null,
          roundIndex: match.roundIndex,
          courtName: match.courtName,
          startAt: match.startAt,
          dayIndex: "SUN",
          status: "SCHEDULED",
          teamAId: match.teamAId,
          teamBId: match.teamBId,
        },
      })
    )
  );

  revalidatePath(`/tournament/${tournamentId}`);
  return { ok: true, round: nextRound };
}

// ─── Generate final brackets (Top32 + Bottom16) ───────────────────────────────

/**
 * After all Sunday Swiss rounds are done, compute global Sunday ranking
 * and generate both SE brackets (Top 32 and Bottom 16).
 */
export async function generateBerlinFinalBracketsAction(tournamentId: string) {
  const denied = await requireOrgaAccess(tournamentId);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { teams: { where: { selected: true } }, matches: true },
  });
  if (!tournament) return { error: "Tournoi introuvable" };

  // Sunday Swiss standings determine final seeding
  const sundayMatches = tournament.matches.filter((m) => m.phase === "SUNDAY_SWISS");
  // Also include Fri + Sat for points total? No: Sunday Swiss is self-contained.
  // The global Sunday ranking is used for seeding into brackets.
  const standings = computeStandings(
    tournament.teams,
    sundayMatches as any,
    tournament.scoringSystem
  );

  const teamMap = new Map(tournament.teams.map((t) => [t.id, t]));
  const globalRanking = standings.map((row, i) => ({
    team: teamMap.get(row.teamId)!,
    globalRank: i + 1,
  })).filter((r) => r.team !== undefined);

  const courtNames = Array.from({ length: tournament.courtsCount }, (_, i) => `Court ${i + 1}`);
  const { top32, bottom16 } = generateBerlinFinalBrackets(
    globalRanking,
    courtNames,
    new Date(tournament.dateEnd),
    tournament.gameDurationMin
  );

  await prisma.$transaction(async (tx) => {
    // Remove existing bracket matches for this format
    await tx.match.deleteMany({
      where: { tournamentId, phase: { in: ["TOP32", "BOTTOM16"] } },
    });

    // Create Top 32 matches
    const createdTop32: Array<{ id: string; roundIndex: number; bracketSide: string | null; positionInRound: number }> = [];
    for (const match of top32) {
      const m = await tx.match.create({
        data: {
          tournamentId,
          phase: "TOP32",
          bracketSide: match.bracketSide ?? null,
          roundIndex: match.roundIndex,
          positionInRound: match.positionInRound ?? 0,
          courtName: match.courtName,
          startAt: match.startAt,
          dayIndex: "SUN",
          status: "SCHEDULED",
          teamAId: match.teamAId,
          teamBId: match.teamBId,
        },
      });
      createdTop32.push({ id: m.id, roundIndex: m.roundIndex, bracketSide: m.bracketSide, positionInRound: m.positionInRound });
    }

    // Link Top 32 SE matches
    await linkSEBracket(createdTop32, tx);

    // Create Bottom 16 matches
    const createdBottom16: Array<{ id: string; roundIndex: number; bracketSide: string | null; positionInRound: number }> = [];
    for (const match of bottom16) {
      const m = await tx.match.create({
        data: {
          tournamentId,
          phase: "BOTTOM16",
          bracketSide: match.bracketSide ?? null,
          roundIndex: match.roundIndex,
          positionInRound: match.positionInRound ?? 0,
          courtName: match.courtName,
          startAt: match.startAt,
          dayIndex: "SUN",
          status: "SCHEDULED",
          teamAId: match.teamAId,
          teamBId: match.teamBId,
        },
      });
      createdBottom16.push({ id: m.id, roundIndex: m.roundIndex, bracketSide: m.bracketSide, positionInRound: m.positionInRound });
    }

    await linkSEBracket(createdBottom16, tx);
  });

  revalidatePath(`/tournament/${tournamentId}`);
  return { ok: true };
}

// ─── SE bracket link helper ───────────────────────────────────────────────────

function linkSEBracket(
  created: Array<{ id: string; roundIndex: number; bracketSide: string | null; positionInRound: number }>,
  tx: any
) {
  const maxRound = Math.max(...created.map((m) => m.roundIndex));
  const thirdPlaceMatch = created.find((m) => m.bracketSide === "L" && m.roundIndex === maxRound);

  const updates: Promise<any>[] = [];

  for (const m of created) {
    if (m.bracketSide === "L") continue; // 3rd place match itself
    if (m.roundIndex >= maxRound) continue; // Final — no next

    const nextPos = Math.floor(m.positionInRound / 2);
    const nextRound = m.roundIndex + 1;
    const nextSide = nextRound === maxRound ? "G" : "W";
    const nextMatch = created.find(
      (c) => c.bracketSide === nextSide && c.roundIndex === nextRound && c.positionInRound === nextPos
    );

    const data: Record<string, unknown> = {};
    if (nextMatch) {
      data.nextMatchWinId = nextMatch.id;
      data.nextSlotWin = m.positionInRound % 2 === 0 ? "A" : "B";
    }
    // Semi-final losers → 3rd place match
    if (thirdPlaceMatch && m.roundIndex === maxRound - 1) {
      data.nextMatchLoseId = thirdPlaceMatch.id;
      data.nextSlotLose = m.positionInRound % 2 === 0 ? "A" : "B";
    }
    if (Object.keys(data).length > 0) {
      updates.push(tx.match.update({ where: { id: m.id }, data }));
    }
  }

  return Promise.all(updates);
}
