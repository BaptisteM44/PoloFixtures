import { describe, it, expect } from "vitest";
import { rrRounds, swissPairings, crossPoolPairings, placementPairings, pairKey } from "./rounds";
import { planSE } from "./se";

const ids = (n: number, prefix = "t") => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

// ─── Round Robin ─────────────────────────────────────────────────────────────

describe("rrRounds", () => {
  for (const n of [3, 4, 5, 6, 7, 8, 10, 16]) {
    it(`n=${n} : chaque équipe joue chaque autre exactement une fois`, () => {
      const pairings = rrRounds([{ key: "", teamIds: ids(n) }]);
      const real = pairings.filter((p) => p.teamBId !== null);
      expect(real).toHaveLength((n * (n - 1)) / 2);

      const seen = new Set<string>();
      for (const p of real) {
        const key = pairKey(p.teamAId, p.teamBId!);
        expect(seen.has(key), `paire ${key} en double`).toBe(false);
        seen.add(key);
      }
    });

    it(`n=${n} : une équipe joue au plus une fois par round`, () => {
      const pairings = rrRounds([{ key: "", teamIds: ids(n) }]);
      const byRound = new Map<number, string[]>();
      for (const p of pairings) {
        const arr = byRound.get(p.roundIndex) ?? [];
        arr.push(p.teamAId);
        if (p.teamBId) arr.push(p.teamBId);
        byRound.set(p.roundIndex, arr);
      }
      for (const [round, teams] of byRound) {
        expect(new Set(teams).size, `round ${round}`).toBe(teams.length);
      }
    });
  }

  it("aller-retour : chaque paire jouée deux fois", () => {
    const pairings = rrRounds([{ key: "", teamIds: ids(4) }], { doubleRound: true });
    const real = pairings.filter((p) => p.teamBId !== null);
    expect(real).toHaveLength(12); // 6 paires × 2
  });

  it("maxRounds : RR partiel", () => {
    const pairings = rrRounds([{ key: "", teamIds: ids(8) }], { maxRounds: 5 });
    expect(Math.max(...pairings.map((p) => p.roundIndex))).toBe(5);
  });

  it("multi-groupes : groupes indépendants", () => {
    const pairings = rrRounds([
      { key: "A", teamIds: ids(4, "a") },
      { key: "B", teamIds: ids(4, "b") },
    ]);
    expect(pairings.filter((p) => p.groupKey === "A")).toHaveLength(6);
    expect(pairings.filter((p) => p.groupKey === "B")).toHaveLength(6);
    // jamais de match inter-groupes
    for (const p of pairings) {
      if (p.teamBId) expect(p.teamAId[0]).toBe(p.teamBId[0]);
    }
  });
});

// ─── Swiss ───────────────────────────────────────────────────────────────────

describe("swissPairings", () => {
  it("apparie par proximité de classement sans rematch", () => {
    const played = new Set([pairKey("t1", "t2")]);
    const pairs = swissPairings(ids(4), played, new Set(), 2);
    // t1 ne peut pas rejouer t2 → t1 vs t3
    expect(pairs[0]).toMatchObject({ teamAId: "t1", teamBId: "t3" });
    expect(pairs[1]).toMatchObject({ teamAId: "t2", teamBId: "t4" });
  });

  it("impair : BYE à la moins bien classée sans BYE préalable", () => {
    const pairs = swissPairings(ids(5), new Set(), new Set(), 1);
    const bye = pairs.find((p) => p.teamBId === null);
    expect(bye?.teamAId).toBe("t5");
  });

  it("le BYE tourne (pas deux fois la même équipe)", () => {
    const pairs = swissPairings(ids(5), new Set(), new Set(["t5"]), 2);
    const bye = pairs.find((p) => p.teamBId === null);
    expect(bye?.teamAId).toBe("t4");
  });

  it("simulation 5 rounds × 16 équipes : jamais de rematch", () => {
    const teams = ids(16);
    const played = new Set<string>();
    const hadBye = new Set<string>();
    for (let r = 1; r <= 5; r++) {
      const pairs = swissPairings(teams, played, hadBye, r);
      for (const p of pairs) {
        if (!p.teamBId) { hadBye.add(p.teamAId); continue; }
        const key = pairKey(p.teamAId, p.teamBId);
        expect(played.has(key), `rematch ${key} au round ${r}`).toBe(false);
        played.add(key);
      }
    }
  });
});

