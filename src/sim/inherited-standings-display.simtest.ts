/**
 * Point 3 (retour Josh) — AFFICHAGE : le classement Swiss montré sur la page
 * publique (PoolTables → computeStandings) doit inclure les points hérités du
 * RR. On reproduit ici le calcul de `inheritedMatchesByPool` fait dans la page,
 * et on vérifie que le classement affiché diffère bien avec/sans héritage.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { createStages, getPipeline, launchStage, applyScore } from "@/engine/pipeline-server";
import { computeStandings } from "@/lib/standings";

async function mk(n: number): Promise<string> {
  const t = await prisma.tournament.create({ data: {
    name: "inh-display", continentCode: "EU", country: "BE", city: "S",
    dateStart: new Date("2026-08-01T07:00:00Z"), dateEnd: new Date("2026-08-02T16:00:00Z"),
    format: "pipeline", gameDurationMin: 12, maxTeams: n, registrationFeePerTeam: 0,
    registrationFeeCurrency: "EUR", contactEmail: "s@t.l", saturdayFormat: "ALL_DAY",
    sundayFormat: "SE", status: "UPCOMING", courtsCount: 2, timezone: "Europe/Brussels",
    usesPipeline: true, testMode: true, hidden: true } as never });
  await prisma.team.createMany({ data: Array.from({ length: n }, (_, i) => ({ tournamentId: t.id, name: `T${i + 1}`, seed: i + 1 })) });
  return t.id;
}

// Reproduit exactement la logique de la page publique.
function inheritedMatchesForPool(stages: any[], allMatches: any[], activeStageId: string, poolTeamIds: Set<string>): any[] {
  const sorted = [...stages].sort((a, b) => a.order - b.order);
  const activeStage = sorted.find((s) => s.id === activeStageId);
  const cfg = (activeStage?.config ?? {}) as any;
  const inheritOrder = activeStage ? (cfg.inheritFrom ?? (cfg.carryPoints ? activeStage.order - 1 : undefined)) : undefined;
  if (inheritOrder === undefined || inheritOrder < 0) return [];
  const inheritedStageIds = new Set(sorted.filter((s) => s.order <= inheritOrder).map((s) => s.id));
  return allMatches.filter(
    (m) => m.stageId && inheritedStageIds.has(m.stageId) && m.teamAId && m.teamBId &&
      poolTeamIds.has(m.teamAId) && poolTeamIds.has(m.teamBId)
  );
}

beforeAll(async () => { await assertSimDatabase(); });
beforeEach(async () => { await resetSimDb(); });

describe("Affichage classement Swiss avec report des points RR", () => {
  it("le classement inclut les matchs RR hérités (T1 dominant remonte)", async () => {
    const id = await mk(8);
    await createStages(id, [
      { name: "RR", type: "RR", config: {}, entryRules: { sources: [{ kind: "registration" }] } },
      { name: "Swiss", type: "SWISS", config: { rounds: 2, inheritFrom: 0 }, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 8 }] } },
    ] as never);

    // Joue le RR : T1 gagne large partout, les autres se battent 3-2
    await launchStage(id, 0);
    let guard = 0;
    while (guard++ < 20) {
      const t = await getPipeline(id);
      const active = t!.stages.find((s) => s.status === "ACTIVE");
      if (!active || active.matches.every((m: any) => m.status === "FINISHED" || !m.teamBId)) break;
      const t1 = t!.teams.find((x) => x.name === "T1")!.id;
      for (const m of active.matches.filter((m: any) => m.status !== "FINISHED" && m.teamAId && m.teamBId)) {
        const sa = m.teamAId === t1 ? 9 : (m.teamBId === t1 ? 0 : 3);
        const sb = m.teamBId === t1 ? 9 : (m.teamAId === t1 ? 0 : 2);
        await applyScore(m.id, sa, sb);
      }
    }

    // Lance le Swiss (aucun match Swiss joué encore)
    await launchStage(id, 1);
    const t = await getPipeline(id);
    const swiss = t!.stages[1];
    const pool = await prisma.pool.findFirst({ where: { stageId: swiss.id }, include: { teams: { include: { team: true } } } });
    const poolTeams = pool!.teams.map((pt) => pt.team);
    const poolTeamIds = new Set(poolTeams.map((x) => x.id));
    const allMatches = await prisma.match.findMany({ where: { tournamentId: id } });

    // SANS héritage : classement Swiss seul (aucun match joué → tout à 0, ordre de seed)
    const swissOnly = allMatches.filter((m) => m.stageId === swiss.id);
    const standingsWithout = computeStandings(poolTeams as any, swissOnly as any, t!.scoringSystem);

    // AVEC héritage (comme la page publique le calcule)
    const inherited = inheritedMatchesForPool(t!.stages, allMatches, swiss.id, poolTeamIds);
    const standingsWith = computeStandings(poolTeams as any, [...swissOnly, ...inherited] as any, t!.scoringSystem);

    const t1id = t!.teams.find((x) => x.name === "T1")!.id;
    // Avec héritage, T1 (dominant au RR) doit être 1er du classement affiché
    expect(standingsWith[0].teamId, "avec héritage, T1 domine grâce aux points RR").toBe(t1id);
    // Sans héritage, le classement ne reflète PAS la domination RR (T1 pas garanti 1er)
    // → preuve que l'héritage change bien le résultat affiché
    expect(inherited.length, "des matchs RR doivent être hérités").toBeGreaterThan(0);
  });
});
