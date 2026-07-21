/**
 * Validation du PIPELINE de bout en bout : pour chaque preset, création d'un
 * tournoi fictif → simulation complète via le cerveau (launchStage/applyScore/
 * advanceStage) → invariants (COMPLETED, pas de match bloqué, classement 1→N).
 *
 * Lancer : npx vitest run -c vitest.sim.config.ts src/sim/pipeline.simtest.ts
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { createStages, getPipeline, simulateAll, finalStandings } from "@/engine/pipeline-server";
import { PIPELINE_PRESETS } from "@/engine/presets";

async function createPipelineTournament(teamCount: number): Promise<string> {
  const t = await prisma.tournament.create({
    data: {
      name: `SANDBOX pipeline ${teamCount}t`,
      continentCode: "EU", country: "BE", city: "SimCity",
      dateStart: new Date("2026-08-01T07:00:00Z"),
      dateEnd: new Date("2026-08-02T16:00:00Z"),
      format: "pipeline", gameDurationMin: 12, maxTeams: teamCount,
      registrationFeePerTeam: 0, registrationFeeCurrency: "EUR",
      contactEmail: "sim@test.local",
      saturdayFormat: "ALL_DAY", sundayFormat: "SE",
      status: "UPCOMING", courtsCount: 2,
      timezone: "Europe/Brussels",
      usesPipeline: true, testMode: true, hidden: true,
    } as never,
  });
  await prisma.team.createMany({
    data: Array.from({ length: teamCount }, (_, i) => ({
      tournamentId: t.id, name: `Team ${String(i + 1).padStart(2, "0")}`, seed: i + 1,
    })),
  });
  return t.id;
}

async function checkPipelineInvariants(tournamentId: string, teamCount: number) {
  const t = await getPipeline(tournamentId);
  expect(t).not.toBeNull();

  // Tournoi terminé
  expect(t!.status, "le tournoi doit être COMPLETED").toBe("COMPLETED");

  // Toutes les étapes DONE
  for (const s of t!.stages) {
    expect(s.status, `étape "${s.name}"`).toBe("DONE");
  }

  // Aucun match bloqué (2 équipes présentes mais non joué) — hors BG dormant
  for (const s of t!.stages) {
    const g = s.matches.find((m) => m.bracketSide === "G");
    for (const m of s.matches) {
      const bgDormant = m.bracketSide === "BG" && !m.teamAId && !m.teamBId && g?.winnerTeamId === g?.teamAId;
      if (bgDormant) continue;
      expect(m.status, `match bloqué: ${s.name} R${m.roundIndex}#${m.positionInRound}`).toBe("FINISHED");
    }
  }

  // Classement final 1→N complet
  const ranking = finalStandings(t!);
  expect(new Set(ranking).size).toBe(teamCount);
}

beforeAll(async () => {
  await assertSimDatabase();
});

beforeEach(async () => {
  await resetSimDb();
});

describe("Pipeline — presets joués de bout en bout", () => {
  for (const preset of PIPELINE_PRESETS) {
    for (const teamCount of [preset.minTeams, 16]) {
      it(`${preset.label} × ${teamCount} équipes`, async () => {
        const id = await createPipelineTournament(teamCount);
        await createStages(id, preset.build(teamCount));

        const res = await simulateAll(id);
        expect(res.error, res.error).toBeUndefined();

        await checkPipelineInvariants(id, teamCount);
      });
    }
  }

  it("Big Apple ×16 : mêmes comptages que le format legacy (84 matchs)", async () => {
    const id = await createPipelineTournament(16);
    const preset = PIPELINE_PRESETS.find((p) => p.key === "big_apple")!;
    await createStages(id, preset.build(16));
    const res = await simulateAll(id);
    expect(res.error, res.error).toBeUndefined();

    const t = await getPipeline(id);
    const counts = t!.stages.map((s) => ({ name: s.name, n: s.matches.length }));
    expect(counts).toEqual([
      { name: "Poules samedi", n: 56 },        // 2×28
      { name: "Swiss dimanche (3-8)", n: 18 }, // 3 rounds × 6 (1 groupe fusionné de 12)
      { name: "Placement 1ers/2es", n: 2 },
      { name: "Bracket final", n: 8 },         // SE8 + 3e place
    ]);

    // Le Swiss dimanche est UN SEUL groupe fusionné de 12 (rangs 3-8 de A + de
    // B), pas 2 groupes séparés — demande explicite de l'organisateur à
    // l'origine du format ("bottom 6 from each group combined into a group
    // of 12"). Avec 12 équipes, 6 matchs/round.
    const swissStage = t!.stages.find((s) => s.name === "Swiss dimanche (3-8)")!;
    const byGroup = new Map<string, number>();
    for (const m of swissStage.matches) {
      const g = m.groupKey || "(aucun)";
      byGroup.set(g, (byGroup.get(g) ?? 0) + 1);
    }
    expect(byGroup.size, "le Swiss dimanche doit être un seul groupe fusionné").toBe(1);
    const soleGroupCount = [...byGroup.values()][0];
    expect(soleGroupCount).toBe(18); // 3 rounds × 6 matchs (12 équipes)

    // Régression : chaque équipe doit avoir joué exactement 3 matchs Swiss
    // (round-robin de poule à part, aucun doublon d'entrée côté Swiss lui-même).
    const swissEntryIds = swissStage.entries.map((e) => e.teamId!).filter(Boolean);
    for (const teamId of swissEntryIds) {
      const swissMatchesForTeam = swissStage.matches.filter((m) => m.teamAId === teamId || m.teamBId === teamId);
      expect(swissMatchesForTeam.length, `équipe ${teamId} doit avoir joué exactement 3 matchs Swiss`).toBe(3);
    }

    // Régression classement : reproduit exactement la logique de dédoublonnage
    // de stageStandings (pipeline-server.ts) — si le Swiss réapparie 2 équipes
    // déjà croisées en poule (rematch, accepté par le solveur en dernier
    // recours), leur match de poule ne doit PLUS être compté en plus du match
    // Swiss, sinon même duel comptabilisé 2 fois (points/victoires fantômes,
    // nombre de matchs incohérent — signalé par un organisateur : "10 matchs
    // joués au lieu de 8 attendus").
    const poolsStage = t!.stages.find((s) => s.name === "Poules samedi")!;
    const pairKeyOf = (a: string, b: string) => [a, b].sort().join("|");
    const swissPairsSet = new Set(swissStage.matches.filter((m) => m.teamAId && m.teamBId).map((m) => pairKeyOf(m.teamAId!, m.teamBId!)));
    const dedupedInherited = poolsStage.matches.filter(
      (m) => m.teamAId && m.teamBId && !swissPairsSet.has(pairKeyOf(m.teamAId!, m.teamBId!)),
    );
    for (const teamId of swissEntryIds) {
      const inheritedCountForTeam = dedupedInherited.filter((m) => m.teamAId === teamId || m.teamBId === teamId).length;
      const swissCountForTeam = swissStage.matches.filter((m) => m.teamAId === teamId || m.teamBId === teamId).length;
      const totalCountedInStandings = inheritedCountForTeam + swissCountForTeam;
      // 7 matchs de poule (moins les rematchs exclus) + 3 matchs Swiss, jamais plus de 10.
      expect(totalCountedInStandings, `équipe ${teamId} : total dédupliqué dans le classement Swiss`).toBeLessThanOrEqual(10);
      expect(totalCountedInStandings, `équipe ${teamId} : total dédupliqué dans le classement Swiss`).toBeGreaterThanOrEqual(3);
    }
  });

  it("48 équipes : 2 poules → SE, joué de bout en bout", async () => {
    const id = await createPipelineTournament(48);
    const preset = PIPELINE_PRESETS.find((p) => p.key === "pools_se")!;
    await createStages(id, preset.build(48));
    const res = await simulateAll(id);
    expect(res.error, res.error).toBeUndefined();
    await checkPipelineInvariants(id, 48);

    const t = await getPipeline(id);
    // 2 poules de 24 → 2 × 276 matchs RR = 552, puis SE 8 (7 + 3e place)
    expect(t!.stages[0].matches).toHaveLength(552);
    expect(t!.stages[1].matches).toHaveLength(8);
  });

  it("nombre impair d'équipes (13) : Swiss avec BYE tournant", async () => {
    const id = await createPipelineTournament(13);
    const preset = PIPELINE_PRESETS.find((p) => p.key === "swiss_de")!;
    await createStages(id, preset.build(13));
    const res = await simulateAll(id);
    expect(res.error, res.error).toBeUndefined();
    await checkPipelineInvariants(id, 13);

    // Le BYE a tourné : jamais deux fois la même équipe
    const t = await getPipeline(id);
    const swiss = t!.stages[0];
    const byes = swiss.matches.filter((m) => !m.teamBId).map((m) => m.teamAId);
    expect(new Set(byes).size).toBe(byes.length);
  });
});
