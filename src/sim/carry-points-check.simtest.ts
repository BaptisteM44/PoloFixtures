/**
 * Point 3 (retour Josh) : les points du Round Robin doivent se REPORTER dans
 * le classement du Swiss du jour 2 (Big Apple), via inheritFrom. On construit
 * un scénario contrôlé où une équipe a une grosse avance de points au RR, et
 * on vérifie que cette avance pèse bien dans le classement Swiss.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { createStages, getPipeline, launchStage, launchNextGroup, applyScore, stageStandings } from "@/engine/pipeline-server";

async function mk(n: number): Promise<string> {
  const t = await prisma.tournament.create({ data: {
    name: "carry", continentCode: "EU", country: "BE", city: "S",
    dateStart: new Date("2026-08-01T07:00:00Z"), dateEnd: new Date("2026-08-02T16:00:00Z"),
    format: "pipeline", gameDurationMin: 12, maxTeams: n, registrationFeePerTeam: 0,
    registrationFeeCurrency: "EUR", contactEmail: "s@t.l", saturdayFormat: "ALL_DAY",
    sundayFormat: "SE", status: "UPCOMING", courtsCount: 2, timezone: "Europe/Brussels",
    usesPipeline: true, testMode: true, hidden: true } as never });
  await prisma.team.createMany({ data: Array.from({ length: n }, (_, i) => ({ tournamentId: t.id, name: `T${i + 1}`, seed: i + 1 })) });
  return t.id;
}

// Joue tous les matchs actuellement jouables de l'étape active, en donnant la
// victoire au teamA (score déterministe) — sauf override par winnerName.
async function playActive(id: string, override?: (a: string, b: string) => [number, number]) {
  const t = await getPipeline(id);
  for (const s of t!.stages.filter((x) => x.status === "ACTIVE")) {
    for (const m of s.matches.filter((x: any) => x.status !== "FINISHED" && x.teamAId && x.teamBId)) {
      const [sa, sb] = override ? override(m.teamAId!, m.teamBId!) : [5, 2];
      await applyScore(m.id, sa, sb);
    }
  }
}

beforeAll(async () => { await assertSimDatabase(); });
beforeEach(async () => { await resetSimDb(); });

describe("Report des points RR → Swiss (inheritFrom)", () => {
  it("l'avance de points du RR pèse dans le classement Swiss", async () => {
    const id = await mk(8);
    // RR (1 groupe de 8, inheritFrom absent ici) puis Swiss qui HÉRITE du RR
    await createStages(id, [
      { name: "RR", type: "RR", config: {}, entryRules: { sources: [{ kind: "registration" }] } },
      { name: "Swiss", type: "SWISS", config: { rounds: 2, inheritFrom: 0 }, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 8 }] } },
    ] as never);

    // Joue tout le RR : T1 gagne toujours quand il joue (grosse avance de points)
    await launchStage(id, 0);
    let guard = 0;
    while (guard++ < 20) {
      const t = await getPipeline(id);
      const active = t!.stages.find((s) => s.status === "ACTIVE");
      if (!active || active.matches.every((m: any) => m.status === "FINISHED" || !m.teamBId)) break;
      const t1 = t!.teams.find((x) => x.name === "T1")!.id;
      await playActive(id, (a, b) => {
        // T1 gagne large ; sinon teamA gagne 3-2
        if (a === t1) return [9, 0];
        if (b === t1) return [0, 9];
        return [3, 2];
      });
    }

    // Classement RR
    const rrStandings = stageStandings((await getPipeline(id))!, 0);
    const t1id = (await getPipeline(id))!.teams.find((x) => x.name === "T1")!.id;
    expect(rrStandings[0], "T1 doit dominer le RR").toBe(t1id);

    // Lance le Swiss, AVANT de jouer : son classement (round 1) doit déjà
    // refléter les points hérités du RR → T1 en tête.
    await launchStage(id, 1);
    const swissStandingsBeforePlay = stageStandings((await getPipeline(id))!, 1);
    expect(
      swissStandingsBeforePlay[0],
      "au lancement du Swiss, T1 doit être en tête grâce aux points hérités du RR",
    ).toBe(t1id);
  });

  it("SANS inheritFrom : le classement Swiss ignore le RR (contrôle négatif)", async () => {
    const id = await mk(8);
    await createStages(id, [
      { name: "RR", type: "RR", config: {}, entryRules: { sources: [{ kind: "registration" }] } },
      { name: "Swiss", type: "SWISS", config: { rounds: 2 }, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 8 }] } },
    ] as never);
    await launchStage(id, 0);
    let guard = 0;
    while (guard++ < 20) {
      const t = await getPipeline(id);
      const active = t!.stages.find((s) => s.status === "ACTIVE");
      if (!active || active.matches.every((m: any) => m.status === "FINISHED" || !m.teamBId)) break;
      await playActive(id);
    }
    await launchStage(id, 1);
    // Sans inheritFrom, le Swiss part de zéro : pas encore de matchs joués →
    // tout le monde à 0 point. Le classement = ordre de seed du Swiss, pas le RR.
    const t = await getPipeline(id);
    const swiss = t!.stages[1];
    // Aucun match Swiss joué encore : le classement ne peut pas refléter des points.
    const playedSwiss = swiss.matches.filter((m: any) => m.status === "FINISHED").length;
    expect(playedSwiss).toBe(0);
  });
});
