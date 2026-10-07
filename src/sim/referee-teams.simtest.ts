/**
 * Arbitrage par équipe : l'orga règle la règle d'une étape, répartit
 * automatiquement, force un choix à la main (jamais recalculé), cache ou non
 * les désignations. Un joueur de l'équipe arbitre peut arbitrer le match
 * (route events) et en reçoit le crédit ; rappels « ton match / tu arbitres »
 * envoyés une seule fois ~15 min avant.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; playerId: string | null; role: string | null; name: string } } }));
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));
vi.mock("@/lib/sse", () => ({ publishMatchUpdate: () => {}, publishNewMatches: () => {}, publishTournamentUpdate: () => {} }));
vi.mock("@/lib/tournament-status", () => ({ syncTournamentCompletionById: async () => {} }));
const notify = vi.hoisted(() => ({ createNotification: vi.fn(async (_p: string, _t: string, _payload: Record<string, unknown>) => {}) }));
vi.mock("@/lib/notify", async (orig) => ({ ...(await orig<typeof import("@/lib/notify")>()), createNotification: notify.createNotification }));

import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { GET as getRefs, PATCH as patchRefs } from "@/app/api/tournaments/[id]/referees/route";
import { POST as assignRefs } from "@/app/api/tournaments/[id]/referees/assign/route";
import { POST as setMatchRef } from "@/app/api/tournaments/[id]/referees/match/route";
import { POST as postEvent } from "@/app/api/matches/[id]/events/route";
import { autoFillReferees, sweepMatchReminders } from "@/lib/referees";

const as = (playerId: string | null) => {
  session.current = playerId ? { user: { id: `u-${playerId}`, playerId, role: null, name: "X" } } : null;
};
const req = (method: string, body?: unknown) =>
  new Request("http://sim.local/api", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: { id } });
const MIN = 60_000;
const calls = (type: string) =>
  (notify.createNotification.mock.calls as unknown as [string, string, Record<string, unknown>][]).filter(([, t]) => t === type);

let tid: string, orga: string, outsider: string;
const teams: { id: string; players: string[] }[] = [];

async function mkPlayer(name: string) {
  const p = await prisma.player.create({ data: { name, country: "Belgium", status: "ACTIVE" }, select: { id: true } });
  await prisma.playerAccount.create({ data: { playerId: p.id, email: `${p.id}@sim.test`, passwordHash: "x" } });
  return p.id;
}
/** Poule de 4 sur un terrain : 6 matchs, créneaux de 20 min à partir de `start`. */
async function mkMatches(start: number) {
  const [a, b, c, d] = teams.map((x) => x.id);
  const pairs = [[a, b], [c, d], [a, c], [b, d], [a, d], [b, c]];
  const ids: string[] = [];
  for (const [i, [x, y]] of pairs.entries()) {
    const m = await prisma.match.create({ data: {
      tournamentId: tid, phase: "POOL", courtName: "Court 1", roundIndex: 1, positionInRound: i,
      status: "SCHEDULED", teamAId: x, teamBId: y, scoreA: 0, scoreB: 0, dayIndex: "SAT",
      startAt: new Date(start + i * 20 * MIN),
    } as never, select: { id: true } });
    ids.push(m.id);
  }
  return ids;
}
const refsOf = async () => prisma.match.findMany({ where: { tournamentId: tid }, orderBy: { startAt: "asc" }, select: { id: true, teamAId: true, teamBId: true, refereeTeamId: true, refereeAuto: true } });

beforeAll(async () => { await assertSimDatabase(); });
beforeEach(async () => {
  await resetSimDb();
  notify.createNotification.mockClear();
  [orga, outsider] = await Promise.all(["Orga", "Dehors"].map(mkPlayer));
  const t = await prisma.tournament.create({
    data: {
      name: "Ref Cup", slug: `ref-cup-${Math.random().toString(36).slice(2, 7)}`, continentCode: "EU", country: "Belgium", city: "Brussels",
      dateStart: new Date(Date.now() - 86400_000), dateEnd: new Date(Date.now() + 86400_000), format: "pipeline", gameDurationMin: 12, maxTeams: 8,
      registrationFeePerTeam: 0, registrationFeeCurrency: "EUR", contactEmail: "a@b.c", saturdayFormat: "ALL_DAY", sundayFormat: "SE",
      status: "LIVE", courtsCount: 1, timezone: "Europe/Brussels", approved: true, hidden: false, creatorId: orga,
    },
    select: { id: true },
  });
  tid = t.id;
  teams.length = 0;
  for (const name of ["A", "B", "C", "D"]) {
    const players = [await mkPlayer(`${name}1`), await mkPlayer(`${name}2`)];
    const team = await prisma.team.create({ data: { tournamentId: tid, name, seed: teams.length + 1, selected: true, players: { create: players.map((playerId) => ({ playerId })) } }, select: { id: true } });
    teams.push({ id: team.id, players });
  }
});

