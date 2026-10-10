/**
 * Pré-seeding (ordre de départ choisi par l'orga) et 1er tour modifiable
 * (échanger deux équipes tant que rien n'a commencé).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { createStages, getPipeline, launchStage, applyScore, setRegistrationSeeds, swapStageTeams } from "@/engine/pipeline-server";

async function mk(n: number): Promise<{ id: string; teams: Array<{ id: string; name: string }> }> {
  const t = await prisma.tournament.create({ data: {
    name: "seed", continentCode: "EU", country: "BE", city: "S",
    dateStart: new Date("2026-08-01T07:00:00Z"), dateEnd: new Date("2026-08-02T16:00:00Z"),
    format: "3v3", gameDurationMin: 12, maxTeams: n, registrationFeePerTeam: 0,
    registrationFeeCurrency: "EUR", contactEmail: "s@t.l", saturdayFormat: "ALL_DAY",
    sundayFormat: "SE", status: "UPCOMING", courtsCount: 1, timezone: "Europe/Brussels",
    usesPipeline: true, testMode: true, hidden: true } as never });
  await prisma.team.createMany({ data: Array.from({ length: n }, (_, i) => ({ tournamentId: t.id, name: `T${i + 1}`, seed: i + 1 })) });
  const teams = await prisma.team.findMany({ where: { tournamentId: t.id }, orderBy: { seed: "asc" }, select: { id: true, name: true } });
  return { id: t.id, teams };
}
const nameOf = (teams: Array<{ id: string; name: string }>, id: string | null) => teams.find((x) => x.id === id)?.name ?? null;

beforeAll(async () => { await assertSimDatabase(); });
beforeEach(async () => { await resetSimDb(); });

describe("Pré-seeding", () => {
  it("l'ordre choisi par l'orga fait les groupes (serpentin) et le 1er round Swiss « haut contre bas »", async () => {
    const { id, teams } = await mk(8);
    await createStages(id, [
      { name: "Swiss", type: "SWISS", config: { rounds: 3, firstRound: "fold" }, entryRules: { sources: [{ kind: "registration" }] } },
    ] as never);
    // L'orga inverse l'ordre : T8 devient tête de série n°1.
    expect((await setRegistrationSeeds(id, [...teams].reverse().map((x) => x.id))).ok).toBe(true);
    await launchStage(id, 0);
    const round1 = (await getPipeline(id))!.stages[0].matches.map((m) => [nameOf(teams, m.teamAId), nameOf(teams, m.teamBId)]);
    expect(round1).toEqual(expect.arrayContaining([["T8", "T4"], ["T7", "T3"], ["T6", "T2"], ["T5", "T1"]]));
    // Une fois lancé, l'ordre de départ est figé.
    expect((await setRegistrationSeeds(id, teams.map((x) => x.id))).error).toBeTruthy();
  });
});

describe("Échanger deux équipes avant de jouer", () => {
  it("poules : l'échange déplace les équipes de groupe (entrées, poules affichées, matchs) ; refusé dès qu'un match a commencé", async () => {
    const { id, teams } = await mk(8);
    await createStages(id, [
      { name: "Poules", type: "RR", config: { courtMode: "mixed" }, entryRules: { sources: [{ kind: "registration" }], groups: 2, groupAssign: "snake" } },
    ] as never);
    await launchStage(id, 0);
    const before = (await getPipeline(id))!.stages[0];
    const groupOf = (stage: typeof before, name: string) => stage.entries.find((e) => nameOf(teams, e.teamId) === name)?.groupKey;
    const gT1 = groupOf(before, "T1"), gT2 = groupOf(before, "T2");
    expect(gT1).not.toBe(gT2); // serpentin : T1 en A, T2 en B
    const t1 = teams.find((x) => x.name === "T1")!.id, t2 = teams.find((x) => x.name === "T2")!.id;

    expect((await swapStageTeams(id, 0, t1, t2)).ok).toBe(true);
    const after = (await getPipeline(id))!.stages[0];
    expect(groupOf(after, "T1")).toBe(gT2);
    expect(groupOf(after, "T2")).toBe(gT1);
    // Les matchs de T1 sont maintenant contre les équipes de l'autre groupe.
    const t1Opp = after.matches.filter((m) => m.teamAId === t1 || m.teamBId === t1).map((m) => (m.teamAId === t1 ? m.teamBId : m.teamAId));
    const otherGroup = after.entries.filter((e) => e.groupKey === gT2 && e.teamId !== t1).map((e) => e.teamId);
    expect(t1Opp.every((o) => otherGroup.includes(o!))).toBe(true);
    const pools = await prisma.pool.findMany({ where: { stageId: after.id }, include: { teams: true } });
    expect(pools.find((p) => p.teams.some((pt) => pt.teamId === t1))!.teams.some((pt) => pt.teamId === t2)).toBe(false);

    // Un match joué → plus d'échange.
    await applyScore(after.matches.find((m) => m.teamBId)!.id, 2, 1);
    expect((await swapStageTeams(id, 0, t1, t2)).error).toBeTruthy();
  });
});
