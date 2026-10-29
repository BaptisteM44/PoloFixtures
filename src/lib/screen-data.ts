/**
 * Données de l'écran de salle : tout ce qu'il faut pour afficher les diapos
 * (matchs avec leurs événements pour le chrono, classements par groupe,
 * tableaux, sponsors) + la config des écrans. Sérialisable en JSON.
 */
import { prisma } from "@/lib/db";
import { tournamentTimezone } from "@/lib/timezone";
import { parseRefereeSettings } from "@/lib/referees";
import { getPipeline, stageStandingRows } from "@/engine/pipeline-server";
import { defaultScreens, type ScreenConfig, type SlideContext, type SlideEntry } from "@/lib/screen-slides";

export type ScreenMatch = {
  id: string;
  status: string;
  phase: string;
  courtName: string;
  startAt: string;
  roundIndex: number;
  positionInRound: number;
  bracketSide: string | null;
  scoreA: number;
  scoreB: number;
  goldenGoal: boolean;
  winnerTeamId: string | null;
  nextMatchWinId: string | null;
  nextSlotWin: string | null;
  nextMatchLoseId: string | null;
  nextSlotLose: string | null;
  teamAId: string | null;
  teamBId: string | null;
  teamA: { id: string; name: string } | null;
  teamB: { id: string; name: string } | null;
  stageId: string | null;
  groupKey: string | null;
  /** Qui arbitre (équipe ou joueur·euses) ; null si non désigné ou masqué au public. */
  referee: string | null;
  events: Array<{ id: string; type: string; matchClockSec: number; createdAt: string; payload: unknown }>;
};

export type ScreenStage = {
  id: string;
  order: number;
  name: string;
  type: string;
  status: string;
  groups: Array<{ key: string | null; rows: Array<{ teamId: string; rank: number; played: number; wins: number; draws: number; losses: number; goalDiff: number; goalsFor: number; points: number }> }>;
  entries: Array<{ teamId: string; slot: number }>;
};

export type ScreenData = {
  tournament: { id: string; slug: string; name: string; gameDurationMin: number; courtsCount: number; status: string; timezone: string | null };
  matches: ScreenMatch[];
  stages: ScreenStage[];
  sponsors: Array<{ id: string; name: string; logoPath: string | null }>;
  teams: Array<{ id: string; name: string }>;
  screens: ScreenConfig[];
  context: SlideContext;
  /** Heure serveur, pour caler le chrono de l'écran sur celui de l'arbitre. */
  serverTime: number;
};

export function toScreenConfig(s: {
  slug: string; name: string; mode: string; court: number; theme: string; clockPosition: string; swapSides: boolean;
  slides: unknown; slideSeconds: number; paused: boolean; pinnedSlide: string | null; announcement: string | null;
}): ScreenConfig {
  return {
    slug: s.slug,
    name: s.name,
    mode: s.mode === "court" ? "court" : "slideshow",
    court: s.court,
    theme: s.theme === "light" ? "light" : "dark",
    clockPosition: s.clockPosition === "bottom" ? "bottom" : "top",
    swapSides: s.swapSides === true,
    slides: Array.isArray(s.slides) ? (s.slides as SlideEntry[]) : null,
    slideSeconds: s.slideSeconds,
    paused: s.paused,
    pinnedSlide: s.pinnedSlide,
    announcement: s.announcement,
  };
}

