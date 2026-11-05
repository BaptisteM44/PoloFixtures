import { describe, expect, it } from "vitest";
import { buildTriplets, getTier, isAbcLevel, nextTeamName, tierMix } from "./abc-draw";

const p = (id: string, level: string) => ({ id, level });

describe("getTier", () => {
  it("range les 8 niveaux en A / B / C", () => {
    expect(["A+", "A", "A-"].map(getTier)).toEqual(["A", "A", "A"]);
    expect(["B+", "B", "B-"].map(getTier)).toEqual(["B", "B", "B"]);
    expect(["C+", "C"].map(getTier)).toEqual(["C", "C"]);
  });
  it("traite un niveau inconnu comme B", () => {
    expect(getTier("Z")).toBe("B");
  });
});

describe("isAbcLevel", () => {
  it("n'accepte que les 8 niveaux", () => {
    expect(isAbcLevel("A+")).toBe(true);
    expect(isAbcLevel("D")).toBe(false);
    expect(isAbcLevel("")).toBe(false);
  });
});

describe("tierMix", () => {
  it("compte les joueurs par tier", () => {
    expect(tierMix(["A", "B+", "C", "A-"])).toEqual({ A: 2, B: 1, C: 1 });
    expect(tierMix([])).toEqual({ A: 0, B: 0, C: 0 });
  });
});

describe("buildTriplets", () => {
  it("forme des équipes 1 A + 1 B + 1 C quand les tiers sont équilibrés", () => {
    const entries = [p("a1", "A"), p("a2", "A-"), p("b1", "B"), p("b2", "B-"), p("c1", "C"), p("c2", "C+")];
    const teams = buildTriplets(entries);
    expect(teams).toHaveLength(2);
    for (const team of teams) {
      expect(tierMix(team.map((e) => e.level))).toEqual({ A: 1, B: 1, C: 1 });
    }
  });

  it("place chaque joueur une seule fois et laisse les surplus non placés", () => {
    const entries = Array.from({ length: 10 }, (_, i) => p(`p${i}`, ["A", "B", "C"][i % 3]));
    const teams = buildTriplets(entries);
    expect(teams).toHaveLength(3);
    const placed = teams.flat().map((e) => e.id);
    expect(new Set(placed).size).toBe(9);
    expect(teams.every((t) => t.length === 3)).toBe(true);
  });

  it("comble un tier manquant avec les autres", () => {
    const entries = [p("a1", "A"), p("a2", "A"), p("a3", "A+"), p("b1", "B"), p("b2", "B"), p("b3", "B")];
    const teams = buildTriplets(entries);
    expect(teams).toHaveLength(2);
    expect(teams.every((t) => t.length === 3)).toBe(true);
  });

  it("ne forme aucune équipe sous 3 joueurs", () => {
    expect(buildTriplets([p("a", "A"), p("b", "B")])).toEqual([]);
  });
});

describe("nextTeamName", () => {
  it("prend le premier numéro libre", () => {
    expect(nextTeamName([])).toBe("Équipe 1");
    expect(nextTeamName(["Équipe 1", "Équipe 3"])).toBe("Équipe 2");
    expect(nextTeamName(["équipe 1"])).toBe("Équipe 2");
  });
});
