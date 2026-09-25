/**
 * Sondages : création par un joueur, ciblage des votants (club/pays), accès du
 * créateur aux résultats (sans les noms), blocage par l'admin et signalement.
 * On tape les vraies routes API avec une session simulée.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; playerId: string | null; role: string | null; name: string } } }));
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));
const notify = vi.hoisted(() => ({ createNotification: vi.fn(async () => {}), notifyAllAdmins: vi.fn(async () => {}) }));
vi.mock("@/lib/notify", () => notify);

import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { POST as createPoll } from "@/app/api/polls/route";
import { PATCH as patchPoll, DELETE as deletePoll } from "@/app/api/polls/[id]/route";
import { POST as vote } from "@/app/api/polls/[id]/vote/route";
import { GET as results } from "@/app/api/polls/[id]/results/route";
import { POST as report } from "@/app/api/polls/[id]/report/route";
import { countPendingPolls } from "@/lib/poll-access";

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

let creator: string, member: string, outsider: string, admin: string, clubId: string;

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET = "sim-secret";
  await assertSimDatabase();
});
beforeEach(async () => {
  await resetSimDb();
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
});

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

  it("ciblage par pays", async () => {
    as(creator);
    const { id } = await (await createPoll(json({ question: "Pays ?", options: ["A", "B"], eligibleCountries: ["France"] }))).json();
    await patchPoll(json({ status: "OPEN" }), ctx(id));
    as(outsider);
    expect((await vote(json({ choices: ["A"] }), ctx(id))).status).toBe(200);
    as(member);
    expect((await vote(json({ choices: ["A"] }), ctx(id))).status).toBe(403);
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

describe("Notification d'ouverture et pastille", () => {
  const openedFor = () =>
    (notify.createNotification.mock.calls as unknown as [string, string][])
      .filter(([, type]) => type === "POLL_OPENED").map(([id]) => id).sort();

  it("sondage club : seuls les membres (hors créateur) sont notifiés, une seule fois", async () => {
    const id = await mkClubPoll();
    expect(openedFor()).toEqual([member]);
    // Fermeture puis réouverture : pas de nouvelle notif.
    notify.createNotification.mockClear();
    as(creator);
    await patchPoll(json({ status: "CLOSED" }), ctx(id));
    await patchPoll(json({ status: "OPEN" }), ctx(id));
    expect(openedFor()).toEqual([]);
  });

  it("sondage pays : les joueurs du pays ; sondage global : personne", async () => {
    as(creator);
    const fr = await (await createPoll(json({ question: "France ?", options: ["A", "B"], eligibleCountries: ["france"] }))).json();
    await patchPoll(json({ status: "OPEN" }), ctx(fr.id));
    expect(openedFor()).toEqual([outsider]);

    notify.createNotification.mockClear();
    const all = await (await createPoll(json({ question: "Tout le monde ?", options: ["A", "B"] }))).json();
    await patchPoll(json({ status: "OPEN" }), ctx(all.id));
    expect(openedFor()).toEqual([]);
  });

  it("pastille : sondages ouverts qui me concernent et pas encore votés", async () => {
    const id = await mkClubPoll();
    as(creator);
    const all = await (await createPoll(json({ question: "Tout le monde ?", options: ["A", "B"] }))).json();
    await patchPoll(json({ status: "OPEN" }), ctx(all.id));

    expect(await countPendingPolls(member)).toBe(2);   // club + global
    expect(await countPendingPolls(outsider)).toBe(1); // global seulement
    expect(await countPendingPolls(creator)).toBe(0);  // ses propres sondages exclus
    as(member);
    await vote(json({ choices: ["Oui"] }), ctx(id));
    expect(await countPendingPolls(member)).toBe(1);

    // Sondage historique sans créateur (createdById NULL) : bien compté.
    await prisma.poll.create({ data: { question: "Ancien ?", options: ["A", "B"], status: "OPEN" } });
    expect(await countPendingPolls(creator)).toBe(1);
  });
});
