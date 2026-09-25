/**
 * Sondages : création par un joueur, ciblage des votants (club/pays) et
 * validation des cibles hors périmètre, accès du créateur aux résultats (sans
 * les noms), blocage/signalement, et toutes les notifs du cycle de vie.
 * On tape les vraies routes API avec une session simulée.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; playerId: string | null; role: string | null; name: string } } }));
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));
const notify = vi.hoisted(() => ({
  // Écrit vraiment la notif : le dédoublonnage (déjà notifié ?) lit la table.
  createNotification: vi.fn(async (playerId: string, type: string, payload: Record<string, unknown>) => {
    const { prisma } = await import("@/lib/db");
    await prisma.notification.create({ data: { playerId, type: type as never, payload: payload as never } });
  }),
  notifyAllAdmins: vi.fn(async (_type: string, _payload: Record<string, unknown>) => {}),
}));
vi.mock("@/lib/notify", () => notify);

import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { POST as createPoll } from "@/app/api/polls/route";
import { PATCH as patchPoll, DELETE as deletePoll } from "@/app/api/polls/[id]/route";
import { POST as vote } from "@/app/api/polls/[id]/vote/route";
import { GET as results } from "@/app/api/polls/[id]/results/route";
import { POST as report } from "@/app/api/polls/[id]/report/route";
import { countPendingPolls } from "@/lib/poll-access";
import { GET as listApprovals } from "@/app/api/polls/approvals/route";
import { POST as decide } from "@/app/api/polls/approvals/[approvalId]/route";
import { sweepPolls } from "@/lib/poll-notify";

const as = (playerId: string | null, role: string | null = null, name = "Joueur") => {
  session.current = playerId || role ? { user: { id: `u-${playerId}`, playerId, role, name } } : null;
};
const json = (body: unknown) =>
  new Request("http://sim.local/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: { id } });

async function mkPlayer(name: string, country: string) {
  const p = await prisma.player.create({ data: { name, country, status: "ACTIVE" }, select: { id: true } });
  // Un compte est requis pour recevoir des notifs de sondage.
  await prisma.playerAccount.create({ data: { playerId: p.id, email: `${p.id}@sim.test`, passwordHash: "x" } });
  return p;
}

let creator: string, member: string, outsider: string, admin: string, clubId: string, parisClubId: string;

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET = "sim-secret";
  await assertSimDatabase();
});
beforeEach(async () => {
  await resetSimDb();
  await prisma.notification.deleteMany();
  await prisma.pollApproval.deleteMany();
  await prisma.pollReport.deleteMany();
  await prisma.pollBallot.deleteMany();
  await prisma.pollVoter.deleteMany();
  await prisma.poll.deleteMany();
  notify.createNotification.mockClear();
  notify.notifyAllAdmins.mockClear();

  creator = (await mkPlayer("Créatrice", "Belgium")).id;
  member = (await mkPlayer("Membre", "Belgium")).id;
  outsider = (await mkPlayer("Extérieur", "France")).id;
  admin = (await mkPlayer("Admin", "Belgium")).id;
  const club = await prisma.club.create({
    data: { name: "Brussels BP", city: "Brussels", country: "Belgium", continentCode: "EU", managerId: creator, approved: true },
    select: { id: true },
  });
  clubId = club.id;
  await prisma.clubMember.create({ data: { clubId, playerId: member, status: "MEMBER" } });
  // Un club étranger, géré par « outsider » : le cibler demande son accord.
  parisClubId = (await prisma.club.create({
    data: { name: "Paris BP", city: "Paris", country: "France", continentCode: "EU", managerId: outsider, approved: true },
    select: { id: true },
  })).id;
});

const calls = (type: string) =>
  (notify.createNotification.mock.calls as unknown as [string, string, Record<string, unknown>][])
    .filter(([, t]) => t === type);
const recipients = (type: string) => calls(type).map(([id]) => id).sort();

async function mkPoll(asId: string, body: Record<string, unknown>, role: string | null = null) {
  as(asId, role);
  const res = await createPoll(json({ question: "Question ?", options: ["A", "B"], ...body }));
  expect(res.status).toBe(200);
  return (await res.json()) as { id: string; pendingApprovals: number };
}

async function mkClubPoll(extra: Record<string, unknown> = {}) {
  as(creator);
  const res = await createPoll(json({ question: "Entraînement mardi ?", options: ["Oui", "Non"], eligibleClubIds: [clubId], ...extra }));
  expect(res.status).toBe(200);
  const { id } = await res.json();
  await patchPoll(json({ status: "OPEN" }), ctx(id));
  return id as string;
}

describe("Création et ciblage", () => {
  it("un joueur (non admin) peut créer un sondage ; ciblé ⇒ non-inscrits désactivés", async () => {
    const id = await mkClubPoll({ allowGuests: true });
    const poll = await prisma.poll.findUniqueOrThrow({ where: { id } });
    expect(poll.createdById).toBe(creator);
    expect(poll.eligibleClubIds).toEqual([clubId]);
    expect(poll.allowGuests).toBe(false);
  });

  it("déconnecté : création refusée", async () => {
    as(null);
    expect((await createPoll(json({ question: "Q ?", options: ["A", "B"] }))).status).toBe(401);
  });

  it("vote : membre du club OK, extérieur refusé, invité refusé", async () => {
    const id = await mkClubPoll();
    as(member);
    expect((await vote(json({ choices: ["Oui"] }), ctx(id))).status).toBe(200);
    as(outsider);
    const r = await vote(json({ choices: ["Non"] }), ctx(id));
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe("not_eligible");
    as(null);
    const g = await vote(json({ choices: ["Non"], email: "guest@example.com" }), ctx(id));
    expect((await g.json()).error).toBe("guests_not_allowed");
    expect(await prisma.pollBallot.count({ where: { pollId: id } })).toBe(1);
  });

  it("ciblage par pays (son propre pays : sans validation)", async () => {
    const { id, pendingApprovals } = await mkPoll(outsider, { eligibleCountries: ["France"] });
    expect(pendingApprovals).toBe(0);
    await patchPoll(json({ status: "OPEN" }), ctx(id));
    expect((await vote(json({ choices: ["A"] }), ctx(id))).status).toBe(200);
    as(member);
    expect((await vote(json({ choices: ["A"] }), ctx(id))).status).toBe(403);
  });

  it("plusieurs cibles : il suffit d'en respecter une (OU)", async () => {
    const { id } = await mkPoll(admin, { eligibleClubIds: [clubId], eligibleCountries: ["France"] }, "ADMIN");
    await patchPoll(json({ status: "OPEN" }), ctx(id));
    as(member);   // via le club
    expect((await vote(json({ choices: ["A"] }), ctx(id))).status).toBe(200);
    as(outsider); // via le pays
    expect((await vote(json({ choices: ["A"] }), ctx(id))).status).toBe(200);
  });
});

describe("Résultats : créateur vs admin vs votant", () => {
  it("le créateur voit chiffres + répartition, mais pas les noms ; l'admin voit les noms", async () => {
    const id = await mkClubPoll({ showResults: "HIDDEN" });
    as(member);
    await vote(json({ choices: ["Oui"] }), ctx(id));

    as(creator);
    const c = await (await results(new Request("http://sim.local"), ctx(id))).json();
    expect(c.visible).toBe(true);
    expect(c.counts.Oui).toBe(1);
    expect(c.canSeeParticipants).toBe(false);
    expect(c.voters).toBeUndefined();
    expect(c.demographics).toEqual([{ isGuest: false, club: "Brussels BP", city: null, country: "Belgium" }]);

    as(admin, "ADMIN");
    const a = await (await results(new Request("http://sim.local"), ctx(id))).json();
    expect(a.voters[0].player.name).toBe("Membre");

    // Un votant lambda ne voit rien (HIDDEN) ni aucune donnée de gestion.
    as(member);
    const m = await (await results(new Request("http://sim.local"), ctx(id))).json();
    expect(m.visible).toBe(false);
    expect(m.poll.eligibleClubIds).toBeUndefined();
  });

  it("un autre joueur ne peut ni modifier ni supprimer le sondage", async () => {
    const id = await mkClubPoll();
    as(outsider);
    expect((await patchPoll(json({ status: "CLOSED" }), ctx(id))).status).toBe(403);
    expect((await deletePoll(new Request("http://sim.local"), ctx(id))).status).toBe(403);
  });
});

describe("Modération : blocage et signalement", () => {
  it("seul l'admin bloque ; le créateur est prévenu et le sondage est gelé", async () => {
    const id = await mkClubPoll();
    as(creator);
    expect((await patchPoll(json({ blocked: true }), ctx(id))).status).toBe(403);

    as(admin, "ADMIN");
    expect((await patchPoll(json({ blocked: true, blockedReason: "Propos insultants" }), ctx(id))).status).toBe(200);
    expect(notify.createNotification).toHaveBeenCalledWith(creator, "POLL_BLOCKED", expect.objectContaining({ pollId: id, reason: "Propos insultants" }));

    as(member);
    expect((await (await vote(json({ choices: ["Oui"] }), ctx(id))).json()).error).toBe("blocked");
    as(creator);
    expect((await patchPoll(json({ status: "OPEN" }), ctx(id))).status).toBe(409);
    expect((await deletePoll(new Request("http://sim.local"), ctx(id))).status).toBe(409);

    as(admin, "ADMIN");
    await patchPoll(json({ blocked: false }), ctx(id));
    as(member);
    expect((await vote(json({ choices: ["Oui"] }), ctx(id))).status).toBe(200);
  });

  it("signalement : prévient les admins, une seule fois par personne, pas sur son propre sondage", async () => {
    const id = await mkClubPoll();
    as(outsider, null, "Extérieur");
    expect((await report(json({ reason: "Question orientée" }), ctx(id))).status).toBe(200);
    expect(notify.notifyAllAdmins).toHaveBeenCalledWith("POLL_REPORTED", expect.objectContaining({ pollId: id, reporterName: "Extérieur" }));
    expect((await report(json({ reason: "Encore une fois" }), ctx(id))).status).toBe(409);
    expect(notify.notifyAllAdmins).toHaveBeenCalledTimes(1);

    as(creator);
    expect((await report(json({ reason: "Auto-signalement" }), ctx(id))).status).toBe(400);
    as(null);
    expect((await report(json({ reason: "Anonyme" }), ctx(id))).status).toBe(401);

    // L'admin classe les signalements.
    as(admin, "ADMIN");
    await patchPoll(json({ dismissReports: true }), ctx(id));
    expect(await prisma.pollReport.count({ where: { pollId: id } })).toBe(0);
  });
});

describe("Validation des cibles hors périmètre", () => {
  it("club étranger : son gérant valide, puis le sondage peut s'ouvrir", async () => {
    const { id, pendingApprovals } = await mkPoll(creator, { eligibleClubIds: [parisClubId] });
    expect(pendingApprovals).toBe(1);
    expect(recipients("POLL_APPROVAL_REQUESTED")).toEqual([outsider]);
    // Ciblage effectif vide tant que ce n'est pas validé — et pas ouvrable.
    expect((await prisma.poll.findUniqueOrThrow({ where: { id } })).eligibleClubIds).toEqual([]);
    as(creator);
    const r = await patchPoll(json({ status: "OPEN" }), ctx(id));
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe("awaiting_approval");

    // Un autre joueur ne peut pas trancher ; le gérant du club, si.
    as(member);
    expect((await (await listApprovals()).json()).approvals).toHaveLength(0);
    as(outsider);
    const { approvals } = await (await listApprovals()).json();
    expect(approvals).toHaveLength(1);
    as(member);
    expect((await decide(json({ approve: true }), { params: { approvalId: approvals[0].id } })).status).toBe(403);
    as(outsider);
    expect((await decide(json({ approve: true }), { params: { approvalId: approvals[0].id } })).status).toBe(200);

    expect((await prisma.poll.findUniqueOrThrow({ where: { id } })).eligibleClubIds).toEqual([parisClubId]);
    expect(calls("POLL_APPROVAL_DECIDED")[0]).toEqual([creator, "POLL_APPROVAL_DECIDED", expect.objectContaining({ approved: "1", target: "Paris BP" })]);
    as(creator);
    expect((await patchPoll(json({ status: "OPEN" }), ctx(id))).status).toBe(200);
    expect(recipients("POLL_OPENED")).toEqual([outsider]);
  });

  it("refus : le sondage reste fermé jusqu'à ce que le ciblage change", async () => {
    const { id } = await mkPoll(creator, { eligibleClubIds: [clubId, parisClubId] });
    const row = await prisma.pollApproval.findFirstOrThrow({ where: { pollId: id } });
    as(outsider);
    await decide(json({ approve: false, reason: "Hors sujet" }), { params: { approvalId: row.id } });
    expect(calls("POLL_APPROVAL_DECIDED")[0][2]).toEqual(expect.objectContaining({ approved: "0", reason: "Hors sujet" }));
    as(creator);
    expect((await (await patchPoll(json({ status: "OPEN" }), ctx(id))).json()).error).toBe("approval_rejected");
    // On retire le club refusé : plus rien en attente, ouverture possible.
    await patchPoll(json({ eligibleClubIds: [clubId] }), ctx(id));
    expect((await patchPoll(json({ status: "OPEN" }), ctx(id))).status).toBe(200);
  });

  it("autre pays, continent ou tout le monde : validation par l'admin du site", async () => {
    const eu = await mkPoll(creator, { eligibleContinents: ["EU"] });
    expect(eu.pendingApprovals).toBe(1);
    expect(notify.notifyAllAdmins).toHaveBeenCalledWith("POLL_APPROVAL_REQUESTED", expect.objectContaining({ pollId: eu.id }));
    const everyone = await mkPoll(creator, {});
    expect(everyone.pendingApprovals).toBe(1);
    // L'admin voit toutes les demandes et accepte « tout le monde ».
    as(admin, "ADMIN");
    const { approvals } = await (await listApprovals()).json();
    expect(approvals).toHaveLength(2);
    const global = approvals.find((a: { poll: { id: string } }) => a.poll.id === everyone.id);
    await decide(json({ approve: true }), { params: { approvalId: global.id } });
    as(creator);
    expect((await patchPoll(json({ status: "OPEN" }), ctx(everyone.id))).status).toBe(200);
    // L'admin, lui, cible librement.
    expect((await mkPoll(admin, { eligibleContinents: ["EU"] }, "ADMIN")).pendingApprovals).toBe(0);
  });

  it("sondage ouvert : on élargit (nouveaux concernés notifiés), on ne réduit pas", async () => {
    const id = await mkClubPoll();
    expect(recipients("POLL_OPENED")).toEqual([member]);
    as(creator);
    const narrow = await patchPoll(json({ eligibleClubIds: [] , eligibleCountries: ["Belgium"] }), ctx(id));
    expect((await narrow.json()).error).toBe("cannot_narrow");

    // Élargir à la France : validation admin, puis notif aux seuls nouveaux.
    await patchPoll(json({ eligibleCountries: ["France"] }), ctx(id));
    const row = await prisma.pollApproval.findFirstOrThrow({ where: { pollId: id, status: "PENDING" } });
    as(admin, "ADMIN");
    await decide(json({ approve: true }), { params: { approvalId: row.id } });
    expect(recipients("POLL_OPENED")).toEqual([member, outsider].sort());
    as(outsider);
    expect((await vote(json({ choices: ["Oui"] }), ctx(id))).status).toBe(200);
  });
});

describe("Notifications du cycle de vie", () => {
  it("club : seuls les membres (hors créateur) sont notifiés, une seule fois", async () => {
    const id = await mkClubPoll();
    expect(recipients("POLL_OPENED")).toEqual([member]);
    as(creator);
    await patchPoll(json({ status: "CLOSED" }), ctx(id));
    await patchPoll(json({ status: "OPEN" }), ctx(id));
    expect(recipients("POLL_OPENED")).toEqual([member]);
  });

  it("pays : les joueurs du pays ; sondage pour tous : personne", async () => {
    const be = await mkPoll(creator, { eligibleCountries: ["belgium"] });
    await patchPoll(json({ status: "OPEN" }), ctx(be.id));
    expect(recipients("POLL_OPENED")).toEqual([admin, member].sort());

    notify.createNotification.mockClear();
    const all = await mkPoll(admin, {}, "ADMIN");
    await patchPoll(json({ status: "OPEN" }), ctx(all.id));
    expect(recipients("POLL_OPENED")).toEqual([]);
  });

  it("ouverture programmée : notif à l'heure d'ouverture, pas avant", async () => {
    const openAt = new Date(Date.now() + 3600_000);
    const { id } = await mkPoll(creator, { eligibleClubIds: [clubId], openAt: openAt.toISOString() });
    await patchPoll(json({ status: "OPEN" }), ctx(id));
    expect(recipients("POLL_OPENED")).toEqual([]);
    await sweepPolls({ now: new Date(openAt.getTime() + 60_000) });
    expect(recipients("POLL_OPENED")).toEqual([member]);
  });

  it("rappel avant fermeture : seulement aux concernés qui n'ont pas voté", async () => {
    await prisma.clubMember.create({ data: { clubId, playerId: admin, status: "MEMBER" } });
    const closeAt = new Date(Date.now() + 48 * 3600_000);
    const { id } = await mkPoll(creator, { eligibleClubIds: [clubId], closeAt: closeAt.toISOString() });
    await patchPoll(json({ status: "OPEN" }), ctx(id));
    as(member);
    await vote(json({ choices: ["A"] }), ctx(id));
    await sweepPolls({ now: new Date(Date.now() + 12 * 3600_000) }); // ferme dans 36 h : trop tôt
    expect(recipients("POLL_CLOSING_SOON")).toEqual([]);
    await sweepPolls({ now: new Date(Date.now() + 30 * 3600_000) }); // ferme dans 18 h
    expect(recipients("POLL_CLOSING_SOON")).toEqual([admin]);
    await sweepPolls({ now: new Date(Date.now() + 31 * 3600_000) }); // pas de doublon
    expect(recipients("POLL_CLOSING_SOON")).toEqual([admin]);
  });

  it("résultats à la fermeture : les votants inscrits sont prévenus", async () => {
    const id = await mkClubPoll({ showResults: "AT_CLOSE" });
    as(member);
    await vote(json({ choices: ["Oui"] }), ctx(id));
    expect(recipients("POLL_RESULTS_AVAILABLE")).toEqual([]);
    as(creator);
    await patchPoll(json({ status: "CLOSED" }), ctx(id));
    expect(recipients("POLL_RESULTS_AVAILABLE")).toEqual([member]);
  });

  it("paliers de votes : notif au créateur, sans doublon au re-vote", async () => {
    const id = await mkClubPoll();
    as(member);
    await vote(json({ choices: ["Oui"] }), ctx(id));
    await vote(json({ choices: ["Non"] }), ctx(id)); // re-vote : toujours 1 votant
    expect(calls("POLL_VOTE_MILESTONE").map(([id2, , p]) => [id2, p.count])).toEqual([[creator, 1]]);
  });

  it("blocage : signaleurs prévenus ; déblocage : créateur prévenu", async () => {
    const id = await mkClubPoll();
    as(member);
    await report(json({ reason: "Question orientée" }), ctx(id));
    as(admin, "ADMIN");
    await patchPoll(json({ blocked: true, blockedReason: "Non conforme" }), ctx(id));
    expect(calls("POLL_REPORT_HANDLED")).toEqual([[member, "POLL_REPORT_HANDLED", expect.objectContaining({ outcome: "blocked" })]]);
    await patchPoll(json({ blocked: false }), ctx(id));
    expect(recipients("POLL_UNBLOCKED")).toEqual([creator]);
  });

  it("classement sans suite : le signaleur est prévenu", async () => {
    const id = await mkClubPoll();
    as(outsider);
    await report(json({ reason: "Bizarre" }), ctx(id));
    as(admin, "ADMIN");
    await patchPoll(json({ dismissReports: true }), ctx(id));
    expect(calls("POLL_REPORT_HANDLED")).toEqual([[outsider, "POLL_REPORT_HANDLED", expect.objectContaining({ outcome: "dismissed" })]]);
  });

  it("pastille : sondages ouverts qui me concernent et pas encore votés", async () => {
    const id = await mkClubPoll();
    const all = await mkPoll(admin, {}, "ADMIN");
    await patchPoll(json({ status: "OPEN" }), ctx(all.id));

    expect(await countPendingPolls(member)).toBe(2);   // club + global
    expect(await countPendingPolls(outsider)).toBe(1); // global seulement
    expect(await countPendingPolls(creator)).toBe(1);  // global (ses propres sondages exclus)
    as(member);
    await vote(json({ choices: ["Oui"] }), ctx(id));
    expect(await countPendingPolls(member)).toBe(1);

    // Sondage historique sans créateur (createdById NULL) : bien compté.
    await prisma.poll.create({ data: { question: "Ancien ?", options: ["A", "B"], status: "OPEN" } });
    expect(await countPendingPolls(outsider)).toBe(2);
  });
});
