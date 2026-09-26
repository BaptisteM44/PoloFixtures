import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { apiMsg } from "@/lib/api-messages";
import { mergePlayers } from "@/lib/player-merge";

// POST /api/players/:id/merge
// Body: { targetPlayerId: string }
// Merges the fictitious player (:id) into targetPlayer, then deletes :id.
// Only orga (of a tournament containing :id) or admin can do this.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const isAdmin = session.user.role === "ADMIN";
  const currentPlayerId = (session.user as { playerId?: string }).playerId;

  if (!isAdmin) {
    const playerInOrgaTournament = await prisma.teamPlayer.findFirst({
      where: {
        playerId: params.id,
        team: {
          tournament: {
            OR: [
              { creatorId: currentPlayerId ?? "" },
              { coOrganizers: { some: { playerId: currentPlayerId ?? "" } } },
            ],
          },
        },
      },
    });
    if (!playerInOrgaTournament) return new Response("Forbidden", { status: 403 });
  }

  const { targetPlayerId } = await request.json();
  if (!targetPlayerId || targetPlayerId === params.id) {
    return Response.json({ error: "targetPlayerId invalide" }, { status: 400 });
  }

  const [source, target] = await Promise.all([
    prisma.player.findUnique({ where: { id: params.id } }),
    prisma.player.findUnique({ where: { id: targetPlayerId } }),
  ]);
  if (!source) return Response.json({ error: apiMsg("source_player_not_found") }, { status: 404 });
  if (!target) return Response.json({ error: apiMsg("target_player_not_found") }, { status: 404 });

  const sourceAccount = await prisma.playerAccount.findUnique({ where: { playerId: params.id } });
  if (sourceAccount) {
    return Response.json({ error: apiMsg("merge_has_account") }, { status: 409 });
  }

  await mergePlayers(params.id, targetPlayerId);

  return Response.json({ ok: true, targetPlayerName: target.name });
}
