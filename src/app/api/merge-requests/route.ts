import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { ghostApproverIds } from "@/lib/player-merge";

// GET /api/merge-requests → demandes de fusion en attente que JE peux trancher
// (admin : toutes ; orga : celles dont le profil fictif est dans un de ses tournois).
export async function GET() {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const isAdmin = session.user.role === "ADMIN";

  const pending = await prisma.playerMergeRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      ghost: {
        select: {
          id: true, name: true, slug: true, country: true, city: true,
          teams: { select: { team: { select: { name: true, tournament: { select: { name: true } } } } }, take: 5 },
        },
      },
      requester: { select: { id: true, name: true, slug: true, country: true, city: true, photoPath: true } },
    },
  });

  const visible = [];
  for (const r of pending) {
    if (isAdmin || (playerId && (await ghostApproverIds(r.ghostPlayerId)).includes(playerId))) visible.push(r);
  }

  return Response.json(
    visible.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      ghost: {
        id: r.ghost.id, name: r.ghost.name, slug: r.ghost.slug, country: r.ghost.country, city: r.ghost.city,
        teams: r.ghost.teams.map((tp) => ({ team: tp.team.name, tournament: tp.team.tournament.name })),
      },
      requester: r.requester,
    }))
  );
}
