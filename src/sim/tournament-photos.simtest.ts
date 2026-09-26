/**
 * Galerie d'un tournoi : 5 photos par personne, visibles tout de suite, du 1er
 * jour jusqu'à 7 jours après la fin. Participants/orga publient directement ;
 * une personne extérieure propose, l'orga (notifiée) valide. Notif de fin de
 * tournoi, bulles de la home, modération.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; playerId: string | null; role: string | null; name: string } } }));
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));
const notify = vi.hoisted(() => ({
  // Écrit vraiment la notif : le regroupement (« 3 photos à valider ») lit la table.
  createNotification: vi.fn(async (playerId: string, type: string, payload: Record<string, unknown>) => {
    const { prisma } = await import("@/lib/db");
    await prisma.notification.create({ data: { playerId, type: type as never, payload: payload as never } });
  }),
  notifyAllAdmins: vi.fn(async (_type: string, _payload: Record<string, unknown>) => {}),
}));
vi.mock("@/lib/notify", () => notify);

import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { GET as getGallery, POST as addPhoto, PATCH as pinGallery } from "@/app/api/tournaments/[id]/photos/route";
import { POST as moderate } from "@/app/api/tournaments/[id]/photos/moderate/route";
import { DELETE as deletePhoto } from "@/app/api/tournament-photos/[photoId]/route";
import { POST as reportPhoto } from "@/app/api/tournament-photos/[photoId]/report/route";
import { galleryPhase, loadHomeGalleries, sweepGalleryEnds, tournamentEndsAt } from "@/lib/tournament-photos";

const as = (playerId: string | null, role: string | null = null) => {
  session.current = playerId || role ? { user: { id: `u-${playerId}`, playerId, role, name: "X" } } : null;
};
const json = (body: unknown) =>
  new Request("http://sim.local/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: { id } });
const pctx = (photoId: string) => ({ params: { photoId } });
const img = () => `https://img.example/tournament-photos/${Math.random().toString(36).slice(2)}.webp`;
const DAY = 86400_000;
const calls = (type: string) =>
  (notify.createNotification.mock.calls as unknown as [string, string, Record<string, unknown>][]).filter(([, t]) => t === type);

let tid: string, orga: string, p1: string, p2: string, waitlisted: string, outsider: string, admin: string;

async function mkPlayer(name: string) {
  const p = await prisma.player.create({ data: { name, country: "Belgium", status: "ACTIVE" }, select: { id: true } });
  await prisma.playerAccount.create({ data: { playerId: p.id, email: `${p.id}@sim.test`, passwordHash: "x" } });
  return p.id;
}
/** Dates du tournoi relatives à maintenant (fuseau UTC, tests déterministes). */
async function setDates(startOffsetDays: number, endOffsetDays: number, status = "LIVE") {
  await prisma.tournament.update({
    where: { id: tid },
    data: {
      dateStart: new Date(Date.now() + startOffsetDays * DAY), dateEnd: new Date(Date.now() + endOffsetDays * DAY),
      status: status as never, photosRevealNotifiedAt: null,
    },
  });
}
async function add(playerId: string) {
  as(playerId);
  const res = await addPhoto(json({ imagePath: img() }), ctx(tid));
  return { status: res.status, body: await res.json() };
}
async function gallery(playerId: string | null, role: string | null = null) {
  as(playerId, role);
  return (await getGallery(new Request("http://sim.local"), ctx(tid))).json();
}

beforeAll(async () => {
  await assertSimDatabase();
  delete process.env.R2_PUBLIC_URL;
});
beforeEach(async () => {
  await resetSimDb();
  await prisma.tournamentPhoto.deleteMany();
  await prisma.notification.deleteMany();
  notify.createNotification.mockClear();
  notify.notifyAllAdmins.mockClear();
  [orga, p1, p2, waitlisted, outsider, admin] = await Promise.all(["Orga", "P1", "P2", "Attente", "Dehors", "Admin"].map(mkPlayer));
  const t = await prisma.tournament.create({
    data: {
      name: "Gallery Open", slug: `gallery-open-${Math.random().toString(36).slice(2, 7)}`, continentCode: "EU", country: "Belgium", city: "Brussels",
      dateStart: new Date(Date.now() - DAY), dateEnd: new Date(Date.now() + DAY), format: "pipeline", gameDurationMin: 12, maxTeams: 8,
      registrationFeePerTeam: 0, registrationFeeCurrency: "EUR", contactEmail: "a@b.c", saturdayFormat: "ALL_DAY", sundayFormat: "SE",
      status: "LIVE", courtsCount: 1, timezone: "UTC", approved: true, hidden: false, creatorId: orga,
    },
    select: { id: true },
  });
  tid = t.id;
  await prisma.team.create({ data: { tournamentId: tid, name: "A", seed: 1, selected: true, players: { create: [{ playerId: p1 }, { playerId: p2 }] } } });
  await prisma.team.create({ data: { tournamentId: tid, name: "W", seed: 2, selected: false, players: { create: [{ playerId: waitlisted }] } } });
});

