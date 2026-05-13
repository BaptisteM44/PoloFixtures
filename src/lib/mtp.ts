/**
 * MTP Open format logic
 *
 * Format (20 teams, 2 courts):
 *   Saturday morning   → Pool A: 10 teams, Swiss 6 rounds
 *   Saturday afternoon → Pool B: 10 teams, Swiss 6 rounds
 *   Sunday morning     → Cross-pool: combined ranking 1v2, 3v4, ... 19v20 (10 matches)
 *   Sunday morning     → Barrage SE ×4: seeds 13-20 (13v20, 14v19, 15v18, 16v17)
 *   Sunday             → DE ×16: top 12 + 4 barrage winners, serpentin seeding
 *
 * classement final: 1-16 from DE, 17-20 from barrage losers (by pool seed)
 */

import { addMinutes } from "date-fns";
import { MatchPhase, MatchStatus, MatchDay } from "@prisma/client";
import type { Team } from "@prisma/client";
import type { StandingRow } from "./standings";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MtpMatch = {
  phase: MatchPhase;
  roundIndex: number;
  positionInRound: number;
  courtName: string;
  startAt: Date;
  dayIndex: MatchDay;
  status: MatchStatus;
  teamAId: string | null;
  teamBId: string | null;
  bracketSide: string | null;
  nextMatchWinId?: string | null;
  nextSlotWin?: string | null;
  nextMatchLoseId?: string | null;
  nextSlotLose?: string | null;
  poolName?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate Swiss round pairings for a given round.
 * Teams sorted by pts desc then seed asc, paired 1v2, 3v4, etc.
 * No-repeat guard: if pair already played, swap with next available.
 */
function swissRound(
  teams: Team[],
  standings: Map<string, { pts: number }>,
  played: Set<string>
): Array<[Team, Team]> {
  const sorted = [...teams].sort((a, b) => {
    const pa = standings.get(a.id)?.pts ?? 0;
    const pb = standings.get(b.id)?.pts ?? 0;
    if (pb !== pa) return pb - pa;
    return (a.seed ?? 999) - (b.seed ?? 999);
  });

  const paired = new Set<string>();
  const pairs: [Team, Team][] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (paired.has(sorted[i].id)) continue;
    let found = false;
    for (let j = i + 1; j < sorted.length; j++) {
      if (paired.has(sorted[j].id)) continue;
      const key = [sorted[i].id, sorted[j].id].sort().join("_");
      if (!played.has(key)) {
        pairs.push([sorted[i], sorted[j]]);
        paired.add(sorted[i].id);
        paired.add(sorted[j].id);
        found = true;
        break;
      }
    }
    if (!found) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (paired.has(sorted[j].id)) continue;
        pairs.push([sorted[i], sorted[j]]);
        paired.add(sorted[i].id);
        paired.add(sorted[j].id);
        break;
      }
    }
  }

  return pairs;
}

/** Challonge-style bracket seeding */
function bracketSeeding(n: number): number[] {
  if (n === 1) return [1];
  const half = n / 2;
  const top = bracketSeeding(half);
  const bottom = top.map((s) => n + 1 - s);
  const result: number[] = [];
  for (let i = 0; i < half; i++) result.push(top[i], bottom[i]);
  return result;
}

// ─── Pool generation ──────────────────────────────────────────────────────────

/**
 * Split 20 seeded teams into Pool A and Pool B using snake draft:
 * A: seeds 1, 4, 5, 8, 9, 12, 13, 16, 17, 20
 * B: seeds 2, 3, 6, 7, 10, 11, 14, 15, 18, 19
 */
export function splitMtpPools(teams: Team[]): { poolA: Team[]; poolB: Team[] } {
  const sorted = [...teams].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999));
  const poolA: Team[] = [];
  const poolB: Team[] = [];
  sorted.forEach((team, i) => {
    const pair = Math.floor(i / 2);
    const posInPair = i % 2;
    if (pair % 2 === 0) {
      posInPair === 0 ? poolA.push(team) : poolB.push(team);
    } else {
      posInPair === 0 ? poolB.push(team) : poolA.push(team);
    }
  });
  return { poolA, poolB };
}

