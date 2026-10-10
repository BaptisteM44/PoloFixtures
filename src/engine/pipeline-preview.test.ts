import { describe, it, expect } from "vitest";
import { previewPipeline } from "./pipeline-preview";
import { getPreset } from "./presets";

describe("previewPipeline", () => {
  it("2 poules → SE 8 avec 16 équipes : 2×8, 56 matchs de poule, 8 au SE (+3e), rien d'anormal", () => {
    const p = previewPipeline(getPreset("pools_se")!.build(16) as never, 16);
    expect(p[0]).toMatchObject({ teams: 16, groupSizes: [8, 8], rounds: 7, matches: 56 });
    expect(p[0].outflows).toHaveLength(2);
    expect(p[1]).toMatchObject({ teams: 8, matches: 8 });
    expect(p.flatMap((x) => x.warnings)).toEqual([]);
  });

  it("même format avec 10 équipes : poules de 5 → rangs 1-4 sur 5 (ok), 5 rounds avec BYE", () => {
    const p = previewPipeline(getPreset("pools_se")!.build(10) as never, 10);
    expect(p[0]).toMatchObject({ groupSizes: [5, 5], rounds: 5, matches: 20 });
    expect(p[1].teams).toBe(8);
  });

  it("plage qui dépasse l'effectif, plage vide, Swiss trop long, doublon entre deux étapes, étape trop petite", () => {
    const p = previewPipeline([
      { name: "Swiss", type: "SWISS", config: { rounds: 10 }, entryRules: { sources: [{ kind: "registration" }] } },
      { name: "Top", type: "SE", config: {}, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 8 }] } },
      { name: "Bas", type: "SE", config: {}, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 5, to: 12 }] } },
      { name: "Rien", type: "DE", config: {}, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 20, to: 24 }] } },
    ], 10);
    const kinds = p.map((x) => x.warnings.map((w) => w.kind));
    expect(kinds[0]).toEqual(["swiss_too_long"]); // 10 rounds pour 10 équipes (9 max sans rematch)
    expect(kinds[2]).toEqual(["range_beyond", "overlap"]); // 5-12 sur 10, et 5-8 déjà pris par Top
    expect(kinds[3]).toEqual(["range_empty", "too_small"]);
    expect(p[2].teams).toBe(6);
  });

  it("Swiss → DE Top 8 / DE Bottom 8 : pas de doublon", () => {
    const p = previewPipeline([
      { name: "Swiss", type: "SWISS", config: { rounds: 5 }, entryRules: { sources: [{ kind: "registration" }] } },
      { name: "Top", type: "DE", config: {}, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 8 }] } },
      { name: "Bottom", type: "DE", config: {}, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 9, to: 16 }] } },
    ], 16);
    expect(p.flatMap((x) => x.warnings)).toEqual([]);
    expect(p[0].outflows.map((o) => o.to)).toEqual(["Top", "Bottom"]);
  });
});
