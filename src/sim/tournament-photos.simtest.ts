/**
 * Pellicule jetable : 5 photos par participant pendant le tournoi, secrètes
 * jusqu'à la révélation (21h heure locale le dernier jour), notif de
 * révélation, bulles de la home, modération.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; playerId: string | null; role: string | null; name: string } } }));
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));
const notify = vi.hoisted(() => ({
  createNotification: vi.fn(async (_id: string, _type: string, _payload: Record<string, unknown>) => {}),
  notifyAllAdmins: vi.fn(async (_type: string, _payload: Record<string, unknown>) => {}),
}));
vi.mock("@/lib/notify", () => notify);

import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { GET as getRoll, POST as shoot, PATCH as pinRoll } from "@/app/api/tournaments/[id]/photos/route";
import { DELETE as deletePhoto } from "@/app/api/tournament-photos/[photoId]/route";
import { POST as reportPhoto } from "@/app/api/tournament-photos/[photoId]/report/route";
import { loadHomeRolls, revealAt, rollPhase, sweepPhotoReveals } from "@/lib/tournament-photos";

const as = (playerId: string | null, role: string | null = null) => {
  session.current = playerId || role ? { user: { id: `u-${playerId}`, playerId, role, name: "X" } } : null;
};
const json = (body: unknown) =>
  new Request("http://sim.local/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: { id } });
const pctx = (photoId: string) => ({ params: { photoId } });
const img = () => `https://img.example/tournament-photos/${Math.random().toString(36).slice(2)}.webp`;
const DAY = 86400_000;

let tid: string, orga: string, p1: string, p2: string, waitlisted: string, outsider: string, admin: string;

async function mkPlayer(name: string) {
  const p = await prisma.player.create({ data: { name, country: "Belgium", status: "ACTIVE" }, select: { id: true } });
  await prisma.playerAccount.create({ data: { playerId: p.id, email: `${p.id}@sim.test`, passwordHash: "x" } });
  return p.id;
}
/** Dates du tournoi relatives à maintenant (fuseau UTC pour des tests déterministes). */
async function setDates(startOffsetDays: number, endOffsetDays: number) {
  await prisma.tournament.update({
    where: { id: tid },
    data: { dateStart: new Date(Date.now() + startOffsetDays * DAY), dateEnd: new Date(Date.now() + endOffsetDays * DAY), photosRevealNotifiedAt: null },
  });
}
async function take(playerId: string) {
  as(playerId);
  const res = await shoot(json({ imagePath: img() }), ctx(tid));
  return { status: res.status, body: await res.json() };
}
async function roll(playerId: string | null) {
  as(playerId);
  return (await getRoll(new Request("http://sim.local"), ctx(tid))).json();
}

