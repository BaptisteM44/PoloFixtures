import { describe, it, expect } from "vitest";
import { resolveEntries, type TransitionContext } from "./transitions";
import { pointsStandings, placementStandings, bracketStandings, type MatchLite } from "./stage-standings";
import { zonedToUtc, formatInTz, scheduleRounds, detectConflicts } from "./scheduler";

const ids = (n: number, p = "t") => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);

// ─── Transitions ─────────────────────────────────────────────────────────────

describe("resolveEntries", () => {
  const ctx: TransitionContext = {
    registrationSeeds: ids(16),
    stageStandings: (order, group) => {
      // stage 0 : groupe A = a1..a8 classés, groupe B = b1..b8 classés
      if (order === 0) return ids(8, group === "A" ? "a" : "b");
      // stage 1 (swiss) : s1..s12 classés
      return ids(12, "s");
    },
  };

  it("registration → seeds initiaux, mono-groupe", () => {
    const entries = resolveEntries({ sources: [{ kind: "registration" }] }, ctx);
    expect(entries).toHaveLength(16);
    expect(entries[0]).toEqual({ groupKey: "", slot: 1, teamId: "t1" });
  });

  it("Big Apple Swiss : rangs 3-8 de chaque groupe → 12 équipes", () => {
    const entries = resolveEntries({
      sources: [
        { kind: "stageRanks", stageOrder: 0, group: "A", from: 3, to: 8 },
        { kind: "stageRanks", stageOrder: 0, group: "B", from: 3, to: 8 },
      ],
    }, ctx);
    expect(entries).toHaveLength(12);
    expect(entries.map((e) => e.teamId)).toEqual(["a3","a4","a5","a6","a7","a8","b3","b4","b5","b6","b7","b8"]);
  });

  it("Split Swiss : rangs 1-8 de A et B entrelacés (A1,B1,A2,B2…)", () => {
    const entries = resolveEntries({
      sources: [
        { kind: "stageRanks", stageOrder: 0, group: "A", from: 1, to: 8 },
        { kind: "stageRanks", stageOrder: 0, group: "B", from: 1, to: 8 },
      ],
      interleaveSources: true,
    }, ctx);
    expect(entries.slice(0, 4).map((e) => e.teamId)).toEqual(["a1", "b1", "a2", "b2"]);
  });

  it("répartition snake en 2 groupes : 1→A, 2→B, 3→B, 4→A", () => {
    const entries = resolveEntries({
      sources: [{ kind: "registration" }],
      groups: 2,
      groupAssign: "snake",
    }, ctx);
    const groupOf = (id: string) => entries.find((e) => e.teamId === id)?.groupKey;
    expect(groupOf("t1")).toBe("A");
    expect(groupOf("t2")).toBe("B");
    expect(groupOf("t3")).toBe("B");
    expect(groupOf("t4")).toBe("A");
    expect(entries.filter((e) => e.groupKey === "A")).toHaveLength(8);
  });

  it("une équipe ne peut entrer qu'une fois (doublons filtrés)", () => {
    const entries = resolveEntries({
      sources: [
        { kind: "stageRanks", stageOrder: 1, from: 1, to: 4 },
        { kind: "stageRanks", stageOrder: 1, from: 1, to: 6 },
      ],
    }, ctx);
    expect(entries).toHaveLength(6); // s1..s6, pas s1..s4+s1..s6
  });
});

// ─── Classements par type d'étape ────────────────────────────────────────────

const finished = (teamAId: string, teamBId: string, scoreA: number, scoreB: number, extra: Partial<MatchLite> = {}): MatchLite => ({
  roundIndex: 1, positionInRound: 0, status: "FINISHED",
  teamAId, teamBId, scoreA, scoreB,
  winnerTeamId: scoreA > scoreB ? teamAId : scoreB > scoreA ? teamBId : null,
  ...extra,
});

describe("pointsStandings", () => {
  it("classe par points puis diff", () => {
    const ranked = pointsStandings(ids(3), [
      finished("t1", "t2", 5, 1),
      finished("t2", "t3", 3, 2),
      finished("t1", "t3", 2, 3),
    ]);
    // t1: 3pts (+3), t2: 3pts (-3), t3: 3pts (0) → diff : t1 > t3 > t2
    expect(ranked).toEqual(["t1", "t3", "t2"]);
  });

  it("confrontation directe en dernier départage", () => {
    const ranked = pointsStandings(["x", "y"], [finished("x", "y", 2, 3)]);
    expect(ranked).toEqual(["y", "x"]);
  });
});

describe("placementStandings", () => {
  it("vainqueur m0, perdant m0, vainqueur m1, perdant m1", () => {
    const ranked = placementStandings([
      finished("a1", "b1", 4, 2, { positionInRound: 0 }),
      finished("a2", "b2", 1, 3, { positionInRound: 1 }),
    ]);
    expect(ranked).toEqual(["a1", "b1", "b2", "a2"]);
  });
});

