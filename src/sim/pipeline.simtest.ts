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
      { name: "Swiss dimanche (3-8)", n: 18 }, // 3 rounds × 6
      { name: "Placement 1ers/2es", n: 2 },
      { name: "Bracket final", n: 8 },         // SE8 + 3e place
    ]);
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