describe("Répartition (orga)", () => {
  it("règle rotation → chaque match a une équipe arbitre libre ; un choix manuel survit au recalcul", async () => {
    await mkMatches(Date.now() + 2 * 3600_000);
    as(outsider);
    expect((await patchRefs(req("PATCH", { rules: { default: "rotation" } }), ctx(tid))).status).toBe(403);
    expect((await assignRefs(req("POST", { mode: "fill" }), ctx(tid))).status).toBe(403);

    as(orga);
    // Choisir une règle automatique répartit tout de suite.
    const res = await (await patchRefs(req("PATCH", { rules: { default: "rotation" } }), ctx(tid))).json();
    expect(res.assigned).toBe(6);
    expect((await (await assignRefs(req("POST", { mode: "fill" }), ctx(tid))).json()).assigned).toBe(0);
    let ms = await refsOf();
    for (const m of ms) {
      expect(m.refereeTeamId).toBeTruthy();
      expect([m.teamAId, m.teamBId]).not.toContain(m.refereeTeamId);
      expect(m.refereeAuto).toBe(true);
    }

    // Choix manuel : refusé pour une équipe qui joue le match, accepté sinon, verrouillé.
    const m0 = ms[0];
    expect((await setMatchRef(req("POST", { matchId: m0.id, teamId: m0.teamAId }), ctx(tid))).status).toBe(400);
    const other = teams.find((x) => x.id !== m0.teamAId && x.id !== m0.teamBId && x.id !== m0.refereeTeamId)!.id;
    expect((await setMatchRef(req("POST", { matchId: m0.id, teamId: other }), ctx(tid))).status).toBe(200);
    await assignRefs(req("POST", { mode: "recompute" }), ctx(tid));
    ms = await refsOf();
    expect(ms[0]).toMatchObject({ refereeTeamId: other, refereeAuto: false });
    expect(ms.slice(1).every((m) => m.refereeAuto)).toBe(true);
  });

  it("règle manuelle : autoFill ne désigne rien ; règle auto : autoFill complète (ex. bracket débloqué)", async () => {
    await mkMatches(Date.now() + 2 * 3600_000);
    await autoFillReferees(tid);
    expect((await refsOf()).every((m) => !m.refereeTeamId)).toBe(true);
    await prisma.tournament.update({ where: { id: tid }, data: { refereeSettings: { rules: { default: "rotation" }, hidden: false } } });
    await autoFillReferees(tid);
    expect((await refsOf()).every((m) => m.refereeTeamId)).toBe(true);
  });

  it("si je joue, je n'arbitre pas : choix manuel refusé pour une équipe qui joue en même temps (autre terrain, en retard)", async () => {
    const [m0] = await mkMatches(Date.now() + 2 * 3600_000);
    const match = await prisma.match.findUniqueOrThrow({ where: { id: m0 } });
    const [c, d] = teams.filter((x) => x.id !== match.teamAId && x.id !== match.teamBId);
    // C et D jouent sur le terrain 2, 6 min après (le terrain a dérivé).
    await prisma.match.create({ data: {
      tournamentId: tid, phase: "POOL", courtName: "Court 2", roundIndex: 1, positionInRound: 9, status: "SCHEDULED",
      teamAId: c.id, teamBId: d.id, scoreA: 0, scoreB: 0, dayIndex: "SAT", startAt: new Date(match.startAt.getTime() + 6 * MIN),
    } as never });
    as(orga);
    const r = await setMatchRef(req("POST", { matchId: m0, teamId: c.id }), ctx(tid));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("plays");
  });

  it("« groupes croisés » refusé dans une étape sans plusieurs groupes", async () => {
    await mkMatches(Date.now() + 2 * 3600_000);
    as(orga);
    expect((await patchRefs(req("PATCH", { rules: { default: "cross_groups" } }), ctx(tid))).status).toBe(400);
  });

  it("équipe dispensée : ses arbitrages auto sont réattribués, elle n'en reçoit plus", async () => {
    await mkMatches(Date.now() + 2 * 3600_000);
    as(orga);
    await patchRefs(req("PATCH", { rules: { default: "rotation" } }), ctx(tid));
    const loaded = (await refsOf()).map((m) => m.refereeTeamId);
    const busiest = teams.map((x) => x.id).sort((a, b) => loaded.filter((y) => y === b).length - loaded.filter((y) => y === a).length)[0];
    await patchRefs(req("PATCH", { excluded: [busiest] }), ctx(tid));
    const after = await refsOf();
    expect(after.some((m) => m.refereeTeamId === busiest)).toBe(false);
    expect(after.every((m) => m.refereeTeamId)).toBe(true);
  });

  it("désignations cachées : les joueurs ne les voient pas, l'orga si", async () => {
    await mkMatches(Date.now() + 2 * 3600_000);
    await prisma.tournament.update({ where: { id: tid }, data: { refereeSettings: { rules: { default: "rotation" }, hidden: true } } });
    await autoFillReferees(tid);

    as(teams[0].players[0]);
    const pub = await (await getRefs(req("GET"), ctx(tid))).json();
    expect(pub.visible).toBe(false);
    expect(pub.canManage).toBe(false);
    expect(pub.myTeamIds).toEqual([teams[0].id]);
    expect(pub.matches.every((m: { refereeTeamId: string | null; refereeTeam: string | null }) => !m.refereeTeamId && !m.refereeTeam)).toBe(true);

    as(orga);
    const own = await (await getRefs(req("GET"), ctx(tid))).json();
    expect(own.canManage).toBe(true);
    expect(own.matches.every((m: { refereeTeam: string | null }) => m.refereeTeam)).toBe(true);
  });
});