describe("bracketStandings", () => {
  it("SE : champion, finaliste, 3e, 4e puis éliminés par round", () => {
    const ranked = bracketStandings([
      finished("t1", "t4", 3, 1, { bracketSide: "W", roundIndex: 2, positionInRound: 0 }), // demi 1
      finished("t2", "t3", 3, 2, { bracketSide: "W", roundIndex: 2, positionInRound: 1 }), // demi 2
      finished("t4", "t3", 5, 4, { bracketSide: "L", roundIndex: 3 }),  // 3e place
      finished("t1", "t2", 2, 1, { bracketSide: "G", roundIndex: 3 }),  // finale
      finished("t1", "t8", 3, 0, { bracketSide: "W", roundIndex: 1, positionInRound: 0 }), // quarts…
      finished("t4", "t5", 3, 1, { bracketSide: "W", roundIndex: 1, positionInRound: 1 }),
      finished("t2", "t7", 3, 1, { bracketSide: "W", roundIndex: 1, positionInRound: 2 }),
      finished("t3", "t6", 3, 1, { bracketSide: "W", roundIndex: 1, positionInRound: 3 }),
    ]);
    expect(ranked.slice(0, 4)).toEqual(["t1", "t2", "t4", "t3"]);
    expect(ranked).toHaveLength(8);
  });

  it("DE : le reset joué (BG) prime sur la GF", () => {
    const ranked = bracketStandings([
      finished("w", "l", 2, 3, { bracketSide: "G", roundIndex: 1 }),  // LB gagne la GF
      finished("w", "l", 1, 4, { bracketSide: "BG", roundIndex: 2 }), // reset : LB confirme
    ]);
    expect(ranked.slice(0, 2)).toEqual(["l", "w"]);
  });
});

// ─── Fuseau + planning ───────────────────────────────────────────────────────

describe("zonedToUtc / formatInTz", () => {
  it("9h à Bruxelles en été = 7h UTC", () => {
    const d = zonedToUtc("2026-08-01", "09:00", "Europe/Brussels");
    expect(d.toISOString()).toBe("2026-08-01T07:00:00.000Z");
    expect(formatInTz(d, "Europe/Brussels")).toBe("09:00");
  });

  it("9h à Bruxelles en hiver = 8h UTC (DST)", () => {
    const d = zonedToUtc("2026-01-15", "09:00", "Europe/Brussels");
    expect(d.toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });

  it("9h à New York ≠ 9h à Bruxelles", () => {
    const ny = zonedToUtc("2026-08-01", "09:00", "America/New_York");
    expect(ny.toISOString()).toBe("2026-08-01T13:00:00.000Z");
    expect(formatInTz(ny, "America/New_York")).toBe("09:00");
  });
});

describe("scheduleRounds", () => {
  it("2 terrains, round de 4 matchs : 2 vagues, puis round suivant", () => {
    const start = new Date("2026-08-01T07:00:00Z");
    const [r1, r2] = scheduleRounds([4, 2], { courtNames: ["C1", "C2"], slotMinutes: 20, startAt: start });
    expect(r1[0]).toEqual({ courtName: "C1", startAt: start });
    expect(r1[1].courtName).toBe("C2");
    expect(r1[2].startAt.getTime()).toBe(start.getTime() + 20 * 60_000);
    // round 2 après les 2 vagues du round 1
    expect(r2[0].startAt.getTime()).toBe(start.getTime() + 40 * 60_000);
  });
});

describe("detectConflicts", () => {
  it("détecte équipe sur 2 matchs simultanés et terrain surbooké", () => {
    const at = new Date("2026-08-01T07:00:00Z");
    const problems = detectConflicts([
      { id: "m1", teamAId: "x", teamBId: "y", courtName: "C1", startAt: at },
      { id: "m2", teamAId: "x", teamBId: "z", courtName: "C2", startAt: at },
      { id: "m3", teamAId: "u", teamBId: "v", courtName: "C1", startAt: at },
    ], 20);
    expect(problems.some((p) => p.includes("Équipe x"))).toBe(true);
    expect(problems.some((p) => p.includes("surbooké"))).toBe(true);
  });

  it("pas de faux positif quand tout est espacé", () => {
    const problems = detectConflicts([
      { id: "m1", teamAId: "x", teamBId: "y", courtName: "C1", startAt: new Date("2026-08-01T07:00:00Z") },
      { id: "m2", teamAId: "x", teamBId: "z", courtName: "C1", startAt: new Date("2026-08-01T07:20:00Z") },
    ], 20);
    expect(problems).toHaveLength(0);
  });
});
