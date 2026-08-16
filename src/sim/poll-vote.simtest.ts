/**
 * Sécurité du système de vote : anti-double-vote (même votant bloqué), anonymat
 * (bulletin non reliable au votant), concurrence (deux votes simultanés du même
 * votant → un seul passe). On tape la vraie logique castVote + les hash.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { hashPlayerVoter, hashGuestVoter } from "@/lib/poll-hash";
import { castVote } from "@/lib/poll-vote";

async function mkPoll(): Promise<string> {
  const p = await prisma.poll.create({
    data: { question: "Q?", options: ["Oui", "Non"], status: "OPEN", allowGuests: true },
    select: { id: true },
  });
  return p.id;
}

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET = "sim-secret";
  await assertSimDatabase();
});
beforeEach(async () => {
  await resetSimDb();
  // resetSimDb tronque Tournament/Player ; on nettoie aussi les polls.
  await prisma.pollBallot.deleteMany();
  await prisma.pollVoter.deleteMany();
  await prisma.poll.deleteMany();
});

describe("Vote — anti-double-vote & anonymat", () => {
  it("un inscrit vote une fois : bulletin déposé + émargement créé", async () => {
    const pollId = await mkPoll();
    const hash = hashPlayerVoter(pollId, "player1");
    const res = await castVote({ pollId, voterHash: hash, choices: ["Oui"], isGuest: false, verified: true });
    expect(res.ok).toBe(true);

    expect(await prisma.pollBallot.count({ where: { pollId } })).toBe(1);
    expect(await prisma.pollVoter.count({ where: { pollId } })).toBe(1);
    const ballot = await prisma.pollBallot.findFirst({ where: { pollId } });
    expect(ballot?.choice).toBe("Oui");
  });

  it("le MÊME inscrit ne peut pas voter deux fois", async () => {
    const pollId = await mkPoll();
    const hash = hashPlayerVoter(pollId, "player1");
    await castVote({ pollId, voterHash: hash, choices: ["Oui"], isGuest: false, verified: true });
    const second = await castVote({ pollId, voterHash: hash, choices: ["Non"], isGuest: false, verified: true });

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("already_voted");
    // AUCUN bulletin fantôme : le 2e vote n'a rien écrit.
    expect(await prisma.pollBallot.count({ where: { pollId } })).toBe(1);
  });

  it("le bulletin est ANONYME : aucun champ ne référence le votant", async () => {
    const pollId = await mkPoll();
    await castVote({ pollId, voterHash: hashPlayerVoter(pollId, "secret-player"), choices: ["Oui"], isGuest: false, verified: true });
    const ballot = await prisma.pollBallot.findFirst({ where: { pollId } });
    // Les seuls champs sont id/pollId/choice/createdAt — pas de voterHash/playerId.
    expect(Object.keys(ballot ?? {}).sort()).toEqual(["choice", "createdAt", "id", "pollId"]);
  });

  it("deux votes CONCURRENTS du même votant → un seul passe", async () => {
    const pollId = await mkPoll();
    const hash = hashGuestVoter(pollId, "a@b.com");
    const results = await Promise.all([
      castVote({ pollId, voterHash: hash, choices: ["Oui"], isGuest: true, verified: true }),
      castVote({ pollId, voterHash: hash, choices: ["Non"], isGuest: true, verified: true }),
    ]);
    const oks = results.filter((r) => r.ok).length;
    expect(oks, "un seul des deux votes concurrents doit réussir").toBe(1);
    expect(await prisma.pollBallot.count({ where: { pollId } })).toBe(1);
  });

  it("deux votants différents comptent séparément", async () => {
    const pollId = await mkPoll();
    await castVote({ pollId, voterHash: hashPlayerVoter(pollId, "p1"), choices: ["Oui"], isGuest: false, verified: true });
    await castVote({ pollId, voterHash: hashPlayerVoter(pollId, "p2"), choices: ["Non"], isGuest: false, verified: true });
    expect(await prisma.pollBallot.count({ where: { pollId } })).toBe(2);
    expect(await prisma.pollVoter.count({ where: { pollId } })).toBe(2);
  });

  it("multi-choix : plusieurs bulletins pour un seul votant", async () => {
    const pollId = await mkPoll();
    await castVote({ pollId, voterHash: hashPlayerVoter(pollId, "p1"), choices: ["Oui", "Non"], isGuest: false, verified: true });
    // 2 bulletins (un par choix), mais 1 seul émargement (le votant a voté une fois).
    expect(await prisma.pollBallot.count({ where: { pollId } })).toBe(2);
    expect(await prisma.pollVoter.count({ where: { pollId } })).toBe(1);
  });
});
