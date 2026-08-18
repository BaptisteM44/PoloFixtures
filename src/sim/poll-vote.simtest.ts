/**
 * Sécurité du système de vote : anti-double-vote (même votant bloqué), anonymat
 * (bulletin non reliable au votant), concurrence (deux votes simultanés du même
 * votant → un seul passe). On tape la vraie logique castVote + les hash.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { hashPlayerVoter, hashGuestVoter } from "@/lib/poll-hash";
import { castVote, validateChoices } from "@/lib/poll-vote";

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
    expect(Object.keys(ballot ?? {}).sort()).toEqual(["choice", "comment", "createdAt", "id", "pollId"]);
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

  it("playerId d'un inscrit : stocké sur l'émargement, JAMAIS sur le bulletin", async () => {
    const player = await prisma.player.create({
      data: { name: "Stats Player", country: "FR", city: "Nantes" } as never,
      select: { id: true },
    });
    const pollId = await mkPoll();
    await castVote({
      pollId, voterHash: hashPlayerVoter(pollId, player.id), choices: ["Oui"],
      isGuest: false, verified: true, playerId: player.id,
    });

    const voter = await prisma.pollVoter.findFirst({ where: { pollId } });
    expect(voter?.playerId).toBe(player.id);

    // Le bulletin n'a et ne peut pas avoir de playerId (schéma sans ce champ) :
    // vérifie qu'aucun champ du bulletin ne référence le votant.
    const ballot = await prisma.pollBallot.findFirst({ where: { pollId } });
    expect(Object.keys(ballot ?? {}).sort()).toEqual(["choice", "comment", "createdAt", "id", "pollId"]);
  });

  it("guest (sans playerId) : émargement a playerId=null", async () => {
    const pollId = await mkPoll();
    await castVote({
      pollId, voterHash: hashGuestVoter(pollId, "guest@test.com"), choices: ["Non"],
      isGuest: true, verified: true, guestInfo: { name: "Guest", club: "Test Club" },
    });
    const voter = await prisma.pollVoter.findFirst({ where: { pollId } });
    expect(voter?.playerId).toBeNull();
    expect((voter?.guestInfo as any)?.club).toBe("Test Club");
  });
});

describe("Re-vote (inscrits) + commentaire", () => {
  it("re-vote : le nouveau choix remplace l'ancien (1 seul bulletin final)", async () => {
    const pollId = await mkPoll();
    const hash = hashPlayerVoter(pollId, "revoter");
    await castVote({ pollId, voterHash: hash, choices: ["Oui"], isGuest: false, verified: true, playerId: null, allowRevote: true });
    // Change d'avis :
    const res = await castVote({ pollId, voterHash: hash, choices: ["Non"], isGuest: false, verified: true, playerId: null, allowRevote: true });
    expect(res.ok).toBe(true);

    // 1 seul bulletin, avec le NOUVEAU choix. Toujours 1 seul émargement.
    const ballots = await prisma.pollBallot.findMany({ where: { pollId } });
    expect(ballots.length).toBe(1);
    expect(ballots[0].choice).toBe("Non");
    expect(await prisma.pollVoter.count({ where: { pollId } })).toBe(1);
  });

  it("sans allowRevote : le 2e vote est refusé (comportement guest/défaut)", async () => {
    const pollId = await mkPoll();
    const hash = hashGuestVoter(pollId, "noRevote@test.com");
    await castVote({ pollId, voterHash: hash, choices: ["Oui"], isGuest: true, verified: true });
    const res = await castVote({ pollId, voterHash: hash, choices: ["Non"], isGuest: true, verified: true });
    expect(res.ok).toBe(false);
    expect(await prisma.pollBallot.count({ where: { pollId } })).toBe(1);
  });

  it("commentaire anonyme : stocké sur le bulletin", async () => {
    const pollId = await mkPoll();
    await castVote({ pollId, voterHash: hashPlayerVoter(pollId, "c1"), choices: ["Oui"], isGuest: false, verified: true, comment: "super idée" });
    const ballot = await prisma.pollBallot.findFirst({ where: { pollId } });
    expect(ballot?.comment).toBe("super idée");
  });
});

describe("validateChoices — bornes min/max", () => {
  const base = { id: "p", status: "OPEN" as const, options: ["A", "B", "C", "D"], openAt: null, closeAt: null };
  it("max : refuse trop de choix", () => {
    const err = validateChoices({ ...base, multipleChoice: true, maxChoices: 2 }, ["A", "B", "C"]);
    expect(err).toContain("maximum");
  });
  it("min : refuse trop peu", () => {
    const err = validateChoices({ ...base, multipleChoice: true, minChoices: 2 }, ["A"]);
    expect(err).toContain("moins");
  });
  it("exactement N (min=max) : ok si pile le bon nombre", () => {
    expect(validateChoices({ ...base, multipleChoice: true, minChoices: 2, maxChoices: 2 }, ["A", "B"])).toBeNull();
    expect(validateChoices({ ...base, multipleChoice: true, minChoices: 2, maxChoices: 2 }, ["A"])).toContain("moins");
  });
});
