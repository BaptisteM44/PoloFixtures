import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasAtLeastRole } from "@/lib/rbac";
import { z } from "zod";

const patchSchema = z.object({
  orgaNote: z.string().max(1000).nullable(),
});

export async function PATCH(req: Request, { params }: { params: { teamId: string } }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const team = await prisma.team.findUnique({
    where: { id: params.teamId },
    include: { tournament: { include: { coOrganizers: true } } },
  });
  if (!team) return new Response("Not found", { status: 404 });

  const isOrga =
    (session.user.role != null && hasAtLeastRole(session.user.role, "ADMIN")) ||
    team.tournament.creatorId === session.user.playerId ||
    team.tournament.coOrganizers.some((o) => o.playerId === session.user.playerId);
  if (!isOrga) return new Response("Forbidden", { status: 403 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.team.update({
    where: { id: params.teamId },
    data: { orgaNote: parsed.data.orgaNote },
  });

  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { teamId: string } }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const team = await prisma.team.findUnique({
    where: { id: params.teamId },
    include: { tournament: { include: { coOrganizers: true } } },
  });
  if (!team) return new Response("Not found", { status: 404 });

  const playerId = session.user.playerId;
  const role = session.user.role;
  const isOrga =
    (role != null && hasAtLeastRole(role, "ADMIN")) ||
    team.tournament.creatorId === playerId ||
    team.tournament.coOrganizers.some((o) => o.playerId === playerId);
  if (!isOrga) return new Response("Forbidden", { status: 403 });

  const wasSelected = team.selected;
  const tournamentId = team.tournament.id;

  await prisma.$transaction(async (tx) => {
    await tx.teamPlayer.deleteMany({ where: { teamId: params.teamId } });
    await tx.team.delete({ where: { id: params.teamId } });

    // Si l'équipe supprimée était sélectionnée et que le tournoi est en mode rush,
    // promouvoir automatiquement la première équipe en liste d'attente
    if (wasSelected && team.tournament.rushRegistration) {
      const firstWaiting = await tx.team.findFirst({
        where: { tournamentId, selected: false },
        orderBy: { waitlistPosition: "asc" },
      });
      if (firstWaiting) {
        await tx.team.update({
          where: { id: firstWaiting.id },
          data: { selected: true, waitlistPosition: null },
        });
      }
    }
  });

  return Response.json({ ok: true });
}
