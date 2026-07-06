/**
 * Validation du BUILDER CUSTOM : compose "à la main" l'exemple de Baptiste
 * (5 Swiss → cross-pool → 4 groupes × 2 tours → DE) exactement comme le
 * ferait PipelineBuilder, valide avec le même schéma zod que l'action
 * serveur, puis simule de bout en bout.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { createStages, getPipeline, simulateAll, finalStandings, previewStageEntries, setStageManualGroups, launchStage } from "@/engine/pipeline-server";
import { validateCustomPipeline } from "@/engine/pipeline-validation";

async function createPipelineTournament(teamCount: number): Promise<string> {
  const t = await prisma.tournament.create({
    data: {
      name: "SANDBOX custom builder", continentCode: "EU", country: "BE", city: "SimCity",
      dateStart: new Date("2026-08-01T07:00:00Z"), dateEnd: new Date("2026-08-02T16:00:00Z"),
      format: "pipeline", gameDurationMin: 12, maxTeams: teamCount,
      registrationFeePerTeam: 0, registrationFeeCurrency: "EUR", contactEmail: "sim@test.local",
      saturdayFormat: "ALL_DAY", sundayFormat: "SE", status: "UPCOMING", courtsCount: 2,
      timezone: "Europe/Brussels", usesPipeline: true, testMode: true, hidden: true,
    } as never,
  });
  await prisma.team.createMany({
    data: Array.from({ length: teamCount }, (_, i) => ({ tournamentId: t.id, name: `Team ${i + 1}`, seed: i + 1 })),
  });
  return t.id;
}

beforeAll(async () => { await assertSimDatabase(); });
beforeEach(async () => { await resetSimDb(); });

describe("Builder custom — exemple utilisateur : 5 Swiss → cross-pool → 4 groupes → DE", () => {
  it("composé exactement comme dans PipelineBuilder, validé puis joué de bout en bout", async () => {
    // Ceci reproduit EXACTEMENT ce que PipelineBuilder envoie à createCustomSandboxAction
    const raw = [
      {
        name: "5 rounds de Swiss",
        type: "SWISS",
        config: { rounds: 5 },
        entryRules: { sources: [{ kind: "registration" }] },
      },
      {
        name: "Cross-pool",
        type: "CROSS_POOL",
        config: { opponents: 2 },
        entryRules: {
          sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 16 }],
          groups: 2,
          groupAssign: "block", // rangs 1-8 = groupe A (haut), 9-16 = groupe B (bas)
        },
      },
      {
        name: "4 groupes, 2 tours",
        type: "RR",
        config: { maxRounds: 2 },
        entryRules: {
          sources: [{ kind: "stageRanks", stageOrder: 1, from: 1, to: 16 }],
          groups: 4,
          groupAssign: "snake",
        },
      },
      {
        name: "Double élimination",
        type: "DE",
        config: { gfReset: true },
        entryRules: { sources: [{ kind: "stageRanks", stageOrder: 2, from: 1, to: 8 }] },
      },
    ];

    // 1. Même validation que l'action serveur
    const validated = validateCustomPipeline(raw);
    expect(validated.ok, !validated.ok ? validated.error : "").toBe(true);
    if (!validated.ok) return;

    // 2. Création + simulation de bout en bout
    const id = await createPipelineTournament(16);
    await createStages(id, validated.stages);
    const res = await simulateAll(id);
    expect(res.error, res.error).toBeUndefined();

    // 3. Invariants
    const t = await getPipeline(id);
    expect(t!.status).toBe("COMPLETED");
    for (const s of t!.stages) expect(s.status, s.name).toBe("DONE");

    const ranking = finalStandings(t!);
    expect(new Set(ranking).size).toBe(16);

    // Comptages attendus
    const counts = t!.stages.map((s) => s.matches.length);
    expect(counts[0]).toBe(40); // Swiss : 5 rounds × 8 matchs (16 équipes)
    // DE(8) = 2*8-2 = 14 matchs + le match BG (reset) toujours créé, joué ou non
    expect(counts[3]).toBe(15);
  });

  it("rejette une config invalide composée dans le builder (référence circulaire)", () => {
    const res = validateCustomPipeline([
      { name: "A", type: "SWISS", config: { rounds: 3 }, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 8 }] } },
    ]);
    expect(res.ok).toBe(false);
  });
});

describe("Composition manuelle des groupes (avant lancement)", () => {
  it("preview → l'orga réassigne → launch respecte sa composition manuelle", async () => {
    const id = await createPipelineTournament(8);
    await createStages(id, [
      { name: "Poules", type: "RR", config: { groups: 2 }, entryRules: { sources: [{ kind: "registration" }], groups: 2, groupAssign: "snake" } },
    ]);

    const preview = await previewStageEntries(id, 0);
    expect(preview.error).toBeUndefined();
    expect(preview.entries).toHaveLength(8);

    // L'orga décide : toutes les équipes impaires en A, paires en B (au lieu du snake par défaut)
    const assignments: Record<string, string> = {};
    preview.entries!.forEach((e, i) => { assignments[e.teamId] = i % 2 === 0 ? "A" : "B"; });
    const setRes = await setStageManualGroups(id, 0, assignments);
    expect(setRes.error).toBeUndefined();

    const launchRes = await launchStage(id, 0);
    expect(launchRes.error).toBeUndefined();

    const t = await getPipeline(id);
    const stage = t!.stages[0];
    for (const entry of stage.entries) {
      expect(entry.groupKey).toBe(assignments[entry.teamId!]);
    }
  });
});
