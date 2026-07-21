import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.playerId) return new Response("Unauthorized", { status: 401 });

  const playerId = session.user.playerId;

  // Find the player's TeamPlayer record for this tournament (peut être absent
  // si la personne est logeur sans jouer dans ce tournoi — ne pas court-circuiter
  // la recherche de asHost dans ce cas)
  const teamPlayer = await prisma.teamPlayer.findFirst({
    where: { playerId, team: { tournamentId: params.id } },
    include: {
      team: { select: { id: true, name: true } },
      accommodationGuest: {
        include: {
          host: {
            include: {
              guests: {
                include: {
                  teamPlayer: {
                    include: {
                      player: { select: { id: true, name: true, photoPath: true } },
                      team: { select: { id: true, name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Check if this player is also a host
  const asHost = await prisma.accommodationHost.findFirst({
    where: { tournamentId: params.id, playerId },
    include: {
      guests: {
        include: {
          teamPlayer: {
            include: {
              player: { select: { id: true, name: true, photoPath: true } },
              team: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  const accommodationGuest = teamPlayer?.accommodationGuest ?? null;

  return Response.json({
    role: asHost ? "host" : accommodationGuest ? "guest" : "none",
    asGuest: accommodationGuest
      ? {
          hostName: accommodationGuest.host.name,
          hostContact: accommodationGuest.host.contact,
          coGuests: accommodationGuest.host.guests
            .filter((g) => g.teamPlayerId !== teamPlayer!.id)
            .map((g) => ({
              playerName: g.teamPlayer.player.name,
              teamName: g.teamPlayer.team.name,
              photoPath: g.teamPlayer.player.photoPath,
            })),
        }
      : null,
    asHost: asHost
      ? {
          hostId: asHost.id,
          name: asHost.name,
          contact: asHost.contact,
          guests: asHost.guests.map((g) => ({
            id: g.id,
            playerName: g.teamPlayer.player.name,
            teamName: g.teamPlayer.team.name,
            photoPath: g.teamPlayer.player.photoPath,
          })),
        }
      : null,
  });
}
