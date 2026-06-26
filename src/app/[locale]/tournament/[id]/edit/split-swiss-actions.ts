"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { computeStandings } from "@/lib/standings";
import {
  generateBerlinSwissRound,
  BerlinMatchInput,
} from "@/lib/berlin-mixed";
import { generateBracket } from "@/lib/bracket";
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

// ─── Generate DE bracket from combined standings ──────────────────────────────

export async function generateSplitSwissBracketAction(tournamentId: string) {
  const denied = await requireOrgaAccess(tournamentId);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { teams: { where: { selected: true } }, matches: true },
  });
  if (!tournament) return { error: "Tournoi introuvable" };

  // All Swiss matches (both groups) for combined standings
  const allSwissMatches = tournament.matches.filter(
    (m) => m.phase === "SWISS_A" || m.phase === "SWISS_B"
  );

  if (allSwissMatches.length === 0)
    return { error: "Aucun match Swiss trouvé pour calculer le classement." };

  // Combined standings: compute per-group, then merge by rank (alternating A/B like Berlin)
  const teamsA = tournament.teams.filter((t: any) => t.saturdayGroup === "A");
  const teamsB = tournament.teams.filter((t: any) => t.saturdayGroup === "B");
  const matchesA = allSwissMatches.filter((m) => m.phase === "SWISS_A");
  const matchesB = allSwissMatches.filter((m) => m.phase === "SWISS_B");

  let seededTeams = tournament.teams;
  if (teamsA.length > 0 && teamsB.length > 0 && matchesA.length > 0 && matchesB.length > 0) {
    const standA = computeStandings(teamsA, matchesA as any, tournament.scoringSystem);
    const standB = computeStandings(teamsB, matchesB as any, tournament.scoringSystem);
    // Interleave: A1, B1, A2, B2, … for fair seeding
    const maxLen = Math.max(standA.length, standB.length);
    const mergedIds: string[] = [];
    for (let i = 0; i < maxLen; i++) {
      if (i < standA.length) mergedIds.push(standA[i].teamId);
      if (i < standB.length) mergedIds.push(standB[i].teamId);
    }
    const teamMap = new Map(tournament.teams.map((t) => [t.id, t]));
    seededTeams = mergedIds.map((id) => teamMap.get(id)!).filter(Boolean);
  } else {
    // Fallback: combined standings
    const combined = computeStandings(tournament.teams, allSwissMatches as any, tournament.scoringSystem);
    const teamMap = new Map(tournament.teams.map((t) => [t.id, t]));
    seededTeams = combined.map((r) => teamMap.get(r.teamId)!).filter(Boolean);
  }

  const bracketSize = (tournament as any).bracketSize ?? seededTeams.length;
  if (seededTeams.length > bracketSize) seededTeams = seededTeams.slice(0, bracketSize);

  const courtNames = Array.from({ length: tournament.courtsCount }, (_, i) => `Court ${i + 1}`);
  const bracketOptions = {
    thirdPlaceMatch: (tournament as any).thirdPlaceMatch ?? false,
    gfReset: (tournament as any).gfReset ?? false,
  };
  const matches = generateBracket(
    seededTeams,
    tournament.sundayFormat,
    courtNames,
    new Date(tournament.dateEnd),
    tournament.gameDurationMin,
    bracketOptions
  );

  await prisma.$transaction(async (tx) => {
    await tx.matchEvent.deleteMany({ where: { match: { tournamentId, phase: "BRACKET" } } });
    await tx.match.deleteMany({ where: { tournamentId, phase: "BRACKET" } });

    const created: Array<{
      id: string;
      roundIndex: number;
      bracketSide: string | null;
      positionInRound: number;
    }> = [];

    for (const match of matches) {
      const m = await tx.match.create({
        data: {
          tournamentId,
          phase: "BRACKET",
          bracketSide: match.bracketSide ?? null,
          roundIndex: match.roundIndex,
          courtName: match.courtName,
          startAt: match.startAt,
          dayIndex: "SUN",
          status: "SCHEDULED",
          positionInRound: match.positionInRound ?? 0,
          teamAId: match.teamAId,
          teamBId: match.teamBId,
        },
      });
      created.push({
        id: m.id,
        roundIndex: m.roundIndex,
        bracketSide: m.bracketSide,
        positionInRound: m.positionInRound,
      });
    }

    // Link bracket matches (DE or SE)
    await linkBracket(created, tournament.sundayFormat, tx);
  });

  revalidatePath(`/tournament/${tournamentId}`);
  return { ok: true };
}

