/**
 * Big Apple format — 16 teams, 3 sites, 2 days
 *
 * Phase 1 — RR in 2 groups of 8 (7 matches per team), Saturday
 *   Pool A on court 1, Pool B on court 2 (2 sites Saturday).
 *   Each team plays half its matches on one court, then rotates to the
 *   other court for the remaining matches (mid-tournament court swap).
 *
 * Phase 2 — Swiss, Sunday (1 site)
 *   The 12 teams ranked 3rd-8th in each pool (6 + 6) play 3 Swiss rounds.
 *   Standings carry over the points from Saturday's RR.
 *   → the 4 best of the Swiss become bracket seeds 5-8.
 *
 * Phase 3 — Placement matches, Sunday
 *   Pool A #1 vs Pool B #1 → winner = seed 1, loser = seed 2
 *   Pool A #2 vs Pool B #2 → winner = seed 3, loser = seed 4
 *
 * Phase 4 — SE bracket of 8 teams, Sunday
 *   Seeds: 1v8, 4v5, 3v6, 2v7 (standard bracket seeding)
 *   QF → SF → 3rd place + Grand Final
 */
import { addMinutes } from "date-fns";
import { MatchDay, MatchPhase, MatchStatus, Team } from "@prisma/client";
import type { StandingRow } from "./standings";
import { generateSwissRound } from "./bracket";

// ─── Types ───────────────────────────────────────────────────────────────────

