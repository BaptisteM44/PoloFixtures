/**
 * Calcul du récap « Ton année en bike polo » d'un joueur, en lecture seule.
 *
 * Ne compte que les tournois JOUÉS avec Poloperator : publics, validés, pas
 * en mode test ni créés par le bac à sable, et avec au moins un match terminé
 * sur la plateforme (un tournoi seulement annoncé ou listé ne compte pas).
 * Jamais de classement ni de victoires : des totaux, des faits.
 */
import { prisma } from "@/lib/db";
import { countryToIso } from "@/lib/country-utils";
import { geocodeTournament } from "@/lib/geocode";
import type { RecapTournament, YearRecapData } from "@/lib/year-recap";

/** Date d'ouverture à tout le monde (avant : admins seulement, pour le rodage). */
export const RECAP_OPENS_AT: Record<number, string> = { 2026: "2026-12-08T00:00:00Z" };

export const recapIsOpen = (year: number, now = new Date()) =>
  !!RECAP_OPENS_AT[year] && now >= new Date(RECAP_OPENS_AT[year]);

const yearRange = (year: number) => ({ gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) });

/** Un vrai match joué sur la plateforme (pas une case vide de tableau). */
const PLAYED_MATCH = { status: "FINISHED" as const, teamAId: { not: null }, teamBId: { not: null } };

/** Tournoi « joué avec Poloperator » dans l'année. */
export function playedTournamentWhere(year: number) {
  return {
    dateStart: yearRange(year),
    testMode: false,
    createdViaSandbox: false,
    approved: true,
    hidden: false,
    matches: { some: PLAYED_MATCH },
  };
}

const countryKey = (c: string | null | undefined) => (c ? countryToIso(c) ?? c.trim().toLowerCase() : null);

// ── Chiffres de la communauté : les mêmes pour tout le monde, gardés 1 h en mémoire ──
const communityCache = new Map<number, { at: number; data: YearRecapData["community"] }>();

export async function communityYear(year: number): Promise<YearRecapData["community"]> {
  const hit = communityCache.get(year);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.data;
  const tournaments = await prisma.tournament.findMany({ where: playedTournamentWhere(year), select: { id: true, country: true } });
  const ids = tournaments.map((t) => t.id);
  const [players, agg] = await Promise.all([
    prisma.teamPlayer.findMany({ where: { team: { selected: true, tournamentId: { in: ids } } }, distinct: ["playerId"], select: { playerId: true } }),
    prisma.match.aggregate({ where: { ...PLAYED_MATCH, tournamentId: { in: ids } }, _count: { _all: true }, _sum: { scoreA: true, scoreB: true } }),
  ]);
  const data = {
    tournaments: ids.length,
    countries: new Set(tournaments.map((t) => countryKey(t.country))).size,
    players: players.length,
    matches: agg._count._all,
    goals: (agg._sum.scoreA ?? 0) + (agg._sum.scoreB ?? 0),
  };
  communityCache.set(year, { at: Date.now(), data });
  return data;
}

// ── Ville du profil sur la carte (pour les kilomètres), gardée en mémoire ──
const geoCache = new Map<string, { lat: number; lng: number } | null>();

async function homeOf(city: string | null, country: string): Promise<YearRecapData["home"]> {
  const c = city?.trim();
  if (!c) return null;
  const key = `${c.toLowerCase()}|${country.trim().toLowerCase()}`;
  if (!geoCache.has(key)) {
    const g = await geocodeTournament({ city: c, country }).catch(() => null);
    geoCache.set(key, g ? { lat: g.lat, lng: g.lng } : null);
  }
  const g = geoCache.get(key);
  return g ? { city: c, ...g } : null;
}

