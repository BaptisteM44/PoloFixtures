"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { computeStandings } from "@/lib/standings";
import {
  generateBerlinSwissRound,
  BerlinMatchInput,
} from "@/lib/berlin-mixed";
import { generateBracketAction } from "@/app/[locale]/tournament/[id]/edit/actions";
import { MatchPhase } from "@prisma/client";

async function requireOrgaAccess(tournamentId: string) {
  const playerId = await getOrgaPlayerId(tournamentId);
  if (!playerId) return { error: "Accès refusé." };
  return null;
}

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

// ─── Save manual group assignments A/B ────────────────────────────────────────

export async function saveSplitSwissGroupsAction(
  tournamentId: string,
  groupA: string[],
  groupB: string[]
) {
  const denied = await requireOrgaAccess(tournamentId);
  if (denied) return denied;

  await prisma.$transaction([
    ...groupA.map((id) => prisma.team.update({ where: { id }, data: { saturdayGroup: "A" } })),
    ...groupB.map((id) => prisma.team.update({ where: { id }, data: { saturdayGroup: "B" } })),
  ]);

  revalidatePath(`/tournament/${tournamentId}`);
  return { ok: true };
}

// ─── Generate next Swiss round for group A or B ───────────────────────────────

export async function generateSplitSwissRoundAction(
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

  const phase: MatchPhase = group === "A" ? "SWISS_A" : "SWISS_B";
  const groupMatches = tournament.matches.filter((m) => m.phase === phase);
  const existingRounds =
    groupMatches.length > 0 ? Math.max(...groupMatches.map((m) => m.roundIndex)) : 0;

  if (existingRounds > 0) {
    const latestRound = groupMatches.filter((m) => m.roundIndex === existingRounds);
    const unfinished = latestRound.filter((m) => m.status !== "FINISHED");
    if (unfinished.length > 0)
      return {
        error: `Le tour Groupe-${group} ${existingRounds} a encore ${unfinished.length} match(es) non terminé(s).`,
      };
  }

  const maxRounds = (tournament as any).saturdayRounds ?? (tournament as any).swissRounds ?? 5;
  if (existingRounds >= maxRounds)
    return { error: `Tous les ${maxRounds} tours du Groupe ${group} sont terminés.` };

  const standings = computeStandings(
    tournament.teams,
    groupMatches as any,
    tournament.scoringSystem
  );
  const allPrior: BerlinMatchInput[] = groupMatches as unknown as BerlinMatchInput[];

  const nextRound = existingRounds + 1;
  const courtNames = Array.from({ length: tournament.courtsCount }, (_, i) => `Court ${i + 1}`);
  const fallback = group === "A"
    ? new Date((tournament as any).saturdayPoolAStart ?? tournament.dateStart)
    : new Date((tournament as any).saturdayPoolBStart ?? tournament.dateStart);
  const roundStart = computeNextRoundStart(groupMatches, existingRounds, tournament.gameDurationMin, fallback);

  const newMatches = generateBerlinSwissRound(
    tournament.teams,
    standings,
    allPrior,
    nextRound,
    `Grp-${group}`,
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

// ─── Generate bracket from combined standings ─────────────────────────────────
// Strategy: compute interleaved A1/B1/A2/B2 ranking, update team seeds in DB,
// then delegate entirely to generateBracketAction which has the full DE/SE linking logic.

export async function generateSplitSwissBracketAction(tournamentId: string) {
  const denied = await requireOrgaAccess(tournamentId);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { teams: { where: { selected: true } }, matches: true },
  });
  if (!tournament) return { error: "Tournoi introuvable" };

  const allSwissMatches = tournament.matches.filter(
    (m) => m.phase === "SWISS_A" || m.phase === "SWISS_B"
  );
  if (allSwissMatches.length === 0)
    return { error: "Aucun match Swiss trouvé pour calculer le classement." };

  // Compute interleaved A1/B1/A2/B2… seed order
  const teamsA = tournament.teams.filter((t: any) => t.saturdayGroup === "A");
  const teamsB = tournament.teams.filter((t: any) => t.saturdayGroup === "B");
  const matchesA = allSwissMatches.filter((m) => m.phase === "SWISS_A");
  const matchesB = allSwissMatches.filter((m) => m.phase === "SWISS_B");

  let mergedIds: string[];
  if (teamsA.length > 0 && teamsB.length > 0 && matchesA.length > 0 && matchesB.length > 0) {
    const standA = computeStandings(teamsA, matchesA as any, tournament.scoringSystem);
    const standB = computeStandings(teamsB, matchesB as any, tournament.scoringSystem);
    const maxLen = Math.max(standA.length, standB.length);
    mergedIds = [];
    for (let i = 0; i < maxLen; i++) {
      if (i < standA.length) mergedIds.push(standA[i].teamId);
      if (i < standB.length) mergedIds.push(standB[i].teamId);
    }
  } else {
    const combined = computeStandings(tournament.teams, allSwissMatches as any, tournament.scoringSystem);
    mergedIds = combined.map((r) => r.teamId);
  }

  // Update team seeds so generateBracketAction picks them up correctly
  await prisma.$transaction(
    mergedIds.map((id, i) => prisma.team.update({ where: { id }, data: { seed: i + 1 } }))
  );

  // Delegate to the full generateBracketAction which handles all DE/SE linking
  return generateBracketAction(tournamentId);
}

// ─── Reset Split Swiss phase ──────────────────────────────────────────────────

export async function resetSplitSwissPhaseAction(
  tournamentId: string,
  phase: "SWISS_A" | "SWISS_B" | "BRACKET"
) {
  const denied = await requireOrgaAccess(tournamentId);
  if (denied) return denied;

  await prisma.$transaction(async (tx) => {
    if (phase === "BRACKET") {
      await tx.matchEvent.deleteMany({ where: { match: { tournamentId, phase: "BRACKET" } } });
      await tx.match.deleteMany({ where: { tournamentId, phase: "BRACKET" } });
    } else {
      const lastRound = await tx.match.findMany({
        where: { tournamentId, phase },
        orderBy: { roundIndex: "desc" },
        take: 1,
      });
      if (lastRound.length === 0) return;
      const maxRound = lastRound[0].roundIndex;
      await tx.matchEvent.deleteMany({ where: { match: { tournamentId, phase, roundIndex: maxRound } } });
      await tx.match.deleteMany({ where: { tournamentId, phase, roundIndex: maxRound } });
    }
  });

  revalidatePath(`/tournament/${tournamentId}`);
  return { ok: true };
}
