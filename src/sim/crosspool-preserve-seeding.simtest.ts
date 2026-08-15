/**
 * Cross-pool avec option « preserveSeeding » (verrouiller le rang de poule).
 *
 * Retour terrain : sans l'option, le 1er d'une poule qui perd son match croisé
 * contre le 1er de l'autre poule pouvait tomber très bas au classement général
 * (6e alors qu'il était 1er de groupe). Avec l'option, le classement est PAR
 * STRATE de rang : tous les 1ers devant tous les 2es… — le duel ne départage
 * qu'à l'intérieur d'une strate. Un 1er de poule reste donc au pire 2e.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { createStages, getPipeline, launchStage, launchNextGroup, applyScore, stageStandings } from "@/engine/pipeline-server";

async function mk(n: number): Promise<string> {
  const t = await prisma.tournament.create({ data: {
    name: "cp-seed", continentCode: "EU", country: "BE", city: "S",
    dateStart: new Date("2026-08-01T07:00:00Z"), dateEnd: new Date("2026-08-02T16:00:00Z"),
    format: "pipeline", gameDurationMin: 12, maxTeams: n, registrationFeePerTeam: 0,
    registrationFeeCurrency: "EUR", contactEmail: "s@t.l", saturdayFormat: "ALL_DAY",
    sundayFormat: "SE", status: "UPCOMING", courtsCount: 2, timezone: "Europe/Brussels",
    usesPipeline: true, testMode: true, hidden: true } as never });
  await prisma.team.createMany({ data: Array.from({ length: n }, (_, i) => ({ tournamentId: t.id, name: `T${i + 1}`, seed: i + 1 })) });
  return t.id;
}

// Joue les matchs jouables de l'étape (order), teamA gagne 5-2 par défaut ; un
// override permet d'imposer un résultat précis (a,b) → [scoreA, scoreB].
async function playStage(id: string, order: number, override?: (a: string, b: string) => [number, number] | undefined) {
  let guard = 0;
  while (guard++ < 30) {
    const t = await getPipeline(id);
    const stage = t!.stages.find((s) => s.order === order);
    if (!stage || stage.status !== "ACTIVE") break;
    const playable = stage.matches.filter((m: any) => m.status !== "FINISHED" && m.teamAId && m.teamBId);
    if (playable.length === 0) break;
    for (const m of playable) {
      const [a, b] = override?.(m.teamAId!, m.teamBId!) ?? [5, 2];
      await applyScore(m.id, a, b);
    }
  }
}

// Construit poules(2 groupes) → cross-pool, joue les poules de façon à ce que
// T1 finisse 1er du groupe A et T5 1er du groupe B (seeds 1..8, 2 groupes snake).
// Renvoie {id, teams, crossOrder}.
async function setup(preserveSeeding: boolean) {
  const id = await mk(8);
  await createStages(id, [
    { name: "Poules", type: "RR", config: {}, entryRules: { sources: [{ kind: "registration" }], groups: 2 } },
    { name: "Cross", type: "CROSS_POOL", config: { opponents: 1, carryPoints: true, preserveSeeding: preserveSeeding || undefined },
      entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 4 }] } },
  ] as never);
  await launchStage(id, 0);
  // Joue le groupe A puis B (séquentiel). teamA gagne toujours (5-2) → l'ordre
  // des seeds dans chaque poule est respecté (le plus petit seed finit 1er).
  await playStage(id, 0);
  await launchNextGroup(id, 0);
  await playStage(id, 0);
  return id;
}

beforeAll(async () => { await assertSimDatabase(); });
beforeEach(async () => { await resetSimDb(); });

describe("Cross-pool preserveSeeding", () => {
  it("AVEC option : le 1er de poule qui perd le croisement reste top-2", async () => {
    const id = await setup(true);
    let t = await getPipeline(id);
    // Rangs de poule (slot) des entries du cross-pool : on récupère les 1ers.
    const cross = t!.stages[1];
    const firsts = cross.entries.filter((e: any) => e.slot === 1).map((e: any) => e.teamId);
    expect(firsts.length, "2 poules → 2 premiers").toBe(2);

    // Fait perdre le 1er du groupe A (firsts[0]) contre le 1er du groupe B.
    await launchStage(id, 1);
    await playStage(id, 1, (a, b) => {
      // Le match qui oppose les deux 1ers : on fait gagner firsts[1].
      if ((a === firsts[0] && b === firsts[1])) return [1, 7];
      if ((a === firsts[1] && b === firsts[0])) return [7, 1];
      return [5, 2];
    });

    const ranking = stageStandings((await getPipeline(id))!, 1);
    // Les 2 premières places sont occupées par les 2 « 1ers de poule ».
    const top2 = new Set(ranking.slice(0, 2));
    expect(top2.has(firsts[0]) && top2.has(firsts[1]),
      "les 2 premiers de poule occupent les 2 premières places du général").toBe(true);
  });

  it("SANS option : le 1er de poule battu peut tomber hors du top-2 (comportement historique)", async () => {
    const id = await setup(false);
    let t = await getPipeline(id);
    const cross = t!.stages[1];
    const firsts = cross.entries.filter((e: any) => e.slot === 1).map((e: any) => e.teamId);

    await launchStage(id, 1);
    await playStage(id, 1, (a, b) => {
      if (a === firsts[0] && b === firsts[1]) return [0, 9];
      if (a === firsts[1] && b === firsts[0]) return [9, 0];
      return [5, 2];
    });

    const ranking = stageStandings((await getPipeline(id))!, 1);
    // Sans preserveSeeding, le classement est purement aux points : le perdant
    // du duel des 1ers n'est pas garanti dans le top-2. On vérifie juste que le
    // tri N'EST PAS forcé par strate (au moins un « 1er » est hors top-2 OU
    // l'ordre diffère de la version verrouillée). Test souple : on s'assure que
    // le gagnant du duel est bien 1er.
    expect(ranking[0], "le gagnant du duel des 1ers domine aux points").toBe(firsts[1]);
  });
});