function linkBracket(
  created: Array<{ id: string; roundIndex: number; bracketSide: string | null; positionInRound: number }>,
  sundayFormat: string,
  tx: any
) {
  const updates: Promise<any>[] = [];

  if (sundayFormat === "DE") {
    // DE linking (same logic as generateBracketAction in actions.ts)
    const upper = created.filter((m) => m.bracketSide === "W" || m.bracketSide === "G");
    const lower = created.filter((m) => m.bracketSide === "L");
    const grand = created.find((m) => m.bracketSide === "G");

    const maxUpperRound = upper.length > 0 ? Math.max(...upper.map((m) => m.roundIndex)) : 0;
    const maxLowerRound = lower.length > 0 ? Math.max(...lower.map((m) => m.roundIndex)) : 0;

    // Upper bracket winners progression
    for (const m of upper.filter((m) => m.bracketSide === "W")) {
      const nextPos = Math.floor(m.positionInRound / 2);
      const nextRound = m.roundIndex + 1;
      const nextMatch = created.find(
        (x) => (x.bracketSide === "W" || x.bracketSide === "G") && x.roundIndex === nextRound && x.positionInRound === nextPos
      );
      if (nextMatch) {
        updates.push(tx.match.update({
          where: { id: m.id },
          data: { nextMatchWinId: nextMatch.id, nextSlotWin: m.positionInRound % 2 === 0 ? "A" : "B" },
        }));
      }
      // Upper losers → lower bracket
      const lowerRound = m.roundIndex * 2 - 1;
      const lowerPos = m.roundIndex === 1
        ? (m.positionInRound % 2 === 0 ? m.positionInRound / 2 * 2 + 1 : (m.positionInRound - 1) / 2 * 2)
        : m.positionInRound;
      const lowerMatch = lower.find(
        (x) => x.roundIndex === lowerRound && x.positionInRound === lowerPos
      );
      if (lowerMatch) {
        updates.push(tx.match.update({
          where: { id: m.id },
          data: { nextMatchLoseId: lowerMatch.id, nextSlotLose: m.positionInRound % 2 === 0 ? "A" : "B" },
        }));
      }
    }

    // Lower bracket progression
    for (let i = 0; i < lower.length; i++) {
      const m = lower[i];
      if (m.roundIndex >= maxLowerRound) {
        // Lower final → Grand Final
        if (grand) {
          updates.push(tx.match.update({
            where: { id: m.id },
            data: { nextMatchWinId: grand.id, nextSlotWin: "B" },
          }));
        }
        continue;
      }
      const nextLower = lower.find(
        (x) => x.roundIndex === m.roundIndex + 1 && x.positionInRound === Math.floor(m.positionInRound / 2)
      );
      if (nextLower) {
        updates.push(tx.match.update({
          where: { id: m.id },
          data: { nextMatchWinId: nextLower.id, nextSlotWin: m.positionInRound % 2 === 0 ? "A" : "B" },
        }));
      }
    }
  } else {
    // SE linking
    const wMatches = created.filter((m) => m.bracketSide === "W");
    const maxRound = created.length > 0 ? Math.max(...created.map((m) => m.roundIndex)) : 0;
    const thirdPlace = created.find((m) => m.bracketSide === "L");

    for (const m of wMatches) {
      if (m.roundIndex >= maxRound) continue;
      const nextPos = Math.floor(m.positionInRound / 2);
      const nextRound = m.roundIndex + 1;
      const nextMatch = created.find(
        (x) => (x.bracketSide === "W" || x.bracketSide === "G") && x.roundIndex === nextRound && x.positionInRound === nextPos
      );
      if (nextMatch) {
        updates.push(tx.match.update({
          where: { id: m.id },
          data: { nextMatchWinId: nextMatch.id, nextSlotWin: m.positionInRound % 2 === 0 ? "A" : "B" },
        }));
      }
      if (thirdPlace && m.roundIndex === maxRound - 1) {
        updates.push(tx.match.update({
          where: { id: m.id },
          data: { nextMatchLoseId: thirdPlace.id, nextSlotLose: m.positionInRound % 2 === 0 ? "A" : "B" },
        }));
      }
    }
  }

  return Promise.all(updates);
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
