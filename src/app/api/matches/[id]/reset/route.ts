import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();

  const match = await prisma.match.findUnique({ where: { id: params.id } });
  if (!match) return new Response("Not found", { status: 404 });

  // Orga only
  const hasRole = session?.user?.role && hasAtLeastRole(session.user.role, "ADMIN");
  let isOrganizer = false;
  const playerId = session?.user?.playerId;
  if (!hasRole && playerId) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: match.tournamentId },
      select: { creatorId: true, coOrganizers: { select: { playerId: true } } },
    });
    isOrganizer =
      tournament?.creatorId === playerId ||
      tournament?.coOrganizers.some((co) => co.playerId === playerId) ||
      false;
  }
  if (!hasRole && !isOrganizer) return new Response("Unauthorized", { status: 401 });

  // Bloquer si une suite existe (nextMatchWin a déjà une équipe propagée depuis ce match)
  if (match.nextMatchWinId) {
    const nextMatch = await prisma.match.findUnique({ where: { id: match.nextMatchWinId } });
    if (nextMatch) {
      const propagatedTeam = match.nextSlotWin === "A" ? nextMatch.teamAId : nextMatch.teamBId;
      // Si l'équipe propagée correspond au vainqueur actuel → suite existante
      const currentWinnerId =
        match.status === "FINISHED"
          ? match.scoreA > match.scoreB
            ? match.teamAId
            : match.teamBId
          : null;
      if (propagatedTeam && propagatedTeam === currentWinnerId) {
        return Response.json(
          { error: "Ce match a une suite — modifiez les scores plutôt que de le réinitialiser." },
          { status: 422 }
        );
      }
    }
  }

  // Reset
  const updated = await prisma.match.update({
    where: { id: params.id },
    data: { status: "SCHEDULED", scoreA: 0, scoreB: 0, winnerTeamId: null },
  });

  return Response.json(updated);
}
