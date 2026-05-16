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
  bracketSide?: "W" | "L" | "G" | "B" | "BG" | "BL" | null;
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

  return assigned.map(({ teamA, teamB, courtIdx }) => {
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
  // Only generate matches where two participants exist.
  // Unpaired loser (odd count) gets an implicit BYE → still a survivor.
  // ═══════════════════════════════════════════════════════════════════════
  const wbR1LoserCount = wbR1Matches.length;
  const lbR1Count = Math.floor(wbR1LoserCount / 2);
  const lbR1Matches = lbR1Count > 0 ? createRound("L", 1, lbR1Count) : [];
  if (lbR1Count > 0) advanceTime(lbR1Count);

  // LB R1 survivors: lbR1Count winners + 1 BYE if wbR1LoserCount is odd
  let lbSurvivors = lbR1Count + (wbR1LoserCount % 2);

  // ═══════════════════════════════════════════════════════════════════════
  // LB R2 (Injection) — LB R1 survivors vs WB R2 losers
  // Only generate min(lbSurvivors, r2Count) real matches.
  // Extra WB R2 losers (r2Count - lbSurvivors) advance via BYE to LB R3.
  // Extra LB survivors (lbSurvivors - r2Count) advance via BYE to LB R3.
  // ═══════════════════════════════════════════════════════════════════════
  const lbR2Count = Math.min(lbSurvivors, r2Count);
  const lbR2Matches = lbR2Count > 0 ? createRound("L", 2, lbR2Count) : [];
  if (lbR2Count > 0) advanceTime(lbR2Count);

  // LB R2 survivors: lbR2Count winners + BYEs from both sides
  lbSurvivors = lbR2Count + Math.abs(r2Count - lbSurvivors);

  // ═══════════════════════════════════════════════════════════════════════
  // Remaining rounds: WB R3..Rm interleaved with LB R3..R(2m-2)
  // We track lbSurvivors precisely to only generate necessary matches.
  // ═══════════════════════════════════════════════════════════════════════
  const allWbRounds: GeneratedMatch[][] = [wbR1Matches, wbR2Matches];
  const allLbRounds: GeneratedMatch[][] = [...(lbR1Count > 0 ? [lbR1Matches] : []), ...(lbR2Count > 0 ? [lbR2Matches] : [])];

  for (let k = 3; k <= upperRounds; k++) {
    const wbCount = size / Math.pow(2, k);
    const wbMatches = createRound("W", k, wbCount);
    allWbRounds.push(wbMatches);
    advanceTime(wbMatches.length);

    // LB R(2k-3) — Consolidation: pair off lbSurvivors
    // floor(lbSurvivors / 2) real matches; odd survivor gets BYE
    const lbConsCount = Math.floor(lbSurvivors / 2);
    const lbConsRound = 2 * k - 3;
    const lbConsMatches = lbConsCount > 0 ? createRound("L", lbConsRound, lbConsCount) : [];
    if (lbConsCount > 0) {
      allLbRounds.push(lbConsMatches);
      advanceTime(lbConsCount);
    }
    // Survivors after consolidation = winners + BYE
    const consSurvivors = lbConsCount + (lbSurvivors % 2);

    // LB R(2k-2) — Injection: consSurvivors vs wbCount WB losers
    // Only generate min(consSurvivors, wbCount) real matches.
    // Surplus from either side advance via BYE.
    const lbInjCount = Math.min(consSurvivors, wbCount);
    const lbInjRound = 2 * k - 2;
    const lbInjMatches = lbInjCount > 0 ? createRound("L", lbInjRound, lbInjCount) : [];
    if (lbInjCount > 0) {
      allLbRounds.push(lbInjMatches);
      advanceTime(lbInjCount);
    }

    // Survivors after injection = winners + BYEs from both sides
    lbSurvivors = lbInjCount + Math.abs(wbCount - consSurvivors);
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

