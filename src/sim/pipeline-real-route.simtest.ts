/**
 * Validation du VRAI chemin de saisie de score sur un tournoi pipeline :
 * PUT /api/matches/[id] (route utilisée par MatchEditPanel/RefereePanel en
 * prod) doit déclencher applyScore()/advanceStage() — pas juste la logique
 * moteur appelée directement (déjà couverte par pipeline.simtest.ts).
 *
 * C'est le test qui garantit que la vraie page /tournament/[id] et le vrai
 * dashboard /tournament/[id]/edit fonctionnent, pas une simulation à part.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock("@/lib/orga-auth", () => ({ getOrgaPlayerId: async () => "sim-player" }));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "sim-user", playerId: "sim-player", role: "ADMIN" } }) }));
vi.mock("@/lib/sse", () => ({ publishMatchUpdate: () => {}, publishNewMatches: () => {}, publishTournamentUpdate: () => {} }));
vi.mock("@/lib/notify", () => ({ notifyTeamPlayers: async () => {}, createNotification: async () => {} }));
vi.mock("@/lib/web-push", () => ({ sendPushToPlayer: async () => {} }));

import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb, mulberry32 } from "./sim-db";
import { playAllPlayable } from "./harness";
import { createStages, getPipeline } from "@/engine/pipeline-server";
import { PIPELINE_PRESETS } from "@/engine/presets";

async function createPipelineTournament(teamCount: number): Promise<string> {
  const t = await prisma.tournament.create({
    data: {
      name: "SANDBOX real-route test", continentCode: "EU", country: "BE", city: "SimCity",
      dateStart: new Date("2026-08-01T07:00:00Z"), dateEnd: new Date("2026-08-02T16:00:00Z"),
      format: "pipeline", gameDurationMin: 12, maxTeams: teamCount,
      registrationFeePerTeam: 0, registrationFeeCurrency: "EUR", contactEmail: "sim@test.local",
      saturdayFormat: "ALL_DAY", sundayFormat: "SE", status: "UPCOMING", courtsCount: 2,
      timezone: "Europe/Brussels", usesPipeline: true, testMode: true, hidden: true,
    } as never,
  });
  await prisma.team.createMany({
    data: Array.from({ length: teamCount }, (_, i) => ({ tournamentId: t.id, name: `Team ${i + 1}`, seed: i + 1 })),
  });
  return t.id;
}

beforeAll(async () => { await assertSimDatabase(); });
beforeEach(async () => { await resetSimDb(); });

describe("Pipeline via la VRAIE route PUT /api/matches/[id]", () => {
  it("un tournoi complet (Big Apple) joué en passant par la route API réelle se termine correctement", async () => {
    const rng = mulberry32(7);
    const id = await createPipelineTournament(16);
    const preset = PIPELINE_PRESETS.find((p) => p.key === "big_apple")!;
    await createStages(id, preset.build(16));

    const { launchStage, launchNextGroup } = await import("@/engine/pipeline-server");

    // Boucle : lancer la prochaine étape en attente, jouer via la vraie route, jusqu'à COMPLETED
    for (let guard = 0; guard < 40; guard++) {
      const t = await getPipeline(id);
      if (!t) throw new Error("tournoi introuvable");
      if (t.status === "COMPLETED") break;

      const active = t.stages.find((s) => s.status === "ACTIVE");
      if (!active) {
        const next = t.stages.find((s) => s.status === "PENDING");
        if (!next) break;
        const res = await launchStage(id, next.order);
        if (res.error) throw new Error(res.error);
        continue;
      }
      // Joue TOUS les matchs jouables via PUT /api/matches/[id] (vraie route)
      await playAllPlayable(id, rng);
      // Sessions séquentielles : groupe fini → l'orga lance le suivant
      // (no-op avec erreur ignorée si tous les groupes sont déjà lancés)
      await launchNextGroup(id, active.order);
    }

    const final = await getPipeline(id);
    expect(final?.status).toBe("COMPLETED");
    for (const s of final!.stages) expect(s.status, s.name).toBe("DONE");

    // Vérifie qu'aucun match n'est resté bloqué
    const allMatches = final!.stages.flatMap((s) => s.matches);
    const stuck = allMatches.filter((m) => m.status !== "FINISHED" && m.teamAId && m.teamBId);
    expect(stuck, JSON.stringify(stuck.map((m) => m.id))).toHaveLength(0);
  });

  it("une égalité en bracket SE/DE est rejetée par la vraie route (422)", async () => {
    const id = await createPipelineTournament(8);
    const preset = PIPELINE_PRESETS.find((p) => p.key === "swiss_de")!;
    await createStages(id, preset.build(8));

    const { launchStage, applyScore } = await import("@/engine/pipeline-server");
    await launchStage(id, 0); // Swiss
    const rng = mulberry32(3);
    // On joue UNIQUEMENT le Swiss (étape 0) : à sa fin le DE s'auto-lance, et on
    // veut inspecter son 1er match AVANT qu'il soit joué. (playAllPlayable jouerait
    // tout le tournoi, DE compris, à cause de l'auto-lancement.)
    let sg = 0;
    while (sg++ < 40) {
      const cur = await getPipeline(id);
      const swiss = cur!.stages[0];
      if (swiss.status !== "ACTIVE") break;
      const playable = swiss.matches.filter((m) => m.teamAId && m.teamBId && m.status !== "FINISHED");
      if (playable.length === 0) break;
      for (const m of playable) {
        let a = Math.floor(rng() * 6);
        let b = Math.floor(rng() * 6);
        if (a === b) a += 1;
        await applyScore(m.id, a, b);
      }
    }

    const t = await getPipeline(id);
    const de = t!.stages[1];
    expect(de.status, "le DE doit s'être auto-lancé à la fin du Swiss").toBe("ACTIVE");
    const firstMatch = de.matches.find((m) => m.teamAId && m.teamBId && m.status !== "FINISHED");
    expect(firstMatch).toBeDefined();

    const { PUT } = await import("@/app/api/matches/[id]/route");
    const req = new Request(`http://sim.local/api/matches/${firstMatch!.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "FINISHED", scoreA: 3, scoreB: 3 }),
    });
    const res = await PUT(req, { params: { id: firstMatch!.id } });
    expect(res.status).toBe(422);
  });
});
