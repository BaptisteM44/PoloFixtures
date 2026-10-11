/**
 * Corriger un résultat de tableau après coup : refusé si le match suivant est
 * déjà commencé/joué avec une autre équipe (sinon tableau incohérent).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { createStages, getPipeline, launchStage, applyScore } from "@/engine/pipeline-server";

async function mkSE(): Promise<string> {
  const t = await prisma.tournament.create({ data: {
    name: "corr", continentCode: "EU", country: "BE", city: "S",
    dateStart: new Date("2026-08-01T07:00:00Z"), dateEnd: new Date("2026-08-02T16:00:00Z"),
    format: "3v3", gameDurationMin: 12, maxTeams: 4, registrationFeePerTeam: 0,
    registrationFeeCurrency: "EUR", contactEmail: "s@t.l", saturdayFormat: "ALL_DAY",
    sundayFormat: "SE", status: "UPCOMING", courtsCount: 1, timezone: "Europe/Brussels",
    usesPipeline: true, testMode: true, hidden: true } as never });
  await prisma.team.createMany({ data: Array.from({ length: 4 }, (_, i) => ({ tournamentId: t.id, name: `T${i + 1}`, seed: i + 1 })) });
  await createStages(t.id, [{ name: "SE", type: "SE", config: {}, entryRules: { sources: [{ kind: "registration" }] } }] as never);
  await launchStage(t.id, 0);
  return t.id;
}
const bySide = async (id: string) => {
  const s = (await getPipeline(id))!.stages[0];
  const semis = s.matches.filter((m) => m.bracketSide === "W").sort((a, b) => a.positionInRound - b.positionInRound);
  return { semis, final: s.matches.find((m) => m.bracketSide === "G")! };
};

beforeAll(async () => { await assertSimDatabase(); });
beforeEach(async () => { await resetSimDb(); });

describe("Correction d'un résultat de tableau", () => {
  it("finale jouée : changer le vainqueur d'une demie est refusé, la finale reste intacte ; même vainqueur : autorisé", async () => {
    const id = await mkSE();
    let { semis } = await bySide(id);
    await applyScore(semis[0].id, 3, 1);
    await applyScore(semis[1].id, 2, 0);
    let { final } = await bySide(id);
    expect((await applyScore(final.id, 4, 2)).ok).toBe(true);
    const before = await prisma.match.findUniqueOrThrow({ where: { id: final.id } });

    const res = await applyScore(semis[0].id, 1, 3); // le vainqueur changerait
    expect(res.error).toMatch(/match suivant|next match/i);
    const after = await prisma.match.findUniqueOrThrow({ where: { id: final.id } });
    expect(after.teamAId).toBe(before.teamAId);
    expect((await prisma.match.findUniqueOrThrow({ where: { id: semis[0].id } })).scoreA).toBe(3);

    expect((await applyScore(semis[0].id, 5, 1)).ok).toBe(true); // même vainqueur, autre score
  });

  it("finale pas encore commencée : changer le vainqueur est permis (la finale est mise à jour)", async () => {
    const id = await mkSE();
    const { semis } = await bySide(id);
    await applyScore(semis[0].id, 3, 1);
    expect((await applyScore(semis[0].id, 1, 3)).ok).toBe(true);
    const { final } = await bySide(id);
    expect(final.teamAId).toBe(semis[0].teamBId);
  });
});
