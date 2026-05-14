import { describe, it, expect } from "vitest";
import {
  generateGrazPools,
  generateGrazRRMatches,
  assignRegroupTeamIds,
  generateRegroupMatches,
  selectSETeams,
  generateGrazSE,
  pairKey,
  buildPlayedPairs,
} from "./graz";
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

// ─── pairKey ─────────────────────────────────────────────────────────────────

describe("pairKey", () => {
  it("returns same key regardless of order", () => {
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"));
  });

  it("produces canonical a:b format", () => {
    expect(pairKey("t1", "t2")).toBe("t1:t2");
    expect(pairKey("t2", "t1")).toBe("t1:t2");
  });
});

// ─── buildPlayedPairs ────────────────────────────────────────────────────────

describe("buildPlayedPairs", () => {
  it("builds set from matches", () => {
    const matches = [
      { teamAId: "t1", teamBId: "t2" },
      { teamAId: "t3", teamBId: "t1" },
    ];
    const pairs = buildPlayedPairs(matches);
    expect(pairs.size).toBe(2);
    expect(pairs.has(pairKey("t1", "t2"))).toBe(true);
    expect(pairs.has(pairKey("t1", "t3"))).toBe(true);
  });

  it("skips matches with null teams", () => {
    const matches = [
      { teamAId: "t1", teamBId: null },
      { teamAId: null, teamBId: "t2" },
    ];
    const pairs = buildPlayedPairs(matches);
    expect(pairs.size).toBe(0);
  });
});

// ─── generateGrazPools ──────────────────────────────────────────────────────

describe("generateGrazPools", () => {
  it("splits 16 teams into 2 pools of 8", () => {
    const teams = makeTeams(16);
    const pools = generateGrazPools(teams);
    expect(pools).toHaveLength(2);
    expect(pools[0].teams).toHaveLength(8);
    expect(pools[1].teams).toHaveLength(8);
  });

  it("uses snake draft for balanced seeding", () => {
    const teams = makeTeams(16);
    const pools = generateGrazPools(teams);
    // Seed 1 in Pool A, Seed 2 in Pool B (first round)
    expect(pools[0].teams[0].seed).toBe(1);
    expect(pools[1].teams[0].seed).toBe(2);
  });

  it("all teams are assigned to exactly one pool", () => {
    const teams = makeTeams(16);
    const pools = generateGrazPools(teams);
    const allIds = pools.flatMap((p) => p.teams.map((t) => t.id));
    expect(new Set(allIds).size).toBe(16);
  });

  it("handles 12 teams (6 per pool)", () => {
    const teams = makeTeams(12);
    const pools = generateGrazPools(teams);
    expect(pools[0].teams).toHaveLength(6);
    expect(pools[1].teams).toHaveLength(6);
  });

  it("handles odd total by uneven split", () => {
    const teams = makeTeams(15);
    const pools = generateGrazPools(teams);
    const total = pools[0].teams.length + pools[1].teams.length;
    expect(total).toBe(15);
  });
});

// ─── generateGrazRRMatches ──────────────────────────────────────────────────