export async function getScreenData(idOrSlug: string): Promise<ScreenData | null> {
  const t = await prisma.tournament.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: {
      id: true, slug: true, name: true, gameDurationMin: true, courtsCount: true, status: true, timezone: true, country: true, lng: true, usesPipeline: true, refereeSettings: true,
      sponsors: { select: { id: true, name: true, logoPath: true } },
      teams: { select: { id: true, name: true } },
      screens: { orderBy: { createdAt: "asc" } },
      matches: {
        orderBy: [{ startAt: "asc" }, { courtName: "asc" }],
        include: {
          teamA: { select: { id: true, name: true } },
          teamB: { select: { id: true, name: true } },
          refereeTeam: { select: { name: true } },
          referee: { select: { name: true } },
          coReferee: { select: { name: true } },
          events: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, matchClockSec: true, createdAt: true, payload: true, matchId: true } },
        },
      },
    },
  });
  if (!t) return null;

  // Classements / tableaux : système d'étapes (pipeline) uniquement.
  const stages: ScreenStage[] = [];
  if (t.usesPipeline) {
    const p = await getPipeline(t.id);
    for (const s of p?.stages ?? []) {
      const groupKeys = [...new Set(s.entries.map((e) => e.groupKey).filter(Boolean))].sort();
      const groups = ["RR", "SWISS", "CROSS_POOL"].includes(s.type)
        ? (groupKeys.length > 1 ? groupKeys : [null]).map((g) => ({
            key: g,
            rows: stageStandingRows(p!, s.order, g ?? undefined).map((r) => ({
              teamId: r.teamId, rank: r.rank, played: r.played, wins: r.wins, draws: r.draws, losses: r.losses,
              goalDiff: r.goalDiff, goalsFor: r.goalsFor, points: r.points,
            })),
          }))
        : [];
      stages.push({
        id: s.id, order: s.order, name: s.name, type: s.type, status: s.status, groups,
        entries: s.entries.filter((e) => e.teamId).map((e) => ({ teamId: e.teamId!, slot: e.slot })),
      });
    }
  }

  // Arbitres : affichés seulement si l'orga ne les a pas masqués au public.
  const refereesHidden = parseRefereeSettings(t.refereeSettings).hidden;
  const refereeOf = (m: (typeof t.matches)[number]) => {
    if (refereesHidden) return null;
    if (m.refereeTeam) return m.refereeTeam.name;
    const names = [m.referee?.name, m.coReferee?.name].filter(Boolean);
    return names.length ? names.join(" / ") : null;
  };

  // Les événements ne servent qu'au chrono des matchs en cours ou à venir.
  const matches: ScreenMatch[] = t.matches.map((m) => ({
    id: m.id, status: m.status, phase: m.phase, courtName: m.courtName, startAt: m.startAt.toISOString(),
    roundIndex: m.roundIndex, positionInRound: m.positionInRound, bracketSide: m.bracketSide,
    scoreA: m.scoreA, scoreB: m.scoreB, goldenGoal: m.goldenGoal, winnerTeamId: m.winnerTeamId,
    nextMatchWinId: m.nextMatchWinId, nextSlotWin: m.nextSlotWin, nextMatchLoseId: m.nextMatchLoseId, nextSlotLose: m.nextSlotLose,
    teamAId: m.teamAId, teamBId: m.teamBId, teamA: m.teamA, teamB: m.teamB, stageId: m.stageId, groupKey: m.groupKey,
    referee: refereeOf(m),
    events: m.status === "FINISHED" ? [] : m.events.map((e) => ({ id: e.id, type: e.type, matchClockSec: e.matchClockSec, createdAt: e.createdAt.toISOString(), payload: e.payload })),
  }));

  const stored = t.screens.map(toScreenConfig);
  const storedSlugs = new Set(stored.map((s) => s.slug));
  const screens = [...stored, ...defaultScreens(t.courtsCount).filter((d) => !storedSlugs.has(d.slug))];

  const context: SlideContext = {
    courtsCount: t.courtsCount,
    stages: stages.map((s) => ({
      order: s.order, name: s.name, type: s.type, status: s.status,
      groups: s.groups.length > 1 ? s.groups.map((g) => g.key!) : [],
      hasMatches: matches.some((m) => m.stageId === s.id),
      hasPending: matches.some((m) => m.stageId === s.id && (m.status === "LIVE" || m.status === "SCHEDULED") && !!m.teamAId && !!m.teamBId),
    })),
    hasScheduled: matches.some((m) => m.status === "SCHEDULED" || m.status === "LIVE"),
    hasReferees: matches.some((m) => (m.status === "SCHEDULED" || m.status === "LIVE") && !!m.referee),
    hasFinished: matches.some((m) => m.status === "FINISHED" && !!m.teamBId),
    hasSponsors: t.sponsors.length > 0,
  };

  return {
    tournament: { id: t.id, slug: t.slug ?? t.id, name: t.name, gameDurationMin: t.gameDurationMin, courtsCount: t.courtsCount, status: t.status, timezone: tournamentTimezone(t) },
    matches,
    stages,
    sponsors: t.sponsors,
    teams: t.teams,
    screens,
    context,
    serverTime: Date.now(),
  };
}
