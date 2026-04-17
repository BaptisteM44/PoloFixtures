/**
 * Berlin Mixed Format algorithms.
 *
 * Friday:   2 groups (A/B, 24 teams each), 5 Swiss rounds
 * Saturday: 2 groups recomposed by global rank (top 24 → Sat-A, bottom 24 → Sat-B), 5 Swiss rounds
 * Sunday:   1–2 big Swiss rounds with ALL 48 teams, NO rematches from Fri or Sat
 *           then Top 32 SE bracket (1st–32nd) + Bottom 16 SE bracket (33rd–48th)
 *           Both brackets have a 3rd place match.
 */

import { addMinutes } from "date-fns";
import { MatchDay, MatchPhase, MatchStatus, Team } from "@prisma/client";
import { computeStandings, StandingRow } from "./standings";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BerlinMatch = {
  phase: MatchPhase;
  poolName?: string | null;
  bracketSide?: "W" | "L" | "G" | null;
  roundIndex: number;
  positionInRound?: number;
  courtName: string;
  startAt: Date;
  dayIndex: MatchDay;
  status: MatchStatus;
  teamAId: string | null;
  teamBId: string | null;
};

export type BerlinMatchInput = {
  teamAId: string | null;
  teamBId: string | null;
  phase?: MatchPhase;
};

// ─── Global Ranking ───────────────────────────────────────────────────────────

/**
 * Compute global ranking across two groups after Friday.
 * Primary: points; secondary: Buchholz; tertiary: SB; then goal diff; then goals.
 * Returns teams sorted best → worst.
 */
export function computeGlobalRanking(
  teamsA: Team[],
  teamsB: Team[],
  matchesA: BerlinMatchInput[],
  matchesB: BerlinMatchInput[],
  scoringSystem?: string | null
): Array<{ team: Team; globalRank: number }> {
  // computeStandings expects Match-like objects; cast to any to satisfy types
  const standA = computeStandings(teamsA, matchesA as any, scoringSystem);
  const standB = computeStandings(teamsB, matchesB as any, scoringSystem);

  const allRows: StandingRow[] = [...standA, ...standB];

  // Build a map for fast team lookup
  const teamMap = new Map<string, Team>();
  [...teamsA, ...teamsB].forEach((t) => teamMap.set(t.id, t));

  // Sort combined standings
  const sorted = allRows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    if (b.sonnebornBerger !== a.sonnebornBerger) return b.sonnebornBerger - a.sonnebornBerger;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    return b.goalsFor - a.goalsFor;
  });

  return sorted.map((row, i) => ({
    team: teamMap.get(row.teamId)!,
    globalRank: i + 1,
  }));
}

// ─── Saturday Group Assignment ────────────────────────────────────────────────

/**
 * Assign 48 globally-ranked teams to Saturday groups using strict alternation:
 * Rank 1→A, 2→B, 3→A, 4→B, 5→A, 6→B…
 * Each group gets 24 teams, evenly spread across the ranking.
 */
export function assignSaturdayGroups(
  globalRanking: Array<{ team: Team; globalRank: number }>
): { satA: Team[]; satB: Team[] } {
  const sorted = [...globalRanking].sort((a, b) => a.globalRank - b.globalRank);
  const satA: Team[] = [];
  const satB: Team[] = [];

  sorted.forEach(({ team }, idx) => {
    if (idx % 2 === 0) satA.push(team);
    else satB.push(team);
  });

  return { satA, satB };
}

// ─── Swiss pairing with full history ─────────────────────────────────────────

/**
 * Generate one Berlin Swiss round for a group.
 * Avoids all historical rematches (from any prior round, any day).
 * Falls back to best-of-bad if all opponents already faced.
 */
