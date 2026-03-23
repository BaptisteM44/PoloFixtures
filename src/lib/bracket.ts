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
  const seedOrder = bracketSeeding(size);
  const slots: (Team | null)[] = seedOrder.map((s) => sorted[s - 1] ?? null);

  const slotMin = gameDurationMin + 5;
  const matches: GeneratedMatch[] = [];

  let baseTime = new Date(startAt);

  // ── Upper R1 — skip BYE matches ──────────────────────────────────────────
  const upper1: Map<number, GeneratedMatch> = new Map();
  let courtIdx = 0;

  for (let m = 0; m < size / 2; m++) {
    const a = slots[m * 2]?.id ?? null;
    const b = slots[m * 2 + 1]?.id ?? null;

    // Skip BYE matches
    if (!a || !b) continue;

    const match: GeneratedMatch = {
      phase: "BRACKET", bracketSide: "W", roundIndex: 1, positionInRound: m,
      courtName: courtNames[courtIdx % courtNames.length],
      startAt: addMinutes(baseTime, Math.floor(courtIdx / courtNames.length) * slotMin),
      dayIndex: "SUN", status: "SCHEDULED",
      teamAId: a, teamBId: b,
    };
    courtIdx++;
    upper1.set(m, match);
    matches.push(match);
  }

  baseTime = addMinutes(baseTime, Math.ceil(Math.max(1, upper1.size) / courtNames.length) * slotMin + 10);

  // ── Upper R2 + Lower R1 ─────────────────────────────────────────────────
  const upper2: GeneratedMatch[] = [];
  const lower1: GeneratedMatch[] = [];
  courtIdx = 0;

  for (let m = 0; m < size / 4; m++) {
    const r1posA = m * 2; // Upper R1 match feeding slot A
    const r1posB = m * 2 + 1; // Upper R1 match feeding slot B

    const u2: GeneratedMatch = {
      phase: "BRACKET", bracketSide: "W", roundIndex: 2, positionInRound: m,
      courtName: courtNames[courtIdx % courtNames.length],
      startAt: addMinutes(baseTime, Math.floor(courtIdx / courtNames.length) * slotMin),
      dayIndex: "SUN", status: "SCHEDULED",
      teamAId: null, teamBId: null,
    };

    // Place BYE advances: if R1 match was skipped, place the real team directly
    if (!upper1.has(r1posA)) {
      u2.teamAId = slots[r1posA * 2]?.id ?? slots[r1posA * 2 + 1]?.id ?? null;
    }
    if (!upper1.has(r1posB)) {
      u2.teamBId = slots[r1posB * 2]?.id ?? slots[r1posB * 2 + 1]?.id ?? null;
    }

    courtIdx++;
    upper2.push(u2);

    // Lower R1: receives losers from Upper R1
    // If both feeder Upper R1 matches were BYEs, skip this Lower R1 match
    const feederA = upper1.has(r1posA);
    const feederB = upper1.has(r1posB);

    if (!feederA && !feederB) continue;

    const l1: GeneratedMatch = {
      phase: "BRACKET", bracketSide: "L", roundIndex: 1, positionInRound: m,
      courtName: courtNames[courtIdx % courtNames.length],
      startAt: addMinutes(baseTime, Math.floor(courtIdx / courtNames.length) * slotMin),
      dayIndex: "SUN", status: "SCHEDULED",
      teamAId: null, teamBId: null,
    };
    courtIdx++;
    lower1.push(l1);
  }
  matches.push(...upper2, ...lower1);

  baseTime = addMinutes(baseTime, Math.ceil(Math.max(1, courtIdx) / courtNames.length) * slotMin + 10);

  // ── Upper Final + Lower R2 ──────────────────────────────────────────────
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

