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
  bracketSide?: "W" | "L" | "G" | "B" | "BG" | "BL" | "R1" | "LG" | "WL" | "LL" | null;
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
  gameDurationMin: number,
  options?: { mazzaSequential?: boolean }
): GeneratedMatch[] {
  const matches: GeneratedMatch[] = [];
  const slotMin = gameDurationMin + 5;

  if (options?.mazzaSequential && pools.length === 2) {
    // Mazza D'Oro sequential schedule (single court, 8 teams/pool = 7 rounds each):
    // Bloc 1: Pool A R1-R4
    // Bloc 2: Pool B R1-R3
    // Bloc 3: Pool B R4-R7
    // Bloc 4: Pool A R5-R7
    const [poolA, poolB] = pools;
    const roundsA = circleMethodRounds(poolA.teams);
    const roundsB = circleMethodRounds(poolB.teams);

    const courtFree = courtNames.map(() => new Date(startAt));

    const pushRounds = (pool: PoolSeed, poolIdx: number, rounds: [Team, Team][][], from: number, to: number) => {
      for (let r = from; r < to && r < rounds.length; r++) {
        for (const pair of rounds[r]) {
          let bestIdx = 0;
          for (let c = 1; c < courtNames.length; c++) {
            if (courtFree[c] < courtFree[bestIdx]) bestIdx = c;
          }
          matches.push({
            phase: "POOL",
            poolName: pool.name,
            poolSessionIndex: poolIdx,
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
    };

    // Bloc 1: Pool A R1-R4 (indices 0-3)
    pushRounds(poolA, 0, roundsA, 0, 4);
    // Bloc 2: Pool B R1-R3 (indices 0-2)
    pushRounds(poolB, 1, roundsB, 0, 3);
    // Bloc 3: Pool B R4-R7 (indices 3-6)
    pushRounds(poolB, 1, roundsB, 3, 7);
    // Bloc 4: Pool A R5-R7 (indices 4-6)
    pushRounds(poolA, 0, roundsA, 4, 7);

    return matches;
  }

  // Per-pool courts: each pool gets its own court timeline (separate sessions)
  const poolRounds = pools.map((pool, poolIdx) => ({
    poolIdx,
    pool,
    rounds: circleMethodRounds(pool.teams),
    courtFree: courtNames.map(() => new Date(startAt)), // Each pool starts at same time
  }));

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
  existingMatches: Array<{ teamAId: string | null; teamBId: string | null; courtName?: string | null }>,
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

  // Teams that already received a BYE in a previous round
  const hadBye = new Set<string>();
  for (const m of existingMatches) {
    if (m.teamAId && !m.teamBId) hadBye.add(m.teamAId);
  }

  // Count how many times each team has played on each court (for equitable distribution)
  const teamCourtCount = new Map<string, Map<string, number>>();
  for (const team of teams) {
    teamCourtCount.set(team.id, new Map(courtNames.map((c) => [c, 0])));
  }
  for (const m of existingMatches) {
    if (m.courtName && m.teamAId && m.teamBId) {
      teamCourtCount.get(m.teamAId)?.set(m.courtName, (teamCourtCount.get(m.teamAId)?.get(m.courtName) ?? 0) + 1);
      teamCourtCount.get(m.teamBId)?.set(m.courtName, (teamCourtCount.get(m.teamBId)?.get(m.courtName) ?? 0) + 1);
    }
  }

  // Sort teams by standings
  const byRank = new Map<string, number>();
  standings.forEach((row, i) => byRank.set(row.teamId, i));
  const sorted = [...teams].sort(
    (a, b) => (byRank.get(a.id) ?? 999) - (byRank.get(b.id) ?? 999)
  );

  // Greedy pairing — avoids rematches; falls back to rematch only if no fresh opponent exists
  const unpaired = [...sorted];
  const pairs: [Team, Team][] = [];
  while (unpaired.length >= 2) {
    const teamA = unpaired.shift()!;
    // Find best available opponent: prefer unplayed, then fall back to already-played
    let freshIdx = -1;
    let rematchIdx = 0; // fallback: first remaining (lowest extra distance from teamA)
    for (let i = 0; i < unpaired.length; i++) {
      if (!played.has(`${teamA.id}|${unpaired[i].id}`)) {
        freshIdx = i;
        break;
      }
    }
    pairs.push([teamA, unpaired.splice(freshIdx >= 0 ? freshIdx : rematchIdx, 1)[0]]);
  }

  // ── BYE constraint: prefer teams that have NOT yet had a BYE ────────────
  // If the leftover team already had a BYE, try to swap with a paired team that
  // hasn't had one yet, provided the swap doesn't create a new rematch.
  if (unpaired.length === 1 && hadBye.has(unpaired[0].id)) {
    // Scan pairs from the end (lowest-ranked first) to find a valid swap
    swapSearch: for (let pi = pairs.length - 1; pi >= 0; pi--) {
      const [teamA, teamB] = pairs[pi];
      // Try releasing teamB (lower-ranked of the pair) to take the BYE
      if (!hadBye.has(teamB.id) && !played.has(`${unpaired[0].id}|${teamA.id}`)) {
        pairs[pi] = [teamA, unpaired[0]];
        unpaired[0] = teamB;
        break swapSearch;
      }
      // Try releasing teamA
      if (!hadBye.has(teamA.id) && !played.has(`${unpaired[0].id}|${teamB.id}`)) {
        pairs[pi] = [unpaired[0], teamB];
        unpaired[0] = teamA;
        break swapSearch;
      }
    }
  }

  const courtFree: Date[] = courtNames.map(() => new Date(startAt));

  // Pre-assign courts so each court gets exactly floor(pairs/courts) or ceil matches.
  // Sort pairs by "which court is most needed" (equitable across rounds),
  // then assign court slots in strict round-robin order.
  const matchesPerCourt = Math.floor(pairs.length / courtNames.length);
  const extra = pairs.length % courtNames.length; // first `extra` courts get one more match

  // Build ordered court slot list: [C0, C1, C2, C0, C1, C2, ...] with exact counts
  const courtSlots: number[] = [];
  for (let c = 0; c < courtNames.length; c++) {
    const count = matchesPerCourt + (c < extra ? 1 : 0);
    for (let i = 0; i < count; i++) courtSlots.push(c);
  }

  // Sort pairs so that teams most "overdue" on a court get assigned to it first.
  // Score each pair for each court: lower = more needed on that court.
  const sortedPairs = [...pairs].map(([teamA, teamB], originalIdx) => {
    const courtScores = courtNames.map((name) =>
      (teamCourtCount.get(teamA.id)?.get(name) ?? 0) +
      (teamCourtCount.get(teamB.id)?.get(name) ?? 0)
    );
    return { teamA, teamB, courtScores, originalIdx };
  });

  // Assign: for each court slot (in order), find the pair that most needs that court
  const assigned: Array<{ teamA: Team; teamB: Team; courtIdx: number }> = [];
  const usedPairIdxs = new Set<number>();

  for (const courtIdx of courtSlots) {
    let bestPairIdx = -1;
    let bestScore = Infinity;
    for (let i = 0; i < sortedPairs.length; i++) {
      if (usedPairIdxs.has(i)) continue;
      const score = sortedPairs[i].courtScores[courtIdx];
      if (score < bestScore) {
        bestScore = score;
        bestPairIdx = i;
      }
    }
    usedPairIdxs.add(bestPairIdx);
    assigned.push({ teamA: sortedPairs[bestPairIdx].teamA, teamB: sortedPairs[bestPairIdx].teamB, courtIdx });
  }

  const realMatches: GeneratedMatch[] = assigned.map(({ teamA, teamB, courtIdx }) => {
    const slot = new Date(courtFree[courtIdx]);
    courtFree[courtIdx] = addMinutes(courtFree[courtIdx], slotMin);

    // Update local court count for subsequent assignments in this round
    teamCourtCount.get(teamA.id)?.set(courtNames[courtIdx], (teamCourtCount.get(teamA.id)?.get(courtNames[courtIdx]) ?? 0) + 1);
    teamCourtCount.get(teamB.id)?.set(courtNames[courtIdx], (teamCourtCount.get(teamB.id)?.get(courtNames[courtIdx]) ?? 0) + 1);

    return {
      phase: "SWISS" as MatchPhase,
      poolName: `Swiss R${roundIndex}`,
      bracketSide: null,
      roundIndex,
      courtName: courtNames[courtIdx],
      startAt: slot,
      dayIndex: day,
      status: "SCHEDULED" as MatchStatus,
      teamAId: teamA.id,
      teamBId: teamB.id,
    };
  });

  // Odd number of teams: the last unpaired team gets a BYE (free win, no match to play)
  if (unpaired.length === 1) {
    realMatches.push({
      phase: "SWISS" as MatchPhase,
      poolName: `Swiss R${roundIndex}`,
      bracketSide: null,
      roundIndex,
      courtName: courtNames[0],
      startAt,
      dayIndex: day,
      status: "FINISHED" as MatchStatus, // immediately done — no real game
      teamAId: unpaired[0].id,
      teamBId: null,
    });
  }

  return realMatches;
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
  const top10 = sorted.slice(0, 10);
  const bottom8 = sorted.slice(10, 18);

  // Generate both SEs with all courts and 3rd place match — courts will be reassigned below
  // Top 10: bracketSide "W" for normal, "G" for final, "L" for 3rd place
  const topMatchesRaw = generateSingleElim(top10, courtNames, startAt, gameDurationMin, true);
  const topMatches = topMatchesRaw.map((m) => ({
    ...m,
    // "L" (3rd place) and "G" (final) stay as-is; rest become "W"
    bracketSide: (m.bracketSide === "G" || m.bracketSide === "L") ? m.bracketSide : "W" as const,
  }));
  // Bottom 8: use B/BG/BL to distinguish from Top 10's W/G/L
  const bottomMatchesRaw = generateSingleElim(bottom8, courtNames, startAt, gameDurationMin, true);
  const bottomMatches = bottomMatchesRaw.map((m) => ({
    ...m,
    bracketSide: m.bracketSide === "G" ? "BG" as const : m.bracketSide === "L" ? "BL" as const : "B" as const,
  }));

  // Reassign courts globally by interleaving top + bottom matches per round,
  // guaranteeing equal court distribution. We process rounds in order and
  // assign courts in strict rotation across both brackets combined.
  const slotMin = gameDurationMin + 5;
  const roundBreak = gameDurationMin + 15;

  // Collect all matches grouped by round (same roundIndex = same stage)
  const maxRound = Math.max(...topMatches.map((m) => m.roundIndex), ...bottomMatches.map((m) => m.roundIndex));

  const result: GeneratedMatch[] = [];
  const courtUsed: number[] = new Array(courtNames.length).fill(0); // total per court across rounds

  for (let r = 1; r <= maxRound; r++) {
    const roundTop = topMatches.filter((m) => m.roundIndex === r);
    const roundBot = bottomMatches.filter((m) => m.roundIndex === r);
    // Interleave: Top, Bot, Top, Bot, ... so courts spread across both brackets
    const roundAll: GeneratedMatch[] = [];
    const maxLen = Math.max(roundTop.length, roundBot.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < roundTop.length) roundAll.push(roundTop[i]);
      if (i < roundBot.length) roundAll.push(roundBot[i]);
    }

    const roundStart = addMinutes(startAt, (r - 1) * roundBreak);
    const courtFree: Date[] = courtNames.map(() => new Date(roundStart));

    // Assign courts: prefer courts with fewest total uses (for cross-round equity)
    // then use availability as tiebreaker
    const roundCourtUsed = new Map<number, number>(courtNames.map((_, i) => [i, 0]));

    const assigned: GeneratedMatch[] = roundAll.map((m) => {
      // Find court with fewest total uses, tiebreak by earliest free
      let bestIdx = 0;
      let bestScore = Infinity;
      for (let c = 0; c < courtNames.length; c++) {
        const totalUses = courtUsed[c] + (roundCourtUsed.get(c) ?? 0);
        const timeOffset = courtFree[c].getTime() - roundStart.getTime();
        const score = totalUses * 100000 + timeOffset;
        if (score < bestScore) { bestScore = score; bestIdx = c; }
      }
      const slot = new Date(courtFree[bestIdx]);
      courtFree[bestIdx] = addMinutes(courtFree[bestIdx], slotMin);
      roundCourtUsed.set(bestIdx, (roundCourtUsed.get(bestIdx) ?? 0) + 1);

      return { ...m, courtName: courtNames[bestIdx], startAt: slot };
    });

    for (let c = 0; c < courtNames.length; c++) {
      courtUsed[c] += roundCourtUsed.get(c) ?? 0;
    }
    result.push(...assigned);
  }

  return result;
}

// ─── Mazza D'Oro Split SE (R1 → Winners + Losers) ────────────────────────────

/**
 * SPLIT_SE format: 16 teams
 * - R1: 8 matches (seeded 1v16, 2v15, ..., 8v9), bracketSide = "R1", roundIndex = 1
 * - Winners bracket: 3 rounds SE from R1 winners, bracketSide W/W/G, roundIndex 2/3/4
 * - Losers bracket: 3 rounds SE from R1 losers, bracketSide L/L/LG, roundIndex 2/3/4
 */
function generateMazzaSplitSE(
  teams: Team[],
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number
): GeneratedMatch[] {
  const slotMin = gameDurationMin + 5;
  const roundBreak = gameDurationMin + 15;
  const allMatches: GeneratedMatch[] = [];

  // Seed slots: 1v16, 2v15, ..., 8v9
  const n = 16;
  const sorted = [...teams].slice(0, n);
  // Pad with nulls if fewer than 16
  while (sorted.length < n) sorted.push(null as any);

  // ── R1: 8 matches ──
  const r1Start = new Date(startAt);
  for (let i = 0; i < 8; i++) {
    const a = sorted[i]?.id ?? null;
    const b = sorted[n - 1 - i]?.id ?? null;
    allMatches.push({
      phase: "BRACKET",
      bracketSide: "R1",
      roundIndex: 1,
      positionInRound: i,
      courtName: courtNames[i % courtNames.length],
      startAt: addMinutes(r1Start, Math.floor(i / courtNames.length) * slotMin),
      dayIndex: "SUN",
      status: "SCHEDULED",
      teamAId: a,
      teamBId: b,
    });
  }

  // ── Winners bracket: 3 rounds (QF=4, SF=2, F=1) ──
  // QF (round 2): 4 matches, bracketSide W
  // SF (round 3): 2 matches, bracketSide W
  // Final (round 4): 1 match, bracketSide G
  const wRounds = [
    { count: 4, side: "W" as const, round: 2 },
    { count: 2, side: "W" as const, round: 3 },
    { count: 1, side: "G" as const, round: 4 },
  ];
  for (const { count, side, round } of wRounds) {
    const rStart = addMinutes(startAt, (round - 1) * roundBreak);
    for (let i = 0; i < count; i++) {
      allMatches.push({
        phase: "BRACKET",
        bracketSide: side,
        roundIndex: round,
        positionInRound: i,
        courtName: courtNames[i % courtNames.length],
        startAt: addMinutes(rStart, Math.floor(i / courtNames.length) * slotMin),
        dayIndex: "SUN",
        status: "SCHEDULED",
        teamAId: null,
        teamBId: null,
      });
    }
  }

  // ── Losers bracket: 3 rounds (QF=4, SF=2, F=1) ──
  // QF (round 2): 4 matches, bracketSide L
  // SF (round 3): 2 matches, bracketSide L
  // Final (round 4): 1 match, bracketSide LG
  const lRounds = [
    { count: 4, side: "L" as const, round: 2 },
    { count: 2, side: "L" as const, round: 3 },
    { count: 1, side: "LG" as const, round: 4 },
  ];
  for (const { count, side, round } of lRounds) {
    const rStart = addMinutes(startAt, (round - 1) * roundBreak);
    for (let i = 0; i < count; i++) {
      allMatches.push({
        phase: "BRACKET",
        bracketSide: side,
        roundIndex: round,
        positionInRound: i,
        courtName: courtNames[i % courtNames.length],
        startAt: addMinutes(rStart, Math.floor(i / courtNames.length) * slotMin),
        dayIndex: "SUN",
        status: "SCHEDULED",
        teamAId: null,
        teamBId: null,
      });
    }
  }

  // ── 3rd place matches (round 5) ──
  // WL: losers of the 2 Winners SF matches
  // LL: losers of the 2 Losers SF matches
  const r5Start = addMinutes(startAt, 4 * roundBreak);
  for (const side of ["WL" as const, "LL" as const]) {
    allMatches.push({
      phase: "BRACKET",
      bracketSide: side,
      roundIndex: 5,
      positionInRound: 0,
      courtName: courtNames[0],
      startAt: r5Start,
      dayIndex: "SUN",
      status: "SCHEDULED",
      teamAId: null,
      teamBId: null,
    });
  }

  return allMatches;
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
  if (format === "SPLIT_SE") {
    return generateMazzaSplitSE(teams, courtNames, startAt, gameDurationMin);
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
 * Double Elimination bracket.
 *
 * Rules:
 *   1. WB = standard single-elim with BYEs for top seeds.
 *   2. Every WB loser drops to LB. A LB loser is eliminated.
 *   3. LB alternates: odd rounds = consolidation, even rounds = injection.
 *      - LB R1 (odd): WB R1 losers pair off among themselves.
 *      - LB R2 (even): LB R1 survivors face WB R2 losers (injection).
 *      - LB R3 (odd): consolidation.
 *      - LB R4 (even): injection of WB R3 losers.
 *      - ... etc.
 *   4. When there's a mismatch between LB survivors and WB losers at an
 *      injection round, the excess teams get a BYE.
 *   5. GF: WB champion vs LB champion.
 *
 * Total matches = 2*N - 2 (without GF reset).
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
  const upperRounds = Math.log2(size);
  // Seeding linéaire : pos 0 = seed1 vs seed(size), pos 1 = seed2 vs seed(size-1), etc.
  // → seed 1 joue toujours contre seed 16 (ou dernier), seed 8 contre seed 9
  const slots: (Team | null)[] = Array.from({ length: size }, (_, i) => {
    const m = Math.floor(i / 2);
    return i % 2 === 0 ? (sorted[m] ?? null) : (sorted[size - 1 - m] ?? null);
  });

  const slotMin = gameDurationMin + 5;
  const roundBreak = 10;
  const matches: GeneratedMatch[] = [];
  let baseTime = new Date(startAt);

  function advanceTime(count: number) {
    if (count > 0) {
      baseTime = addMinutes(baseTime, Math.ceil(count / courtNames.length) * slotMin + roundBreak);
    }
  }

  function emitRound(
    side: "W" | "L" | "G" | "BG",
    roundIndex: number,
    count: number,
    preFilled?: Array<{ a: string | null; b: string | null }>
  ): GeneratedMatch[] {
    const out: GeneratedMatch[] = [];
    for (let m = 0; m < count; m++) {
      const slot = preFilled?.[m] ?? { a: null, b: null };
      const match: GeneratedMatch = {
        phase: "BRACKET",
        bracketSide: side,
        roundIndex,
        positionInRound: m,
        courtName: courtNames[m % courtNames.length],
        startAt: addMinutes(baseTime, Math.floor(m / courtNames.length) * slotMin),
        dayIndex: "SUN",
        status: "SCHEDULED",
        teamAId: slot.a,
        teamBId: slot.b,
      };
      out.push(match);
      matches.push(match);
    }
    return out;
  }

  // ── WB R1 ───────────────────────────────────────────────────────────
  const r1Count = size / 2;
  const byeAdvances = new Map<number, string>();
  const wbR1RealPositions: number[] = [];

  for (let m = 0; m < r1Count; m++) {
    const a = slots[m * 2]?.id ?? null;
    const b = slots[m * 2 + 1]?.id ?? null;
    if (a && b) {
      wbR1RealPositions.push(m);
    } else {
      const adv = a ?? b;
      if (adv) byeAdvances.set(Math.floor(m / 2) * 10 + (m % 2), adv);
    }
  }

  const w1 = wbR1RealPositions.length; // WB R1 real matches = WB R1 losers

  // Emit WB R1 real matches
  for (let ci = 0; ci < w1; ci++) {
    const pos = wbR1RealPositions[ci];
    const a = slots[pos * 2]?.id ?? null;
    const b = slots[pos * 2 + 1]?.id ?? null;
    const match: GeneratedMatch = {
      phase: "BRACKET", bracketSide: "W", roundIndex: 1,
      positionInRound: pos,
      courtName: courtNames[ci % courtNames.length],
      startAt: addMinutes(baseTime, Math.floor(ci / courtNames.length) * slotMin),
      dayIndex: "SUN", status: "SCHEDULED", teamAId: a, teamBId: b,
    };
    matches.push(match);
  }
  advanceTime(w1);

  // ── LB classification (needed before emitting any LB rounds) ────────
  // Challonge structure for LB R1 (per r2Pos branch):
  //   - 2 WB R1 losers → they consolidate in LB R1; WB R2 loser injects at LB R2
  //   - 1 WB R1 loser  → WB R1 loser vs WB R2 loser in LB R1 (both consumed)
  //   - 0 WB R1 losers → WB R2 loser BYEs directly to LB R2

  const w2 = size / 4;

  // Classify each r2Pos branch
  const r2PosWithR1Loser = new Map<number, number[]>(); // r2Pos → [r1Pos, ...]
  for (const pos of wbR1RealPositions) {
    const r2Pos = Math.floor(pos / 2);
    if (!r2PosWithR1Loser.has(r2Pos)) r2PosWithR1Loser.set(r2Pos, []);
    r2PosWithR1Loser.get(r2Pos)!.push(pos);
  }

  // For each r2Pos: how many WB R1 losers feed into it
  const lbR1ConsolidationR2Pos: number[] = []; // 2 WB R1 losers → consolidate; WB R2 loser enters LB R2
  const lbR1InjectionR2Pos: number[] = [];     // 1 WB R1 loser → faces WB R2 loser in LB R1
  const lbR1ByeR2Pos: number[] = [];           // 0 WB R1 losers → WB R2 loser BYEs to LB R2

  for (let r2Pos = 0; r2Pos < w2; r2Pos++) {
    const count = (r2PosWithR1Loser.get(r2Pos) ?? []).length;
    if (count >= 2) lbR1ConsolidationR2Pos.push(r2Pos);
    else if (count === 1) lbR1InjectionR2Pos.push(r2Pos);
    else lbR1ByeR2Pos.push(r2Pos);
  }

  const lbR1Count = lbR1ConsolidationR2Pos.length + lbR1InjectionR2Pos.length;
  const lbR2Teams = lbR1Count + lbR1ConsolidationR2Pos.length + lbR1ByeR2Pos.length;

  let lbSurvivors = 0;
  let lbRoundIdx = 1;

  // ── LB R1 (from WB R1 losers) — emitted right after WB R1 ───────────
  if (lbR1Count > 0) {
    emitRound("L", lbRoundIdx++, lbR1Count);
    advanceTime(lbR1Count);
  }

  // ── WB R2 ───────────────────────────────────────────────────────────
  const wbR2Pre: Array<{ a: string | null; b: string | null }> = [];
  for (let m = 0; m < w2; m++) {
    wbR2Pre.push({ a: byeAdvances.get(m * 10 + 0) ?? null, b: byeAdvances.get(m * 10 + 1) ?? null });
  }
  emitRound("W", 2, w2, wbR2Pre);
  advanceTime(w2);

  // ── LB R2 (injection of WB R2 losers) — emitted right after WB R2 ──
  const lbR2Count = Math.floor(lbR2Teams / 2);
  if (lbR2Count > 0) {
    emitRound("L", lbRoundIdx++, lbR2Count);
    advanceTime(lbR2Count);
  }
  lbSurvivors = lbR2Count + (lbR2Teams % 2);

  // ── WB R3+ with interleaved LB consolidation + injection ────────────
  // MTP Open pattern: consolidation FIRST (LB survivors pair up), THEN injection (WB losers enter)
  for (let k = 3; k <= upperRounds; k++) {
    const wbCount = size / Math.pow(2, k);

    // Consolidation: LB survivors from previous round pair up
    if (lbSurvivors > 1) {
      const consCount = Math.floor(lbSurvivors / 2);
      if (consCount > 0) {
        emitRound("L", lbRoundIdx++, consCount);
        advanceTime(consCount);
      }
      lbSurvivors = consCount + (lbSurvivors % 2);
    }

    // WB round k
    emitRound("W", k, wbCount);
    advanceTime(wbCount);

    // Injection: LB survivors face WB R(k) losers (with BYEs if uneven)
    const injCount = Math.min(lbSurvivors, wbCount);
    if (injCount > 0) {
      emitRound("L", lbRoundIdx++, injCount);
      advanceTime(injCount);
    }
    lbSurvivors = injCount + Math.abs(lbSurvivors - wbCount);
  }

  // Final consolidations if needed
  while (lbSurvivors > 1) {
    const consCount = Math.floor(lbSurvivors / 2);
    emitRound("L", lbRoundIdx++, consCount);
    advanceTime(consCount);
    lbSurvivors = consCount + (lbSurvivors % 2);
  }

  // Grand Final
  emitRound("G", 1, 1);
  advanceTime(1);
  if (gfReset) emitRound("BG", 2, 1);

  return matches;
}

