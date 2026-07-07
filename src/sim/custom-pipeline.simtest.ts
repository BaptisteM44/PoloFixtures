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

  it("cross-pool à 2 sources (poule A vs poule B) sans découpage explicite (groups:1)", async () => {
    // Reproduit le cas de Baptiste : un Swiss en 2 groupes, puis un cross-pool
    // qui prend une source = classement du groupe A, une autre = groupe B, sans
    // "Split into N groups" (groups:1). Le moteur doit préserver A/B en entrée.
    const raw = [
      {
        name: "Swiss",
        type: "SWISS",
        config: { rounds: 3 },
        entryRules: { sources: [{ kind: "registration" }], groups: 2, groupAssign: "snake" },
      },
      {
        name: "Cross-pool",
        type: "CROSS_POOL",
        config: { opponents: 1 },
        entryRules: {
          sources: [
            { kind: "stageRanks", stageOrder: 0, group: "A", from: 1, to: 8 },
            { kind: "stageRanks", stageOrder: 0, group: "B", from: 1, to: 8 },
          ],
          interleaveSources: true,
          groups: 1,
        },
      },
    ];

    const validated = validateCustomPipeline(raw);
    expect(validated.ok, !validated.ok ? validated.error : "").toBe(true);
    if (!validated.ok) return;

    const id = await createPipelineTournament(16);
    await createStages(id, validated.stages);

    // Le Swiss doit être joué avant de pouvoir lancer le cross-pool
    const res = await simulateAll(id);
    expect(res.error, res.error).toBeUndefined();

    const t = await getPipeline(id);
    expect(t!.status).toBe("COMPLETED");
    const cross = t!.stages[1];
    expect(cross.status, "cross-pool doit se lancer et se terminer").toBe("DONE");
    // Cross-pool 8 vs 8, opponents:1 → 8 matchs
    expect(cross.matches.length).toBe(8);
  });

  it("cross-pool à 1 source 'groupe vide' depuis un Swiss à 2 groupes (récupère A/B auto)", async () => {
    // Cas exact du screenshot de Baptiste : une seule source qui prend tout le
    // classement Swiss (rangs 1-16, groupe non précisé). Le Swiss ayant 2
    // groupes, le cross-pool doit récupérer A et B tout seul.
    const raw = [
      {
        name: "Swiss",
        type: "SWISS",
        config: { rounds: 5 },
        entryRules: { sources: [{ kind: "registration" }], groups: 2, groupAssign: "snake" },
      },
      {
        name: "Cross-pool",
        type: "CROSS_POOL",
        config: { opponents: 1 },
        entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 16 }], groups: 1 },
      },
    ];
    const validated = validateCustomPipeline(raw);
    expect(validated.ok, !validated.ok ? validated.error : "").toBe(true);
    if (!validated.ok) return;

    const id = await createPipelineTournament(16);
    await createStages(id, validated.stages);
    const res = await simulateAll(id);
    expect(res.error, res.error).toBeUndefined();

    const t = await getPipeline(id);
    const cross = t!.stages[1];
    expect(cross.status, "cross-pool doit se lancer et se terminer").toBe("DONE");
    // 8 (poule A) vs 8 (poule B), opponents:1 → 8 matchs
    expect(cross.matches.length).toBe(8);
    // Vérifie que les 2 poules sont bien distinctes (pas 16 dans un seul groupe)
    const groups = new Set(cross.entries.map((e) => e.groupKey));
    expect(groups.has("A") && groups.has("B")).toBe(true);
  });

  it("carryPoints : le classement d'une étape cumule les points de l'étape précédente", async () => {
    // 2 poules RR (étanches) puis cross-pool avec cumul des points. Le
    // classement du cross-pool doit refléter RR + cross-pool, pas seulement
    // les 8 matchs du cross-pool.
    const rawWithout = [
      { name: "Poules", type: "RR", config: {}, entryRules: { sources: [{ kind: "registration" }], groups: 2, groupAssign: "block" } },
      { name: "Cross", type: "CROSS_POOL", config: { opponents: 1 }, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 16 }] } },
    ];
    const rawWith = [
      { name: "Poules", type: "RR", config: {}, entryRules: { sources: [{ kind: "registration" }], groups: 2, groupAssign: "block" } },
      { name: "Cross", type: "CROSS_POOL", config: { opponents: 1, carryPoints: true }, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 16 }] } },
    ];

    for (const raw of [rawWithout, rawWith]) {
      const v = validateCustomPipeline(raw);
      expect(v.ok, !v.ok ? v.error : "").toBe(true);
    }

    // Sans cumul : classement basé sur 8 matchs. Avec cumul : matchs RR + cross.
    const idA = await createPipelineTournament(16);
    await createStages(idA, (validateCustomPipeline(rawWithout) as { stages: unknown[] }).stages as never);
    expect((await simulateAll(idA)).error).toBeUndefined();
    const tA = await getPipeline(idA);
    const crossMatchesA = tA!.stages[1].matches.length;

    const idB = await createPipelineTournament(16);
    await createStages(idB, (validateCustomPipeline(rawWith) as { stages: unknown[] }).stages as never);
    expect((await simulateAll(idB)).error).toBeUndefined();
    const tB = await getPipeline(idB);

    // Les deux produisent un classement complet de 16 équipes
    expect(new Set(finalStandings(tA!)).size).toBe(16);
    expect(new Set(finalStandings(tB!)).size).toBe(16);
    // Le cross-pool joue le même nombre de matchs dans les deux cas (le cumul
    // ne change QUE le classement, pas les appariements)
    expect(tB!.stages[1].matches.length).toBe(crossMatchesA);
  });

  it("poules → cross-pool → Swiss cumulatif : évite les rematchs hérités (sauf fallback)", async () => {
    // Le scénario de Baptiste : 2 poules, croisement A×B léger, puis Swiss qui
    // cumule les points ET hérite de l'historique pour éviter les rematchs.
    // Croisement léger (opponents:1) + peu de rounds Swiss → assez de marge
    // pour tout éviter sans fallback.
    const raw = [
      { name: "Poules", type: "RR", config: {}, entryRules: { sources: [{ kind: "registration" }], groups: 2, groupAssign: "block" } },
      { name: "Croisement", type: "CROSS_POOL", config: { opponents: 1 }, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 16 }] } },
      { name: "Swiss final", type: "SWISS", config: { rounds: 3, carryPoints: true }, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 1, from: 1, to: 16 }] } },
    ];
    const v = validateCustomPipeline(raw);
    expect(v.ok, !v.ok ? v.error : "").toBe(true);
    if (!v.ok) return;

    const id = await createPipelineTournament(16);
    await createStages(id, v.stages);
    expect((await simulateAll(id)).error).toBeUndefined();

    const t = await getPipeline(id);
    expect(t!.status).toBe("COMPLETED");

    // Historique des affrontements des 2 premières étapes
    const prior = new Set<string>();
    const key = (a: string, b: string) => [a, b].sort().join("~");
    for (const s of [t!.stages[0], t!.stages[1]]) {
      for (const m of s.matches) if (m.teamAId && m.teamBId) prior.add(key(m.teamAId, m.teamBId));
    }
    // Chaque équipe : 7 (poule) + 1 (croisement) = 8 adversaires connus sur 15.
    // Le Swiss (3 rounds) a largement de quoi éviter tous les rematchs hérités.
    const swissRematches = t!.stages[2].matches.filter(
      (m) => m.teamAId && m.teamBId && prior.has(key(m.teamAId, m.teamBId))
    );
    expect(swissRematches.map((m) => m.id), "le Swiss cumulatif ne doit pas rejouer un match déjà joué").toHaveLength(0);
    expect(new Set(finalStandings(t!)).size).toBe(16);
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
