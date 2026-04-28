/**
 * MTP Open format logic
 *
 * Format (20 teams, 2 courts):
 *   Saturday morning  → Pool A: 10 teams, full RR (9 rounds, 5 matches/round on 2 courts)
 *   Saturday afternoon → Pool B: 10 teams, full RR
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

/** Circle-method RR: n-1 rounds, each team plays once per round */
function circleMethodRounds(teams: Team[]): Array<Array<[Team, Team]>> {
  const list: (Team | null)[] = [...teams];
  if (list.length % 2 !== 0) list.push(null);
  const n = list.length;
  const rounds: Array<Array<[Team, Team]>> = [];
  for (let r = 0; r < n - 1; r++) {
    const round: Array<[Team, Team]> = [];
    for (let i = 0; i < n / 2; i++) {
      const home = list[i];
      const away = list[n - 1 - i];
      if (home && away) round.push([home, away]);
    }
    rounds.push(round);
    const last = list.pop()!;
    list.splice(1, 0, last);
  }
  return rounds;
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
 * (ensures balanced pools)
 */
export function splitMtpPools(teams: Team[]): { poolA: Team[]; poolB: Team[] } {
  const sorted = [...teams].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999));
  const poolA: Team[] = [];
  const poolB: Team[] = [];
  sorted.forEach((team, i) => {
    // Snake: pair index 0-based (0,1), (2,3), (4,5)...
    const pair = Math.floor(i / 2);
    const posInPair = i % 2;
    // Even pair → A first, B second; odd pair → B first, A second
    if (pair % 2 === 0) {
      posInPair === 0 ? poolA.push(team) : poolB.push(team);
    } else {
      posInPair === 0 ? poolB.push(team) : poolA.push(team);
    }
  });
  return { poolA, poolB };
}