// ─── Cross-pool ──────────────────────────────────────────────────────────────

describe("crossPoolPairings", () => {
  it("2 adversaires : chaque équipe de A rencontre 2 équipes de B, par rang décalé", () => {
    const pairs = crossPoolPairings(ids(4, "a"), ids(4, "b"), 2);
    expect(pairs).toHaveLength(8);
    // round 1 : a1vb1, a2vb2… ; round 2 : a1vb2, a2vb3…
    expect(pairs[0]).toMatchObject({ roundIndex: 1, teamAId: "a1", teamBId: "b1" });
    expect(pairs[4]).toMatchObject({ roundIndex: 2, teamAId: "a1", teamBId: "b2" });
  });

  it("jamais deux fois le même adversaire", () => {
    const pairs = crossPoolPairings(ids(6, "a"), ids(6, "b"), 3);
    const seen = new Set<string>();
    for (const p of pairs) {
      const key = pairKey(p.teamAId, p.teamBId!);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

// ─── Placement ───────────────────────────────────────────────────────────────

describe("placementPairings", () => {
  it("1erA vs 1erB, 2eA vs 2eB", () => {
    const pairs = placementPairings(ids(8, "a"), ids(8, "b"), 2);
    expect(pairs).toEqual([
      { roundIndex: 1, positionInRound: 0, groupKey: "", teamAId: "a1", teamBId: "b1" },
      { roundIndex: 1, positionInRound: 1, groupKey: "", teamAId: "a2", teamBId: "b2" },
    ]);
  });
});

// ─── SE ──────────────────────────────────────────────────────────────────────

describe("planSE", () => {
  for (let n = 2; n <= 32; n++) {
    it(`n=${n} : n-1 matchs (+1 si 3e place), liens complets`, () => {
      const withThird = n >= 4;
      const plan = planSE(n, { thirdPlace: withThird });
      const expected = n - 1 + (withThird && n >= 4 ? 1 : 0);
      expect(plan.matches).toHaveLength(expected);

      // Une seule finale G, sans winTo
      const finals = plan.matches.filter((m) => m.side === "G");
      expect(finals).toHaveLength(1);
      expect(finals[0].winTo).toBeUndefined();

      // Chaque seed 1..n placé exactement une fois
      const placed = plan.matches.flatMap((m) => [m.seedA, m.seedB]).filter((s): s is number => s !== null);
      expect([...placed].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    });
  }

  it("simulation complète n=16 avec 3e place : tout se remplit", () => {
    const plan = planSE(16, { thirdPlace: true });
    const slots = new Map(plan.matches.map((m) => [m.key, { A: m.seedA, B: m.seedB }]));
    for (const m of plan.matches) {
      const s = slots.get(m.key)!;
      expect(s.A, `${m.key} slot A vide`).not.toBeNull();
      expect(s.B, `${m.key} slot B vide`).not.toBeNull();
      const winner = s.A!; // le meilleur seed gagne toujours
      const loser = s.B!;
      if (m.winTo) slots.get(m.winTo.key)![m.winTo.slot] = Math.min(winner, loser);
      if (m.loseTo) slots.get(m.loseTo.key)![m.loseTo.slot] = Math.max(winner, loser);
    }
  });

  it("seeding : la finale théorique est 1 vs 2 (les seeds se croisent le plus tard possible)", () => {
    const plan = planSE(16);
    const semis = plan.matches.filter((m) => m.roundIndex === 3 && m.side === "W");
    expect(semis).toHaveLength(2);
  });
});
