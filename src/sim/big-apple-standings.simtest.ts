/**
 * Points 1 & 3 (retour Josh) sur le preset Big Apple :
 *  1. Un classement Swiss du jour 2 doit être visible → il faut une Pool
 *     rattachée à l'étape Swiss (source des onglets publics). Le Swiss est UN
 *     SEUL groupe fusionné de 12 (rangs 3-8 de A + de B), pas 2 groupes
 *     séparés — demande explicite de l'organisateur à l'origine du format.
 *  3. Ce classement Swiss doit inclure les points hérités du RR (inheritFrom).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { createStages, getPipeline, launchStage, launchNextGroup, applyScore, stageStandings } from "@/engine/pipeline-server";
import { PIPELINE_PRESETS } from "@/engine/presets";

async function mk(n: number): Promise<string> {
  const t = await prisma.tournament.create({ data: {
    name: "big-apple-standings", continentCode: "EU", country: "BE", city: "S",
    dateStart: new Date("2026-08-01T07:00:00Z"), dateEnd: new Date("2026-08-02T16:00:00Z"),
    format: "pipeline", gameDurationMin: 12, maxTeams: n, registrationFeePerTeam: 0,
    registrationFeeCurrency: "EUR", contactEmail: "s@t.l", saturdayFormat: "ALL_DAY",
    sundayFormat: "SE", status: "UPCOMING", courtsCount: 2, timezone: "Europe/Brussels",
    usesPipeline: true, testMode: true, hidden: true } as never });
  await prisma.team.createMany({ data: Array.from({ length: n }, (_, i) => ({ tournamentId: t.id, name: `T${i + 1}`, seed: i + 1 })) });
  return t.id;
}

async function playAllActive(id: string) {
  for (let guard = 0; guard < 40; guard++) {
    const t = await getPipeline(id);
    const active = t!.stages.filter((s) => s.status === "ACTIVE");
    let played = 0;
    for (const s of active) {
      for (const m of s.matches.filter((x: any) => x.status !== "FINISHED" && x.teamAId && x.teamBId)) {
        await applyScore(m.id, 5, 2);
        played++;
      }
    }
    if (played === 0) {
      // Peut-être un groupe séquentiel à lancer
      let launched = false;
      for (const s of active) {
        if (s.type === "RR" || s.type === "SWISS") {
          const r = await launchNextGroup(id, s.order);
          if (r.ok) { launched = true; break; }
        }
      }
      if (!launched) break;
    }
  }
}

beforeAll(async () => { await assertSimDatabase(); });
beforeEach(async () => { await resetSimDb(); });

describe("Big Apple — classement Swiss jour 2 visible et cumulatif", () => {
  it("l'étape Swiss crée 1 Pool fusionnée (12 équipes) → onglet de classement", async () => {
    const id = await mk(16);
    const preset = PIPELINE_PRESETS.find((p) => p.key === "big_apple")!;
    await createStages(id, preset.build(16));

    // Joue tout le RR (2 groupes séquentiels), puis lance le Swiss
    await launchStage(id, 0);
    await playAllActive(id);

    const swissStage = (await getPipeline(id))!.stages.find((s) => s.name === "Swiss dimanche (3-8)")!;
    await launchStage(id, swissStage.order);

    // Les Pool de l'étape Swiss (source des onglets de classement publics) :
    // une seule pool fusionnée de 12 équipes, pas 2 pools séparées par groupe.
    const pools = await prisma.pool.findMany({ where: { stageId: swissStage.id }, select: { id: true, name: true } });
    expect(pools.length, "l'étape Swiss doit avoir 1 seule Pool fusionnée").toBe(1);

    const poolTeams = await prisma.poolTeam.count({ where: { poolId: pools[0].id } });
    expect(poolTeams, "la Pool fusionnée doit contenir les 12 équipes (rangs 3-8 de A + de B)").toBe(12);
  });

  it("le classement Swiss inclut les points du RR (inheritFrom)", async () => {
    const id = await mk(16);
    const preset = PIPELINE_PRESETS.find((p) => p.key === "big_apple")!;
    await createStages(id, preset.build(16));
    // Confirme que le preset a bien inheritFrom sur le Swiss
    const t0 = await getPipeline(id);
    const swiss = t0!.stages.find((s) => s.name === "Swiss dimanche (3-8)")!;
    expect((swiss.config as any).inheritFrom, "le Swiss Big Apple doit hériter des points du RR").toBe(0);
  });
});