describe("generateGrazRRMatches", () => {
  const courts = ["Court 1"];
  const day1 = new Date("2026-06-01T09:00:00Z");
  const day2 = new Date("2026-06-02T09:00:00Z");
  const duration = 15;

  it("generates correct number of RR matches for 2 pools of 8", () => {
    const teams = makeTeams(16);
    const pools = generateGrazPools(teams);
    const matches = generateGrazRRMatches(pools, courts, day1, day2, duration);
    // Each pool of 8: C(8,2) = 28 matches. Total = 56
    expect(matches).toHaveLength(56);
  });

  it("every team plays 7 matches (pool of 8)", () => {
    const teams = makeTeams(16);
    const pools = generateGrazPools(teams);
    const matches = generateGrazRRMatches(pools, courts, day1, day2, duration);

    const counts = new Map<string, number>();
    for (const m of matches) {
      counts.set(m.teamAId!, (counts.get(m.teamAId!) ?? 0) + 1);
      counts.set(m.teamBId!, (counts.get(m.teamBId!) ?? 0) + 1);
    }
    for (const [, count] of counts) {
      expect(count).toBe(7);
    }
  });

  it("splits matches between day 1 and day 2", () => {
    const teams = makeTeams(16);
    const pools = generateGrazPools(teams);
    const matches = generateGrazRRMatches(pools, courts, day1, day2, duration);

    const day1Matches = matches.filter((m) => m.dayIndex === "SAT");
    const day2Matches = matches.filter((m) => m.dayIndex === "SUN");
    expect(day1Matches.length).toBeGreaterThan(0);
    expect(day2Matches.length).toBeGreaterThan(0);
  });

  it("day 1 has 5 rounds per pool by default", () => {
    const teams = makeTeams(16);
    const pools = generateGrazPools(teams);
    const matches = generateGrazRRMatches(pools, courts, day1, day2, duration);

    const day1Matches = matches.filter((m) => m.dayIndex === "SAT");
    // 5 rounds × 4 matches per round × 2 pools = 40
    expect(day1Matches).toHaveLength(40);
  });

  it("all matches have phase GRAZ_RR", () => {
    const teams = makeTeams(16);
    const pools = generateGrazPools(teams);
    const matches = generateGrazRRMatches(pools, courts, day1, day2, duration);
    expect(matches.every((m) => m.phase === "GRAZ_RR")).toBe(true);
  });

  it("no duplicate pairings", () => {
    const teams = makeTeams(16);
    const pools = generateGrazPools(teams);
    const matches = generateGrazRRMatches(pools, courts, day1, day2, duration);
    const pairs = new Set<string>();
    for (const m of matches) {
      const key = pairKey(m.teamAId!, m.teamBId!);
      expect(pairs.has(key)).toBe(false);
      pairs.add(key);
    }
  });
});

// ─── assignRegroupTeamIds ───────────────────────────────────────────────────

