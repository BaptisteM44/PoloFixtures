import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MultiplexView } from "@/components/MultiplexView";
import type { MatchWithTeams } from "@/components/ScheduleBoard";

interface Props {
  searchParams: {
    stream?: string;
    tournamentId?: string;
  };
}

export default async function MultiplexPage({ searchParams }: Props) {
  const { stream, tournamentId } = searchParams;

  const session = await auth();
  const currentPlayerId = (session?.user as any)?.playerId ?? null;
  const currentPlayerName = session?.user?.name ?? null;
  const charterAccepted = !!((session?.user as { charterAccepted?: boolean } | undefined)?.charterAccepted);

  let isOrga = false;
  let gameDurationMin = 12;
  let initialMatches: MatchWithTeams[] = [];
  let chatMode: "OPEN" | "ORG_ONLY" | "DISABLED" = "OPEN";
  let creatorId: string | null = null;
  let tournamentName: string | null = null;

  if (tournamentId) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        name: true,
        creatorId: true,
        gameDurationMin: true,
        chatMode: true,
        coOrganizers: { include: { player: { select: { id: true, name: true } } } },
        matches: {
          include: {
            teamA: true,
            teamB: true,
            events: true,
          },
          orderBy: [{ startAt: "asc" }, { positionInRound: "asc" }],
        },
      },
    });

    if (tournament) {
      tournamentName = tournament.name;
      creatorId = tournament.creatorId;
      gameDurationMin = tournament.gameDurationMin;
      chatMode = tournament.chatMode as "OPEN" | "ORG_ONLY" | "DISABLED";
      initialMatches = tournament.matches as unknown as MatchWithTeams[];
      isOrga =
        !!currentPlayerId &&
        (currentPlayerId === tournament.creatorId ||
          tournament.coOrganizers.some((co: any) => co.player?.id === currentPlayerId || co.playerId === currentPlayerId));
    }
  }

  return (
    <MultiplexView
      streamUrl={stream ?? null}
      tournamentId={tournamentId ?? null}
      tournamentName={tournamentName}
      initialMatches={initialMatches}
      gameDurationMin={gameDurationMin}
      chatMode={chatMode}
      currentPlayerId={currentPlayerId}
      currentPlayerName={currentPlayerName}
      isOrga={isOrga}
      creatorId={creatorId}
      charterAccepted={charterAccepted}
    />
  );
}
