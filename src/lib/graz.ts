/**
 * Graz format — 16 teams, 1 court, 2 days
 *
 * Phase 1 — RR in 2 groups of 8 (7 matches per team)
 *   Day 1: 5 matches each
 *   Day 2 morning: 2 remaining matches to finish RR
 *
 * Phase 2 — Regroup into 4 groups of 4 (mini-RR, 2 new matches per team)
 *   Top:   A1, A2, B1, B2
 *   Mid 1: A3, A5, B4, B6
 *   Mid 2: A4, A6, B3, B5
 *   Bottom: A7, A8, B7, B8
 *   Each team already played 1 opponent from own original pool → score kept.
 *   Only play the 2 opponents not yet faced.
 *
 * Phase 3 — SE 8 teams (QF → SF → F)
 *   Top 4 from Top group + winners Mid 1 & Mid 2 + 2nd Mid 1 & Mid 2
 *
 * Flexible: works with any even total, group sizes adapt.
 */
import { addMinutes } from "date-fns";
import { MatchDay, MatchPhase, MatchStatus, Team } from "@prisma/client";
import type { StandingRow } from "./standings";

// ─── Types ───────────────────────────────────────────────────────────────────

export type GrazMatch = {
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

export type GrazGroup = {
  name: string;
  teams: Team[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Circle-method round-robin: n-1 rounds, each team plays once per round.
 */
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

// ─── Phase 1: Initial RR pools ──────────────────────────────────────────────

/**
 * Split teams into 2 balanced pools using snake draft by seed.
 */
export function generateGrazPools(teams: Team[]): GrazGroup[] {
  const sorted = [...teams].sort((a, b) => a.seed - b.seed);
  const poolA: Team[] = [];
  const poolB: Team[] = [];

  sorted.forEach((team, idx) => {
    const round = Math.floor(idx / 2);
    const pos = idx % 2;
    const targetPool = round % 2 === 0 ? (pos === 0 ? poolA : poolB) : (pos === 0 ? poolB : poolA);
    targetPool.push(team);
  });

  return [
    { name: "Pool A", teams: poolA },
    { name: "Pool B", teams: poolB },
  ];
}

/**
 * Generate RR matches for a single pool (day 1 or day 2).
 * @param pool           The pool to generate for
 * @param courtNames     Court names
 * @param startAt        Start time for this block
 * @param dayIndex       SAT or SUN
 * @param gameDurationMin
 * @param roundFrom      First round index to generate (1-based, inclusive)
 * @param roundTo        Last round index to generate (1-based, inclusive)
 */
export function generateGrazPoolRounds(
  pool: GrazGroup,
  courtNames: string[],
  startAt: Date,
  dayIndex: MatchDay,
  gameDurationMin: number,
  roundFrom: number,
  roundTo: number
): GrazMatch[] {
  const matches: GrazMatch[] = [];
  const slotMin = gameDurationMin + 5;
  const rounds = circleMethodRounds(pool.teams);
  const courtFree = courtNames.map(() => new Date(startAt));

  for (let r = roundFrom - 1; r < Math.min(roundTo, rounds.length); r++) {
    for (const [teamA, teamB] of rounds[r]) {
      let bestIdx = 0;
      for (let c = 1; c < courtNames.length; c++) {
        if (courtFree[c] < courtFree[bestIdx]) bestIdx = c;
      }
      matches.push({
        phase: "GRAZ_RR",
        poolName: pool.name,
        bracketSide: null,
        roundIndex: r + 1,
        courtName: courtNames[bestIdx],
        startAt: new Date(courtFree[bestIdx]),
        dayIndex,
        status: "SCHEDULED",
        teamAId: teamA.id,
        teamBId: teamB.id,
      });
      courtFree[bestIdx] = addMinutes(courtFree[bestIdx], slotMin);
    }
  }

  return matches;
}

/**
 * Generate RR matches for the initial pools.
 * Splits rounds across Day 1 and Day 2 based on matchesPerDay1.
 * @deprecated Use generateGrazPoolRounds for per-pool generation.
 */
export function generateGrazRRMatches(
  pools: GrazGroup[],
  courtNames: string[],
  day1Start: Date,
  day2Start: Date,
  gameDurationMin: number,
  matchesPerDay1 = 5
): GrazMatch[] {
  const matches: GrazMatch[] = [];
  const slotMin = gameDurationMin + 5;

  for (const pool of pools) {
    const rounds = circleMethodRounds(pool.teams);
    const courtFree = courtNames.map(() => new Date(day1Start));
    let currentDay: MatchDay = "SAT";
    const day1Rounds = matchesPerDay1;

    for (let r = 0; r < rounds.length; r++) {
      if (r === day1Rounds) {
        currentDay = "SUN";
        for (let c = 0; c < courtFree.length; c++) {
          courtFree[c] = new Date(day2Start);
        }
      }

      for (const [teamA, teamB] of rounds[r]) {
        let bestIdx = 0;
        for (let c = 1; c < courtNames.length; c++) {
          if (courtFree[c] < courtFree[bestIdx]) bestIdx = c;
        }

        matches.push({
          phase: "GRAZ_RR",
          poolName: pool.name,
          bracketSide: null,
          roundIndex: r + 1,
          courtName: courtNames[bestIdx],
          startAt: new Date(courtFree[bestIdx]),
          dayIndex: currentDay,
          status: "SCHEDULED",
          teamAId: teamA.id,
          teamBId: teamB.id,
        });
        courtFree[bestIdx] = addMinutes(courtFree[bestIdx], slotMin);
      }
    }
  }

  return matches;
}

// ─── Phase 2: Regroup ────────────────────────────────────────────────────────

/**
 * Regroup teams into 4 groups based on RR standings.
 * For 16 teams (8 per pool):
 *   Top:    A1, A2, B1, B2
 *   Mid 1:  A3, A5, B4, B6
 *   Mid 2:  A4, A6, B3, B5
 *   Bottom: A7, A8, B7, B8
 *
 * Flexible: adapts group sizes for different team counts.
 */
export function regroupTeams(
  poolAStandings: StandingRow[],
  poolBStandings: StandingRow[]
): GrazGroup[] {
  const a = poolAStandings.map((s) => s.teamId);
  const b = poolBStandings.map((s) => s.teamId);
  const poolSize = Math.max(a.length, b.length);

  // For standard 8-per-pool format
  if (poolSize >= 8) {
    return [
      { name: "Top", teams: [] },    // A1,A2 + B1,B2
      { name: "Mid 1", teams: [] },  // A3,A5 + B4,B6
      { name: "Mid 2", teams: [] },  // A4,A6 + B3,B5
      { name: "Bottom", teams: [] }, // A7,A8 + B7,B8
    ];
  }

  // Smaller pools: 2 groups (top half / bottom half crossed)
  return [
    { name: "Top", teams: [] },
    { name: "Bottom", teams: [] },
  ];
}

/**
 * Assign team IDs to regrouped groups based on standings.
 * Returns the group assignments with team IDs (not Team objects).
 */
export function assignRegroupTeamIds(
  poolAStandings: StandingRow[],
  poolBStandings: StandingRow[]
): Array<{ name: string; teamIds: string[] }> {
  const a = poolAStandings.map((s) => s.teamId);
  const b = poolBStandings.map((s) => s.teamId);
  const poolSize = Math.max(a.length, b.length);

  if (poolSize >= 8) {
    return [
      { name: "Top", teamIds: [a[0], a[1], b[0], b[1]] },
      { name: "Mid 1", teamIds: [a[2], a[4], b[3], b[5]] },
      { name: "Mid 2", teamIds: [a[3], a[5], b[2], b[4]] },
      { name: "Bottom", teamIds: [a[6], a[7], b[6], b[7]] },
    ];
  }

  if (poolSize >= 6) {
    return [
      { name: "Top", teamIds: [a[0], a[1], b[0], b[1]] },
      { name: "Mid 1", teamIds: [a[2], a[4], b[3], b[5]] },
      { name: "Mid 2", teamIds: [a[3], a[5], b[2], b[4]] },
    ];
  }

  // Small pools: simple top/bottom split
  const half = Math.ceil(poolSize / 2);
  return [
    { name: "Top", teamIds: [...a.slice(0, half), ...b.slice(0, half)] },
    { name: "Bottom", teamIds: [...a.slice(half), ...b.slice(half)] },
  ];
}

/**
 * Generate regroup matches. Each team plays only opponents NOT yet faced.
 * In a group of 4 from 2 original pools, each team already played 1 teammate
 * from their original pool → only 2 new matches per team.
 */
export function generateRegroupMatches(
  groups: Array<{ name: string; teamIds: string[] }>,
  playedPairs: Set<string>,
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number
): GrazMatch[] {
  const matches: GrazMatch[] = [];
  const slotMin = gameDurationMin + 5;
  const courtFree = courtNames.map(() => new Date(startAt));

  for (const group of groups) {
    const ids = group.teamIds;
    // Generate all possible pairs, skip already played
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = pairKey(ids[i], ids[j]);
        if (playedPairs.has(key)) continue;

        let bestIdx = 0;
        for (let c = 1; c < courtNames.length; c++) {
          if (courtFree[c] < courtFree[bestIdx]) bestIdx = c;
        }

        matches.push({
          phase: "GRAZ_REGROUP",
          poolName: group.name,
          bracketSide: null,
          roundIndex: 1,
          courtName: courtNames[bestIdx],
          startAt: new Date(courtFree[bestIdx]),
          dayIndex: "SUN",
          status: "SCHEDULED",
          teamAId: ids[i],
          teamBId: ids[j],
        });
        courtFree[bestIdx] = addMinutes(courtFree[bestIdx], slotMin);
      }
    }
  }

  return matches;
}

// ─── Phase 3: SE bracket (8 teams) ──────────────────────────────────────────

/**
 * Select 6 teams for the final SE bracket:
 *   - All 4 from Top group (seeded 1-4, Top1 & Top2 get BYE in SF)
 *   - 1st from Mid 1 (seed 5)
 *   - 1st from Mid 2 (seed 6)
 */
export function selectSETeams(
  regroupStandings: Map<string, StandingRow[]>
): string[] {
  const top = regroupStandings.get("Top") ?? [];
  const mid1 = regroupStandings.get("Mid 1") ?? [];
  const mid2 = regroupStandings.get("Mid 2") ?? [];

  return [
    top[0]?.teamId,   // seed 1 — BYE
    top[1]?.teamId,   // seed 2 — BYE
    top[2]?.teamId,   // seed 3
    top[3]?.teamId,   // seed 4
    mid1[0]?.teamId,  // seed 5 (Mid1 winner)
    mid2[0]?.teamId,  // seed 6 (Mid2 winner)
  ].filter(Boolean) as string[];
}

/**
 * Generate SE bracket for 6 teams:
 *   QF1 (round 1, pos 0): seed3 vs seed6
 *   QF2 (round 1, pos 1): seed4 vs seed5
 *   SF1 (round 2, pos 0): seed1 (BYE) vs QF1W  → teamA=seed1, teamB=null
 *   SF2 (round 2, pos 1): seed2 (BYE) vs QF2W  → teamA=seed2, teamB=null
 *   3rd place (round 3, bracketSide L): SF1L vs SF2L
 *   Final (round 3, bracketSide G): SF1W vs SF2W
 *
 * nextMatchWinId / nextMatchLoseId wiring is done in the action after DB insert.
 */
export function generateGrazSE(
  teamIds: string[], // [seed1, seed2, seed3, seed4, mid1W, mid2W]
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number
): GrazMatch[] {
  const slotMin = gameDurationMin + 5;
  const roundBreak = gameDurationMin + 15;
  const court = courtNames[0] ?? "Court 1";

  const [s1, s2, s3, s4, m1w, m2w] = teamIds;

  const r1Start = new Date(startAt);
  const r2Start = addMinutes(startAt, roundBreak);
  const r3Start = addMinutes(startAt, 2 * roundBreak);

  return [
    // QF1 : seed3 vs Mid2W
    { phase: "GRAZ_SE", bracketSide: "W", roundIndex: 1, positionInRound: 0, courtName: court, startAt: r1Start, dayIndex: "SUN", status: "SCHEDULED", teamAId: s3 ?? null, teamBId: m2w ?? null },
    // QF2 : seed4 vs Mid1W — starts after QF1
    { phase: "GRAZ_SE", bracketSide: "W", roundIndex: 1, positionInRound: 1, courtName: court, startAt: addMinutes(r1Start, slotMin), dayIndex: "SUN", status: "SCHEDULED", teamAId: s4 ?? null, teamBId: m1w ?? null },
    // SF1 : seed1 BYE (teamB=null, will be filled when QF1 finishes)
    { phase: "GRAZ_SE", bracketSide: "W", roundIndex: 2, positionInRound: 0, courtName: court, startAt: r2Start, dayIndex: "SUN", status: "SCHEDULED", teamAId: s1 ?? null, teamBId: null },
    // SF2 : seed2 BYE
    { phase: "GRAZ_SE", bracketSide: "W", roundIndex: 2, positionInRound: 1, courtName: court, startAt: addMinutes(r2Start, slotMin), dayIndex: "SUN", status: "SCHEDULED", teamAId: s2 ?? null, teamBId: null },
    // 3rd place
    { phase: "GRAZ_SE", bracketSide: "L", roundIndex: 3, positionInRound: 0, courtName: court, startAt: r3Start, dayIndex: "SUN", status: "SCHEDULED", teamAId: null, teamBId: null },
    // Final
    { phase: "GRAZ_SE", bracketSide: "G", roundIndex: 3, positionInRound: 1, courtName: court, startAt: addMinutes(r3Start, slotMin), dayIndex: "SUN", status: "SCHEDULED", teamAId: null, teamBId: null },
  ];
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Create a canonical pair key for two team IDs (order-independent).
 */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Build a set of all played pairs from a list of matches.
 */
export function buildPlayedPairs(
  matches: Array<{ teamAId: string | null; teamBId: string | null }>
): Set<string> {
  const pairs = new Set<string>();
  for (const m of matches) {
    if (m.teamAId && m.teamBId) {
      pairs.add(pairKey(m.teamAId, m.teamBId));
    }
  }
  return pairs;
}
