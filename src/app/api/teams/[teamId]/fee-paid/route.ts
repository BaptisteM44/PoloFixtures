import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { notifyTeamPlayers } from "@/lib/notify";

// PATCH /api/teams/:teamId/fee-paid — toggle feePaid for a team
// Only orga/admin of the tournament containing this team
export async function PATCH(request: Request, { params }: { params: { teamId: string } }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const team = await prisma.team.findUnique({
    where: { id: params.teamId },
    include: {
      tournament: {
        select: {
          id: true,
          name: true,
          slug: true,
          creatorId: true,
          coOrganizers: { select: { playerId: true } },
        },
      },
    },
  });
  if (!team) return Response.json({ error: "Team not found" }, { status: 404 });

  const isAdmin = session.user.role === "ADMIN";
  const playerId = (session.user as { playerId?: string }).playerId;
  const isOrga =
    team.tournament.creatorId === playerId ||
    team.tournament.coOrganizers.some((co) => co.playerId === playerId);

  if (!isAdmin && !isOrga) return new Response("Forbidden", { status: 403 });

  const { feePaid } = await request.json();
  const updated = await prisma.team.update({
    where: { id: params.teamId },
    data: { feePaid: Boolean(feePaid) },
  });

  // Notify team players when payment is confirmed (not when unchecked)
  if (updated.feePaid) {
    notifyTeamPlayers(params.teamId, "TEAM_FEE_CONFIRMED", {
      teamId: team.id,
      teamName: team.name,
      tournamentId: team.tournament.id,
      tournamentName: team.tournament.name,
      tournamentSlug: team.tournament.slug ?? "",
    }).catch(() => {});
  }

  return Response.json({ ok: true, feePaid: updated.feePaid });
}
