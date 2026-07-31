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

  // Une équipe en liste d'attente ne joue pas (encore) — le paiement n'a pas de sens.
  if (team.selected === false) {
    return Response.json({ error: "Impossible de marquer le paiement d'une équipe en liste d'attente." }, { status: 400 });
  }

  const isAdmin = session.user.role === "ADMIN";
  const playerId = (session.user as { playerId?: string }).playerId;
  const isOrga =
    team.tournament.creatorId === playerId ||
    team.tournament.coOrganizers.some((co) => co.playerId === playerId);

  if (!isAdmin && !isOrga) return new Response("Forbidden", { status: 403 });

  const { feePaid, paymentMethod } = await request.json();
  const validMethods = ["BANK_TRANSFER", "PAYPAL", "CASH", "OTHER"];
  const method = validMethods.includes(paymentMethod) ? paymentMethod : null;
  const updated = await prisma.team.update({
    where: { id: params.teamId },
    data: {
      feePaid: Boolean(feePaid),
      // Uncheck efface le mode de paiement ; check sans mode explicite garde l'existant.
      paymentMethod: !feePaid ? null : paymentMethod !== undefined ? method : team.paymentMethod,
    },
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

  return Response.json({ ok: true, feePaid: updated.feePaid, paymentMethod: updated.paymentMethod });
}