/** Generate Swiss matches for one MTP pool (swissRounds rounds) */
export function generateMtpPool(
  teams: Team[],
  phase: MatchPhase,
  poolName: string,
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number,
  dayIndex: MatchDay = "SAT",
  swissRounds = 6
): MtpMatch[] {
  const slotMin = gameDurationMin + 5;
  const roundBreak = 5;
  const matches: MtpMatch[] = [];

  const standings = new Map<string, { pts: number }>(
    teams.map((t) => [t.id, { pts: 0 }])
  );
  const played = new Set<string>();

  // Round 1: seed-based 1v10, 2v9, 3v8, 4v7, 5v6
  const seedSorted = [...teams].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999));

  let courtFree: Date[] = courtNames.map(() => new Date(startAt));

  for (let r = 0; r < swissRounds; r++) {
    let roundPairs: Array<[Team, Team]>;

    if (r === 0) {
      roundPairs = [];
      const n = seedSorted.length;
      for (let i = 0; i < Math.floor(n / 2); i++) {
        roundPairs.push([seedSorted[i], seedSorted[n - 1 - i]]);
      }
    } else {
      roundPairs = swissRound(teams, standings, played);
    }

    for (const [a, b] of roundPairs) {
      played.add([a.id, b.id].sort().join("_"));
    }

    if (r > 0) {
      const roundStart = new Date(Math.max(...courtFree.map((d) => d.getTime())));
      courtFree = courtNames.map(() => addMinutes(roundStart, roundBreak));
    }

    roundPairs.forEach(([teamA, teamB], posInRound) => {
      let bestIdx = 0;
      for (let c = 1; c < courtNames.length; c++) {
        if (courtFree[c] < courtFree[bestIdx]) bestIdx = c;
      }
      matches.push({
        phase,
        roundIndex: r + 1,
        positionInRound: posInRound,
        courtName: courtNames[bestIdx],
        startAt: new Date(courtFree[bestIdx]),
        dayIndex,
        status: "SCHEDULED",
        teamAId: teamA.id,
        teamBId: teamB.id,
        bracketSide: null,
        poolName,
      });
      courtFree[bestIdx] = addMinutes(courtFree[bestIdx], slotMin);
    });
  }

  return matches;
}

// ─── Cross-pool generation ────────────────────────────────────────────────────

/**
 * Generate cross-pool matches from combined ranking:
 * 1v2, 3v4, 5v6, 7v8, 9v10, 11v12, 13v14, 15v16, 17v18, 19v20
 * combinedRanking: 20 teams sorted by combined pool standings (index 0 = rank 1)
 */
export function generateMtpCrossPool(
  combinedRanking: Team[],
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number
): MtpMatch[] {
  const slotMin = gameDurationMin + 5;
  const courtFree: Date[] = courtNames.map(() => new Date(startAt));
  const matches: MtpMatch[] = [];

  for (let i = 0; i < combinedRanking.length - 1; i += 2) {
    const teamA = combinedRanking[i];
    const teamB = combinedRanking[i + 1];
    if (!teamA || !teamB) continue;

    let bestIdx = 0;
    for (let c = 1; c < courtNames.length; c++) {
      if (courtFree[c] < courtFree[bestIdx]) bestIdx = c;
    }

    matches.push({
      phase: "CROSS_POOL" as MatchPhase,
      roundIndex: 1,
      positionInRound: i / 2,
      courtName: courtNames[bestIdx],
      startAt: new Date(courtFree[bestIdx]),
      dayIndex: "SUN" as MatchDay,
      status: "SCHEDULED" as MatchStatus,
      teamAId: teamA.id,
      teamBId: teamB.id,
      bracketSide: null,
    });
    courtFree[bestIdx] = addMinutes(courtFree[bestIdx], slotMin);
  }

  return matches;
}

// ─── Barrage generation ───────────────────────────────────────────────────────