export function generateBerlinSwissRound(
  teams: Team[],
  standings: StandingRow[],
  allPriorMatches: BerlinMatchInput[],
  roundIndex: number,
  groupLabel: string,
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number,
  day: MatchDay
): BerlinMatch[] {
  const slotMin = gameDurationMin + 5;

  // Build rematch set from ALL prior matches (Fri + Sat)
  const played = new Set<string>();
  for (const m of allPriorMatches) {
    if (m.teamAId && m.teamBId) {
      played.add(`${m.teamAId}|${m.teamBId}`);
      played.add(`${m.teamBId}|${m.teamAId}`);
    }
  }

  // Sort teams by standings
  const byRank = new Map<string, number>();
  standings.forEach((row, i) => byRank.set(row.teamId, i));
  const sorted = [...teams].sort(
    (a, b) => (byRank.get(a.id) ?? 999) - (byRank.get(b.id) ?? 999)
  );

  // Greedy pairing: prefer no rematch, fallback to closest rank
  const unpaired = [...sorted];
  const pairs: [Team, Team][] = [];

  while (unpaired.length >= 2) {
    const teamA = unpaired.shift()!;
    let opponentIdx = -1;

    // First try: find first opponent not already faced
    for (let i = 0; i < unpaired.length; i++) {
      if (!played.has(`${teamA.id}|${unpaired[i].id}`)) {
        opponentIdx = i;
        break;
      }
    }

    // Fallback: already faced everyone — just take the closest by rank (index 0)
    if (opponentIdx === -1) opponentIdx = 0;

    pairs.push([teamA, unpaired.splice(opponentIdx, 1)[0]]);
  }

  // If odd team count, last team gets a BYE (not added as a match)

  const courtFree: Date[] = courtNames.map(() => new Date(startAt));

  return pairs.map(([teamA, teamB], pos) => {
    let bestIdx = 0;
    for (let c = 1; c < courtNames.length; c++) {
      if (courtFree[c] < courtFree[bestIdx]) bestIdx = c;
    }
    const slot = new Date(courtFree[bestIdx]);
    courtFree[bestIdx] = addMinutes(courtFree[bestIdx], slotMin);

    return {
      phase: phaseForGroupLabel(groupLabel, day),
      poolName: `${groupLabel} R${roundIndex}`,
      bracketSide: null,
      roundIndex,
      positionInRound: pos,
      courtName: courtNames[bestIdx],
      startAt: slot,
      dayIndex: day,
      status: "SCHEDULED" as MatchStatus,
      teamAId: teamA.id,
      teamBId: teamB.id,
    };
  });
}

function phaseForGroupLabel(label: string, day: MatchDay): MatchPhase {
  if (day === "FRI") {
    return label.endsWith("A") ? "FRIDAY_A" : "FRIDAY_B";
  }
  if (day === "SAT") {
    return label.endsWith("A") ? "SATURDAY_A" : "SATURDAY_B";
  }
  return "SUNDAY_SWISS";
}

// ─── Sunday Big Swiss ─────────────────────────────────────────────────────────

/**
 * Generate one Sunday Swiss round across all 48 teams.
 * Forbidden pairs: all matches played on Friday AND Saturday.
 */
export function generateSundaySwissRound(
  teams: Team[],
  sundayStandings: StandingRow[],
  allPriorMatches: BerlinMatchInput[], // Fri + Sat matches
  roundIndex: number,
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number
): BerlinMatch[] {
  const slotMin = gameDurationMin + 5;

  const played = new Set<string>();
  for (const m of allPriorMatches) {
    if (m.teamAId && m.teamBId) {
      played.add(`${m.teamAId}|${m.teamBId}`);
      played.add(`${m.teamBId}|${m.teamAId}`);
    }
  }

  const byRank = new Map<string, number>();
  sundayStandings.forEach((row, i) => byRank.set(row.teamId, i));

  // Trier du MOINS bien classé au MIEUX classé :
  // les équipes faibles jouent en premier (matchs du matin),
  // les tops jouent en dernier (cadeau pour les meilleures équipes).
  const sorted = [...teams].sort(
    (a, b) => (byRank.get(b.id) ?? 0) - (byRank.get(a.id) ?? 0)
  );

  const unpaired = [...sorted];
  const pairs: [Team, Team][] = [];

  while (unpaired.length >= 2) {
    const teamA = unpaired.shift()!;
    let opponentIdx = -1;

    for (let i = 0; i < unpaired.length; i++) {
      if (!played.has(`${teamA.id}|${unpaired[i].id}`)) {
        opponentIdx = i;
        break;
      }
    }

    if (opponentIdx === -1) opponentIdx = 0;
    pairs.push([teamA, unpaired.splice(opponentIdx, 1)[0]]);
  }

  const courtFree: Date[] = courtNames.map(() => new Date(startAt));

  return pairs.map(([teamA, teamB], pos) => {
    let bestIdx = 0;
    for (let c = 1; c < courtNames.length; c++) {
      if (courtFree[c] < courtFree[bestIdx]) bestIdx = c;
    }
    const slot = new Date(courtFree[bestIdx]);
    courtFree[bestIdx] = addMinutes(courtFree[bestIdx], slotMin);

    return {
      phase: "SUNDAY_SWISS" as MatchPhase,
      poolName: `Sunday R${roundIndex}`,
      bracketSide: null,
      roundIndex,
      positionInRound: pos,
      courtName: courtNames[bestIdx],
      startAt: slot,
      dayIndex: "SUN" as MatchDay,
      status: "SCHEDULED" as MatchStatus,
      teamAId: teamA.id,
      teamBId: teamB.id,
    };
  });
}

// ─── SE Bracket (Top 32 / Bottom 16) ─────────────────────────────────────────

