/**
 * Filet de sécurité : un tournoi pipeline encore LIVE 7 jours après sa fin,
 * sans activité depuis 3 jours, passe COMPLETED ; une activité récente
 * (événement de match) l'en empêche.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { syncLiveTournamentsCompletion } from "@/lib/tournament-status";

const DAY = 86400_000;
async function mkLive(endDaysAgo: number) {
  const t = await prisma.tournament.create({ data: {
    name: "Stale", continentCode: "EU", country: "Belgium", city: "B", timezone: "Europe/Brussels",
    dateStart: new Date(Date.now() - (endDaysAgo + 1) * DAY), dateEnd: new Date(Date.now() - endDaysAgo * DAY),
    format: "pipeline", gameDurationMin: 12, maxTeams: 4, registrationFeePerTeam: 0, registrationFeeCurrency: "EUR",
    contactEmail: "a@example.com", saturdayFormat: "ALL_DAY", sundayFormat: "SE", status: "LIVE", courtsCount: 1,
    usesPipeline: true } as never, select: { id: true } });
  await prisma.stage.create({ data: { tournamentId: t.id, order: 0, name: "Poules", type: "RR", status: "ACTIVE", config: {}, entryRules: {} } as never });
  // L'étape a été lancée pendant le tournoi (pas d'activité récente).
  await prisma.$executeRawUnsafe(`UPDATE "Stage" SET "updatedAt" = now() - interval '9 days' WHERE "tournamentId" = $1`, t.id);
  return t.id;
}

beforeAll(async () => { await assertSimDatabase(); });
beforeEach(async () => { await resetSimDb(); });

describe("Tournoi LIVE oublié", () => {
  it("7 jours après la fin et plus rien ne bouge → Terminé", async () => {
    const id = await mkLive(8);
    await syncLiveTournamentsCompletion();
    expect((await prisma.tournament.findUniqueOrThrow({ where: { id } })).status).toBe("COMPLETED");
  });

  it("une activité récente (événement de match) → reste LIVE", async () => {
    const id = await mkLive(8);
    const a = await prisma.team.create({ data: { tournamentId: id, name: "A", seed: 1 } });
    const b = await prisma.team.create({ data: { tournamentId: id, name: "B", seed: 2 } });
    const m = await prisma.match.create({ data: { tournamentId: id, phase: "POOL", courtName: "Court 1", roundIndex: 1, positionInRound: 0, status: "LIVE", teamAId: a.id, teamBId: b.id, dayIndex: "SAT", startAt: new Date() } as never });
    await prisma.matchEvent.create({ data: { matchId: m.id, type: "GOAL", matchClockSec: 10, payload: {} } });
    await syncLiveTournamentsCompletion();
    expect((await prisma.tournament.findUniqueOrThrow({ where: { id } })).status).toBe("LIVE");
  });

  it("fini il y a 4 jours seulement → reste LIVE", async () => {
    const id = await mkLive(4);
    await syncLiveTournamentsCompletion();
    expect((await prisma.tournament.findUniqueOrThrow({ where: { id } })).status).toBe("LIVE");
  });
});
