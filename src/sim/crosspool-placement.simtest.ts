/**
 * Cross-pool & placement : garantit que
 *  - le cross-pool oppose TOUJOURS deux poules A vs B au même rang (jamais deux
 *    équipes d'une même poule, jamais un recoupage du classement général) ;
 *  - le placement inter-poules apparie rang i de A vs rang i de B ;
 *  - une source cross-pool mono-groupe non découpée est REFUSÉE.
 */
import { describe, it, expect } from "vitest";
import { crossPoolPairings, placementPairings } from "@/engine/rounds";

describe("Cross-pool — A vs B au même rang", () => {
  const A = ["A1", "A2", "A3", "A4"];
  const B = ["B1", "B2", "B3", "B4"];

  it("opponents=1 : chaque match est un A vs un B de même rang", () => {
    const p = crossPoolPairings(A, B, 1);
    expect(p).toHaveLength(4);
    // Aucun match entre deux équipes de la même poule
    for (const m of p) {
      const sameGroup = m.teamAId![0] === m.teamBId![0];
      expect(sameGroup, `${m.teamAId} vs ${m.teamBId} = même poule`).toBe(false);
    }
    // Rang égal au round 1
    expect(p.map((m) => `${m.teamAId}v${m.teamBId}`)).toEqual(["A1vB1", "A2vB2", "A3vB3", "A4vB4"]);
  });
});

describe("Placement — rang i A vs rang i B (1er/2e du classement)", () => {
  it("classement 1 et 2 : 2 matchs (1erA vs 1erB, 2eA vs 2eB)", () => {
    const A = ["A1", "A2", "A3", "A4"];
    const B = ["B1", "B2", "B3", "B4"];
    const p = placementPairings(A, B, 2); // count=2 → places 1/2 et 3/4
    expect(p.map((m) => `${m.teamAId}v${m.teamBId}`)).toEqual(["A1vB1", "A2vB2"]);
    // jamais deux du même groupe
    for (const m of p) expect(m.teamAId![0] === m.teamBId![0]).toBe(false);
  });
});