function nextPowerOf2(n: number): number {
  if (n <= 1) return 1;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

function bracketSeeding(n: number): number[] {
  if (n === 1) return [1];
  const half = n / 2;
  const top = bracketSeeding(half);
  const bottom = top.map((s) => n + 1 - s);
  const result: number[] = [];
  for (let i = 0; i < half; i++) result.push(top[i], bottom[i]);
  return result;
}

/**
 * Generate a Single Elimination bracket with a 3rd place match.
 * phase: "TOP32" for the top bracket, "BOTTOM16" for the consolation bracket.
 */
export function generateBerlinSEBracket(
  teams: Team[],
  phase: "TOP32" | "BOTTOM16",
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number
): BerlinMatch[] {
  const sorted = [...teams];
  const size = nextPowerOf2(sorted.length);
  const totalRounds = Math.log2(size);
  const slotMin = gameDurationMin + 5;
  const roundBreak = gameDurationMin + 15;

  const seedOrder = bracketSeeding(size);
  const slots: (Team | null)[] = seedOrder.map((s) => sorted[s - 1] ?? null);

  const allMatches: BerlinMatch[] = [];
  const matchGrid: Map<number, BerlinMatch>[] = [];

  for (let r = 0; r < totalRounds; r++) {
    const matchesInRound = size / Math.pow(2, r + 1);
    const roundStart = addMinutes(startAt, r * roundBreak);
    const roundMap = new Map<number, BerlinMatch>();
    let courtIdx = 0;

    for (let m = 0; m < matchesInRound; m++) {
      let teamAId: string | null = null;
      let teamBId: string | null = null;

      if (r === 0) {
        const a = slots[m * 2]?.id ?? null;
        const b = slots[m * 2 + 1]?.id ?? null;
        if (a && !b) continue; // BYE
        if (b && !a) continue; // BYE
        if (!a && !b) continue;
        teamAId = a;
        teamBId = b;
      }

      // Last round = Final (G), second-to-last semifinal (W), others W
      const isGrand = r === totalRounds - 1;
      const bracketSide: "W" | "G" = isGrand ? "G" : "W";

      const match: BerlinMatch = {
        phase: phase as MatchPhase,
        bracketSide,
        roundIndex: r + 1,
        positionInRound: m,
        courtName: courtNames[courtIdx % courtNames.length],
        startAt: addMinutes(roundStart, Math.floor(courtIdx / courtNames.length) * slotMin),
        dayIndex: "SUN" as MatchDay,
        status: "SCHEDULED" as MatchStatus,
        teamAId,
        teamBId,
      };
      courtIdx++;
      roundMap.set(m, match);
      allMatches.push(match);
    }
    matchGrid.push(roundMap);
  }

  // Propagate BYE auto-advances to R2
  if (matchGrid.length >= 2) {
    const r1Count = size / 2;
    for (let m = 0; m < r1Count; m++) {
      const a = slots[m * 2]?.id ?? null;
      const b = slots[m * 2 + 1]?.id ?? null;
      if (!matchGrid[0].has(m)) {
        const advancing = a ?? b;
        if (advancing) {
          const r2Pos = Math.floor(m / 2);
          const r2Match = matchGrid[1].get(r2Pos);
          if (r2Match) {
            if (m % 2 === 0) r2Match.teamAId = advancing;
            else r2Match.teamBId = advancing;
          }
        }
      }
    }
  }

  // 3rd place match: same timing as final, second court
  if (totalRounds >= 2) {
    const finalRoundStart = addMinutes(startAt, (totalRounds - 1) * roundBreak);
    const thirdStart =
      courtNames.length > 1
        ? finalRoundStart
        : addMinutes(finalRoundStart, slotMin);
    const thirdCourtIdx = Math.min(1, courtNames.length - 1);

    allMatches.push({
      phase: phase as MatchPhase,
      bracketSide: "L",
      roundIndex: totalRounds,
      positionInRound: 1,
      courtName: courtNames[thirdCourtIdx],
      startAt: thirdStart,
      dayIndex: "SUN" as MatchDay,
      status: "SCHEDULED" as MatchStatus,
      teamAId: null,
      teamBId: null,
    });
  }

  return allMatches;
}

/**
 * Split the global Sunday ranking into Top 32 and Bottom 16,
 * then generate both SE brackets.
 *
 * Returns { top32: BerlinMatch[], bottom16: BerlinMatch[] }
 */
export function generateBerlinFinalBrackets(
  globalRanking: Array<{ team: Team; globalRank: number }>,
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number
): { top32: BerlinMatch[]; bottom16: BerlinMatch[] } {
  const sorted = [...globalRanking].sort((a, b) => a.globalRank - b.globalRank);

  const top32Teams = sorted.slice(0, 32).map((r) => r.team);
  const bottom16Teams = sorted.slice(32).map((r) => r.team);

  const top32 = generateBerlinSEBracket(top32Teams, "TOP32", courtNames, startAt, gameDurationMin);

  // Bottom 16 starts after Top 32 bracket would finish (rough estimate)
  const top32Rounds = Math.log2(nextPowerOf2(top32Teams.length));
  const bottom16Start = addMinutes(startAt, top32Rounds * (gameDurationMin + 15));
  const bottom16 = generateBerlinSEBracket(bottom16Teams, "BOTTOM16", courtNames, bottom16Start, gameDurationMin);

  return { top32, bottom16 };
}
