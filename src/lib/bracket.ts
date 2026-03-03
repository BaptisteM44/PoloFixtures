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

function nextPowerOf2(n: number): number {
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
  const sorted = [...teams].sort((a, b) => a.seed - b.seed);
  const size = nextPowerOf2(sorted.length);
  const totalRounds = Math.log2(size);
  const slotMin = gameDurationMin + 5;
  const roundBreak = gameDurationMin + 15;

  // Place seeds into bracket slots using Challonge-style seeding
  const seedOrder = bracketSeeding(size);
  const slots: (Team | null)[] = seedOrder.map((s) => sorted[s - 1] ?? null);

  const allMatches: GeneratedMatch[] = [];
  const matchGrid: GeneratedMatch[][] = [];

  for (let r = 0; r < totalRounds; r++) {
    const matchesInRound = size / Math.pow(2, r + 1);
    const roundStart = addMinutes(startAt, r * roundBreak);
    const roundMatches: GeneratedMatch[] = [];

    for (let m = 0; m < matchesInRound; m++) {
      const match: GeneratedMatch = {
        phase: "BRACKET",
        bracketSide: r === totalRounds - 1 ? "G" : "W",
        roundIndex: r + 1,
        positionInRound: m,
        courtName: courtNames[m % courtNames.length],
        startAt: addMinutes(roundStart, Math.floor(m / courtNames.length) * slotMin),
        dayIndex: "SUN",
        status: "SCHEDULED",
        teamAId: r === 0 ? (slots[m * 2]?.id ?? null) : null,
        teamBId: r === 0 ? (slots[m * 2 + 1]?.id ?? null) : null,
      };
      roundMatches.push(match);
      allMatches.push(match);
    }
    matchGrid.push(roundMatches);
  }

  // Propagate BYE auto-advances (slot == null means BYE → opponent advances)
  for (let m = 0; m < (matchGrid[0]?.length ?? 0); m++) {
    const match = matchGrid[0][m];
    if (match.teamAId && !match.teamBId && matchGrid[1]) {
      const next = matchGrid[1][Math.floor(m / 2)];
      if (m % 2 === 0) next.teamAId = match.teamAId;
      else next.teamBId = match.teamAId;
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
  const sorted = [...teams].sort((a, b) => a.seed - b.seed);
  const size = nextPowerOf2(sorted.length);
  const seedOrder = bracketSeeding(size);
  const slots: (Team | null)[] = seedOrder.map((s) => sorted[s - 1] ?? null);

  const slotMin = gameDurationMin + 5;
  const matches: GeneratedMatch[] = [];

  // Time helpers
  let baseTime = new Date(startAt);
  const slot = (round: GeneratedMatch[], idx: number) =>
    addMinutes(baseTime, Math.floor(idx / courtNames.length) * slotMin);

  // Upper R1
  const upper1: GeneratedMatch[] = [];
  for (let m = 0; m < size / 2; m++) {
    upper1.push({
      phase: "BRACKET", bracketSide: "W", roundIndex: 1, positionInRound: m,
      courtName: courtNames[m % courtNames.length],
      startAt: slot(upper1, m), dayIndex: "SUN", status: "SCHEDULED",
      teamAId: slots[m * 2]?.id ?? null, teamBId: slots[m * 2 + 1]?.id ?? null,
    });
  }
  matches.push(...upper1);

  baseTime = addMinutes(baseTime, Math.ceil((size / 2) / courtNames.length) * slotMin + 10);

  // Upper R2 + Lower R1 (run in parallel)
  const upper2: GeneratedMatch[] = [];
  const lower1: GeneratedMatch[] = [];
  for (let m = 0; m < size / 4; m++) {
    upper2.push({
      phase: "BRACKET", bracketSide: "W", roundIndex: 2, positionInRound: m,
      courtName: courtNames[(m * 2) % courtNames.length],
      startAt: slot(upper2, m * 2), dayIndex: "SUN", status: "SCHEDULED",
      teamAId: null, teamBId: null,
    });
    lower1.push({
      phase: "BRACKET", bracketSide: "L", roundIndex: 1, positionInRound: m,
      courtName: courtNames[(m * 2 + 1) % courtNames.length],
      startAt: slot(lower1, m * 2 + 1), dayIndex: "SUN", status: "SCHEDULED",
      teamAId: null, teamBId: null,
    });
  }
  matches.push(...upper2, ...lower1);

  baseTime = addMinutes(baseTime, Math.ceil((size / 2) / courtNames.length) * slotMin + 10);

  // Upper Final + Lower R2
  const upperFinal: GeneratedMatch = {
    phase: "BRACKET", bracketSide: "W", roundIndex: 3, positionInRound: 0,
    courtName: courtNames[0],
    startAt: new Date(baseTime), dayIndex: "SUN", status: "SCHEDULED",
    teamAId: null, teamBId: null,
  };
  const lower2: GeneratedMatch[] = [];
  for (let m = 0; m < size / 4; m++) {
    lower2.push({
      phase: "BRACKET", bracketSide: "L", roundIndex: 2, positionInRound: m,
      courtName: courtNames[(m + 1) % courtNames.length],
      startAt: addMinutes(baseTime, Math.floor(m / Math.max(1, courtNames.length - 1)) * slotMin),
      dayIndex: "SUN", status: "SCHEDULED",
      teamAId: null, teamBId: null,
    });
  }
  matches.push(upperFinal, ...lower2);

  baseTime = addMinutes(baseTime, Math.ceil(Math.max(1, size / 4) / courtNames.length) * slotMin + 15);

  // Lower Final
  const lowerFinal: GeneratedMatch = {
    phase: "BRACKET", bracketSide: "L", roundIndex: 3, positionInRound: 0,
    courtName: courtNames[courtNames.length > 1 ? 1 : 0],
    startAt: new Date(baseTime), dayIndex: "SUN", status: "SCHEDULED",
    teamAId: null, teamBId: null,
  };
  matches.push(lowerFinal);

  // Grand Final
  const grandFinal: GeneratedMatch = {
    phase: "BRACKET", bracketSide: "G", roundIndex: 4, positionInRound: 0,
    courtName: courtNames[0],
    startAt: addMinutes(baseTime, gameDurationMin + 20),
    dayIndex: "SUN", status: "SCHEDULED",
    teamAId: null, teamBId: null,
  };
  matches.push(grandFinal);

  return matches;
}

