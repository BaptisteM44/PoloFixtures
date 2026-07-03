import { describe, it, expect } from "vitest";
import {
  generateBigApplePools,
  generateBigApplePoolRounds,
  selectSwissTeamIds,
  generateBigApplePlacement,
  selectSESeeds,
  generateBigAppleSE,
  pairKey,
  buildPlayedPairs,
} from "./big-apple";
import type { StandingRow } from "./standings";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTeams(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i + 1}`,
    name: `Team ${i + 1}`,
    seed: i + 1,
    tournamentId: "tour1",
    createdAt: new Date(),
    updatedAt: new Date(),
    eliminated: false,
    droppedOut: false,
    checkedIn: true,
    player1Id: null,
    player2Id: null,
    player3Id: null,
    logo: null,
  })) as any[];
}

function makeStandings(teamIds: string[]): StandingRow[] {
  return teamIds.map((id, i) => ({
    teamId: id,
    name: `Team ${id}`,
    played: 7,
    wins: 7 - i,
    draws: 0,
    losses: i,
    goalsFor: 20 - i,
    goalsAgainst: i,
    goalDiff: 20 - 2 * i,
    points: (7 - i) * 3,
    buchholz: 0,
    sonnebornBerger: 0,
  }));
}

// ─── Phase 1: Pools ──────────────────────────────────────────────────────────

describe("Big Apple — pools", () => {
  it("splits 16 teams into 2 pools of 8", () => {
    const pools = generateBigApplePools(makeTeams(16));
    expect(pools).toHaveLength(2);
    expect(pools[0].teams).toHaveLength(8);
    expect(pools[1].teams).toHaveLength(8);
  });

  it("distributes seeds via snake draft (seed 1 and 2 in different pools)", () => {
    const pools = generateBigApplePools(makeTeams(16));
    const aIds = pools[0].teams.map((t) => t.seed);
    const bIds = pools[1].teams.map((t) => t.seed);
    expect(aIds).toContain(1);
    expect(bIds).toContain(2);
  });
});

// ─── Phase 1: RR rounds with court rotation ──────────────────────────────────

describe("Big Apple — RR rounds", () => {
  it("generates 7 rounds worth of matches for a pool of 8 (28 matches over rounds 1-7)", () => {
    const pools = generateBigApplePools(makeTeams(16));
    const matches = generateBigApplePoolRounds(
      pools[0],
      "Court 1",
      "Court 2",
      new Date("2026-06-06T09:00:00Z"),
      "SAT",
      15,
      1,
      7
    );
    // 8 teams RR = 7 rounds × 4 matches = 28 matches
    expect(matches).toHaveLength(28);
    expect(matches.every((m) => m.phase === "BIG_APPLE_RR")).toBe(true);
  });

  it("swaps court at mid-tournament (first half on primary, second on secondary)", () => {
    const pools = generateBigApplePools(makeTeams(16));
    const matches = generateBigApplePoolRounds(
      pools[0],
      "Court 1",
      "Court 2",
      new Date("2026-06-06T09:00:00Z"),
      "SAT",
      15,
      1,
      7
    );
    // 7 rounds → swapAt = ceil(7/2) = 4 → rounds 1-4 on Court 1, rounds 5-7 on Court 2
    const earlyRounds = matches.filter((m) => m.roundIndex <= 4);
    const lateRounds = matches.filter((m) => m.roundIndex >= 5);
    expect(earlyRounds.every((m) => m.courtName === "Court 1")).toBe(true);
    expect(lateRounds.every((m) => m.courtName === "Court 2")).toBe(true);
  });

  it("generates only the requested round range", () => {
    const pools = generateBigApplePools(makeTeams(16));
    const matches = generateBigApplePoolRounds(
      pools[0],
      "Court 1",
      "Court 2",
      new Date("2026-06-06T09:00:00Z"),
      "SAT",
      15,
      6,
      7
    );
    // rounds 6-7 only = 2 rounds × 4 matches = 8
    expect(matches).toHaveLength(8);
    expect(matches.every((m) => m.roundIndex === 6 || m.roundIndex === 7)).toBe(true);
  });
});

// ─── Phase 2: Sunday Swiss selection ─────────────────────────────────────────

describe("Big Apple — Swiss selection", () => {
  it("selects ranks 3-8 of each pool → 12 teams", () => {
    const a = makeStandings(["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]);
    const b = makeStandings(["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"]);
    const ids = selectSwissTeamIds(a, b);
    expect(ids).toHaveLength(12);
    expect(ids).not.toContain("a1");
    expect(ids).not.toContain("a2");
    expect(ids).not.toContain("b1");
    expect(ids).not.toContain("b2");
    expect(ids).toContain("a3");
    expect(ids).toContain("b8");
  });
});

// ─── Phase 3: Placement matches ──────────────────────────────────────────────

describe("Big Apple — placement matches", () => {
  it("pairs A1 vs B1 and A2 vs B2", () => {
    const a = makeStandings(["a1", "a2", "a3"]);
    const b = makeStandings(["b1", "b2", "b3"]);
    const matches = generateBigApplePlacement(a, b, ["Court 1", "Court 2"], new Date(), 15);
    expect(matches).toHaveLength(2);
    // Match 0 = seeds 1/2
    expect(matches[0].teamAId).toBe("a1");
    expect(matches[0].teamBId).toBe("b1");
    // Match 1 = seeds 3/4
    expect(matches[1].teamAId).toBe("a2");
    expect(matches[1].teamBId).toBe("b2");
  });
});

// ─── Phase 4: SE seeds + bracket ─────────────────────────────────────────────

describe("Big Apple — SE seeds", () => {
  it("builds 8 seeds from placement winners/losers + swiss top4", () => {
    const seeds = selectSESeeds(
      ["p1w", "p1l"],
      ["p2w", "p2l"],
      ["s1", "s2", "s3", "s4"]
    );
    expect(seeds).toEqual(["p1w", "p1l", "p2w", "p2l", "s1", "s2", "s3", "s4"]);
  });
});

describe("Big Apple — SE bracket", () => {
  const seeds = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"];

  it("generates 8 matches (4 QF, 2 SF, 3rd, Final)", () => {
    const matches = generateBigAppleSE(seeds, ["Court 1", "Court 2"], new Date(), 15);
    expect(matches).toHaveLength(8);
    expect(matches.filter((m) => m.roundIndex === 1)).toHaveLength(4);
    expect(matches.filter((m) => m.roundIndex === 2)).toHaveLength(2);
    expect(matches.filter((m) => m.roundIndex === 3)).toHaveLength(2);
  });

  it("uses standard balanced bracket seeding for QF (each pair sums to seed 9)", () => {
    const matches = generateBigAppleSE(seeds, ["Court 1"], new Date(), 15);
    const qf = matches.filter((m) => m.roundIndex === 1);
    const pairs = qf.map((m) => [m.teamAId, m.teamBId]);
    // bracketSeeding(8) = [1,8,4,5,2,7,3,6]
    expect(pairs).toEqual([
      ["S1", "S8"],
      ["S4", "S5"],
      ["S2", "S7"],
      ["S3", "S6"],
    ]);
    // every pairing separates a top seed from a bottom seed (seedA + seedB = 9)
    const seedNum = (s: string) => Number(s.replace("S", ""));
    for (const [a, b] of pairs) {
      expect(seedNum(a as string) + seedNum(b as string)).toBe(9);
    }
  });

  it("marks the 3rd-place match L and the final G", () => {
    const matches = generateBigAppleSE(seeds, ["Court 1"], new Date(), 15);
    const third = matches.find((m) => m.roundIndex === 3 && m.positionInRound === 0);
    const final = matches.find((m) => m.roundIndex === 3 && m.positionInRound === 1);
    expect(third?.bracketSide).toBe("L");
    expect(final?.bracketSide).toBe("G");
  });
});

// ─── Utilities ───────────────────────────────────────────────────────────────

describe("Big Apple — utilities", () => {
  it("pairKey is order-independent", () => {
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"));
  });

  it("buildPlayedPairs ignores byes", () => {
    const pairs = buildPlayedPairs([
      { teamAId: "a", teamBId: "b" },
      { teamAId: "c", teamBId: null },
    ]);
    expect(pairs.has(pairKey("a", "b"))).toBe(true);
    expect(pairs.size).toBe(1);
  });
});
