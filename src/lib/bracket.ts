import { addMinutes } from "date-fns";
import { MatchDay, MatchPhase, MatchStatus, PoolSession, SaturdayFormat, SundayFormat, Team } from "@prisma/client";
import type { StandingRow } from "./standings";

export type PoolSeed = {
  name: string;
  session?: PoolSession | null;
  teams: Team[];
};

export type GeneratedMatch = {
  phase: MatchPhase;
  poolName?: string | null;
  poolSessionIndex?: number | null; // 0 = Pool A, 1 = Pool B, etc.
  bracketSide?: "W" | "L" | "G" | null;
  roundIndex: number;
  positionInRound?: number;
  courtName: string;
  startAt: Date;
  dayIndex: MatchDay;
  status: MatchStatus;
  teamAId: string | null;
  teamBId: string | null;
  nextMatchWinId?: string | null;
  nextSlotWin?: string | null;
  nextMatchLoseId?: string | null;
  nextSlotLose?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function nextPowerOf2(n: number): number {
  if (n <= 1) return 1;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

/**
 * Challonge-style bracket seeding for a bracket of size n (power of 2).
 * Ensures seed 1 and seed 2 are on opposite sides and can only meet in the final.
 */
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
 * Circle-method round-robin: generates n-1 rounds where each team plays
 * exactly once per round. No back-to-back matches for any team.
 */
function circleMethodRounds(teams: Team[]): Array<Array<[Team, Team]>> {
  const list: (Team | null)[] = [...teams];
  if (list.length % 2 !== 0) list.push(null); // BYE for odd number of teams
  const n = list.length;
  const rounds: Array<Array<[Team, Team]>> = [];

  for (let r = 0; r < n - 1; r++) {
    const round: Array<[Team, Team]> = [];
    for (let i = 0; i < n / 2; i++) {
      const home = list[i];
      const away = list[n - 1 - i];
      if (home && away) round.push([home, away]);
      // BYE slot: team has a free round (no match added)
    }
    rounds.push(round);
    // Rotate: fix list[0], cycle the rest (last element moves to index 1)
    const last = list.pop()!;
    list.splice(1, 0, last);
  }

  return rounds;
}

// ─── Pools ────────────────────────────────────────────────────────────────────

export function generatePools(teams: Team[], saturdayFormat: SaturdayFormat, poolCountOverride?: number): PoolSeed[] {
  if (saturdayFormat === "SWISS") return []; // Swiss uses rounds, not fixed pools

  const poolCount = poolCountOverride ?? (teams.length <= 6 ? 1 : 2);
  const pools: PoolSeed[] = [];
  for (let i = 0; i < poolCount; i++) {
    pools.push({
      name: `Pool ${String.fromCharCode(65 + i)}`,
      session: saturdayFormat === "SPLIT_POOLS" ? (i === 0 ? "MORNING" : "AFTERNOON") : null,
      teams: [],
    });
  }
  // Serpentin: distribute teams by seed across pools for balanced groups
  [...teams]
    .sort((a, b) => a.seed - b.seed)
    .forEach((team, idx) => {
      const round = Math.floor(idx / poolCount);
      const posInRound = idx % poolCount;
      // Even rounds: left-to-right, odd rounds: right-to-left (snake draft)
      const poolIdx = round % 2 === 0 ? posInRound : poolCount - 1 - posInRound;
      pools[poolIdx].teams.push(team);
    });

  return pools;
}

/**
 * Pool schedule using the circle method + greedy court assignment.
 *
 * Key property: teams are grouped into rounds (circle method), then
 * rounds are interleaved across all pools. A team plays at most ONE match
 * per round slot → no three-in-a-row, minimal wait time.
 */
export function generatePoolMatches(
  pools: PoolSeed[],
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number
): GeneratedMatch[] {
  const matches: GeneratedMatch[] = [];
  const slotMin = gameDurationMin + 5;

  // Per-pool courts: each pool gets its own court timeline (separate sessions)
  const poolRounds = pools.map((pool, poolIdx) => ({
    poolIdx,
    pool,
    rounds: circleMethodRounds(pool.teams),
    courtFree: courtNames.map(() => new Date(startAt)), // Each pool starts at same time
  }));

  const maxRounds = Math.max(...poolRounds.map((pr) => pr.rounds.length), 0);

  // Schedule each pool's rounds sequentially (no interleaving between pools)
  for (const { poolIdx, pool, rounds, courtFree } of poolRounds) {
    for (let r = 0; r < rounds.length; r++) {
      const roundMatches = rounds[r];
      for (const pair of roundMatches) {
        let bestIdx = 0;
        for (let c = 1; c < courtNames.length; c++) {
          if (courtFree[c] < courtFree[bestIdx]) bestIdx = c;
        }
        matches.push({
          phase: "POOL",
          poolName: pool.name,
          poolSessionIndex: poolIdx, // 0 = Pool A, 1 = Pool B, etc.
          bracketSide: null,
          roundIndex: r + 1,
          courtName: courtNames[bestIdx],
          startAt: new Date(courtFree[bestIdx]),
          dayIndex: "SAT",
          status: "SCHEDULED",
          teamAId: pair[0].id,
          teamBId: pair[1].id,
        });
        courtFree[bestIdx] = addMinutes(courtFree[bestIdx], slotMin);
      }
    }
  }

  return matches;
}

// ─── Swiss ────────────────────────────────────────────────────────────────────

/**
 * Generate one Swiss round.
 * - Teams sorted by current standings (points → goal diff)
 * - Greedy pairing; avoids rematches when possible
 * - Spread across available courts
 */
export function generateSwissRound(
  teams: Team[],
  standings: StandingRow[],
  existingMatches: Array<{ teamAId: string | null; teamBId: string | null }>,
  roundIndex: number,
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number,
  day: MatchDay = "SAT"
): GeneratedMatch[] {
  const slotMin = gameDurationMin + 5;

  // Already-played pairs
  const played = new Set<string>();
  for (const m of existingMatches) {
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

  // Greedy pairing
  const unpaired = [...sorted];
  const pairs: [Team, Team][] = [];
  while (unpaired.length >= 2) {
    const teamA = unpaired.shift()!;
    let opponentIdx = 0;
    // Find first opponent not already faced
    for (let i = 0; i < unpaired.length; i++) {
      if (!played.has(`${teamA.id}|${unpaired[i].id}`)) {
        opponentIdx = i;
        break;
      }
    }
    pairs.push([teamA, unpaired.splice(opponentIdx, 1)[0]]);
  }

  const courtFree: Date[] = courtNames.map(() => new Date(startAt));

  return pairs.map(([teamA, teamB]) => {
    let bestIdx = 0;
    for (let c = 1; c < courtNames.length; c++) {
      if (courtFree[c] < courtFree[bestIdx]) bestIdx = c;
    }
    const slot = new Date(courtFree[bestIdx]);
    courtFree[bestIdx] = addMinutes(courtFree[bestIdx], slotMin);

    return {
      phase: "SWISS" as MatchPhase,
      poolName: `Swiss R${roundIndex}`,
      bracketSide: null,
      roundIndex,
      courtName: courtNames[bestIdx],
      startAt: slot,
      dayIndex: day,
      status: "SCHEDULED",
      teamAId: teamA.id,
      teamBId: teamB.id,
    };
  });
}

// ─── Cross-Pool ──────────────────────────────────────────────────────────────

/**
 * Generate cross-pool matches: team ranked Nth in pool A vs team ranked Nth in pool B.
 * With 3+ pools, pairs are made between pool A-B, C-D, etc. (or A-B, A-C for 3 pools).
 * For 2 pools: 1A vs 1B, 2A vs 2B, ...
 */
export function generateCrossPoolMatches(
  poolStandings: Array<{ poolName: string; teams: Team[] }>,
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number
): GeneratedMatch[] {
  const matches: GeneratedMatch[] = [];
  const slotMin = gameDurationMin + 5;
  const courtFree: Date[] = courtNames.map(() => new Date(startAt));

  if (poolStandings.length === 2) {
    // Standard 2-pool cross: 1A vs 1B, 2A vs 2B, etc.
    const poolA = poolStandings[0].teams;
    const poolB = poolStandings[1].teams;
    const count = Math.min(poolA.length, poolB.length);
    for (let i = 0; i < count; i++) {
      let bestIdx = 0;
      for (let c = 1; c < courtNames.length; c++) {
        if (courtFree[c] < courtFree[bestIdx]) bestIdx = c;
      }
      matches.push({
        phase: "CROSS_POOL" as MatchPhase,
        poolName: null,
        bracketSide: null,
        roundIndex: 1,
        positionInRound: i,
        courtName: courtNames[bestIdx],
        startAt: new Date(courtFree[bestIdx]),
        dayIndex: "SUN",
        status: "SCHEDULED",
        teamAId: poolA[i].id,
        teamBId: poolB[i].id,
      });
      courtFree[bestIdx] = addMinutes(courtFree[bestIdx], slotMin);
    }
  } else {
    // 3+ pools: pair pools (A-B, C-D, ...) and cross-match by rank
    // If odd number of pools, last pool gets paired with first pool for extra matches
    const pairs: [number, number][] = [];
    for (let i = 0; i < poolStandings.length; i += 2) {
      if (i + 1 < poolStandings.length) {
        pairs.push([i, i + 1]);
      } else {
        pairs.push([i, 0]); // last pool paired with first
      }
    }
    let pos = 0;
    for (const [pA, pB] of pairs) {
      const teamsA = poolStandings[pA].teams;
      const teamsB = poolStandings[pB].teams;
      const count = Math.min(teamsA.length, teamsB.length);
      for (let i = 0; i < count; i++) {
        let bestIdx = 0;
        for (let c = 1; c < courtNames.length; c++) {
          if (courtFree[c] < courtFree[bestIdx]) bestIdx = c;
        }
        matches.push({
          phase: "CROSS_POOL" as MatchPhase,
          poolName: null,
          bracketSide: null,
          roundIndex: 1,
          positionInRound: pos++,
          courtName: courtNames[bestIdx],
          startAt: new Date(courtFree[bestIdx]),
          dayIndex: "SUN",
          status: "SCHEDULED",
          teamAId: teamsA[i].id,
          teamBId: teamsB[i].id,
        });
        courtFree[bestIdx] = addMinutes(courtFree[bestIdx], slotMin);
      }
    }
  }

  return matches;
}

// ─── Split SE (Swiss 6 → TOP 10 SE + Bottom 8 Consolante) ──────────────────

/**
 * Generate two separate Single Elimination brackets:
 * - TOP 10: Top 10 teams from standings
 * - CONSOLANTE: Bottom 8 teams from standings
 * Both start at the same time on different courts.
 */
function generateSplitSE(
  teams: Team[],
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number
): GeneratedMatch[] {
  const sorted = [...teams];

  // Split into TOP 10 and Bottom 8
  const top10 = sorted.slice(0, 10);
  const bottom8 = sorted.slice(10, 18);

  // Generate SE for TOP 10 (uses first half of courts)
  const topCourtCount = Math.ceil(courtNames.length / 2);
  const topCourts = courtNames.slice(0, topCourtCount);
  const topMatches = generateSingleElim(top10, topCourts, startAt, gameDurationMin, false)
    .map((m) => ({ ...m, bracketSide: "W" as const })); // "W" side for top bracket

  // Generate SE for Bottom 8 (uses second half of courts, same start time)
  const bottomCourts = courtNames.slice(topCourtCount);
  const bottomMatches = generateSingleElim(bottom8, bottomCourts.length > 0 ? bottomCourts : topCourts, startAt, gameDurationMin, false)
    .map((m) => ({ ...m, bracketSide: "L" as const })); // "L" side for consolante bracket

  return [...topMatches, ...bottomMatches];
}

// ─── Bracket ──────────────────────────────────────────────────────────────────

export function generateBracket(
  teams: Team[],
  format: SundayFormat,
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number,
  options?: { thirdPlaceMatch?: boolean; gfReset?: boolean }
): GeneratedMatch[] {
  if (format === "RR") {
    return generateRoundRobin(teams, courtNames, startAt, gameDurationMin);
  }
  if (format === "DE" && teams.length >= 4) {
    return generateDoubleElim(teams, courtNames, startAt, gameDurationMin, options?.gfReset ?? false);
  }
  if (format === "SWISS_SPLIT_SE") {
    return generateSplitSE(teams, courtNames, startAt, gameDurationMin);
  }
  return generateSingleElim(teams, courtNames, startAt, gameDurationMin, options?.thirdPlaceMatch ?? false);
}

/**
 * Round Robin bracket — every team plays every other team once.
 * Uses the circle method for scheduling. Phase = BRACKET, bracketSide = null.
 */
function generateRoundRobin(
  teams: Team[],
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number
): GeneratedMatch[] {
  const rounds = circleMethodRounds(teams);
  const slotMin = gameDurationMin + 5;
  const roundBreak = 10;
  const matches: GeneratedMatch[] = [];
  let courtFree: Date[] = courtNames.map(() => new Date(startAt));

  rounds.forEach((round, r) => {
    // After each round, all courts advance past the previous round
    const roundStart = new Date(Math.max(...courtFree.map((d) => d.getTime())));
    if (r > 0) {
      courtFree = courtNames.map(() => addMinutes(roundStart, roundBreak));
    }

    for (const [teamA, teamB] of round) {
      let bestIdx = 0;
      for (let c = 1; c < courtNames.length; c++) {
        if (courtFree[c] < courtFree[bestIdx]) bestIdx = c;
      }
      matches.push({
        phase: "BRACKET",
        bracketSide: null,
        roundIndex: r + 1,
        positionInRound: matches.filter((m) => m.roundIndex === r + 1).length,
        courtName: courtNames[bestIdx],
        startAt: new Date(courtFree[bestIdx]),
        dayIndex: "SUN",
        status: "SCHEDULED",
        teamAId: teamA.id,
        teamBId: teamB.id,
      });
      courtFree[bestIdx] = addMinutes(courtFree[bestIdx], slotMin);
    }
  });

  return matches;
}

function generateSingleElim(
  teams: Team[],
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number,
  thirdPlaceMatch = false
): GeneratedMatch[] {
  const sorted = [...teams];
  const size = nextPowerOf2(sorted.length);
  const totalRounds = Math.log2(size);
  const slotMin = gameDurationMin + 5;
  const roundBreak = gameDurationMin + 15;

  const seedOrder = bracketSeeding(size);
  const slots: (Team | null)[] = seedOrder.map((s) => sorted[s - 1] ?? null);

  const allMatches: GeneratedMatch[] = [];
  // matchGrid[r][positionInRound] — sparse: BYE matches are skipped
  const matchGrid: Map<number, GeneratedMatch>[] = [];

  for (let r = 0; r < totalRounds; r++) {
    const matchesInRound = size / Math.pow(2, r + 1);
    const roundStart = addMinutes(startAt, r * roundBreak);
    const roundMap = new Map<number, GeneratedMatch>();
    let courtIdx = 0;

    for (let m = 0; m < matchesInRound; m++) {
      let teamAId: string | null = null;
      let teamBId: string | null = null;

      if (r === 0) {
        const a = slots[m * 2]?.id ?? null;
        const b = slots[m * 2 + 1]?.id ?? null;

        // Skip BYE matches: if one team is null, advance the real team directly
        if (a && !b) {
          // Team A gets a BYE — will be placed in R2 below
          continue;
        }
        if (b && !a) {
          // Team B gets a BYE — will be placed in R2 below
          continue;
        }
        if (!a && !b) {
          // Both null — skip entirely
          continue;
        }
        teamAId = a;
        teamBId = b;
      }

      const match: GeneratedMatch = {
        phase: "BRACKET",
        bracketSide: r === totalRounds - 1 ? "G" : "W",
        roundIndex: r + 1,
        positionInRound: m,
        courtName: courtNames[courtIdx % courtNames.length],
        startAt: addMinutes(roundStart, Math.floor(courtIdx / courtNames.length) * slotMin),
        dayIndex: "SUN",
        status: "SCHEDULED",
        teamAId,
        teamBId,
      };
      courtIdx++;
      roundMap.set(m, match);
      allMatches.push(match);
    }
    matchGrid.push(roundMap);
  }

  // Propagate BYE auto-advances: place BYE winners directly into R2
  if (matchGrid.length >= 2) {
    const r1Count = size / 2;
    for (let m = 0; m < r1Count; m++) {
      const a = slots[m * 2]?.id ?? null;
      const b = slots[m * 2 + 1]?.id ?? null;

      // If this R1 match was skipped (BYE), place the real team into R2
      if (!matchGrid[0].has(m)) {
        const advancingTeam = a ?? b;
        if (advancingTeam) {
          const r2Pos = Math.floor(m / 2);
          const r2Match = matchGrid[1].get(r2Pos);
          if (r2Match) {
            if (m % 2 === 0) r2Match.teamAId = advancingTeam;
            else r2Match.teamBId = advancingTeam;
          }
        }
      }
    }
  }

  // 3rd place match: losers of the semi-finals play each other
  // Semi-finals = round totalRounds-1 (the round just before the final)
  if (thirdPlaceMatch && totalRounds >= 2) {
    const semiFinalRound = totalRounds - 1;
    const semiMatches = matchGrid[semiFinalRound - 1]; // 0-indexed
    if (semiMatches && semiMatches.size >= 2) {
      // Schedule 3rd place match at the same time as the final
      const finalRoundStart = addMinutes(startAt, (totalRounds - 1) * roundBreak);
      const thirdPlaceStartAt = addMinutes(finalRoundStart, slotMin); // after final on court 2
      const thirdCourtIdx = Math.min(1, courtNames.length - 1);
      allMatches.push({
        phase: "BRACKET",
        bracketSide: "L", // use "L" to distinguish from final ("G")
        roundIndex: totalRounds,
        positionInRound: 1,
        courtName: courtNames[thirdCourtIdx],
        startAt: courtNames.length > 1 ? finalRoundStart : thirdPlaceStartAt,
        dayIndex: "SUN",
        status: "SCHEDULED",
        teamAId: null,
        teamBId: null,
      });
    }
  }

  return allMatches;
}

/**
 * Double Elimination bracket — Challonge-style with interleaved scheduling.
 *
 * Structure (for size = 2^m with N actual teams):
 *   Upper Bracket: m rounds (WB R1..Rm)
 *   Lower Bracket: 2*(m-1) rounds (LB R1..R(2m-2))
 *     - Odd LB rounds (R1, R3, R5…) = Consolidation (LB survivors pair off)
 *     - Even LB rounds (R2, R4, R6…) = Injection (LB survivors vs WB losers)
 *   Grand Final: 1 match
 *
 * Play order (interleaved):
 *   WB R1 → WB R2 → LB R1 → LB R2 → WB R3 → LB R3 → LB R4 → WB R4 → LB R5 → LB R6 → … → GF
 *   Pattern after the first 4 rounds: [WB Rk, LB R(2k-3), LB R(2k-2)] for k=3..m
 *
 * Losers routing:
 *   WB R1 losers → LB R1 (consolidation: they pair off)
 *   WB R(n≥2) losers → LB R(2n-2) slot B (injection round)
 *
 * BYE handling:
 *   Top seeds skip WB R1. BYEs produce NO losers → LB R1 is smaller.
 *   WB R1 has (size/2 - byeCount) actual matches.
 *   LB R1 has ceil(wbR1Losers/2) matches (wbR1Losers pair off).
 *   If wbR1Losers is odd, one gets a LB R1 BYE.
 */
function generateDoubleElim(
  teams: Team[],
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number,
  gfReset = false
): GeneratedMatch[] {
  const sorted = [...teams];
  const size = nextPowerOf2(sorted.length);
  const upperRounds = Math.log2(size); // m: e.g. 4 for size=16
  const seedOrder = bracketSeeding(size);
  const slots: (Team | null)[] = seedOrder.map((s) => sorted[s - 1] ?? null);

  const slotMin = gameDurationMin + 5;
  const roundBreak = 10;
  const matches: GeneratedMatch[] = [];
  let baseTime = new Date(startAt);

  // Track which WB R1 positions are real matches vs BYEs
  const wbR1Real = new Map<number, GeneratedMatch>(); // pos → match

  // Helper: advance baseTime after a set of matches
  function advanceTime(matchCount: number) {
    if (matchCount > 0) {
      baseTime = addMinutes(baseTime, Math.ceil(matchCount / courtNames.length) * slotMin + roundBreak);
    }
  }

  // Helper: create matches for one round
  function createRound(
    side: "W" | "L" | "G",
    roundIndex: number,
    count: number,
    teamSlots?: Array<{ a: string | null; b: string | null }>,
  ): GeneratedMatch[] {
    const roundMatches: GeneratedMatch[] = [];
    let courtIdx = 0;
    for (let m = 0; m < count; m++) {
      const match: GeneratedMatch = {
        phase: "BRACKET",
        bracketSide: side,
        roundIndex,
        positionInRound: m,
        courtName: courtNames[courtIdx % courtNames.length],
        startAt: addMinutes(baseTime, Math.floor(courtIdx / courtNames.length) * slotMin),
        dayIndex: "SUN",
        status: "SCHEDULED",
        teamAId: teamSlots?.[m]?.a ?? null,
        teamBId: teamSlots?.[m]?.b ?? null,
      };
      courtIdx++;
      roundMatches.push(match);
      matches.push(match);
    }
    return roundMatches;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WB R1 — skip BYE matches, advance BYE teams to WB R2
  // ═══════════════════════════════════════════════════════════════════════
  const wbR1Slots: Array<{ a: string | null; b: string | null }> = [];
  const wbR1Positions: number[] = []; // actual positions of real matches
  const byeAdvances = new Map<number, string>(); // WB R2 pos → teamId from BYE

  const r1Count = size / 2;
  for (let m = 0; m < r1Count; m++) {
    const a = slots[m * 2]?.id ?? null;
    const b = slots[m * 2 + 1]?.id ?? null;
    if (a && b) {
      wbR1Slots.push({ a, b });
      wbR1Positions.push(m);
    } else {
      // BYE: advance the real team to WB R2
      const advancing = a ?? b;
      if (advancing) {
        const r2Pos = Math.floor(m / 2);
        byeAdvances.set(r2Pos * 10 + (m % 2), advancing); // encode pos+slot
      }
    }
  }

  // Create WB R1 matches with correct positionInRound
  let courtIdx = 0;
  const wbR1Matches: GeneratedMatch[] = [];
  for (let i = 0; i < wbR1Slots.length; i++) {
    const match: GeneratedMatch = {
      phase: "BRACKET",
      bracketSide: "W",
      roundIndex: 1,
      positionInRound: wbR1Positions[i],
      courtName: courtNames[courtIdx % courtNames.length],
      startAt: addMinutes(baseTime, Math.floor(courtIdx / courtNames.length) * slotMin),
      dayIndex: "SUN",
      status: "SCHEDULED",
      teamAId: wbR1Slots[i].a,
      teamBId: wbR1Slots[i].b,
    };
    courtIdx++;
    wbR1Matches.push(match);
    matches.push(match);
    wbR1Real.set(wbR1Positions[i], match);
  }
  advanceTime(wbR1Matches.length);

  // ═══════════════════════════════════════════════════════════════════════
  // WB R2 — pre-fill BYE advances
  // ═══════════════════════════════════════════════════════════════════════
  const r2Count = size / 4;
  const wbR2Slots: Array<{ a: string | null; b: string | null }> = [];
  for (let m = 0; m < r2Count; m++) {
    let a: string | null = null;
    let b: string | null = null;
    // Check if WB R1 at pos m*2 was a BYE → feed slot A
    const byeA = byeAdvances.get(m * 10 + 0);
    if (byeA) a = byeA;
    // Check if WB R1 at pos m*2+1 was a BYE → feed slot B
    const byeB = byeAdvances.get(m * 10 + 1);
    if (byeB) b = byeB;
    wbR2Slots.push({ a, b });
  }
  const wbR2Matches = createRound("W", 2, r2Count, wbR2Slots);
  advanceTime(wbR2Matches.length);

  // ═══════════════════════════════════════════════════════════════════════
  // LB R1 (Consolidation) — WB R1 losers pair off
  // ═══════════════════════════════════════════════════════════════════════
  const wbR1LoserCount = wbR1Matches.length; // only real matches produce losers
  const lbR1Count = Math.floor(wbR1LoserCount / 2);
  const lbR1Matches = createRound("L", 1, lbR1Count);
  advanceTime(lbR1Matches.length);

  // ═══════════════════════════════════════════════════════════════════════
  // LB R2 (Injection) — LB R1 survivors vs WB R2 losers
  // ═══════════════════════════════════════════════════════════════════════
  // LB R2 size = same as LB R1 survivors count (= lbR1Count)
  // BUT if wbR1LoserCount was odd, there's one extra LB survivor (BYE in LB R1)
  const lbR1Survivors = lbR1Count + (wbR1LoserCount % 2); // +1 if odd loser got LB BYE
  // WB R2 produces r2Count losers. LB R2 matches = max of the two.
  // In standard brackets, lbR1Survivors should equal wbR2Losers count.
  // For uneven cases, take the max to accommodate all teams.
  const lbR2Count = Math.max(lbR1Survivors, r2Count);
  const lbR2Matches = createRound("L", 2, lbR2Count);
  advanceTime(lbR2Matches.length);

  // ═══════════════════════════════════════════════════════════════════════
  // Remaining rounds: WB R3..Rm interleaved with LB R3..R(2m-2)
  // Pattern: WB Rk → LB R(2k-3) consolidation → LB R(2k-2) injection
  // ═══════════════════════════════════════════════════════════════════════
  const allWbRounds: GeneratedMatch[][] = [wbR1Matches, wbR2Matches];
  const allLbRounds: GeneratedMatch[][] = [lbR1Matches, lbR2Matches];

  // Track LB survivors count for sizing
  let lbSurvivors = lbR2Count; // after LB R2

  for (let k = 3; k <= upperRounds; k++) {
    // WB Rk
    const wbCount = size / Math.pow(2, k);
    const wbMatches = createRound("W", k, wbCount);
    allWbRounds.push(wbMatches);
    advanceTime(wbMatches.length);

    // LB R(2k-3) — Consolidation: LB survivors pair off
    const lbConsCount = Math.floor(lbSurvivors / 2);
    const lbConsRound = 2 * k - 3;
    const lbConsMatches = createRound("L", lbConsRound, lbConsCount);
    allLbRounds.push(lbConsMatches);
    advanceTime(lbConsMatches.length);

    // LB R(2k-2) — Injection: LB cons survivors vs WB Rk losers
    const lbInjCount = lbConsCount; // same count: each cons winner meets one WB loser
    const lbInjRound = 2 * k - 2;
    const lbInjMatches = createRound("L", lbInjRound, lbInjCount);
    allLbRounds.push(lbInjMatches);
    advanceTime(lbInjMatches.length);

    lbSurvivors = lbInjCount; // after injection round
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Grand Final (GF1)
  // ═══════════════════════════════════════════════════════════════════════
  createRound("G", 1, 1);
  advanceTime(1);

  // GF Reset (GF2) — only played if LB winner beats WB winner in GF1
  if (gfReset) {
    createRound("G", 2, 1);
  }

  return matches;
}

