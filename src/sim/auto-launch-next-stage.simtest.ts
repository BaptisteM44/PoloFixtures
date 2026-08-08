/**
 * Retour Baptiste : « quand une étape se termine, l'étape suivante ne se
 * déclenche pas automatiquement ». On vérifie ici que jouer le DERNIER match
 * d'une étape (via applyScore, comme le fait l'orga) lance automatiquement
 * l'étape suivante éligible — SANS appeler launchStage à la main.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { createStages, getPipeline, launchStage, launchNextGroup, applyScore } from "@/engine/pipeline-server";

async function mk(n: number): Promise<string> {
  const t = await prisma.tournament.create({ data: {
    name: "auto-launch", continentCode: "EU", country: "BE", city: "S",
    dateStart: new Date("2026-08-01T07:00:00Z"), dateEnd: new Date("2026-08-02T16:00:00Z"),
    format: "pipeline", gameDurationMin: 12, maxTeams: n, registrationFeePerTeam: 0,
    registrationFeeCurrency: "EUR", contactEmail: "s@t.l", saturdayFormat: "ALL_DAY",
    sundayFormat: "SE", status: "UPCOMING", courtsCount: 2, timezone: "Europe/Brussels",
    usesPipeline: true, testMode: true, hidden: true } as never });
  await prisma.team.createMany({ data: Array.from({ length: n }, (_, i) => ({ tournamentId: t.id, name: `T${i + 1}`, seed: i + 1 })) });
  return t.id;
}

// Joue tous les matchs jouables d'UNE étape précise (par order) — teamA 5-2.
async function playPlayableOf(id: string, order: number): Promise<number> {
  const t = await getPipeline(id);
  const stage = t!.stages.find((s) => s.order === order);
  if (!stage || stage.status !== "ACTIVE") return 0;
  let n = 0;
  for (const m of stage.matches.filter((x: any) => x.status !== "FINISHED" && x.teamAId && x.teamBId)) {
    await applyScore(m.id, 5, 2);
    n++;
  }
  return n;
}

// Joue une étape (order) jusqu'à épuisement de ses matchs jouables (rounds
// Swiss/RR régénérés à la volée). N'AVANCE PAS sur l'étape suivante.
async function finishStage(id: string, order: number): Promise<void> {
  let guard = 0;
  while (guard++ < 40) {
    if ((await playPlayableOf(id, order)) === 0) break;
  }
}

beforeAll(async () => { await assertSimDatabase(); });
beforeEach(async () => { await resetSimDb(); });

describe("Auto-lancement de l'étape suivante à la fin d'une étape", () => {
  it("finir un RR (1 groupe) lance automatiquement le SE suivant", async () => {
    const id = await mk(8);
    await createStages(id, [
      { name: "RR", type: "RR", config: {}, entryRules: { sources: [{ kind: "registration" }] } },
      { name: "SE", type: "SE", config: { thirdPlace: false },
        entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 8 }] } },
    ] as never);

    await launchStage(id, 0); // seule l'étape 0 est lancée à la main
    // Joue TOUT le RR (étape 0 seulement) via applyScore.
    await finishStage(id, 0);

    const t = await getPipeline(id);
    const rr = t!.stages[0];
    const se = t!.stages[1];
    expect(rr.status, "le RR doit être terminé").toBe("DONE");
    expect(se.status, "le SE doit s'être lancé TOUT SEUL").toBe("ACTIVE");
    expect(se.matches.length, "le SE doit avoir généré ses matchs").toBeGreaterThan(0);
  });

  it("le SE final passe le tournoi en COMPLETED sans action manuelle", async () => {
    const id = await mk(4);
    await createStages(id, [
      { name: "RR", type: "RR", config: {}, entryRules: { sources: [{ kind: "registration" }] } },
      { name: "SE", type: "SE", config: { thirdPlace: false },
        entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 4 }] } },
    ] as never);

    await launchStage(id, 0);
    await finishStage(id, 0); // le RR finit → le SE s'auto-lance
    await finishStage(id, 1); // on joue le SE (déjà ACTIVE) → tournoi COMPLETED

    const t = await getPipeline(id);
    expect(t!.stages[1].status, "le SE doit être terminé").toBe("DONE");
    expect(t!.status, "le tournoi doit être COMPLETED").toBe("COMPLETED");
  });

  it("RR à 2 groupes séquentiels : le SE n'auto-lance qu'après le 2e groupe", async () => {
    const id = await mk(8);
    // RR à 2 groupes (config groups:2). En mode séquentiel, seul le groupe A est
    // généré au lancement ; B se lance via launchNextGroup. Le SE (dépend de
    // l'étape 0) ne doit PAS se lancer tant que le groupe B n'est pas fini.
    await createStages(id, [
      { name: "Poules", type: "RR", config: {}, entryRules: { sources: [{ kind: "registration" }], groups: 2 } },
      { name: "SE", type: "SE", config: { thirdPlace: false },
        entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 4 }] } },
    ] as never);

    await launchStage(id, 0);
    // Finit le groupe A (seul lancé en mode séquentiel par défaut).
    await finishStage(id, 0);

    let t = await getPipeline(id);
    expect(t!.stages[0].status, "l'étape n'est pas finie : groupe B pas lancé").toBe("ACTIVE");
    expect(t!.stages[1].status, "le SE ne doit PAS s'être lancé").toBe("PENDING");

    // Lance et finit le groupe B.
    await launchNextGroup(id, 0);
    await finishStage(id, 0);

    t = await getPipeline(id);
    expect(t!.stages[0].status, "les 2 groupes finis → étape DONE").toBe("DONE");
    expect(t!.stages[1].status, "le SE doit s'auto-lancer après le 2e groupe").toBe("ACTIVE");
  });
});
