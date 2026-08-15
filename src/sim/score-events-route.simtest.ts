/**
 * Retour terrain (tournoi réel) : à la saisie, le score s'affichait faux
 * (« 2-2 devient 3-0 »), totaux incohérents. Cause : la route events écrivait
 * les buts atomiquement (increment) MAIS réécrasait ensuite scoreA ET scoreB
 * avec les valeurs lues en début de requête (périmées) — donc une saisie
 * concurrente sur l'autre équipe était perdue.
 *
 * Ce test tape la VRAIE route POST /api/matches/[id]/events et vérifie qu'une
 * rafale de buts concurrents sur les deux équipes donne le bon score final.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "sim-user", playerId: "sim-player", role: "ADMIN" } }) }));
vi.mock("@/lib/rbac", () => ({ hasAtLeastRole: () => true }));
vi.mock("@/lib/sse", () => ({ publishMatchUpdate: () => {}, publishNewMatches: () => {}, publishTournamentUpdate: () => {} }));
vi.mock("@/lib/tournament-status", () => ({ syncTournamentCompletionById: async () => {} }));

import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";

async function mkMatch(): Promise<{ tournamentId: string; matchId: string; teamAId: string; teamBId: string }> {
  const t = await prisma.tournament.create({ data: {
    name: "score-route", continentCode: "EU", country: "BE", city: "S",
    dateStart: new Date("2026-08-01T07:00:00Z"), dateEnd: new Date("2026-08-02T16:00:00Z"),
    format: "pipeline", gameDurationMin: 12, maxTeams: 2, registrationFeePerTeam: 0,
    registrationFeeCurrency: "EUR", contactEmail: "s@t.l", saturdayFormat: "ALL_DAY",
    sundayFormat: "SE", status: "LIVE", courtsCount: 1, timezone: "Europe/Brussels",
    usesPipeline: true, testMode: true, hidden: true } as never });
  const a = await prisma.team.create({ data: { tournamentId: t.id, name: "A", seed: 1 } });
  const b = await prisma.team.create({ data: { tournamentId: t.id, name: "B", seed: 2 } });
  const m = await prisma.match.create({ data: {
    tournamentId: t.id, phase: "POOL", courtName: "Court 1", roundIndex: 1, positionInRound: 0,
    status: "LIVE", teamAId: a.id, teamBId: b.id, scoreA: 0, scoreB: 0, dayIndex: "SAT",
    startAt: new Date("2026-08-01T08:00:00Z"),
  } as never });
  return { tournamentId: t.id, matchId: m.id, teamAId: a.id, teamBId: b.id };
}

function goalReq(matchId: string, teamId: string, delta = 1) {
  return new Request(`http://sim.local/api/matches/${matchId}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "GOAL", matchClockSec: 60, teamId, delta }),
  });
}

beforeAll(async () => { await assertSimDatabase(); });
beforeEach(async () => { await resetSimDb(); });

describe("Route events — score correct sous saisies concurrentes", () => {
  it("2 buts A + 2 buts B envoyés EN CONCURRENCE → 2-2 (pas de but perdu)", async () => {
    const { matchId, teamAId, teamBId } = await mkMatch();
    const { POST } = await import("@/app/api/matches/[id]/events/route");

    // Rafale concurrente : 2 buts pour chaque équipe, tous lancés en parallèle.
    await Promise.all([
      POST(goalReq(matchId, teamAId), { params: { id: matchId } }),
      POST(goalReq(matchId, teamBId), { params: { id: matchId } }),
      POST(goalReq(matchId, teamAId), { params: { id: matchId } }),
      POST(goalReq(matchId, teamBId), { params: { id: matchId } }),
    ]);

    const m = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(m.scoreA, "2 buts A ne doivent pas être écrasés").toBe(2);
    expect(m.scoreB, "2 buts B ne doivent pas être écrasés").toBe(2);
  });

  it("séquentiel 2-2 puis END : match nul, aucun vainqueur, score intact", async () => {
    const { matchId, teamAId, teamBId } = await mkMatch();
    const { POST } = await import("@/app/api/matches/[id]/events/route");

    await POST(goalReq(matchId, teamAId), { params: { id: matchId } });
    await POST(goalReq(matchId, teamBId), { params: { id: matchId } });
    await POST(goalReq(matchId, teamAId), { params: { id: matchId } });
    await POST(goalReq(matchId, teamBId), { params: { id: matchId } });

    const endReq = new Request(`http://sim.local/api/matches/${matchId}/events`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "END", matchClockSec: 720 }),
    });
    await POST(endReq, { params: { id: matchId } });

    const m = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(m.scoreA).toBe(2);
    expect(m.scoreB).toBe(2);
    expect(m.status).toBe("FINISHED");
    expect(m.winnerTeamId, "un 2-2 ne doit pas avoir de vainqueur").toBeNull();
  });

  it("annuler un but (delta -1) décrémente sans repasser sous 0", async () => {
    const { matchId, teamAId } = await mkMatch();
    const { POST } = await import("@/app/api/matches/[id]/events/route");

    await POST(goalReq(matchId, teamAId, 1), { params: { id: matchId } });
    await POST(goalReq(matchId, teamAId, 1), { params: { id: matchId } });
    await POST(goalReq(matchId, teamAId, -1), { params: { id: matchId } }); // annulation
    let m = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(m.scoreA).toBe(1);

    // Deux annulations de plus ne doivent pas rendre le score négatif.
    await POST(goalReq(matchId, teamAId, -1), { params: { id: matchId } });
    await POST(goalReq(matchId, teamAId, -1), { params: { id: matchId } });
    m = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(m.scoreA, "le score ne descend pas sous 0").toBe(0);
  });
});
