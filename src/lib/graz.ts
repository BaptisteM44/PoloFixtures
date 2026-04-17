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
 * Generate RR matches for the initial pools.
 * Splits rounds across Day 1 and Day 2 based on matchesPerDay1.
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
    let matchCount = 0;
    // Each team plays once per round. matchesPerDay1 rounds on day 1.
    const day1Rounds = matchesPerDay1;

    for (let r = 0; r < rounds.length; r++) {
      if (r === day1Rounds) {
        // Switch to day 2
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
 * Select 8 teams for the final SE bracket:
 *   - All 4 from Top group
 *   - 1st and 2nd from Mid 1
 *   - 1st and 2nd from Mid 2
 *
 * Teams are seeded 1-8 based on their regroup standing.
 */
export function selectSETeams(
  regroupStandings: Map<string, StandingRow[]>
): string[] {
  const top = regroupStandings.get("Top") ?? [];
  const mid1 = regroupStandings.get("Mid 1") ?? [];
  const mid2 = regroupStandings.get("Mid 2") ?? [];

  return [
    ...top.map((s) => s.teamId),
    ...(mid1.slice(0, 2).map((s) => s.teamId)),
    ...(mid2.slice(0, 2).map((s) => s.teamId)),
  ];
}

/**
 * Generate SE bracket matches for qualified teams.
 * 8 teams → QF (4 matches) → SF (2 matches) → Final (1 match) = 7 matches
 */
export function generateGrazSE(
  teamIds: string[],
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number
): GrazMatch[] {
  const size = nextPowerOf2(teamIds.length);
  const totalRounds = Math.log2(size);
  const slotMin = gameDurationMin + 5;
  const roundBreak = gameDurationMin + 15;

  const seedOrder = bracketSeeding(size);
  const slots: (string | null)[] = seedOrder.map((s) => teamIds[s - 1] ?? null);

  const matches: GrazMatch[] = [];

  for (let r = 0; r < totalRounds; r++) {
    const matchesInRound = size / Math.pow(2, r + 1);
    const roundStart = addMinutes(startAt, r * roundBreak);
    let courtIdx = 0;

    for (let m = 0; m < matchesInRound; m++) {
      let teamAId: string | null = null;
      let teamBId: string | null = null;

      if (r === 0) {
        const a = slots[m * 2] ?? null;
        const b = slots[m * 2 + 1] ?? null;
        if ((a && !b) || (b && !a) || (!a && !b)) continue; // BYE
        teamAId = a;
        teamBId = b;
      }

      matches.push({
        phase: "GRAZ_SE",
        poolName: null,
        bracketSide: r === totalRounds - 1 ? "G" : "W",
        roundIndex: r + 1,
        positionInRound: m,
        courtName: courtNames[courtIdx % courtNames.length],
        startAt: addMinutes(roundStart, Math.floor(courtIdx / courtNames.length) * slotMin),
        dayIndex: "SUN",
        status: "SCHEDULED",
        teamAId,
        teamBId,
      });
      courtIdx++;
    }
  }

  return matches;
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