describe("Fenêtre d'ouverture", () => {
  it("ouverte du 1er jour jusqu'à 7 jours après la fin (21h locale), lancement anticipé inclus", () => {
    const t = { dateStart: new Date("2026-07-11T00:00:00Z"), dateEnd: new Date("2026-07-12T00:00:00Z"), timezone: "Europe/Brussels", status: "UPCOMING" };
    expect(tournamentEndsAt(t).toISOString()).toBe("2026-07-12T19:00:00.000Z"); // 21h CEST
    expect(galleryPhase(t, new Date("2026-07-10T20:00:00Z"))).toBe("before");
    expect(galleryPhase({ ...t, status: "LIVE" }, new Date("2026-07-10T20:00:00Z"))).toBe("open"); // lancé la veille
    expect(galleryPhase(t, new Date("2026-07-11T08:00:00Z"))).toBe("open");
    expect(galleryPhase(t, new Date("2026-07-19T18:59:00Z"))).toBe("open");   // J+7, 1 min avant
    expect(galleryPhase(t, new Date("2026-07-19T19:00:00Z"))).toBe("closed");
  });

  it("sans fuseau renseigné : déduit du pays (21h à Lisbonne ou à Philadelphie, pas en UTC)", () => {
    const t = { dateStart: new Date("2026-10-02T00:00:00Z"), dateEnd: new Date("2026-10-04T00:00:00Z"), timezone: null, country: "Portugal", lng: -8.78 };
    expect(tournamentEndsAt(t).toISOString()).toBe("2026-10-04T20:00:00.000Z"); // 21h WEST
    expect(tournamentEndsAt({ ...t, country: "United States of America", lng: -75.16 }).toISOString()).toBe("2026-10-05T01:00:00.000Z"); // 21h EDT
  });

  it("avant : pas d'ajout, mais le joueur sait qu'il pourra ; après fermeture : lecture seule", async () => {
    await setDates(3, 4, "UPCOMING");
    expect((await add(p1)).body.error).toBe("not_started");
    const before = await gallery(p1);
    expect([before.phase, before.participant, before.canAdd]).toEqual(["before", true, false]);
    await setDates(-12, -10, "COMPLETED");
    expect((await add(p1)).body.error).toBe("closed");
    await setDates(-5, -3, "COMPLETED"); // fini depuis 3 jours : encore ouverte
    expect((await add(p1)).status).toBe(200);
  });
});