export type BigAppleMatch = {
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

export type BigAppleGroup = {
  name: string;
  teams: Team[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a canonical pair key for two team IDs (order-independent). */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Build a set of all played pairs from a list of matches. */
export function buildPlayedPairs(
  matches: Array<{ teamAId: string | null; teamBId: string | null }>
): Set<string> {
  const pairs = new Set<string>();
  for (const m of matches) {
    if (m.teamAId && m.teamBId) pairs.add(pairKey(m.teamAId, m.teamBId));
  }
  return pairs;
}

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

/** Standard bracket seeding order for a power-of-2 size. */
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
export function generateBigApplePools(teams: Team[]): BigAppleGroup[] {
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
 * Generate RR matches for a single pool, keeping the pool on ONE court, but
 * swapping to the alternate court at mid-tournament (Big Apple court rotation).
 *
 * @param pool             The pool to generate for
 * @param primaryCourt     Court used for the first half of the rounds
 * @param secondaryCourt   Court used for the second half of the rounds
 * @param startAt          Start time for this block
 * @param dayIndex         SAT or SUN
 * @param gameDurationMin
 * @param roundFrom        First round index to generate (1-based, inclusive)
 * @param roundTo          Last round index to generate (1-based, inclusive)
 */
export function generateBigApplePoolRounds(
  pool: BigAppleGroup,
  primaryCourt: string,
  secondaryCourt: string,
  startAt: Date,
  dayIndex: MatchDay,
  gameDurationMin: number,
  roundFrom: number,
  roundTo: number
): BigAppleMatch[] {
  const matches: BigAppleMatch[] = [];
  const slotMin = gameDurationMin + 5;
  const rounds = circleMethodRounds(pool.teams);
  const totalRounds = rounds.length;
  const swapAt = Math.ceil(totalRounds / 2); // first half on primary, rest on secondary

  let cursor = new Date(startAt);

  for (let r = roundFrom - 1; r < Math.min(roundTo, totalRounds); r++) {
    const court = r < swapAt ? primaryCourt : secondaryCourt;
    for (const [teamA, teamB] of rounds[r]) {
      matches.push({
        phase: "BIG_APPLE_RR",
        poolName: pool.name,
        bracketSide: null,
        roundIndex: r + 1,
        courtName: court,
        startAt: new Date(cursor),
        dayIndex,
        status: "SCHEDULED",
        teamAId: teamA.id,
        teamBId: teamB.id,
      });
      cursor = addMinutes(cursor, slotMin);
    }
  }

  return matches;
}

// ─── Phase 2: Sunday Swiss (teams ranked 3-8 of each pool) ────────────────────

/**
 * Select the 12 teams (ranked 3rd-8th in each pool) that go to the Sunday Swiss.
 * Returns the team IDs. Pools smaller than 3 teams contribute nothing here.
 */
export function selectSwissTeamIds(
  poolAStandings: StandingRow[],
  poolBStandings: StandingRow[]
): string[] {
  const a = poolAStandings.slice(2).map((s) => s.teamId); // ranks 3..N
  const b = poolBStandings.slice(2).map((s) => s.teamId);
  return [...a, ...b];
}

/**
 * Generate a single Swiss round for the Sunday middle group.
 * Avoids rematches from Saturday's RR (they only meet again if unavoidable).
 *
 * @param swissTeams    Team objects for the 12 Swiss teams
 * @param standings     Current overall standings (carries Saturday points)
 * @param playedPairs   Pairs already played (Saturday + previous Swiss rounds)
 * @param roundIndex    1-based Swiss round index
 * @param courtNames    Sunday courts
 * @param startAt
 * @param gameDurationMin
 */
export function generateBigAppleSwissRound(
  swissTeams: Team[],
  standings: StandingRow[],
  playedPairs: Set<string>,
  roundIndex: number,
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number
): BigAppleMatch[] {
  const rawMatches = generateSwissRound(
    swissTeams,
    standings,
    Array.from(playedPairs).map((key) => {
      const [a, b] = key.split(":");
      return { teamAId: a, teamBId: b };
    }),
    roundIndex,
    courtNames,
    startAt,
    gameDurationMin,
    "SUN"
  );

  return rawMatches.map((m, i) => ({
    phase: "BIG_APPLE_SWISS" as MatchPhase,
    poolName: "Swiss",
    bracketSide: null,
    roundIndex,
    positionInRound: i,
    courtName: m.courtName,
    startAt: m.startAt,
    dayIndex: "SUN" as MatchDay,
    status: "SCHEDULED" as MatchStatus,
    teamAId: m.teamAId ?? null,
    teamBId: m.teamBId ?? null,
  }));
}

// ─── Phase 3: Placement matches (top 2 of each pool) ─────────────────────────

/**
 * Generate the 2 placement matches:
 *   Pool A #1 vs Pool B #1  → winner seed 1, loser seed 2
 *   Pool A #2 vs Pool B #2  → winner seed 3, loser seed 4
 */
export function generateBigApplePlacement(
  poolAStandings: StandingRow[],
  poolBStandings: StandingRow[],
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number
): BigAppleMatch[] {
  const a1 = poolAStandings[0]?.teamId ?? null;
  const a2 = poolAStandings[1]?.teamId ?? null;
  const b1 = poolBStandings[0]?.teamId ?? null;
  const b2 = poolBStandings[1]?.teamId ?? null;

  const court0 = courtNames[0] ?? "Court 1";
  const court1 = courtNames[1] ?? court0;

  return [
    // Match for seeds 1/2
    {
      phase: "BIG_APPLE_PLACEMENT",
      poolName: "Placement 1-2",
      bracketSide: null,
      roundIndex: 1,
      positionInRound: 0,
      courtName: court0,
      startAt: new Date(startAt),
      dayIndex: "SUN",
      status: "SCHEDULED",
      teamAId: a1,
      teamBId: b1,
    },
    // Match for seeds 3/4
    {
      phase: "BIG_APPLE_PLACEMENT",
      poolName: "Placement 3-4",
      bracketSide: null,
      roundIndex: 1,
      positionInRound: 1,
      courtName: court1,
      startAt: new Date(startAt),
      dayIndex: "SUN",
      status: "SCHEDULED",
      teamAId: a2,
      teamBId: b2,
    },
  ];
}

// ─── Phase 4: SE bracket (8 teams) ───────────────────────────────────────────

/**
 * Build the ordered 8 seeds for the final bracket.
 *   seed 1/2 → placement match 1 (winner/loser)
 *   seed 3/4 → placement match 2 (winner/loser)
 *   seed 5-8 → top 4 of the Sunday Swiss (by final Swiss standings)
 *
 * @param placement12  [winner, loser] of the seeds 1/2 placement match
 * @param placement34  [winner, loser] of the seeds 3/4 placement match
 * @param swissTop4    Top-4 Swiss team IDs, best first
 */
export function selectSESeeds(
  placement12: [string | null, string | null],
  placement34: [string | null, string | null],
  swissTop4: string[]
): (string | null)[] {
  return [
    placement12[0] ?? null, // seed 1
    placement12[1] ?? null, // seed 2
    placement34[0] ?? null, // seed 3
    placement34[1] ?? null, // seed 4
    swissTop4[0] ?? null,   // seed 5
    swissTop4[1] ?? null,   // seed 6
    swissTop4[2] ?? null,   // seed 7
    swissTop4[3] ?? null,   // seed 8
  ];
}

/**
 * Generate the SE bracket for 8 teams.
 *   Standard seeding: 1v8, 4v5, 3v6, 2v7
 *   QF (round 1) → SF (round 2) → 3rd place + Grand Final (round 3)
 *
 * @param seeds  [seed1..seed8] team IDs (index 0 = seed 1)
 *
 * nextMatchWinId / nextMatchLoseId wiring is done in the action after DB insert.
 * The returned order is: [QF1, QF2, QF3, QF4, SF1, SF2, 3rd, Final].
 */
export function generateBigAppleSE(
  seeds: (string | null)[],
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number
): BigAppleMatch[] {
  const slotMin = gameDurationMin + 5;
  const roundBreak = gameDurationMin + 15;
  const courts = Math.max(courtNames.length, 1);

  // bracketSeeding(8) → [1,8,5,4,3,6,7,2] (1-based). Map to QF pairs.
  const order = bracketSeeding(8); // e.g. [1,8,5,4,3,6,7,2]
  const qfPairs: [number, number][] = [];
  for (let i = 0; i < order.length; i += 2) {
    qfPairs.push([order[i] - 1, order[i + 1] - 1]);
  }

  const matches: BigAppleMatch[] = [];

  // QF round
  qfPairs.forEach(([a, b], i) => {
    const courtIdx = i % courts;
    const courtStart = addMinutes(startAt, Math.floor(i / courts) * slotMin);
    matches.push({
      phase: "BIG_APPLE_SE",
      bracketSide: "W",
      roundIndex: 1,
      positionInRound: i,
      courtName: courtNames[courtIdx] ?? "Court 1",
      startAt: courtStart,
      dayIndex: "SUN",
      status: "SCHEDULED",
      teamAId: seeds[a] ?? null,
      teamBId: seeds[b] ?? null,
    });
  });

  // SF round
  const sfStart = addMinutes(startAt, roundBreak);
  for (let i = 0; i < 2; i++) {
    matches.push({
      phase: "BIG_APPLE_SE",
      bracketSide: "W",
      roundIndex: 2,
      positionInRound: i,
      courtName: courtNames[i % courts] ?? "Court 1",
      startAt: sfStart,
      dayIndex: "SUN",
      status: "SCHEDULED",
      teamAId: null,
      teamBId: null,
    });
  }

  // 3rd place + Grand Final
  const finalStart = addMinutes(startAt, 2 * roundBreak);
  matches.push({
    phase: "BIG_APPLE_SE",
    bracketSide: "L",
    roundIndex: 3,
    positionInRound: 0,
    courtName: courtNames[0] ?? "Court 1",
    startAt: finalStart,
    dayIndex: "SUN",
    status: "SCHEDULED",
    teamAId: null,
    teamBId: null,
  });
  matches.push({
    phase: "BIG_APPLE_SE",
    bracketSide: "G",
    roundIndex: 3,
    positionInRound: 1,
    courtName: courtNames[courts > 1 ? 1 : 0] ?? "Court 1",
    startAt: finalStart,
    dayIndex: "SUN",
    status: "SCHEDULED",
    teamAId: null,
    teamBId: null,
  });

  return matches;
}