/** Generate RR matches for one MTP pool */
export function generateMtpPool(
  teams: Team[],
  phase: MatchPhase,
  poolName: string,
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number,
  dayIndex: MatchDay = "SAT"
): MtpMatch[] {
  const rounds = circleMethodRounds(teams);
  const slotMin = gameDurationMin + 5;
  const roundBreak = 5;
  const matches: MtpMatch[] = [];
  let courtFree: Date[] = courtNames.map(() => new Date(startAt));

  rounds.forEach((round, r) => {
    if (r > 0) {
      const roundStart = new Date(Math.max(...courtFree.map((d) => d.getTime())));
      courtFree = courtNames.map(() => addMinutes(roundStart, roundBreak));
    }
    round.forEach(([teamA, teamB], posInRound) => {
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
  });

  return matches;
}

// ─── Barrage generation ───────────────────────────────────────────────────────

/**
 * Generate 4 barrage matches: 13v20, 14v19, 15v18, 16v17
 * seeds 13-20 from combined pool standings (index 12-19)
 */
export function generateMtpBarrage(
  seeds13to20: Team[], // [seed13, seed14, seed15, seed16, seed17, seed18, seed19, seed20]
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number
): MtpMatch[] {
  const slotMin = gameDurationMin + 5;
  // Matchups: 0v7, 1v6, 2v5, 3v4 → 13v20, 14v19, 15v18, 16v17
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
 * Seeding: top12 (seeds 1-12) + 4 barrage winners placed at seeds 13-16 by original pool rank.
 * Matchups: serpentin 1v16, 2v15, 3v14, 4v13, 5v12, 6v11, 7v10, 8v9
 */
export function generateMtpDE(
  seeded16: Team[], // array of 16 teams in seed order (index 0 = seed1)
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number,
  gfReset = false
): MtpMatch[] {
  // Use standard DE logic — 16 teams, 4 rounds winners bracket + losers bracket
  // We'll generate the structure manually for full control
  const slotMin = gameDurationMin + 5;
  const roundBreak = gameDurationMin + 10;

  // Serpentin seeding: 1v16, 2v15, 3v14, 4v13, 5v12, 6v11, 7v10, 8v9
  const n = 16;
  const seedOrder = bracketSeeding(n); // [1,16,8,9,4,13,5,12,3,14,6,11,7,10,2,15] (challonge style)
  const slots = seedOrder.map((s) => seeded16[s - 1] ?? null);

  // We delegate to the existing generateDoubleElim equivalent by building matches
  // For simplicity, delegate: we provide teams in seeded order to generateBracket DE
  // The return type needs to match MtpMatch
  const matches: MtpMatch[] = [];

  // Winners bracket: R1 (8 matches), R2 (4), R3 (2), R4/final (1)
  // Losers bracket: LR1 (4), LR2 (4), LR3 (2), LR4 (2), LR5 (1), LR6 (1) → Grand Final
  // This is complex — we'll generate it round by round with nextMatchWinId wiring done post-creation

  // R1: 8 matches
  const r1StartAt = new Date(startAt);
  const r1Matches: MtpMatch[] = [];
  const courtFreeR1: Date[] = courtNames.map(() => new Date(r1StartAt));

  for (let m = 0; m < 8; m++) {
    const teamA = slots[m * 2];
    const teamB = slots[m * 2 + 1];
    const courtIdx = m % courtNames.length;
    // Advance court time after each pair on same court
    const slotTime = new Date(courtFreeR1[courtIdx]);
    courtFreeR1[courtIdx] = addMinutes(courtFreeR1[courtIdx], slotMin);

    r1Matches.push({
      phase: "MTP_DE" as MatchPhase,
      roundIndex: 1,
      positionInRound: m,
      courtName: courtNames[courtIdx],
      startAt: slotTime,
      dayIndex: "SUN" as MatchDay,
      status: "SCHEDULED" as MatchStatus,
      teamAId: teamA?.id ?? null,
      teamBId: teamB?.id ?? null,
      bracketSide: "W",
    });
  }
  matches.push(...r1Matches);

  // R2: 4 matches
  const r2Start = addMinutes(new Date(Math.max(...courtFreeR1.map((d) => d.getTime()))), roundBreak - slotMin);
  const r2Matches: MtpMatch[] = [];
  const courtFreeR2: Date[] = courtNames.map(() => new Date(r2Start));
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
  const r3Matches: MtpMatch[] = [];
  const courtFreeR3: Date[] = courtNames.map(() => new Date(r3Start));
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

  // R4: WB Final (1 match)
  const r4Start = addMinutes(new Date(Math.max(...courtFreeR3.map((d) => d.getTime()))), roundBreak - slotMin);
  const wbFinal: MtpMatch = {
    phase: "MTP_DE" as MatchPhase, roundIndex: 4, positionInRound: 0,
    courtName: courtNames[0], startAt: r4Start,
    dayIndex: "SUN" as MatchDay, status: "SCHEDULED" as MatchStatus,
    teamAId: null, teamBId: null, bracketSide: "W",
  };
  matches.push(wbFinal);

  // ── Losers Bracket ──
  // LR1: 4 matches (R1 losers — positions 4-7 vs 0-3 reversed)
  // LR1 starts after R1
  const lr1Start = addMinutes(new Date(Math.max(...courtFreeR1.map((d) => d.getTime()))), roundBreak - slotMin);
  const lr1Matches: MtpMatch[] = [];
  const courtFreeLR1: Date[] = courtNames.map(() => new Date(lr1Start));
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

  // LR2: 4 matches (LR1 winners vs R2 losers)
  const lr2Start = addMinutes(new Date(Math.max(...courtFreeR2.map((d) => d.getTime()), ...courtFreeLR1.map((d) => d.getTime()))), roundBreak - slotMin);
  const lr2Matches: MtpMatch[] = [];
  const courtFreeLR2: Date[] = courtNames.map(() => new Date(lr2Start));
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
  const lr3Matches: MtpMatch[] = [];
  const courtFreeLR3: Date[] = courtNames.map(() => new Date(lr3Start));
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

  // LR4: 2 matches (LR3 winners vs R3 losers)
  const lr4Start = addMinutes(new Date(Math.max(...courtFreeR3.map((d) => d.getTime()), ...courtFreeLR3.map((d) => d.getTime()))), roundBreak - slotMin);
  const lr4Matches: MtpMatch[] = [];
  const courtFreeLR4: Date[] = courtNames.map(() => new Date(lr4Start));
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

  // LR5: 1 match (LR4 winner vs WB R4 loser)
  const lr5Start = addMinutes(new Date(Math.max(...courtFreeLR4.map((d) => d.getTime()), addMinutes(r4Start, slotMin).getTime())), roundBreak - slotMin);
  const lr5Match: MtpMatch = {
    phase: "MTP_DE" as MatchPhase, roundIndex: 5, positionInRound: 0,
    courtName: courtNames[0], startAt: lr5Start,
    dayIndex: "SUN" as MatchDay, status: "SCHEDULED" as MatchStatus,
    teamAId: null, teamBId: null, bracketSide: "L",
  };
  matches.push(lr5Match);

  // Grand Final
  const gfStart = addMinutes(new Date(Math.max(addMinutes(lr5Start, slotMin).getTime(), addMinutes(r4Start, slotMin).getTime())), roundBreak);
  const gfMatch: MtpMatch = {
    phase: "MTP_DE" as MatchPhase, roundIndex: 5, positionInRound: 0,
    courtName: courtNames[0], startAt: gfStart,
    dayIndex: "SUN" as MatchDay, status: "SCHEDULED" as MatchStatus,
    teamAId: null, teamBId: null, bracketSide: "G",
  };
  matches.push(gfMatch);

  if (gfReset) {
    const gfResetMatch: MtpMatch = {
      phase: "MTP_DE" as MatchPhase, roundIndex: 6, positionInRound: 0,
      courtName: courtNames[0], startAt: addMinutes(gfStart, slotMin),
      dayIndex: "SUN" as MatchDay, status: "SCHEDULED" as MatchStatus,
      teamAId: null, teamBId: null, bracketSide: "BG",
    };
    matches.push(gfResetMatch);
  }

  return matches;
}

// ─── Combined standings helper ─────────────────────────────────────────────────

/** Merge two pool standings into one ranked list of 20 */
export function combineMtpStandings(
  poolAStandings: StandingRow[],
  poolBStandings: StandingRow[]
): StandingRow[] {
  // Interleave: pick best from each pool alternately, by points/diff/buchholz
  const combined: StandingRow[] = [];
  let ai = 0;
  let bi = 0;
  while (ai < poolAStandings.length || bi < poolBStandings.length) {
    const a = poolAStandings[ai];
    const b = poolBStandings[bi];
    if (!b) { combined.push(a); ai++; continue; }
    if (!a) { combined.push(b); bi++; continue; }
    // Compare: pts → goalDiff → buchholz → goalsFor
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
