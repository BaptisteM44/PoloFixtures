import { MatchPhase, MatchStatus, TournamentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

type TournamentLite = {
  id: string;
  status: TournamentStatus;
  dateEnd: Date;
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

  // Only complete if there's a finished final match (BRACKET with no nextMatchWinId)
  // This indicates the tournament actually reached its conclusion
  const hasFinishedFinal = matches.some(
    (m) => m.phase === "BRACKET" && !m.nextMatchWinId && m.status === "FINISHED" && !!m.winnerTeamId
  );

  return hasFinishedFinal;
}

function shouldCompleteByDate(dateEnd: Date, now: Date): boolean {
  return now.getTime() >= dateEnd.getTime() + ONE_DAY_MS;
}

export async function syncTournamentCompletionById(tournamentId: string): Promise<TournamentStatus | null> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, status: true, dateEnd: true },
  });

  if (!tournament) return null;
  if (tournament.status !== "LIVE") return tournament.status;

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

  const shouldComplete = shouldCompleteByDate(tournament.dateEnd, now) || shouldCompleteFromMatches(matches);
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
    select: { id: true, status: true, dateEnd: true },
  });

  if (liveTournaments.length === 0) return [];

  const liveIds = liveTournaments.map((t) => t.id);
  const matches = await prisma.match.findMany({
    where: { tournamentId: { in: liveIds } },
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
  const idsToComplete = liveTournaments
    .filter((t: TournamentLite) => {
      const tmMatches = byTournament.get(t.id) ?? [];
      return shouldCompleteByDate(t.dateEnd, now) || shouldCompleteFromMatches(tmMatches);
    })
    .map((t) => t.id);

  if (idsToComplete.length === 0) return [];

  await prisma.tournament.updateMany({
    where: { id: { in: idsToComplete }, status: "LIVE" },
    data: { status: "COMPLETED" },
  });

  return idsToComplete;
}
