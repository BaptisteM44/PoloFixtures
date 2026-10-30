/**
 * Récap de l'année : seuls les tournois JOUÉS avec Poloperator comptent (pas
 * ceux seulement annoncés, en mode test, ou d'une autre année). Buts notés à
 * son nom (corrections déduites), adversaires et leurs pays, coéquipier·es et
 * binôme, arbitrage, orga, hébergement, photos, entraînements, chiffres
 * collectifs.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";

// Pas d'appel réseau : la ville du profil est « placée » à Bruxelles.
vi.mock("@/lib/geocode", () => ({ geocodeTournament: async () => ({ lat: 50.85, lng: 4.35, precise: false }) }));

import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { computeYearRecap } from "@/lib/year-in-review";

const DAY = 86400_000;
let me: string, mate1: string, mate2: string, opp1: string, opp2: string, guestA: string, guestB: string;

async function mkPlayer(name: string, country = "Belgium") {
  return (await prisma.player.create({ data: { name, country, city: "Bruxelles", status: "ACTIVE" }, select: { id: true } })).id;
}
let n = 0;
async function mkTournament(name: string, dateStart: string, opts: { testMode?: boolean; creatorId?: string; lat?: number; lng?: number; city?: string; country?: string } = {}) {
  const start = new Date(dateStart);
  return (await prisma.tournament.create({
    data: {
      name, slug: `recap-${++n}`, continentCode: "EU", country: opts.country ?? "France", city: opts.city ?? "Lyon",
      dateStart: start, dateEnd: new Date(+start + DAY), format: "pipeline", gameDurationMin: 12, maxTeams: 8,
      registrationFeePerTeam: 0, registrationFeeCurrency: "EUR", contactEmail: "a@b.c", saturdayFormat: "ALL_DAY", sundayFormat: "SE",
      status: "COMPLETED", courtsCount: 1, timezone: "UTC", approved: true, hidden: false, testMode: opts.testMode ?? false,
      creatorId: opts.creatorId ?? null, lat: opts.lat ?? 45.76, lng: opts.lng ?? 4.84,
    },
    select: { id: true },
  })).id;
}
async function mkTeam(tournamentId: string, name: string, players: string[]) {
  const t = await prisma.team.create({ data: { tournamentId, name, seed: ++n, selected: true }, select: { id: true } });
  for (const playerId of players) await prisma.teamPlayer.create({ data: { teamId: t.id, playerId } });
  return t.id;
}
async function mkMatch(tournamentId: string, teamAId: string, teamBId: string, status: "FINISHED" | "SCHEDULED" = "FINISHED", extra: { refereePlayerId?: string } = {}) {
  return (await prisma.match.create({
    data: { tournamentId, teamAId, teamBId, status, scoreA: 3, scoreB: 2, phase: "STAGE", roundIndex: 1, courtName: "Court 1", startAt: new Date(), dayIndex: "SAT", ...extra },
    select: { id: true },
  })).id;
}
const goal = (matchId: string, playerId: string, delta?: number) =>
  prisma.matchEvent.create({ data: { matchId, type: "GOAL", matchClockSec: 60, payload: { playerId, ...(delta !== undefined ? { delta } : {}) } } });

beforeAll(async () => {
  await assertSimDatabase();
  await resetSimDb();
  me = await mkPlayer("Camille Test");
  mate1 = await mkPlayer("Léa Martin");
  mate2 = await mkPlayer("Hugo");
  opp1 = await mkPlayer("Opp Un", "France");
  opp2 = await mkPlayer("Opp Deux", "Italy");
  guestA = await mkPlayer("Invité A", "Germany");
  guestB = await mkPlayer("Invité B", "Germany");

  // T1 — mars 2026, Lyon : 2 matchs terminés + 1 pas encore joué
  const t1 = await mkTournament("Printemps Open", "2026-03-14T09:00:00Z");
  const a = await mkTeam(t1, "Les A", [me, mate1]);
  const b = await mkTeam(t1, "Les B", [opp1, opp2]);
  const m1 = await mkMatch(t1, a, b);
  await mkMatch(t1, b, a);
  await mkMatch(t1, a, b, "SCHEDULED");
  await goal(m1, me);
  await goal(m1, me);
  await goal(m1, me, -1); // correction de l'arbitre
  await goal(m1, mate1);

  // T2 — juin 2026, Graz : je l'organise, j'arbitre un match, j'héberge 2 personnes
  const t2 = await mkTournament("Été Cup", "2026-06-20T09:00:00Z", { creatorId: undefined, city: "Graz", country: "Austria", lat: 47.07, lng: 15.44 });
  await prisma.tournament.update({ where: { id: t2 }, data: { creatorId: me } });
  const c = await mkTeam(t2, "Les C", [me, mate1, mate2]);
  const d = await mkTeam(t2, "Les D", [opp1]);
  const e = await mkTeam(t2, "Les E", [guestA, guestB]);
  await mkMatch(t2, c, d);
  await mkMatch(t2, d, e, "FINISHED", { refereePlayerId: me });
  const host = await prisma.accommodationHost.create({ data: { tournamentId: t2, playerId: me, name: "Camille" }, select: { id: true } });
  for (const pid of [guestA, guestB]) {
    const tp = await prisma.teamPlayer.findFirstOrThrow({ where: { teamId: e, playerId: pid }, select: { id: true } });
    await prisma.accommodationGuest.create({ data: { hostId: host.id, teamPlayerId: tp.id } });
  }

  // Pièges : annoncé sans match joué, mode test, autre année
  const listed = await mkTournament("Annoncé seulement", "2026-09-05T09:00:00Z");
  await mkTeam(listed, "Les L", [me]);
  const test = await mkTournament("Tournoi test", "2026-10-01T09:00:00Z", { testMode: true });
  const tx = await mkTeam(test, "Les T", [me]);
  const ty = await mkTeam(test, "Les U", [opp2]);
  await mkMatch(test, tx, ty);
  const old = await mkTournament("Hiver 2025", "2025-12-06T09:00:00Z");
  const ox = await mkTeam(old, "Les O", [me]);
  const oy = await mkTeam(old, "Les P", [opp2]);
  await mkMatch(old, ox, oy);

  // Photos (une masquée), entraînements (un annulé, un à venir)
  await prisma.tournamentPhoto.create({ data: { tournamentId: t2, authorId: me, imagePath: "x.webp", createdAt: new Date("2026-06-21T10:00:00Z") } });
  await prisma.tournamentPhoto.create({ data: { tournamentId: t2, authorId: me, imagePath: "y.webp", createdAt: new Date("2026-06-21T10:00:00Z"), hiddenAt: new Date() } });
  const club = await prisma.club.create({ data: { name: "Brussels Bike Polo", city: "Bruxelles", country: "Belgium", continentCode: "EU", managerId: me }, select: { id: true } });
  await prisma.clubMember.create({ data: { clubId: club.id, playerId: me, status: "MEMBER" } });
  const sessions = [
    { date: "2026-02-01T10:00:00Z", status: "ACTIVE" },
    { date: "2026-02-08T10:00:00Z", status: "ACTIVE" },
    { date: "2026-02-15T10:00:00Z", status: "CANCELLED" },
    { date: new Date(Date.now() + 10 * DAY).toISOString(), status: "ACTIVE" },
  ];
  for (const s of sessions) {
    const cs = await prisma.clubSession.create({ data: { clubId: club.id, date: new Date(s.date), createdById: me, status: s.status }, select: { id: true } });
    await prisma.clubSessionAttendee.create({ data: { sessionId: cs.id, playerId: me, status: "CONFIRMED" } });
  }
});

describe("récap de l'année", () => {
  it("ne garde que les tournois joués avec Poloperator dans l'année, dans l'ordre des dates", async () => {
    const r = (await computeYearRecap(me, 2026))!;
    expect(r.tournaments.map((t) => t.name)).toEqual(["Printemps Open", "Été Cup"]);
    expect(r.firstName).toBe("Camille");
    expect(r.card.clubName).toBe("Brussels Bike Polo");
    expect(r.home).toMatchObject({ city: "Bruxelles" });
  });

  it("compte matchs, temps de jeu, buts notés à son nom (correction déduite) et adversaires", async () => {
    const r = (await computeYearRecap(me, 2026))!;
    expect(r.pitch.matches).toBe(3); // 2 à Lyon + 1 à Graz ; le match à venir et ceux des pièges ne comptent pas
    expect(r.pitch.minutes).toBe(36);
    expect(r.pitch.goals).toBe(1);
    expect(r.pitch.opponents).toBe(2); // Opp Un (deux fois) et Opp Deux
    expect(r.pitch.opponentCountries).toBe(2); // France, Italie
  });

  it("coéquipier·es et binôme de la saison", async () => {
    const r = (await computeYearRecap(me, 2026))!;
    expect(r.teammates.count).toBe(2);
    expect(r.teammates.buddy).toEqual({ name: "Léa Martin", together: 2 });
  });

  it("ce qu'on a fait pour la scène", async () => {
    const r = (await computeYearRecap(me, 2026))!;
    expect(r.scene).toEqual({ refereed: 1, organized: 1, hosted: 2, photos: 1, trainings: 2 });
  });

  it("chiffres collectifs : seulement les tournois joués de l'année", async () => {
    const r = (await computeYearRecap(me, 2026))!;
    expect(r.community.tournaments).toBe(2);
    expect(r.community.countries).toBe(2);
    expect(r.community.matches).toBe(4);
    expect(r.community.goals).toBe(20);
    expect(r.community.players).toBe(7);
  });

  it("une autre année ne mélange rien", async () => {
    const r = (await computeYearRecap(me, 2025))!;
    expect(r.tournaments.map((t) => t.name)).toEqual(["Hiver 2025"]);
    expect(r.scene.organized).toBe(0);
  });
});
