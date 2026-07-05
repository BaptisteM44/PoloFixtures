import { describe, it, expect } from "vitest";
import { validateCustomPipeline } from "./pipeline-validation";

const registration = { sources: [{ kind: "registration" as const }] };

describe("validateCustomPipeline", () => {
  it("accepte un pipeline simple valide", () => {
    const res = validateCustomPipeline([
      { name: "Poules", type: "RR", config: { groups: 2 }, entryRules: registration },
      { name: "Bracket", type: "SE", config: { thirdPlace: true }, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 8 }] } },
    ]);
    expect(res.ok).toBe(true);
  });

  it("accepte l'exemple monstre : Swiss → cross-pool → 4 groupes → DE", () => {
    const res = validateCustomPipeline([
      { name: "Swiss", type: "SWISS", config: { rounds: 5 }, entryRules: registration },
      { name: "Cross-pool", type: "CROSS_POOL", config: { opponents: 1 }, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 16 }], groups: 2, groupAssign: "block" } },
      { name: "4 groupes", type: "RR", config: { maxRounds: 2 }, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 1, from: 1, to: 16 }], groups: 4 } },
      { name: "DE finale", type: "DE", config: { gfReset: true }, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 2, from: 1, to: 8 }] } },
    ]);
    expect(res.ok).toBe(true);
  });

  it("rejette une étape sans nom", () => {
    const res = validateCustomPipeline([{ name: "", type: "RR", config: {}, entryRules: registration }]);
    expect(res.ok).toBe(false);
  });

  it("rejette un pipeline vide", () => {
    const res = validateCustomPipeline([]);
    expect(res.ok).toBe(false);
  });

  it("rejette une référence vers une étape future ou soi-même", () => {
    const res = validateCustomPipeline([
      { name: "A", type: "SWISS", config: { rounds: 3 }, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 1, from: 1, to: 8 }] } },
      { name: "B", type: "SE", config: {}, entryRules: registration },
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("précédentes");
  });

  it("rejette 'to' < 'from'", () => {
    const res = validateCustomPipeline([
      { name: "A", type: "SE", config: {}, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 5, to: 2 }] } },
    ]);
    expect(res.ok).toBe(false);
  });

  it("rejette un type d'étape inconnu", () => {
    const res = validateCustomPipeline([{ name: "A", type: "MYSTERY", config: {}, entryRules: registration }]);
    expect(res.ok).toBe(false);
  });

  it("rejette une config incohérente avec le type (SWISS sans rounds)", () => {
    const res = validateCustomPipeline([{ name: "A", type: "SWISS", config: {}, entryRules: registration }]);
    expect(res.ok).toBe(false);
  });

  it("rejette plus de 12 étapes", () => {
    const many = Array.from({ length: 13 }, (_, i) => ({ name: `S${i}`, type: "SE" as const, config: {}, entryRules: registration }));
    const res = validateCustomPipeline(many);
    expect(res.ok).toBe(false);
  });
});