export async function computeYearRecap(playerId: string, year: number): Promise<YearRecapData | null> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      id: true, name: true, country: true, city: true, photoPath: true, startYear: true, badges: true, pinnedBadges: true,
      clubMemberships: { where: { status: "MEMBER" }, take: 1, select: { club: { select: { name: true } } } },
    },
  });
  if (!player) return null;
  const range = yearRange(year);

  // Ses équipes retenues dans les tournois joués de l'année
  const myTeams = await prisma.teamPlayer.findMany({
    where: { playerId, team: { selected: true, tournament: playedTournamentWhere(year) } },
    select: {
      team: {
        select: {
          id: true,
          tournament: { select: { id: true, name: true, city: true, country: true, dateStart: true, lat: true, lng: true, gameDurationMin: true } },
        },
      },
    },
  });
  const teamIds = myTeams.map((x) => x.team.id);
  const myTeamSet = new Set(teamIds);
  const teamToTournament = new Map(myTeams.map((x) => [x.team.id, x.team.tournament.id]));
  const byId = new Map(myTeams.map((x) => [x.team.tournament.id, x.team.tournament]));
  const tournaments = [...byId.values()].sort((a, b) => +a.dateStart - +b.dateStart);

  const [mates, matches, refereed, organized, hosted, photos, trainings, home, community] = await Promise.all([
    prisma.teamPlayer.findMany({
      where: { teamId: { in: teamIds }, playerId: { not: playerId } },
      select: { teamId: true, playerId: true, player: { select: { name: true } } },
    }),
    prisma.match.findMany({
      where: { ...PLAYED_MATCH, OR: [{ teamAId: { in: teamIds } }, { teamBId: { in: teamIds } }] },
      select: { id: true, tournamentId: true, teamAId: true, teamBId: true },
    }),
    prisma.match.count({
      where: { ...PLAYED_MATCH, OR: [{ refereePlayerId: playerId }, { coRefereePlayerId: playerId }], tournament: playedTournamentWhere(year) },
    }),
    prisma.tournament.count({
      where: { ...playedTournamentWhere(year), OR: [{ creatorId: playerId }, { coOrganizers: { some: { playerId, role: "ORGA" } } }] },
    }),
    prisma.accommodationGuest.count({ where: { host: { playerId, tournament: playedTournamentWhere(year) } } }),
    prisma.tournamentPhoto.count({ where: { authorId: playerId, hiddenAt: null, pendingApproval: false, createdAt: range } }),
    prisma.clubSessionAttendee.count({
      where: { playerId, status: "CONFIRMED", session: { status: "ACTIVE", date: { gte: range.gte, lt: new Date(Math.min(Date.now(), +range.lt)) } } },
    }),
    homeOf(player.city, player.country),
    communityYear(year),
  ]);

  // Buts notés à son nom (l'arbitre choisit le buteur, c'est optionnel) ; une correction compte en négatif.
  const matchIds = matches.map((m) => m.id);
  const goalEvents = matchIds.length
    ? await prisma.matchEvent.findMany({
        where: { matchId: { in: matchIds }, type: { in: ["GOAL", "GOLDEN_GOAL"] }, payload: { path: ["playerId"], equals: playerId } },
        select: { payload: true },
      })
    : [];
  const goals = Math.max(0, goalEvents.reduce((s, e) => {
    const d = Number((e.payload as { delta?: unknown } | null)?.delta ?? 1);
    return s + (Number.isFinite(d) ? d : 1);
  }, 0));

  // Adversaires croisés (joueur·euses des équipes rencontrées) et leurs pays
  const oppTeamIds = [...new Set(matches.map((m) => (myTeamSet.has(m.teamAId!) ? m.teamBId! : m.teamAId!)))].filter((id) => !myTeamSet.has(id));
  const opponents = oppTeamIds.length
    ? await prisma.teamPlayer.findMany({ where: { teamId: { in: oppTeamIds } }, select: { playerId: true, player: { select: { country: true } } } })
    : [];
  const oppPlayers = new Set(opponents.map((o) => o.playerId).filter((id) => id !== playerId));
  const oppCountries = new Set(opponents.map((o) => countryKey(o.player.country)).filter(Boolean));

  // Coéquipier·es, et le binôme : la personne avec qui on a joué le plus de tournois (au moins 2)
  const mateMap = new Map<string, { name: string; tournaments: Set<string> }>();
  for (const m of mates) {
    const e = mateMap.get(m.playerId) ?? { name: m.player.name.trim(), tournaments: new Set<string>() };
    e.tournaments.add(teamToTournament.get(m.teamId)!);
    mateMap.set(m.playerId, e);
  }
  const ranked = [...mateMap.values()].sort((a, b) => b.tournaments.size - a.tournaments.size || a.name.localeCompare(b.name));
  const buddy = ranked[0] && ranked[0].tournaments.size >= 2 ? { name: ranked[0].name, together: ranked[0].tournaments.size } : null;

  const list: RecapTournament[] = tournaments.map((t) => ({
    name: t.name, city: t.city, country: t.country, date: t.dateStart.toISOString(), lat: t.lat, lng: t.lng,
  }));

  return {
    year,
    firstName: player.name.trim().split(/\s+/)[0],
    firstSeason: player.startYear === year,
    card: {
      name: player.name.trim(), country: player.country, city: player.city, photoPath: player.photoPath,
      clubName: player.clubMemberships[0]?.club.name ?? null,
      badges: player.badges, pinnedBadges: player.pinnedBadges, startYear: player.startYear,
    },
    home,
    tournaments: list,
    teammates: { count: mateMap.size, names: ranked.map((r) => r.name), buddy },
    pitch: {
      matches: matches.length,
      minutes: matches.reduce((s, m) => s + (byId.get(m.tournamentId)?.gameDurationMin ?? 0), 0),
      goals,
      opponents: oppPlayers.size,
      opponentCountries: oppCountries.size,
    },
    scene: { refereed, organized, hosted, photos, trainings },
    badges: player.badges,
    community,
    // N° attribué quand la carte est remise (table SeasonCard, SQL à passer) ; en attendant : pas de n°.
    gift: { serial: "—" },
  };
}
