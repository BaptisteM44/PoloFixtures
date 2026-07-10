/**
 * Étape C — définir le format pipeline d'un tournoi réel (onglet Format) :
 * setTournamentPipeline bascule usesPipeline, (re)crée les étapes, refuse si
 * un match est déjà joué.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { setTournamentPipeline, getPipeline, launchStage, simulateStage, applyScore } from "@/engine/pipeline-server";

async function mkLegacy(n: number): Promise<string> {
  const t = await prisma.tournament.create({ data: {
    name: "legacy-to-pipeline", continentCode: "EU", country: "BE", city: "S",
    dateStart: new Date("2026-08-01T07:00:00Z"), dateEnd: new Date("2026-08-02T16:00:00Z"),
    format: "3v3", gameDurationMin: 12, maxTeams: n, registrationFeePerTeam: 0,
    registrationFeeCurrency: "EUR", contactEmail: "s@t.l", saturdayFormat: "ALL_DAY",
    sundayFormat: "SE", status: "UPCOMING", courtsCount: 2, timezone: "Europe/Brussels",
    usesPipeline: false, testMode: true, hidden: true } as never });
  await prisma.team.createMany({ data: Array.from({ length: n }, (_, i) => ({ tournamentId: t.id, name: `T${i + 1}`, seed: i + 1 })) });
  return t.id;
}

const SWISS_SE = [
  { name: "Swiss", type: "SWISS", config: { rounds: 3 }, entryRules: { sources: [{ kind: "registration" }] } },
  { name: "Bracket", type: "SE", config: { thirdPlace: true }, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 8 }] } },
];

beforeAll(async () => { await assertSimDatabase(); });
beforeEach(async () => { await resetSimDb(); });

describe("setTournamentPipeline — conversion legacy → pipeline", () => {
  it("un tournoi legacy vide bascule au pipeline et se joue de bout en bout", async () => {
    const id = await mkLegacy(8);
    const res = await setTournamentPipeline(id, SWISS_SE);
    expect(res.error, res.error).toBeUndefined();

    const t = await getPipeline(id);
    expect((t as any).usesPipeline ?? true).toBeTruthy();
    expect(t!.stages).toHaveLength(2);

    await launchStage(id, 0);
    await simulateStage(id);
    await launchStage(id, 1);
    await simulateStage(id);

    const final = await getPipeline(id);
    expect(final!.status).toBe("COMPLETED");
  });

  it("refuse la conversion si un match est déjà joué", async () => {
    const id = await mkLegacy(8);
    await setTournamentPipeline(id, SWISS_SE);
    await launchStage(id, 0);
    // Joue un seul match
    const t = await getPipeline(id);
    const m = t!.stages[0].matches.find((x) => x.teamAId && x.teamBId)!;
    await applyScore(m.id, 5, 3);

    // Nouvelle tentative de reformater → refusée
    const res = await setTournamentPipeline(id, SWISS_SE);
    expect(res.error).toBeDefined();
    expect(res.ok).toBeUndefined();
  });

  it("rejette une composition invalide (référence circulaire)", async () => {
    const id = await mkLegacy(8);
    const res = await setTournamentPipeline(id, [
      { name: "A", type: "SWISS", config: { rounds: 3 }, entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 8 }] } },
    ]);
    expect(res.error).toBeDefined();
  });
});