beforeAll(async () => {
  await assertSimDatabase();
  delete process.env.R2_PUBLIC_URL;
});
beforeEach(async () => {
  await resetSimDb();
  await prisma.tournamentPhoto.deleteMany();
  notify.createNotification.mockClear();
  notify.notifyAllAdmins.mockClear();
  [orga, p1, p2, waitlisted, outsider, admin] = await Promise.all(["Orga", "P1", "P2", "Attente", "Dehors", "Admin"].map(mkPlayer));
  const t = await prisma.tournament.create({
    data: {
      name: "Roll Open", slug: `roll-open-${Math.random().toString(36).slice(2, 7)}`, continentCode: "EU", country: "Belgium", city: "Brussels",
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

describe("Phases et heure de révélation", () => {
  it("révélation à 21h heure locale le dernier jour", () => {
    const t = { dateStart: new Date("2026-07-11T00:00:00Z"), dateEnd: new Date("2026-07-12T00:00:00Z"), timezone: "Europe/Brussels" };
    expect(revealAt(t).toISOString()).toBe("2026-07-12T19:00:00.000Z"); // 21h CEST
    expect(rollPhase(t, new Date("2026-07-10T20:00:00Z"))).toBe("before");
    expect(rollPhase(t, new Date("2026-07-12T18:59:00Z"))).toBe("shooting");
    expect(rollPhase(t, new Date("2026-07-12T19:00:00Z"))).toBe("revealed");
  });
});

describe("Prise de vue", () => {
  it("joueurs sélectionnés et orga peuvent shooter ; liste d'attente et extérieurs non", async () => {
    expect((await take(p1)).status).toBe(200);
    expect((await take(orga)).status).toBe(200);
    expect((await take(waitlisted)).body.error).toBe("not_participant");
    expect((await take(outsider)).body.error).toBe("not_participant");
    as(null);
    expect((await shoot(json({ imagePath: img() }), ctx(tid))).status).toBe(401);
  });

  it("5 photos max ; supprimer la sienne rend un crédit", async () => {
    for (let i = 0; i < 5; i++) expect((await take(p1)).status).toBe(200);
    expect((await take(p1)).body.error).toBe("no_shots_left");
    const [first] = (await roll(p1)).mine;
    as(p1);
    expect((await deletePhoto(new Request("http://sim.local"), pctx(first.id))).status).toBe(200);
    expect((await take(p1)).status).toBe(200);
  });

  it("pas de photo avant le tournoi ni après la révélation", async () => {
    await setDates(3, 4);
    expect((await take(p1)).body.error).toBe("not_started");
    await setDates(-4, -2);
    expect((await take(p1)).body.error).toBe("revealed");
  });
});

describe("Secret jusqu'à la révélation", () => {
  it("avant : chacun ne voit que les siennes + le total ; après : tout le monde voit tout", async () => {
    await take(p1); await take(p1); await take(p2);
    const r1 = await roll(p1);
    expect([r1.phase, r1.total, r1.mine.length, r1.photos.length, r1.remaining, r1.canShoot]).toEqual(["shooting", 3, 2, 0, 3, true]);
    const anon = await roll(null);
    expect([anon.total, anon.photos.length, anon.canShoot]).toEqual([3, 0, false]);

    await setDates(-4, -2);
    const after = await roll(outsider);
    expect([after.phase, after.photos.length]).toEqual(["revealed", 3]);
  });

  it("l'orga ne supprime pas une photo avant la révélation, seulement après", async () => {
    const { body } = await take(p1);
    as(orga);
    expect((await deletePhoto(new Request("http://sim.local"), pctx(body.id))).status).toBe(403);
    await setDates(-4, -2);
    expect((await deletePhoto(new Request("http://sim.local"), pctx(body.id))).status).toBe(200);
  });
});

describe("Révélation, home et modération", () => {
  it("notif de révélation une seule fois aux participants (pas avant 21h)", async () => {
    await take(p1);
    await sweepPhotoReveals();
    expect(notify.createNotification).not.toHaveBeenCalled();

    await setDates(-3, -1.5); // dernier jour ≤ hier (UTC) → révélée quelle que soit l'heure
    await sweepPhotoReveals();
    await sweepPhotoReveals();
    const recipients = (notify.createNotification.mock.calls as unknown as [string, string][]).map(([id]) => id).sort();
    expect(recipients).toEqual([orga, p1, p2].sort()); // pas la liste d'attente
  });

  it("home : appareil pour le participant pendant le tournoi, puis pellicule révélée", async () => {
    await take(p1);
    let home = await loadHomeRolls(p1);
    expect(home.cameras.map((c) => [c.tournamentId, c.remaining])).toEqual([[tid, 4]]);
    expect(home.rolls).toEqual([]);
    expect((await loadHomeRolls(outsider)).cameras).toEqual([]);

    await setDates(-3, -1);
    home = await loadHomeRolls(outsider);
    expect(home.rolls.map((r) => [r.tournamentId, r.photos.length, r.pinned])).toEqual([[tid, 1, false]]);

    // Au-delà de 21 jours : disparaît… sauf si l'admin l'a mise à la une.
    await setDates(-30, -29);
    expect((await loadHomeRolls(null)).rolls).toEqual([]);
    as(admin, "ADMIN");
    await pinRoll(json({ pinned: true }), ctx(tid));
    expect((await loadHomeRolls(null)).rolls.map((r) => r.pinned)).toEqual([true]);
  });

  it("signalement après révélation : masquée d'office au 3e", async () => {
    const { body } = await take(p1);
    as(p2);
    expect((await reportPhoto(new Request("http://sim.local"), pctx(body.id))).status).toBe(404); // pas encore révélée
    await setDates(-4, -2);
    for (const who of [p2, orga, outsider]) {
      as(who);
      await reportPhoto(new Request("http://sim.local"), pctx(body.id));
    }
    expect(notify.notifyAllAdmins).toHaveBeenCalledTimes(3);
    expect((await roll(null)).photos).toEqual([]);
  });
});
