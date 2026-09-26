import { prisma } from "@/lib/db";
import { getPipeline, finalStandings } from "@/engine/pipeline-server";

export type PodiumIds = { first: string | null; second: string | null; third: string | null };

const BRACKET_PHASES = ["BRACKET", "MTP_DE", "GRAZ_SE", "KIOSQUE_SE", "BIG_APPLE_SE", "STAGE"];

/**
 * Podium d'un tournoi terminé (ids d'équipes). Source unique pour l'affichage
 * du podium ET les badges (champion, club_champion…), pour qu'ils ne divergent
 * plus — notamment sur la finale « revanche » (BG) du format DE.
 */
export async function getPodiumTeamIds(tournamentId: string): Promise<PodiumIds> {
  const podium: PodiumIds = { first: null, second: null, third: null };

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { usesPipeline: true, stages: { select: { id: true, type: true, order: true, entryRules: true } } },
  });
  if (!tournament) return podium;
  const isPipeline = !!tournament.usesPipeline;

  // Podium d'un pipeline : il vient du bracket qui contient les MEILLEURS
  // (rangs les plus hauts, ex: DE Top 8), pas forcément le dernier stage —
  // avec deux DE parallèles (Top 8 / Bottom 8), le podium est celui du Top 8.
  const stagesDesc = isPipeline ? [...tournament.stages].sort((a, b) => b.order - a.order) : [];
  const minFromOf = (s: { entryRules: unknown }): number => {
    const rules = s.entryRules as { sources?: { kind: string; from?: number }[] } | null;
    const sources = (rules?.sources ?? []).filter((src) => src.kind === "stageRanks");
    if (sources.length === 0) return 1;
    return Math.min(...sources.map((src) => src.from ?? 1));
  };
  const bracketStages = stagesDesc.filter((s) => s.type === "SE" || s.type === "DE");
  const mainStage = bracketStages.length > 0
    ? [...bracketStages].sort((a, b) => minFromOf(a) - minFromOf(b) || b.order - a.order)[0]
    : (stagesDesc[0] ?? null);

  if (isPipeline && mainStage && mainStage.type !== "SE" && mainStage.type !== "DE") {
    const pipeline = await getPipeline(tournamentId);
    if (pipeline) {
      const ranking = finalStandings(pipeline);
      podium.first = ranking[0] ?? null;
      podium.second = ranking[1] ?? null;
      podium.third = ranking[2] ?? null;
    }
    return podium;
  }

  const matches = await prisma.match.findMany({
    where: {
      tournamentId,
      phase: { in: BRACKET_PHASES as any },
      status: "FINISHED",
      ...(isPipeline ? { stageId: mainStage?.id ?? null } : {}),
    },
    select: { bracketSide: true, teamAId: true, teamBId: true, winnerTeamId: true },
    orderBy: { roundIndex: "desc" },
  });

  const winnerOf = (m: { teamAId: string | null; teamBId: string | null; winnerTeamId: string | null }) =>
    m.winnerTeamId === m.teamAId ? m.teamAId : m.teamBId;
  const loserOf = (m: { teamAId: string | null; teamBId: string | null; winnerTeamId: string | null }) =>
    m.winnerTeamId === m.teamAId ? m.teamBId : m.teamAId;

  // GF : si la revanche (BG) a été jouée, c'est ELLE le match décisif.
  const resetPlayed = matches.find((m) => m.bracketSide === "BG" && m.winnerTeamId);
  const grandFinal = resetPlayed ?? matches.find((m) => m.bracketSide === "G");
  if (grandFinal) {
    podium.first = winnerOf(grandFinal);
    podium.second = loserOf(grandFinal);
  }

  // 3e : SPLIT_SE → gagnant du match WL ; SE → gagnant de la petite finale (seul
  // match L) ; DE → perdant du dernier match du loser bracket.
  const wlMatch = matches.find((m) => m.bracketSide === "WL");
  if (wlMatch) {
    podium.third = winnerOf(wlMatch);
  } else {
    const lMatches = matches.filter((m) => m.bracketSide === "L");
    if (lMatches.length > 0) {
      const lFinal = lMatches[0];
      const third = lMatches.length === 1 ? winnerOf(lFinal) : loserOf(lFinal);
      if (third && third !== podium.first && third !== podium.second) podium.third = third;
    }
  }

  return podium;
}

// Le recalcul des badges repasse sur les mêmes tournois pour chaque joueur :
// cache court, suffisant pour un recalcul global sans figer une correction
// de résultat faite après coup par l'orga.
const podiumCache = new Map<string, { at: number; value: Promise<PodiumIds> }>();
const PODIUM_TTL_MS = 5 * 60 * 1000;

export function getPodiumTeamIdsCached(tournamentId: string): Promise<PodiumIds> {
  const hit = podiumCache.get(tournamentId);
  if (hit && Date.now() - hit.at < PODIUM_TTL_MS) return hit.value;
  const value = getPodiumTeamIds(tournamentId);
  podiumCache.set(tournamentId, { at: Date.now(), value });
  value.catch(() => podiumCache.delete(tournamentId));
  return value;
}