/**
 * Generate 4 barrage matches: 13v20, 14v19, 15v18, 16v17
 */
export function generateMtpBarrage(
  seeds13to20: Team[],
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number
): MtpMatch[] {
  const slotMin = gameDurationMin + 5;
  const pairs: [Team, Team][] = [
    [seeds13to20[0], seeds13to20[7]],
    [seeds13to20[1], seeds13to20[6]],
    [seeds13to20[2], seeds13to20[5]],
    [seeds13to20[3], seeds13to20[4]],
  ];

  const courtFree: Date[] = courtNames.map(() => new Date(startAt));

  return pairs.map(([teamA, teamB], i) => {
    const courtIdx = i % courtNames.length;
    const slot = new Date(courtFree[courtIdx]);
    courtFree[courtIdx] = addMinutes(courtFree[courtIdx], slotMin);
    return {
      phase: "MTP_BARRAGE" as MatchPhase,
      roundIndex: 1,
      positionInRound: i,
      courtName: courtNames[courtIdx],
      startAt: slot,
      dayIndex: "SUN" as MatchDay,
      status: "SCHEDULED" as MatchStatus,
      teamAId: teamA.id,
      teamBId: teamB.id,
      bracketSide: null,
    };
  });
}

// ─── DE generation ────────────────────────────────────────────────────────────

/**
 * Generate DE bracket for 16 seeded teams.
 */
