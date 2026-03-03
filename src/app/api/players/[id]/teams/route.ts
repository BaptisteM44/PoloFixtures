import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const teamPlayers = await prisma.teamPlayer.findMany({
    where: { playerId: params.id },
    include: {
      team: {
        include: {
          players: { include: { player: { select: { id: true, name: true, country: true, city: true } } } },
          tournament: { select: { id: true, name: true, dateEnd: true, status: true } },
        },
      },
    },
    orderBy: { team: { tournament: { dateEnd: "desc" } } },
  });

  const teams = teamPlayers.map((tp) => ({
    teamId: tp.team.id,
    teamName: tp.team.name,
    tournamentId: tp.team.tournament.id,
    tournamentName: tp.team.tournament.name,
    tournamentDate: tp.team.tournament.dateEnd,
    players: tp.team.players.map((p) => ({
      id: p.player.id,
      name: p.player.name,
      country: p.player.country,
      city: p.player.city,
      isCaptain: p.isCaptain,
    })),
  }));

  return Response.json(teams);
}
