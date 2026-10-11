/**
 * Mode « une source = un groupe » de bout en bout : les qualifiés de la poule
 * A restent ensemble dans la phase suivante (groupe A), ceux de B aussi.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { createStages, getPipeline, launchStage, simulateAll } from "@/engine/pipeline-server";

beforeAll(async () => { await assertSimDatabase(); });
beforeEach(async () => { await resetSimDb(); });

describe("groupAssign « source »", () => {
  it("2 poules → 2e phase : les 3 premiers de A restent en A, ceux de B en B, et le tournoi va au bout", async () => {
    const t = await prisma.tournament.create({ data: {
      name: "src", continentCode: "EU", country: "BE", city: "S",
      dateStart: new Date("2026-08-01T07:00:00Z"), dateEnd: new Date("2026-08-02T16:00:00Z"),
      format: "3v3", gameDurationMin: 12, maxTeams: 12, registrationFeePerTeam: 0,
      registrationFeeCurrency: "EUR", contactEmail: "s@t.l", saturdayFormat: "ALL_DAY",
      sundayFormat: "SE", status: "UPCOMING", courtsCount: 2, timezone: "Europe/Brussels",
      usesPipeline: true, testMode: true, hidden: true } as never });
    await prisma.team.createMany({ data: Array.from({ length: 12 }, (_, i) => ({ tournamentId: t.id, name: `T${i + 1}`, seed: i + 1 })) });
    await createStages(t.id, [
      { name: "Poules", type: "RR", config: { courtMode: "mixed" }, entryRules: { sources: [{ kind: "registration" }], groups: 2 } },
      { name: "Phase 2", type: "RR", config: { courtMode: "mixed" }, entryRules: {
        sources: [{ kind: "stageRanks", stageOrder: 0, group: "A", from: 1, to: 3 }, { kind: "stageRanks", stageOrder: 0, group: "B", from: 1, to: 3 }],
        groups: 2, groupAssign: "source" } },
    ] as never);
    await launchStage(t.id, 0);
    await simulateAll(t.id);
    const p = (await getPipeline(t.id))!;
    expect(p.status).toBe("COMPLETED");
    const poolGroup = new Map(p.stages[0].entries.map((e) => [e.teamId, e.groupKey]));
    for (const e of p.stages[1].entries) expect(poolGroup.get(e.teamId)).toBe(e.groupKey);
    expect(p.stages[1].entries).toHaveLength(6);
  });
});