export function generateMtpDE(
  seeded16: Team[],
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number,
  gfReset = false
): MtpMatch[] {
  const slotMin = gameDurationMin + 5;
  const roundBreak = gameDurationMin + 10;

  const n = 16;
  const seedOrder = bracketSeeding(n);
  const slots = seedOrder.map((s) => seeded16[s - 1] ?? null);

  const matches: MtpMatch[] = [];

  // R1: 8 matches
  const courtFreeR1: Date[] = courtNames.map(() => new Date(startAt));
  const r1Matches: MtpMatch[] = [];
  for (let m = 0; m < 8; m++) {
    const teamA = slots[m * 2];
    const teamB = slots[m * 2 + 1];
    const courtIdx = m % courtNames.length;
    const slotTime = new Date(courtFreeR1[courtIdx]);
    courtFreeR1[courtIdx] = addMinutes(courtFreeR1[courtIdx], slotMin);
    r1Matches.push({
      phase: "MTP_DE" as MatchPhase, roundIndex: 1, positionInRound: m,
      courtName: courtNames[courtIdx], startAt: slotTime,
      dayIndex: "SUN" as MatchDay, status: "SCHEDULED" as MatchStatus,
      teamAId: teamA?.id ?? null, teamBId: teamB?.id ?? null, bracketSide: "W",
    });
  }
  matches.push(...r1Matches);

  // R2: 4 matches
  const r2Start = addMinutes(new Date(Math.max(...courtFreeR1.map((d) => d.getTime()))), roundBreak - slotMin);
  const courtFreeR2: Date[] = courtNames.map(() => new Date(r2Start));
  const r2Matches: MtpMatch[] = [];
  for (let m = 0; m < 4; m++) {
    const courtIdx = m % courtNames.length;
    const slotTime = new Date(courtFreeR2[courtIdx]);
    courtFreeR2[courtIdx] = addMinutes(courtFreeR2[courtIdx], slotMin);
    r2Matches.push({
      phase: "MTP_DE" as MatchPhase, roundIndex: 2, positionInRound: m,
      courtName: courtNames[courtIdx], startAt: slotTime,
      dayIndex: "SUN" as MatchDay, status: "SCHEDULED" as MatchStatus,
      teamAId: null, teamBId: null, bracketSide: "W",
    });
  }
  matches.push(...r2Matches);

  // R3: 2 matches
  const r3Start = addMinutes(new Date(Math.max(...courtFreeR2.map((d) => d.getTime()))), roundBreak - slotMin);
  const courtFreeR3: Date[] = courtNames.map(() => new Date(r3Start));
  const r3Matches: MtpMatch[] = [];
  for (let m = 0; m < 2; m++) {
    const courtIdx = m % courtNames.length;
    const slotTime = new Date(courtFreeR3[courtIdx]);
    courtFreeR3[courtIdx] = addMinutes(courtFreeR3[courtIdx], slotMin);
    r3Matches.push({
      phase: "MTP_DE" as MatchPhase, roundIndex: 3, positionInRound: m,
      courtName: courtNames[courtIdx], startAt: slotTime,
      dayIndex: "SUN" as MatchDay, status: "SCHEDULED" as MatchStatus,
      teamAId: null, teamBId: null, bracketSide: "W",
    });
  }
  matches.push(...r3Matches);

  // R4: WB Final
  const r4Start = addMinutes(new Date(Math.max(...courtFreeR3.map((d) => d.getTime()))), roundBreak - slotMin);
  matches.push({
    phase: "MTP_DE" as MatchPhase, roundIndex: 4, positionInRound: 0,
    courtName: courtNames[0], startAt: r4Start,
    dayIndex: "SUN" as MatchDay, status: "SCHEDULED" as MatchStatus,
    teamAId: null, teamBId: null, bracketSide: "W",
  });

  // LR1: 4 matches
  const lr1Start = addMinutes(new Date(Math.max(...courtFreeR1.map((d) => d.getTime()))), roundBreak - slotMin);
  const courtFreeLR1: Date[] = courtNames.map(() => new Date(lr1Start));
  const lr1Matches: MtpMatch[] = [];
  for (let m = 0; m < 4; m++) {
    const courtIdx = m % courtNames.length;
    const slotTime = new Date(courtFreeLR1[courtIdx]);
    courtFreeLR1[courtIdx] = addMinutes(courtFreeLR1[courtIdx], slotMin);
    lr1Matches.push({
      phase: "MTP_DE" as MatchPhase, roundIndex: 1, positionInRound: m,
      courtName: courtNames[courtIdx], startAt: slotTime,
      dayIndex: "SUN" as MatchDay, status: "SCHEDULED" as MatchStatus,
      teamAId: null, teamBId: null, bracketSide: "L",
    });
  }
  matches.push(...lr1Matches);

  // LR2: 4 matches
  const lr2Start = addMinutes(new Date(Math.max(...courtFreeR2.map((d) => d.getTime()), ...courtFreeLR1.map((d) => d.getTime()))), roundBreak - slotMin);
  const courtFreeLR2: Date[] = courtNames.map(() => new Date(lr2Start));
  const lr2Matches: MtpMatch[] = [];
  for (let m = 0; m < 4; m++) {
    const courtIdx = m % courtNames.length;
    const slotTime = new Date(courtFreeLR2[courtIdx]);
    courtFreeLR2[courtIdx] = addMinutes(courtFreeLR2[courtIdx], slotMin);
    lr2Matches.push({
      phase: "MTP_DE" as MatchPhase, roundIndex: 2, positionInRound: m,
      courtName: courtNames[courtIdx], startAt: slotTime,
      dayIndex: "SUN" as MatchDay, status: "SCHEDULED" as MatchStatus,
      teamAId: null, teamBId: null, bracketSide: "L",
    });
  }
  matches.push(...lr2Matches);

  // LR3: 2 matches
  const lr3Start = addMinutes(new Date(Math.max(...courtFreeLR2.map((d) => d.getTime()))), roundBreak - slotMin);
  const courtFreeLR3: Date[] = courtNames.map(() => new Date(lr3Start));
  const lr3Matches: MtpMatch[] = [];
  for (let m = 0; m < 2; m++) {
    const courtIdx = m % courtNames.length;
    const slotTime = new Date(courtFreeLR3[courtIdx]);
    courtFreeLR3[courtIdx] = addMinutes(courtFreeLR3[courtIdx], slotMin);
    lr3Matches.push({
      phase: "MTP_DE" as MatchPhase, roundIndex: 3, positionInRound: m,
      courtName: courtNames[courtIdx], startAt: slotTime,
      dayIndex: "SUN" as MatchDay, status: "SCHEDULED" as MatchStatus,
      teamAId: null, teamBId: null, bracketSide: "L",
    });
  }
  matches.push(...lr3Matches);

  // LR4: 2 matches
  const lr4Start = addMinutes(new Date(Math.max(...courtFreeR3.map((d) => d.getTime()), ...courtFreeLR3.map((d) => d.getTime()))), roundBreak - slotMin);
  const courtFreeLR4: Date[] = courtNames.map(() => new Date(lr4Start));
  const lr4Matches: MtpMatch[] = [];
  for (let m = 0; m < 2; m++) {
    const courtIdx = m % courtNames.length;
    const slotTime = new Date(courtFreeLR4[courtIdx]);
    courtFreeLR4[courtIdx] = addMinutes(courtFreeLR4[courtIdx], slotMin);
    lr4Matches.push({
      phase: "MTP_DE" as MatchPhase, roundIndex: 4, positionInRound: m,
      courtName: courtNames[courtIdx], startAt: slotTime,
      dayIndex: "SUN" as MatchDay, status: "SCHEDULED" as MatchStatus,
      teamAId: null, teamBId: null, bracketSide: "L",
    });
  }
  matches.push(...lr4Matches);

  // LR5: 1 match
  const lr5Start = addMinutes(new Date(Math.max(...courtFreeLR4.map((d) => d.getTime()), addMinutes(r4Start, slotMin).getTime())), roundBreak - slotMin);
  matches.push({
    phase: "MTP_DE" as MatchPhase, roundIndex: 5, positionInRound: 0,
    courtName: courtNames[0], startAt: lr5Start,
    dayIndex: "SUN" as MatchDay, status: "SCHEDULED" as MatchStatus,
    teamAId: null, teamBId: null, bracketSide: "L",
  });

  // Grand Final
  const gfStart = addMinutes(new Date(Math.max(addMinutes(lr5Start, slotMin).getTime(), addMinutes(r4Start, slotMin).getTime())), roundBreak);
  matches.push({
    phase: "MTP_DE" as MatchPhase, roundIndex: 5, positionInRound: 0,
    courtName: courtNames[0], startAt: gfStart,
    dayIndex: "SUN" as MatchDay, status: "SCHEDULED" as MatchStatus,
    teamAId: null, teamBId: null, bracketSide: "G",
  });

  if (gfReset) {
    matches.push({
      phase: "MTP_DE" as MatchPhase, roundIndex: 6, positionInRound: 0,
      courtName: courtNames[0], startAt: addMinutes(gfStart, slotMin),
      dayIndex: "SUN" as MatchDay, status: "SCHEDULED" as MatchStatus,
      teamAId: null, teamBId: null, bracketSide: "BG",
    });
  }

  return matches;
}

// ─── Combined standings helper ─────────────────────────────────────────────────

/** Merge two pool standings into one ranked list */
export function combineMtpStandings(
  poolAStandings: StandingRow[],
  poolBStandings: StandingRow[]
): StandingRow[] {
  const combined: StandingRow[] = [];
  let ai = 0;
  let bi = 0;
  while (ai < poolAStandings.length || bi < poolBStandings.length) {
    const a = poolAStandings[ai];
    const b = poolBStandings[bi];
    if (!b) { combined.push(a); ai++; continue; }
    if (!a) { combined.push(b); bi++; continue; }
    if (b.points !== a.points) {
      a.points > b.points ? (combined.push(a), ai++) : (combined.push(b), bi++);
    } else if (b.goalDiff !== a.goalDiff) {
      a.goalDiff > b.goalDiff ? (combined.push(a), ai++) : (combined.push(b), bi++);
    } else if (b.buchholz !== a.buchholz) {
      a.buchholz > b.buchholz ? (combined.push(a), ai++) : (combined.push(b), bi++);
    } else {
      a.goalsFor >= b.goalsFor ? (combined.push(a), ai++) : (combined.push(b), bi++);
    }
  }
  return combined;
}