describe("Ajout et validation", () => {
  it("participants et orga publient directement ; extérieurs et liste d'attente proposent", async () => {
    expect((await add(p1)).body.pending).toBe(false);
    expect((await add(orga)).body.pending).toBe(false);
    expect((await add(outsider)).body.pending).toBe(true);
    expect((await add(waitlisted)).body.pending).toBe(true);
    as(null);
    expect((await addPhoto(json({ imagePath: img() }), ctx(tid))).status).toBe(401);

    // Public : seulement les photos publiées. L'extérieur voit la sienne en attente.
    const anon = await gallery(null);
    expect([anon.photos.length, anon.pending.length, anon.moderator]).toEqual([2, 0, false]);
    const mine = await gallery(outsider);
    expect(mine.mine.map((p: { pending?: boolean }) => !!p.pending)).toEqual([true]);
    // L'orga voit les photos à valider.
    expect((await gallery(orga)).pending.length).toBe(2);
  });

  it("l'orga est prévenue par UNE notif dont le compteur monte", async () => {
    await add(outsider); await add(outsider); await add(outsider);
    const notifs = await prisma.notification.findMany({ where: { playerId: orga, type: "TOURNAMENT_PHOTOS_REQUESTED" } });
    expect(notifs.length).toBe(1);
    expect((notifs[0].payload as { count: number }).count).toBe(3);
  });

  it("valider publie (auteur prévenu), refuser supprime et rend le crédit ; réservé à l'orga", async () => {
    const a = (await add(outsider)).body.id;
    const b = (await add(outsider)).body.id;
    as(p1);
    expect((await moderate(json({ photoIds: [a], approve: true }), ctx(tid))).status).toBe(403);

    as(orga);
    await moderate(json({ photoIds: [a], approve: true }), ctx(tid));
    await moderate(json({ photoIds: [b], approve: false }), ctx(tid));
    expect((await gallery(null)).photos.map((p: { id: string }) => p.id)).toEqual([a]);
    expect(await prisma.tournamentPhoto.count({ where: { id: b } })).toBe(0);
    expect(calls("TOURNAMENT_PHOTOS_DECIDED").map(([id, , p]) => [id, p.approved, p.rejected])).toEqual([[outsider, 1, 0], [outsider, 0, 1]]);
    expect((await gallery(outsider)).remaining).toBe(4);
  });

  it("5 photos max (en attente comprises) ; supprimer la sienne rend un crédit", async () => {
    for (let i = 0; i < 5; i++) expect((await add(outsider)).status).toBe(200);
    expect((await add(outsider)).body.error).toBe("no_shots_left");
    const [first] = (await gallery(outsider)).mine;
    as(outsider);
    await deletePhoto(new Request("http://sim.local"), pctx(first.id));
    expect((await add(outsider)).status).toBe(200);
  });

  it("l'orga peut retirer n'importe quelle photo de sa galerie, un autre joueur non", async () => {
    const { body } = await add(p1);
    as(p2);
    expect((await deletePhoto(new Request("http://sim.local"), pctx(body.id))).status).toBe(403);
    as(orga);
    expect((await deletePhoto(new Request("http://sim.local"), pctx(body.id))).status).toBe(200);
  });
});

describe("Fin de tournoi, home et signalements", () => {
  it("notif de fin (21h dernier jour) une seule fois, s'il y a des photos, aux participants", async () => {
    await add(p1);
    await sweepGalleryEnds();
    expect(calls("TOURNAMENT_PHOTOS_REVEALED")).toEqual([]);

    await setDates(-3, -1.5); // dernier jour ≤ hier (UTC) → terminé quelle que soit l'heure
    await sweepGalleryEnds();
    await sweepGalleryEnds();
    expect(calls("TOURNAMENT_PHOTOS_REVEALED").map(([id]) => id).sort()).toEqual([orga, p1, p2].sort());
  });

  it("home : 📷 pour le participant pendant le tournoi, galerie visible tout de suite", async () => {
    await add(p1);
    let home = await loadHomeGalleries(p1);
    expect(home.cameras.map((c) => [c.tournamentId, c.remaining])).toEqual([[tid, 4]]);
    expect(home.galleries.map((g) => [g.tournamentId, g.photos.length])).toEqual([[tid, 1]]);
    expect((await loadHomeGalleries(outsider)).cameras).toEqual([]);

    // Après la fin : plus de 📷, la galerie reste.
    await setDates(-3, -1.5, "COMPLETED");
    home = await loadHomeGalleries(p1);
    expect([home.cameras.length, home.galleries.length]).toEqual([0, 1]);

    // Au-delà de 21 jours : disparaît… sauf si l'admin l'a mise à la une.
    await setDates(-30, -29, "COMPLETED");
    expect((await loadHomeGalleries(null)).galleries).toEqual([]);
    as(admin, "ADMIN");
    await pinGallery(json({ pinned: true }), ctx(tid));
    expect((await loadHomeGalleries(null)).galleries.map((g) => g.pinned)).toEqual([true]);
  });

  it("une photo en attente n'est pas sur la home et ne se signale pas ; publiée : masquée au 3e signalement", async () => {
    const pending = (await add(outsider)).body.id;
    expect((await loadHomeGalleries(null)).galleries).toEqual([]);
    as(p2);
    expect((await reportPhoto(new Request("http://sim.local"), pctx(pending))).status).toBe(404);

    const { body } = await add(p1);
    for (const who of [p2, orga, outsider]) {
      as(who);
      await reportPhoto(new Request("http://sim.local"), pctx(body.id));
    }
    expect(notify.notifyAllAdmins).toHaveBeenCalledTimes(3);
    expect((await gallery(null)).photos).toEqual([]);
  });
});