describe("assignRegroupTeamIds", () => {
  it("creates 4 groups for 8-per-pool", () => {
    const poolA = makeStandings(["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]);
    const poolB = makeStandings(["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"]);
    const groups = assignRegroupTeamIds(poolA, poolB);

    expect(groups).toHaveLength(4);
    expect(groups[0].name).toBe("Top");
    expect(groups[1].name).toBe("Mid 1");
    expect(groups[2].name).toBe("Mid 2");
    expect(groups[3].name).toBe("Bottom");
  });

  it("Top group has A1,A2,B1,B2", () => {
    const poolA = makeStandings(["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]);
    const poolB = makeStandings(["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"]);
    const groups = assignRegroupTeamIds(poolA, poolB);

    expect(groups[0].teamIds).toEqual(["a1", "a2", "b1", "b2"]);
  });

  it("Mid 1 has A3,A5,B4,B6", () => {
    const poolA = makeStandings(["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]);
    const poolB = makeStandings(["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"]);
    const groups = assignRegroupTeamIds(poolA, poolB);

    expect(groups[1].teamIds).toEqual(["a3", "a5", "b4", "b6"]);
  });

  it("Mid 2 has A4,A6,B3,B5", () => {
    const poolA = makeStandings(["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]);
    const poolB = makeStandings(["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"]);
    const groups = assignRegroupTeamIds(poolA, poolB);

    expect(groups[2].teamIds).toEqual(["a4", "a6", "b3", "b5"]);
  });

  it("Bottom has A7,A8,B7,B8", () => {
    const poolA = makeStandings(["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]);
    const poolB = makeStandings(["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"]);
    const groups = assignRegroupTeamIds(poolA, poolB);

    expect(groups[3].teamIds).toEqual(["a7", "a8", "b7", "b8"]);
  });

  it("all 16 teams are assigned to exactly one group", () => {
    const poolA = makeStandings(["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]);
    const poolB = makeStandings(["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"]);
    const groups = assignRegroupTeamIds(poolA, poolB);

    const allIds = groups.flatMap((g) => g.teamIds);
    expect(new Set(allIds).size).toBe(16);
  });

  it("each group has exactly 4 teams", () => {
    const poolA = makeStandings(["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]);
    const poolB = makeStandings(["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"]);
    const groups = assignRegroupTeamIds(poolA, poolB);

    for (const group of groups) {
      expect(group.teamIds).toHaveLength(4);
    }
  });

  it("handles 6-per-pool (3 groups)", () => {
    const poolA = makeStandings(["a1", "a2", "a3", "a4", "a5", "a6"]);
    const poolB = makeStandings(["b1", "b2", "b3", "b4", "b5", "b6"]);
    const groups = assignRegroupTeamIds(poolA, poolB);

    expect(groups).toHaveLength(3);
  });

  it("handles small pools (4 per pool → 2 groups)", () => {
    const poolA = makeStandings(["a1", "a2", "a3", "a4"]);
    const poolB = makeStandings(["b1", "b2", "b3", "b4"]);
    const groups = assignRegroupTeamIds(poolA, poolB);

    expect(groups).toHaveLength(2);
  });
});

// ─── generateRegroupMatches ─────────────────────────────────────────────────

describe("generateRegroupMatches", () => {
  it("skips already-played pairs", () => {
    const groups = [
      { name: "Top", teamIds: ["a1", "a2", "b1", "b2"] },
    ];
    // a1 vs a2 already played in pool A, b1 vs b2 already played in pool B
    const played = new Set([pairKey("a1", "a2"), pairKey("b1", "b2")]);
    const courts = ["Court 1"];
    const start = new Date("2026-06-02T11:00:00Z");

    const matches = generateRegroupMatches(groups, played, courts, start, 15);

    // C(4,2)=6 total pairs - 2 already played = 4 new matches
    expect(matches).toHaveLength(4);
  });

  it("generates all pairs when none are played", () => {
    const groups = [
      { name: "Top", teamIds: ["a1", "a2", "b1", "b2"] },
    ];
    const played = new Set<string>();
    const courts = ["Court 1"];
    const start = new Date("2026-06-02T11:00:00Z");

    const matches = generateRegroupMatches(groups, played, courts, start, 15);
    // C(4,2) = 6
    expect(matches).toHaveLength(6);
  });

  it("each team plays only against new opponents", () => {
    const groups = [
      { name: "Top", teamIds: ["a1", "a2", "b1", "b2"] },
    ];
    const played = new Set([pairKey("a1", "a2"), pairKey("b1", "b2")]);
    const courts = ["Court 1"];
    const start = new Date("2026-06-02T11:00:00Z");

    const matches = generateRegroupMatches(groups, played, courts, start, 15);

    for (const m of matches) {
      const key = pairKey(m.teamAId!, m.teamBId!);
      expect(played.has(key)).toBe(false);
    }
  });

  it("all matches have phase GRAZ_REGROUP", () => {
    const groups = [
      { name: "Mid 1", teamIds: ["a3", "a5", "b4", "b6"] },
    ];
    const played = new Set([pairKey("a3", "a5"), pairKey("b4", "b6")]);
    const courts = ["Court 1"];
    const start = new Date("2026-06-02T11:00:00Z");

    const matches = generateRegroupMatches(groups, played, courts, start, 15);
    expect(matches.every((m) => m.phase === "GRAZ_REGROUP")).toBe(true);
  });

  it("handles multiple groups", () => {
    const groups = [
      { name: "Top", teamIds: ["a1", "a2", "b1", "b2"] },
      { name: "Bottom", teamIds: ["a7", "a8", "b7", "b8"] },
    ];
    const played = new Set([
      pairKey("a1", "a2"), pairKey("b1", "b2"),
      pairKey("a7", "a8"), pairKey("b7", "b8"),
    ]);
    const courts = ["Court 1"];
    const start = new Date("2026-06-02T11:00:00Z");

    const matches = generateRegroupMatches(groups, played, courts, start, 15);
    // 4 new matches per group × 2 groups = 8
    expect(matches).toHaveLength(8);
  });
});

// ─── selectSETeams ──────────────────────────────────────────────────────────

describe("selectSETeams", () => {
  it("selects 8 teams: 4 from Top + 2 from Mid1 + 2 from Mid2", () => {
    const standings = new Map<string, StandingRow[]>();
    standings.set("Top", makeStandings(["t1", "t2", "t3", "t4"]));
    standings.set("Mid 1", makeStandings(["m1a", "m1b", "m1c", "m1d"]));
    standings.set("Mid 2", makeStandings(["m2a", "m2b", "m2c", "m2d"]));

    const selected = selectSETeams(standings);
    expect(selected).toHaveLength(8);
    expect(selected).toEqual(["t1", "t2", "t3", "t4", "m1a", "m1b", "m2a", "m2b"]);
  });

  it("handles missing groups gracefully", () => {
    const standings = new Map<string, StandingRow[]>();
    standings.set("Top", makeStandings(["t1", "t2", "t3", "t4"]));

    const selected = selectSETeams(standings);
    expect(selected).toHaveLength(4); // only Top group
  });
});

// ─── generateGrazSE ─────────────────────────────────────────────────────────

describe("generateGrazSE", () => {
  const courts = ["Court 1"];
  const start = new Date("2026-06-02T14:00:00Z");
  const duration = 15;

  it("generates 7 matches for 8 teams (QF + SF + F)", () => {
    const teamIds = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];
    const matches = generateGrazSE(teamIds, courts, start, duration);
    expect(matches).toHaveLength(7);
  });

  it("has 4 QF, 2 SF, 1 Final", () => {
    const teamIds = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];
    const matches = generateGrazSE(teamIds, courts, start, duration);

    const r1 = matches.filter((m) => m.roundIndex === 1);
    const r2 = matches.filter((m) => m.roundIndex === 2);
    const r3 = matches.filter((m) => m.roundIndex === 3);
    expect(r1).toHaveLength(4);
    expect(r2).toHaveLength(2);
    expect(r3).toHaveLength(1);
  });

  it("final has bracketSide G", () => {
    const teamIds = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];
    const matches = generateGrazSE(teamIds, courts, start, duration);

    const final = matches.find((m) => m.bracketSide === "G");
    expect(final).toBeDefined();
    expect(final!.roundIndex).toBe(3);
  });

  it("all matches have phase GRAZ_SE", () => {
    const teamIds = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];
    const matches = generateGrazSE(teamIds, courts, start, duration);
    expect(matches.every((m) => m.phase === "GRAZ_SE")).toBe(true);
  });

  it("QF matches have all 8 teams assigned", () => {
    const teamIds = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];
    const matches = generateGrazSE(teamIds, courts, start, duration);

    const qf = matches.filter((m) => m.roundIndex === 1);
    const teamsInQF = new Set<string>();
    for (const m of qf) {
      if (m.teamAId) teamsInQF.add(m.teamAId);
      if (m.teamBId) teamsInQF.add(m.teamBId);
    }
    expect(teamsInQF.size).toBe(8);
  });

  it("SF and Final have null teams (TBD)", () => {
    const teamIds = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];
    const matches = generateGrazSE(teamIds, courts, start, duration);

    const sf = matches.filter((m) => m.roundIndex === 2);
    for (const m of sf) {
      expect(m.teamAId).toBeNull();
      expect(m.teamBId).toBeNull();
    }
  });

  it("handles 4 teams (SF + F only)", () => {
    const teamIds = ["t1", "t2", "t3", "t4"];
    const matches = generateGrazSE(teamIds, courts, start, duration);
    expect(matches).toHaveLength(3); // 2 SF + 1 F
  });
});

// ─── Full flow ──────────────────────────────────────────────────────────────

describe("Full Graz flow — 16 teams", () => {
  const teams = makeTeams(16);
  const courts = ["Court 1"];
  const day1 = new Date("2026-06-01T09:00:00Z");
  const day2 = new Date("2026-06-02T09:00:00Z");
  const duration = 15;

  it("Phase 1: pools + RR produce 56 matches, 7 per team", () => {
    const pools = generateGrazPools(teams);
    const matches = generateGrazRRMatches(pools, courts, day1, day2, duration);

    expect(matches).toHaveLength(56);

    const counts = new Map<string, number>();
    for (const m of matches) {
      counts.set(m.teamAId!, (counts.get(m.teamAId!) ?? 0) + 1);
      counts.set(m.teamBId!, (counts.get(m.teamBId!) ?? 0) + 1);
    }
    for (const [, c] of counts) expect(c).toBe(7);
  });

  it("Phase 2: regroup skips intra-pool pairs → 2 new matches per team", () => {
    const pools = generateGrazPools(teams);
    const rrMatches = generateGrazRRMatches(pools, courts, day1, day2, duration);
    const played = buildPlayedPairs(rrMatches);

    const poolA = makeStandings(pools[0].teams.map((t) => t.id));
    const poolB = makeStandings(pools[1].teams.map((t) => t.id));
    const groups = assignRegroupTeamIds(poolA, poolB);

    const regroupMatches = generateRegroupMatches(
      groups, played, courts, new Date("2026-06-02T11:00:00Z"), duration
    );

    // Each group of 4: 2 from pool A + 2 from pool B
    // Already played: 1 pair per original pool = 2 pairs
    // New matches: C(4,2) - 2 = 4 per group × 4 groups = 16
    expect(regroupMatches).toHaveLength(16);

    // Each team plays exactly 2 new matches
    const counts = new Map<string, number>();
    for (const m of regroupMatches) {
      counts.set(m.teamAId!, (counts.get(m.teamAId!) ?? 0) + 1);
      counts.set(m.teamBId!, (counts.get(m.teamBId!) ?? 0) + 1);
    }
    for (const [, c] of counts) expect(c).toBe(2);
  });

  it("Phase 3: SE bracket with 8 qualified teams → 7 matches", () => {
    const teamIds = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];
    const seMatches = generateGrazSE(teamIds, courts, new Date("2026-06-02T14:00:00Z"), duration);
    expect(seMatches).toHaveLength(7);
  });

  it("Total: 9 matches per team (7 RR + 2 regroup) + SE for qualifiers", () => {
    const pools = generateGrazPools(teams);
    const rrMatches = generateGrazRRMatches(pools, courts, day1, day2, duration);
    const played = buildPlayedPairs(rrMatches);

    const poolA = makeStandings(pools[0].teams.map((t) => t.id));
    const poolB = makeStandings(pools[1].teams.map((t) => t.id));
    const groups = assignRegroupTeamIds(poolA, poolB);
    const regroupMatches = generateRegroupMatches(
      groups, played, courts, new Date("2026-06-02T11:00:00Z"), duration
    );

    const counts = new Map<string, number>();
    for (const m of [...rrMatches, ...regroupMatches]) {
      counts.set(m.teamAId!, (counts.get(m.teamAId!) ?? 0) + 1);
      counts.set(m.teamBId!, (counts.get(m.teamBId!) ?? 0) + 1);
    }
    for (const [, c] of counts) expect(c).toBe(9);
  });

  it("every team plays 9 different opponents", () => {
    const pools = generateGrazPools(teams);
    const rrMatches = generateGrazRRMatches(pools, courts, day1, day2, duration);
    const played = buildPlayedPairs(rrMatches);

    const poolA = makeStandings(pools[0].teams.map((t) => t.id));
    const poolB = makeStandings(pools[1].teams.map((t) => t.id));
    const groups = assignRegroupTeamIds(poolA, poolB);
    const regroupMatches = generateRegroupMatches(
      groups, played, courts, new Date("2026-06-02T11:00:00Z"), duration
    );

    const opponents = new Map<string, Set<string>>();
    for (const m of [...rrMatches, ...regroupMatches]) {
      if (!opponents.has(m.teamAId!)) opponents.set(m.teamAId!, new Set());
      if (!opponents.has(m.teamBId!)) opponents.set(m.teamBId!, new Set());
      opponents.get(m.teamAId!)!.add(m.teamBId!);
      opponents.get(m.teamBId!)!.add(m.teamAId!);
    }
    for (const [, opps] of opponents) expect(opps.size).toBe(9);
  });
});
