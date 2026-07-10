/**
 * Non-régression : un Swiss ne doit JAMAIS produire de rematch évitable.
 * Un ancien appariement glouton « volait » des adversaires et forçait de
 * faux rematchs (~57% des tournois 2 groupes × 4 rounds) alors qu'un
 * jumelage parfait existait. Corrigé par un solveur avec backtracking.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { createStages, getPipeline, launchStage, simulateStage } from "@/engine/pipeline-server";

async function mk(n: number): Promise<string> {
  const t = await prisma.tournament.create({ data: {
    name: "swiss-rematch", continentCode: "EU", country: "BE", city: "S",
    dateStart: new Date("2026-08-01T07:00:00Z"), dateEnd: new Date("2026-08-02T16:00:00Z"),
    format: "pipeline", gameDurationMin: 12, maxTeams: n, registrationFeePerTeam: 0,
    registrationFeeCurrency: "EUR", contactEmail: "s@t.l", saturdayFormat: "ALL_DAY",
    sundayFormat: "SE", status: "UPCOMING", courtsCount: 2, timezone: "Europe/Brussels",
    usesPipeline: true, testMode: true, hidden: true } as never });
  await prisma.team.createMany({ data: Array.from({ length: n }, (_, i) => ({ tournamentId: t.id, name: `T${i + 1}`, seed: i + 1 })) });
  return t.id;
}

const key = (a: string, b: string) => [a, b].sort().join("~");

async function rematchesPerGroup(id: string): Promise<number> {
  const t = await getPipeline(id);
  const ms = t!.stages[0].matches;
  const seen = new Map<string, number>();
  for (const m of ms) if (m.teamAId && m.teamBId) {
    const k = key(m.teamAId, m.teamBId);
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return [...seen.values()].filter((c) => c > 1).length;
}

beforeAll(async () => { await assertSimDatabase(); });
beforeEach(async () => { await resetSimDb(); });

describe("Swiss — aucun rematch évitable", () => {
  it("2 groupes × 8 équipes, 4 rounds", async () => {
    const id = await mk(16);
    await createStages(id, [
      { name: "Swiss", type: "SWISS", config: { rounds: 4 }, entryRules: { sources: [{ kind: "registration" }], groups: 2, groupAssign: "snake" } },
    ] as never);
    await launchStage(id, 0);
    await simulateStage(id);
    expect(await rematchesPerGroup(id)).toBe(0);
  });

  it("1 groupe × 16 équipes, 6 rounds", async () => {
    const id = await mk(16);
    await createStages(id, [
      { name: "Swiss", type: "SWISS", config: { rounds: 6 }, entryRules: { sources: [{ kind: "registration" }] } },
    ] as never);
    await launchStage(id, 0);
    await simulateStage(id);
    expect(await rematchesPerGroup(id)).toBe(0);
  });

  it("nombre impair (11 équipes) avec BYE, 5 rounds", async () => {
    const id = await mk(11);
    await createStages(id, [
      { name: "Swiss", type: "SWISS", config: { rounds: 5 }, entryRules: { sources: [{ kind: "registration" }] } },
    ] as never);
    await launchStage(id, 0);
    await simulateStage(id);
    expect(await rematchesPerGroup(id)).toBe(0);
  });
});