describe("Notifs de désignation", () => {
  it("chaque joueur des équipes désignées est prévenu ; rien si caché, tout le monde au dévoilement", async () => {
    await mkMatches(Date.now() + 2 * 3600_000);
    as(orga);
    await patchRefs(req("PATCH", { hidden: true }), ctx(tid));
    await patchRefs(req("PATCH", { rules: { default: "rotation" } }), ctx(tid));
    expect(calls("REFEREE_ASSIGNED")).toHaveLength(0);

    await patchRefs(req("PATCH", { hidden: false }), ctx(tid));
    const sent = calls("REFEREE_ASSIGNED");
    const refTeams = new Set((await refsOf()).map((m) => m.refereeTeamId));
    const expected = teams.filter((x) => refTeams.has(x.id)).flatMap((x) => x.players);
    expect(sent.map(([id]) => id).sort()).toEqual([...expected].sort());
    const [, , payload] = sent[0];
    expect(Number(payload.count)).toBeGreaterThan(0);
    expect(payload.nextTime).toMatch(/^\d{2}:\d{2}$/);
  });

  it("choix manuel : l'ancienne et la nouvelle équipe sont prévenues", async () => {
    const [m0] = await mkMatches(Date.now() + 2 * 3600_000);
    const match = await prisma.match.findUniqueOrThrow({ where: { id: m0 } });
    const [c, d] = teams.filter((x) => x.id !== match.teamAId && x.id !== match.teamBId);
    await prisma.match.update({ where: { id: m0 }, data: { refereeTeamId: c.id } });
    as(orga);
    expect((await setMatchRef(req("POST", { matchId: m0, teamId: d.id }), ctx(tid))).status).toBe(200);
    const who = new Set(calls("REFEREE_ASSIGNED").map(([id]) => id));
    expect([...c.players, ...d.players].every((p) => who.has(p))).toBe(true);
    const cPayload = calls("REFEREE_ASSIGNED").find(([id]) => id === c.players[0])![2];
    expect(Number(cPayload.count)).toBe(0);
  });
});

describe("L'équipe arbitre arbitre", () => {
  it("un joueur de l'équipe désignée peut lancer le match (et en a le crédit) ; un autre joueur non", async () => {
    const [m0] = await mkMatches(Date.now() + 2 * 3600_000);
    const match = await prisma.match.findUniqueOrThrow({ where: { id: m0 } });
    const refTeam = teams.find((x) => x.id !== match.teamAId && x.id !== match.teamBId)!;
    const stranger = teams.find((x) => x.id !== match.teamAId && x.id !== match.teamBId && x.id !== refTeam.id)!;
    await prisma.match.update({ where: { id: m0 }, data: { refereeTeamId: refTeam.id } });

    as(stranger.players[0]);
    expect((await postEvent(req("POST", { type: "START", matchClockSec: 0 }), ctx(m0))).status).toBe(401);

    as(refTeam.players[1]);
    expect((await postEvent(req("POST", { type: "START", matchClockSec: 0 }), ctx(m0))).status).toBe(200);
    const after = await prisma.match.findUniqueOrThrow({ where: { id: m0 } });
    expect(after.status).toBe("LIVE");
    expect(after.refereePlayerId).toBe(refTeam.players[1]);
  });
});

