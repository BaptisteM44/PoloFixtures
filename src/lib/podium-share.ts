import { prisma } from "@/lib/db";
import { getPodiumTeamIds } from "@/lib/podium";
import { getPipeline, finalRanking } from "@/engine/pipeline-server";
import type { PodiumTeam } from "@/components/PodiumStory";

const playerSelect = {
  id: true, name: true, country: true, city: true, photoPath: true, badges: true, pinnedBadges: true,
  startYear: true, hand: true, gender: true, showGender: true, activeCard: true, coachCard: true, whbpcCard: true,
} as const;

export type PodiumShareData = {
  teams: PodiumTeam[];
  /** Équipes 1re, 2e, 3e (ids) */
  podiumIds: string[];
  /** Équipe de la personne connectée, si elle a joué le tournoi */
  myTeamId: string | null;
  /** Équipe mise en avant par défaut : la sienne, sinon la gagnante */
  defaultTeamId: string;
};

/**
 * Données de l'image « résultat » à partager : toutes les équipes retenues,
 * avec leur rang (podium ; classement complet pour les tournois en étapes) et
 * leurs joueurs (cartes). null s'il n'y a pas de podium.
 */
export async function getPodiumShareData(tournamentId: string, viewerPlayerId: string | null | undefined): Promise<PodiumShareData | null> {
  const podium = await getPodiumTeamIds(tournamentId);
  const podiumIds = [podium.first, podium.second, podium.third].filter((x): x is string => !!x);
  if (podiumIds.length === 0) return null;

  const rank = new Map<string, number>();
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { usesPipeline: true } });
  if (t?.usesPipeline) {
    const pipeline = await getPipeline(tournamentId);
    if (pipeline) for (const r of finalRanking(pipeline)) rank.set(r.teamId, r.rank);
  }
  podiumIds.forEach((id, i) => rank.set(id, i + 1));

  const rows = await prisma.team.findMany({
    where: { tournamentId, selected: true },
    select: { id: true, name: true, color: true, players: { select: { player: { select: playerSelect } } } },
  });
  const teams: PodiumTeam[] = rows.map((r) => ({
    id: r.id, name: r.name, color: r.color, rank: rank.get(r.id) ?? null,
    players: r.players.map(({ player: p }) => ({
      id: p.id, name: p.name, country: p.country, city: p.city, photoPath: p.photoPath,
      badges: p.pinnedBadges?.length ? p.pinnedBadges : p.badges, startYear: p.startYear, hand: p.hand,
      gender: p.gender ?? undefined, showGender: p.showGender, activeCard: p.activeCard,
      coachData: p.coachCard ? { tournament: p.coachCard.tournament, city: p.coachCard.city, collectorNumber: p.coachCard.collectorNumber } : null,
      whbpcData: p.whbpcCard ? { ...p.whbpcCard, hand: p.whbpcCard.hand as "RIGHTIE" | "LEFTIE" } : null,
    })),
  })).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.name.localeCompare(b.name));

  const myTeamId = viewerPlayerId ? teams.find((tm) => tm.players.some((p) => p.id === viewerPlayerId))?.id ?? null : null;
  return { teams, podiumIds, myTeamId, defaultTeamId: myTeamId ?? podiumIds[0] };
}

/** « 17–18 oct. 2026 » (ou une seule date) dans la langue de la page. */
export function formatTournamentDates(locale: string, start: Date, end: Date) {
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  return start.toDateString() === end.toDateString() ? fmt.format(start) : fmt.formatRange(start, end);
}
