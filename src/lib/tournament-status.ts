import { MatchPhase, MatchStatus, TournamentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

type TournamentLite = {
  id: string;
  status: TournamentStatus;
  dateEnd: Date;
  usesPipeline?: boolean;
};

type MatchLite = {
  tournamentId: string;
  status: MatchStatus;
  phase: MatchPhase;
  nextMatchWinId: string | null;
  winnerTeamId: string | null;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function shouldCompleteFromMatches(matches: MatchLite[]): boolean {
  if (matches.length === 0) return false;

  // Only complete if there's a finished final match (BRACKET or MTP_DE with no nextMatchWinId)
  // This indicates the tournament actually reached its conclusion
  const finalPhases = ["BRACKET", "MTP_DE", "GRAZ_SE", "KIOSQUE_SE", "BIG_APPLE_SE"];
  const hasFinishedFinal = matches.some(
    (m) => finalPhases.includes(m.phase) && !m.nextMatchWinId && m.status === "FINISHED" && !!m.winnerTeamId
  );

  return hasFinishedFinal;
}

function shouldCompleteByDate(dateEnd: Date, now: Date): boolean {
  return now.getTime() >= dateEnd.getTime() + ONE_DAY_MS;
}

/**
 * Pipeline (refonte formats) : un tournoi est terminé quand TOUTES ses
 * étapes sont DONE/SKIPPED — jamais par date. La règle "24h après dateEnd"
 * ne s'applique pas au pipeline : un format peut légitimement déborder
 * (plusieurs brackets en parallèle, retard, etc.) sans être considéré fini.
 */
async function isPipelineComplete(tournamentId: string): Promise<boolean> {
  const stages = await prisma.stage.findMany({
    where: { tournamentId },
    select: { status: true },
  });
  if (stages.length === 0) return false;
  return stages.every((s) => s.status === "DONE" || s.status === "SKIPPED");
}

export async function syncTournamentCompletionById(tournamentId: string): Promise<TournamentStatus | null> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, status: true, dateEnd: true, usesPipeline: true } as never,
  }) as (TournamentLite & { usesPipeline: boolean }) | null;

  if (!tournament) return null;
  if (tournament.status !== "LIVE") return tournament.status;

  let shouldComplete: boolean;
  if (tournament.usesPipeline) {
    shouldComplete = await isPipelineComplete(tournamentId);
  } else {
    const now = new Date();
    const matches = await prisma.match.findMany({
      where: { tournamentId: tournament.id },
      select: {
        tournamentId: true,
        status: true,
        phase: true,
        nextMatchWinId: true,
        winnerTeamId: true,
      },
    });
    shouldComplete = shouldCompleteByDate(tournament.dateEnd, now) || shouldCompleteFromMatches(matches);
  }
  if (!shouldComplete) return tournament.status;

  await prisma.tournament.update({
    where: { id: tournament.id },
    data: { status: "COMPLETED" },
  });

  return "COMPLETED";
}

export async function syncLiveTournamentsCompletion(): Promise<string[]> {
  const liveTournaments = await prisma.tournament.findMany({
    where: { status: "LIVE" },
    select: { id: true, status: true, dateEnd: true, usesPipeline: true } as never,
  }) as unknown as Array<TournamentLite & { usesPipeline: boolean }>;

  if (liveTournaments.length === 0) return [];

  const pipelineIds = liveTournaments.filter((t) => t.usesPipeline).map((t) => t.id);
  const legacyTournaments = liveTournaments.filter((t) => !t.usesPipeline);

  // Pipeline : terminé quand toutes les étapes sont DONE/SKIPPED (jamais par date).
  const pipelineIdsToComplete: string[] = [];
  if (pipelineIds.length > 0) {
    const stages = await prisma.stage.findMany({
      where: { tournamentId: { in: pipelineIds } },
      select: { tournamentId: true, status: true },
    });
    const stagesByTournament = new Map<string, { status: string }[]>();
    for (const s of stages) {
      const arr = stagesByTournament.get(s.tournamentId) ?? [];
      arr.push(s);
      stagesByTournament.set(s.tournamentId, arr);
    }
    for (const id of pipelineIds) {
      const tmStages = stagesByTournament.get(id) ?? [];
      if (tmStages.length > 0 && tmStages.every((s) => s.status === "DONE" || s.status === "SKIPPED")) {
        pipelineIdsToComplete.push(id);
      }
    }
  }

  // Legacy : logique historique (date ou match final joué).
  let legacyIdsToComplete: string[] = [];
  if (legacyTournaments.length > 0) {
    const legacyIds = legacyTournaments.map((t) => t.id);
    const matches = await prisma.match.findMany({
      where: { tournamentId: { in: legacyIds } },
      select: {
        tournamentId: true,
        status: true,
        phase: true,
        nextMatchWinId: true,
        winnerTeamId: true,
      },
    });

    const byTournament = new Map<string, MatchLite[]>();
    for (const m of matches) {
      const arr = byTournament.get(m.tournamentId) ?? [];
      arr.push(m);
      byTournament.set(m.tournamentId, arr);
    }

    const now = new Date();
    legacyIdsToComplete = legacyTournaments
      .filter((t) => {
        const tmMatches = byTournament.get(t.id) ?? [];
        return shouldCompleteByDate(t.dateEnd, now) || shouldCompleteFromMatches(tmMatches);
      })
      .map((t) => t.id);
  }

  const idsToComplete = [...pipelineIdsToComplete, ...legacyIdsToComplete];
  if (idsToComplete.length === 0) return [];

  await prisma.tournament.updateMany({
    where: { id: { in: idsToComplete }, status: "LIVE" },
    data: { status: "COMPLETED" },
  });

  return idsToComplete;
}
