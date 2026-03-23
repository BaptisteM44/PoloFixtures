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

export function generatePools(teams: Team[], saturdayFormat: SaturdayFormat): PoolSeed[] {
  if (saturdayFormat === "SWISS") return []; // Swiss uses rounds, not fixed pools

  const poolCount = teams.length <= 6 ? 1 : 2;
  const pools: PoolSeed[] = [];
  for (let i = 0; i < poolCount; i++) {
    pools.push({
      name: `Pool ${String.fromCharCode(65 + i)}`,
      session: saturdayFormat === "SPLIT_POOLS" ? (i === 0 ? "MORNING" : "AFTERNOON") : null,
      teams: [],
    });
  }
  [...teams]
    .sort((a, b) => a.seed - b.seed)
    .forEach((team, idx) => pools[idx % poolCount].teams.push(team));

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

  // Per-court "next available" timestamp
  const courtFree: Date[] = courtNames.map(() => new Date(startAt));

  const poolRounds = pools.map((pool) => ({
    pool,
    rounds: circleMethodRounds(pool.teams),
  }));

  const maxRounds = Math.max(...poolRounds.map((pr) => pr.rounds.length), 0);

  for (let r = 0; r < maxRounds; r++) {
    // Collect this round's matches from ALL pools (interleaved scheduling)
    const roundBatch: Array<{ pool: PoolSeed; pair: [Team, Team] }> = [];
    for (const { pool, rounds } of poolRounds) {
      if (rounds[r]) {
        for (const pair of rounds[r]) roundBatch.push({ pool, pair });
      }
    }

    // Greedy: assign each match to the court that becomes free earliest
    for (const { pool, pair } of roundBatch) {
      let bestIdx = 0;
      for (let c = 1; c < courtNames.length; c++) {
        if (courtFree[c] < courtFree[bestIdx]) bestIdx = c;
      }
      matches.push({
        phase: "POOL",
        poolName: pool.name,
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

// ─── Bracket ──────────────────────────────────────────────────────────────────

export function generateBracket(
  teams: Team[],
  format: SundayFormat,
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number
): GeneratedMatch[] {
  if (format === "DE" && teams.length >= 4) {
    return generateDoubleElim(teams, courtNames, startAt, gameDurationMin);
  }
  return generateSingleElim(teams, courtNames, startAt, gameDurationMin);
}

function generateSingleElim(
  teams: Team[],
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number
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

  return allMatches;
}

function generateDoubleElim(
  teams: Team[],
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number
): GeneratedMatch[] {
  const sorted = [...teams];
  const size = nextPowerOf2(sorted.length);
  const upperRounds = Math.log2(size); // e.g. 4 for size=16
  const seedOrder = bracketSeeding(size);
  const slots: (Team | null)[] = seedOrder.map((s) => sorted[s - 1] ?? null);

  const slotMin = gameDurationMin + 5;
  const roundBreak = 10;
  const matches: GeneratedMatch[] = [];
  let baseTime = new Date(startAt);

  // upperGrid[r][pos] = match (sparse — BYEs skipped)
  const upperGrid: Map<number, GeneratedMatch>[] = [];

  // ── Upper Bracket — all rounds ─────────────────────────────────────────
  for (let r = 0; r < upperRounds; r++) {
    const matchesInRound = size / Math.pow(2, r + 1);
    const roundMap = new Map<number, GeneratedMatch>();
    let courtIdx = 0;

    for (let m = 0; m < matchesInRound; m++) {
      let teamAId: string | null = null;
      let teamBId: string | null = null;

      if (r === 0) {
        const a = slots[m * 2]?.id ?? null;
        const b = slots[m * 2 + 1]?.id ?? null;
        // Skip BYE matches in R1
        if (!a || !b) continue;
        teamAId = a;
        teamBId = b;
      } else {
        // Place BYE advances from previous round
        const prevMap = upperGrid[r - 1];
        const prevMatchesInRound = size / Math.pow(2, r);
        const posA = m * 2;
        const posB = m * 2 + 1;
        if (r === 1) {
          // BYE advance from R1: use slot data
          if (!prevMap?.has(posA)) {
            teamAId = slots[posA * 2]?.id ?? slots[posA * 2 + 1]?.id ?? null;
          }
          if (!prevMap?.has(posB)) {
            teamBId = slots[posB * 2]?.id ?? slots[posB * 2 + 1]?.id ?? null;
          }
        }
        // For r >= 2 the teams come from previous match winners (set at runtime)
        // Only pre-populate if both slots in prev round were missing (both BYE-advanced)
        void prevMatchesInRound; // used for documentation only
      }

      const match: GeneratedMatch = {
        phase: "BRACKET",
        bracketSide: r === upperRounds - 1 ? "G" : "W",
        roundIndex: r + 1,
        positionInRound: m,
        courtName: courtNames[courtIdx % courtNames.length],
        startAt: addMinutes(baseTime, Math.floor(courtIdx / courtNames.length) * slotMin),
        dayIndex: "SUN", status: "SCHEDULED",
        teamAId, teamBId,
      };
      courtIdx++;
      roundMap.set(m, match);
      matches.push(match);
    }

    upperGrid.push(roundMap);

    const roundMatchCount = roundMap.size;
    baseTime = addMinutes(baseTime, Math.ceil(Math.max(1, roundMatchCount) / courtNames.length) * slotMin + roundBreak);
  }

  // ── Lower Bracket — 2*(upperRounds-1) rounds ──────────────────────────
  // Lower R(2k-1): receives losers from Upper R(k), plays them off
  // Lower R(2k):   survivors play against losers from Upper R(k+1)
  // Total lower rounds = 2*(upperRounds-1), then Lower Final
  const lowerRounds = 2 * (upperRounds - 1);
  const lowerGrid: Map<number, GeneratedMatch>[] = [];

  for (let lr = 0; lr < lowerRounds; lr++) {
    // Number of matches in this lower round
    // Lower bracket starts with size/4 matches and halves every 2 rounds
    const lowerSize = (size / 4) / Math.pow(2, Math.floor(lr / 2));
    const roundMap = new Map<number, GeneratedMatch>();
    let courtIdx = 0;

    for (let m = 0; m < lowerSize; m++) {
      // On odd lower rounds (lr=0,2,4...), check if this match has any feeders
      // lr=0 (Lower R1): fed by losers from Upper R1
      // Skip if both feeding Upper R1 matches were BYEs (no losers)
      if (lr === 0) {
        const upperR1Map = upperGrid[0];
        // Each Lower R1 match at pos m is fed by Upper R1 matches at pos m*2 and m*2+1
        const feederA = upperR1Map?.has(m * 2);
        const feederB = upperR1Map?.has(m * 2 + 1);
        if (!feederA && !feederB) continue;
      }

      const match: GeneratedMatch = {
        phase: "BRACKET", bracketSide: "L",
        roundIndex: lr + 1,
        positionInRound: m,
        courtName: courtNames[courtIdx % courtNames.length],
        startAt: addMinutes(baseTime, Math.floor(courtIdx / courtNames.length) * slotMin),
        dayIndex: "SUN", status: "SCHEDULED",
        teamAId: null, teamBId: null,
      };
      courtIdx++;
      roundMap.set(m, match);
      matches.push(match);
    }

    lowerGrid.push(roundMap);

    const roundMatchCount = roundMap.size;
    baseTime = addMinutes(baseTime, Math.ceil(Math.max(1, roundMatchCount) / courtNames.length) * slotMin + roundBreak);
  }

  // ── Lower Final ────────────────────────────────────────────────────────
  const lowerFinal: GeneratedMatch = {
    phase: "BRACKET", bracketSide: "L",
    roundIndex: lowerRounds + 1,
    positionInRound: 0,
    courtName: courtNames[0],
    startAt: new Date(baseTime), dayIndex: "SUN", status: "SCHEDULED",
    teamAId: null, teamBId: null,
  };
  matches.push(lowerFinal);
  baseTime = addMinutes(baseTime, slotMin + roundBreak);

  // ── Grand Final ────────────────────────────────────────────────────────
  const grandFinal: GeneratedMatch = {
    phase: "BRACKET", bracketSide: "G",
    roundIndex: lowerRounds + 2,
    positionInRound: 0,
    courtName: courtNames[0],
    startAt: new Date(baseTime), dayIndex: "SUN", status: "SCHEDULED",
    teamAId: null, teamBId: null,
  };
  matches.push(grandFinal);

  return matches;
}

