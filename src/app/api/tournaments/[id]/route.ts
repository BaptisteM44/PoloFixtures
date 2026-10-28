import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { apiMsg } from "@/lib/api-messages";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    include: {
      sponsors: true,
      // API publique : champs publics des joueurs seulement (avant : fiche
      // complète avec allergies/régime), et jamais les notes privées de l'orga.
      teams: {
        include: {
          players: {
            include: {
              player: { select: { id: true, name: true, slug: true, country: true, city: true, photoPath: true } }
            }
          }
        }
      },
      pools: {
        include: {
          teams: { include: { team: true } }
        }
      },
      matches: {
        include: {
          teamA: true,
          teamB: true,
          events: true
        },
        orderBy: { startAt: "asc" }
      }
    }
  });

  if (!tournament) return new Response("Not found", { status: 404 });
  const teams = tournament.teams.map(({ orgaNote: _o, registrationNote: _r, ...team }) => team);
  return Response.json({ ...tournament, teams });
}


export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  const role = session?.user?.role;
  if (!playerId) return new Response("Unauthorized", { status: 401 });

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: { id: true, creatorId: true, status: true },
  });
  if (!tournament) return new Response("Not found", { status: 404 });

  const isAdmin = role ? hasAtLeastRole(role, "ADMIN") : false;
  const isCreator = tournament.creatorId === playerId;
  if (!isAdmin && !isCreator) return new Response("Forbidden", { status: 403 });

  // Bloquer la suppression si le tournoi est LIVE ou COMPLETED
  if (tournament.status === "LIVE" || tournament.status === "COMPLETED") {
    return Response.json({ error: apiMsg("cannot_delete_started") }, { status: 400 });
  }

  await prisma.tournament.delete({ where: { id: params.id } });
  return Response.json({ ok: true });
}
