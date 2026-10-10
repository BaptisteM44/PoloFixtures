/**
 * Classement final complet avec ex æquo : chaque équipe classée par la
 * dernière étape jouée ; éliminés au même stade = ex æquo (« 5e ex æquo »).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { createStages, getPipeline, launchStage, simulateAll, finalRanking } from "@/engine/pipeline-server";
import { getPreset } from "@/engine/presets";

async function mk(n: number): Promise<string> {
  const t = await prisma.tournament.create({ data: {
    name: "final", continentCode: "EU", country: "BE", city: "S",
    dateStart: new Date("2026-08-01T07:00:00Z"), dateEnd: new Date("2026-08-02T16:00:00Z"),
    format: "3v3", gameDurationMin: 12, maxTeams: n, registrationFeePerTeam: 0,
    registrationFeeCurrency: "EUR", contactEmail: "s@t.l", saturdayFormat: "ALL_DAY",
    sundayFormat: "SE", status: "UPCOMING", courtsCount: 2, timezone: "Europe/Brussels",
    usesPipeline: true, testMode: true, hidden: true } as never });
  await prisma.team.createMany({ data: Array.from({ length: n }, (_, i) => ({ tournamentId: t.id, name: `T${i + 1}`, seed: i + 1 })) });
  return t.id;
}
const ranksOf = (r: Array<{ rank: number }>) => r.map((x) => x.rank);

beforeAll(async () => { await assertSimDatabase(); });
beforeEach(async () => { await resetSimDb(); });

describe("Classement final avec ex æquo", () => {
  it("2 poules de 8 → SE 8 (+3e) : 1,2,3,4 puis 5e×4, puis 9e×2, 11e×2, 13e×2, 15e×2", async () => {
    const id = await mk(16);
    await createStages(id, getPreset("pools_se")!.build(16));
    await launchStage(id, 0);
    await simulateAll(id);
    const t = await getPipeline(id);
    expect(t!.status).toBe("COMPLETED");
    const r = finalRanking(t!);
    expect(r).toHaveLength(16);
    expect(ranksOf(r)).toEqual([1, 2, 3, 4, 5, 5, 5, 5, 9, 9, 11, 11, 13, 13, 15, 15]);
    expect(r.filter((x) => x.rank === 5).every((x) => x.tied)).toBe(true);
    expect(r[0].tied).toBe(false);
    // Les éliminés de poule sont bien ceux de l'étape « Poules »
    expect(new Set(r.slice(8).map((x) => x.stageName))).toEqual(new Set(["Poules"]));
  });

  it("Swiss → DE Top 8 et DE Bottom 8 en parallèle : le tableau du haut passe avant celui du bas", async () => {
    const id = await mk(16);
    await createStages(id, [
      { name: "Swiss", type: "SWISS", config: { rounds: 4 }, entryRules: { sources: [{ kind: "registration" }] } },
      { name: "DE Bottom", type: "DE", config: {}, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 9, to: 16 }] } },
      { name: "DE Top", type: "DE", config: {}, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 8 }] } },
    ] as never);
    await launchStage(id, 0);
    await simulateAll(id);
    const t = await getPipeline(id);
    const r = finalRanking(t!);
    expect(r).toHaveLength(16);
    expect(r.slice(0, 8).every((x) => x.stageName === "DE Top")).toBe(true);
    expect(r.slice(8).every((x) => x.stageName === "DE Bottom")).toBe(true);
    expect(r[0].rank).toBe(1);
    expect(r[8].rank).toBe(9);
  });
});
