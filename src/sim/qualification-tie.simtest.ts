/**
 * Égalité parfaite sur une ligne de qualification : l'étape suivante ne se
 * lance PAS toute seule (seul l'ordre d'entrée départagerait) ; l'onglet
 * Étapes affiche l'alerte. L'orga tranche (un but de plus au vainqueur du
 * tir au but) ou lance quand même.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { createStages, getPipeline, launchStage, applyScore, pipelineTieWarnings } from "@/engine/pipeline-server";

async function mk(n: number): Promise<string> {
  const t = await prisma.tournament.create({ data: {
    name: "tie", continentCode: "EU", country: "BE", city: "S",
    dateStart: new Date("2026-08-01T07:00:00Z"), dateEnd: new Date("2026-08-02T16:00:00Z"),
    format: "3v3", gameDurationMin: 12, maxTeams: n, registrationFeePerTeam: 0,
    registrationFeeCurrency: "EUR", contactEmail: "s@t.l", saturdayFormat: "ALL_DAY",
    sundayFormat: "SE", status: "UPCOMING", courtsCount: 1, timezone: "Europe/Brussels",
    usesPipeline: true, testMode: true, hidden: true } as never });
  await prisma.team.createMany({ data: Array.from({ length: n }, (_, i) => ({ tournamentId: t.id, name: `T${i + 1}`, seed: i + 1 })) });
  return t.id;
}
const stages = [
  { name: "Poule", type: "RR", config: {}, entryRules: { sources: [{ kind: "registration" }] } },
  { name: "Finale", type: "SE", config: {}, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 2 }] } },
];

beforeAll(async () => { await assertSimDatabase(); });
beforeEach(async () => { await resetSimDb(); });

describe("Égalité parfaite à la ligne de qualification", () => {
  it("tout nul → égalité parfaite à 4 sur la ligne des 2 qualifiés : pas de lancement auto, alerte nommant les équipes", async () => {
    const id = await mk(4);
    await createStages(id, stages as never);
    await launchStage(id, 0);
    const rr = (await getPipeline(id))!.stages[0];
    for (const m of rr.matches) await applyScore(m.id, 1, 1);

    const t = await getPipeline(id);
    expect(t!.stages[0].status).toBe("DONE");
    expect(t!.stages[1].status, "la finale attend l'orga").toBe("PENDING");
    const warnings = await pipelineTieWarnings(id);
    expect(warnings[1]).toHaveLength(1);
    expect(warnings[1][0].teamNames.sort()).toEqual(["T1", "T2", "T3", "T4"]);

    // L'orga lance quand même : autorisé.
    expect((await launchStage(id, 1)).ok).toBe(true);
  });

  it("le format est préservé (le type d'équipe n'est plus écrasé par « pipeline »)", async () => {
    const id = await mk(4);
    const { setTournamentPipeline } = await import("@/engine/pipeline-server");
    expect((await setTournamentPipeline(id, stages)).ok).toBe(true);
    expect((await prisma.tournament.findUniqueOrThrow({ where: { id } })).format).toBe("3v3");
  });

  it("pas d'égalité (ou égalité hors de la ligne) : lancement automatique normal", async () => {
    const id = await mk(4);
    await createStages(id, stages as never);
    await launchStage(id, 0);
    const rr = (await getPipeline(id))!.stages[0];
    // T1 bat tout le monde, le reste nul : T1 1er, T2-T4 à égalité… sur la ligne 2/3 !
    // → on rend T2 2e en lui donnant un but de plus contre T3 (le « tir au but »).
    for (const m of rr.matches) {
      const ids = [m.teamAId, m.teamBId];
      const names = await prisma.team.findMany({ where: { id: { in: ids as string[] } }, select: { id: true, name: true } });
      const n = (x: string | null) => names.find((y) => y.id === x)?.name;
      if (n(m.teamAId) === "T1") await applyScore(m.id, 3, 0);
      else if (n(m.teamBId) === "T1") await applyScore(m.id, 0, 3);
      else if ([n(m.teamAId), n(m.teamBId)].sort().join() === "T2,T3") await applyScore(m.id, n(m.teamAId) === "T2" ? 2 : 1, n(m.teamAId) === "T2" ? 1 : 2);
      else await applyScore(m.id, 1, 1);
    }
    const t = await getPipeline(id);
    expect(t!.stages[1].status, "plus d'égalité sur la ligne → lancée toute seule").toBe("ACTIVE");
    expect(await pipelineTieWarnings(id)).toEqual({});
  });
});
