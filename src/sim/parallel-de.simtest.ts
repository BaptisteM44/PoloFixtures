/**
 * Étapes parallèles : deux DE indépendants (Top 8 / Bottom 8) issus d'un même
 * Swiss doivent pouvoir tourner EN MÊME TEMPS (ils ne dépendent pas l'un de
 * l'autre). Le tournoi ne se termine que quand les DEUX sont finis.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { createStages, getPipeline, launchStage, simulateStage, applyScore } from "@/engine/pipeline-server";

async function mk(n: number): Promise<string> {
  const t = await prisma.tournament.create({ data: {
    name: "parallel-de", continentCode: "EU", country: "BE", city: "S",
    dateStart: new Date("2026-08-01T07:00:00Z"), dateEnd: new Date("2026-08-02T16:00:00Z"),
    format: "pipeline", gameDurationMin: 12, maxTeams: n, registrationFeePerTeam: 0,
    registrationFeeCurrency: "EUR", contactEmail: "s@t.l", saturdayFormat: "ALL_DAY",
    sundayFormat: "SE", status: "UPCOMING", courtsCount: 2, timezone: "Europe/Brussels",
    usesPipeline: true, testMode: true, hidden: true } as never });
  await prisma.team.createMany({ data: Array.from({ length: n }, (_, i) => ({ tournamentId: t.id, name: `T${i + 1}`, seed: i + 1 })) });
  return t.id;
}

async function playActive(id: string): Promise<number> {
  const t = await getPipeline(id);
  let played = 0;
  for (const s of t!.stages.filter((x) => x.status === "ACTIVE")) {
    for (const m of s.matches.filter((x: any) => x.status !== "FINISHED" && x.teamAId && x.teamBId)) {
      await applyScore(m.id, 3, 1);
      played++;
    }
  }
  return played;
}

beforeAll(async () => { await assertSimDatabase(); });
beforeEach(async () => { await resetSimDb(); });

describe("DE Top 8 / Bottom 8 en parallèle", () => {
  it("les deux DE se lancent en même temps après le Swiss", async () => {
    const id = await mk(16);
    await createStages(id, [
      { name: "Swiss", type: "SWISS", config: { rounds: 3 }, entryRules: { sources: [{ kind: "registration" }] } },
      { name: "DE Top 8", type: "DE", config: {}, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 8 }] } },
      { name: "DE Bottom 8", type: "DE", config: {}, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 9, to: 16 }] } },
    ] as never);

    // Swiss d'abord
    await launchStage(id, 0);
    await simulateStage(id);

    // Les DEUX DE doivent pouvoir se lancer (aucun ne dépend de l'autre)
    const r1 = await launchStage(id, 1);
    expect(r1.error, "DE Top 8 doit se lancer").toBeUndefined();
    const r2 = await launchStage(id, 2);
    expect(r2.error, "DE Bottom 8 doit se lancer en parallèle").toBeUndefined();

    // Les deux sont ACTIVE en même temps
    let t = await getPipeline(id);
    expect(t!.stages[1].status).toBe("ACTIVE");
    expect(t!.stages[2].status).toBe("ACTIVE");

    // On joue les deux brackets en même temps, un match de chaque à la fois
    let guard = 0;
    while (guard++ < 40) { if (await playActive(id) === 0) break; }

    t = await getPipeline(id);
    expect(t!.stages[1].status, "Top 8 terminé").toBe("DONE");
    expect(t!.stages[2].status, "Bottom 8 terminé").toBe("DONE");
    expect(t!.status, "tournoi terminé quand les 2 DE finis").toBe("COMPLETED");
  });

  it("une étape DÉPENDANTE reste bloquée tant que sa source n'est pas finie", async () => {
    const id = await mk(8);
    await createStages(id, [
      { name: "Swiss", type: "SWISS", config: { rounds: 2 }, entryRules: { sources: [{ kind: "registration" }] } },
      { name: "SE", type: "SE", config: {}, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 4 }] } },
    ] as never);
    await launchStage(id, 0); // Swiss actif, pas fini
    const res = await launchStage(id, 1); // dépend du Swiss → doit être bloqué
    expect(res.error).toBeDefined();
  });
});