describe("Rappels 15 min avant", () => {
  it("joueurs des deux équipes + équipe arbitre, une seule fois ; seulement les matchs proches", async () => {
    const [m0, m1] = await mkMatches(Date.now() + 15 * MIN); // m0 dans 15 min, m1 dans 35 min
    const match = await prisma.match.findUniqueOrThrow({ where: { id: m0 } });
    const refTeam = teams.find((x) => x.id !== match.teamAId && x.id !== match.teamBId)!;
    await prisma.match.update({ where: { id: m0 }, data: { refereeTeamId: refTeam.id } });

    await sweepMatchReminders();
    const soon = calls("MATCH_SOON");
    expect(soon).toHaveLength(4);
    expect(new Set(soon.map(([, , p]) => p.matchId))).toEqual(new Set([m0]));
    const playing = teams.filter((x) => x.id === match.teamAId || x.id === match.teamBId).flatMap((x) => x.players);
    expect(soon.map(([id]) => id).sort()).toEqual([...playing].sort());
    expect(soon[0][2]).toMatchObject({ court: "Court 1", tournamentName: "Ref Cup" });
    expect(soon[0][2].time).toMatch(/^\d{2}:\d{2}$/);
    const refCalls = calls("REFEREE_SOON");
    expect(refCalls.map(([id]) => id).sort()).toEqual([...refTeam.players].sort());

    notify.createNotification.mockClear();
    await sweepMatchReminders();
    expect(notify.createNotification).not.toHaveBeenCalled();
    expect((await prisma.match.findUniqueOrThrow({ where: { id: m1 } })).remindersSentAt).toBeNull();
  });

  it("ça glisse : le rappel part quand le match d'avant est lancé, même si l'horaire prévu est loin", async () => {
    // Planning en avance sur l'horaire : m1 « prévu » dans 1 h, mais m0 vient d'être lancé.
    const [m0, m1, m2] = await mkMatches(Date.now() + 40 * MIN);
    await sweepMatchReminders();
    expect(notify.createNotification).not.toHaveBeenCalled(); // 40 min : trop tôt pour le premier match

    await prisma.match.update({ where: { id: m0 }, data: { status: "LIVE", remindersSentAt: new Date() } });
    await prisma.matchEvent.create({ data: { matchId: m0, type: "START", matchClockSec: 0, payload: {} } as never });
    await sweepMatchReminders({ tournamentId: tid });
    const soon = calls("MATCH_SOON");
    expect(new Set(soon.map(([, , p]) => p.matchId))).toEqual(new Set([m1])); // pas m2 : il y a encore m1 avant
    expect(soon[0][2]).toMatchObject({ next: 1 });
    expect(String(soon[0][2].afterLabel)).toContain("–");
    expect((await prisma.match.findUniqueOrThrow({ where: { id: m2 } })).remindersSentAt).toBeNull();
  });

  it("direct pas utilisé (rien n'est lancé) : on se rabat sur l'heure", async () => {
    // Le match d'avant aurait dû finir depuis longtemps mais personne ne l'a lancé.
    const [m0, m1] = await mkMatches(Date.now() - 30 * MIN);
    await prisma.match.update({ where: { id: m1 }, data: { startAt: new Date(Date.now() + 5 * MIN) } });
    await prisma.match.update({ where: { id: m0 }, data: { remindersSentAt: new Date() } });
    await sweepMatchReminders({ tournamentId: tid });
    expect(new Set(calls("MATCH_SOON").map(([, , p]) => p.matchId))).toEqual(new Set([m1]));
    expect(calls("MATCH_SOON")[0][2]).toMatchObject({ next: 0 });
  });

  it("désignations cachées : pas de rappel d'arbitrage (mais celui du match, oui)", async () => {
    const [m0] = await mkMatches(Date.now() + 10 * MIN);
    const match = await prisma.match.findUniqueOrThrow({ where: { id: m0 } });
    await prisma.match.update({ where: { id: m0 }, data: { refereeTeamId: teams.find((x) => x.id !== match.teamAId && x.id !== match.teamBId)!.id } });
    await prisma.tournament.update({ where: { id: tid }, data: { refereeSettings: { rules: {}, hidden: true } } });
    await sweepMatchReminders();
    expect(calls("MATCH_SOON")).toHaveLength(4);
    expect(calls("REFEREE_SOON")).toHaveLength(0);
  });

  it("tournoi en mode test : aucun rappel", async () => {
    await mkMatches(Date.now() + 10 * MIN);
    await prisma.tournament.update({ where: { id: tid }, data: { testMode: true } });
    await sweepMatchReminders();
    expect(notify.createNotification).not.toHaveBeenCalled();
  });
});
