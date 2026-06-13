import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { z } from "zod";

const schema = z.object({
  matchAId: z.string(),
  matchBId: z.string(),
});

export async function POST(req: Request) {
  const session = await auth();

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Paramètres invalides" }, { status: 400 });

  const { matchAId, matchBId } = parsed.data;
  if (matchAId === matchBId) return Response.json({ error: "Même match" }, { status: 400 });

  const [matchA, matchB] = await Promise.all([
    prisma.match.findUnique({ where: { id: matchAId } }),
    prisma.match.findUnique({ where: { id: matchBId } }),
  ]);

  if (!matchA || !matchB) return new Response("Not found", { status: 404 });
  if (matchA.tournamentId !== matchB.tournamentId)
    return Response.json({ error: "Les matchs doivent appartenir au même tournoi" }, { status: 422 });

  // Orga only
  const hasRole = session?.user?.role && hasAtLeastRole(session.user.role, "ADMIN");
  let isOrganizer = false;
  const playerId = session?.user?.playerId;
  if (!hasRole && playerId) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: matchA.tournamentId },
      select: { creatorId: true, coOrganizers: { select: { playerId: true } } },
    });
    isOrganizer =
      tournament?.creatorId === playerId ||
      tournament?.coOrganizers.some((co) => co.playerId === playerId) ||
      false;
  }
  if (!hasRole && !isOrganizer) return new Response("Unauthorized", { status: 401 });

  // Échanger terrain + heure
  const [updatedA, updatedB] = await prisma.$transaction([
    prisma.match.update({
      where: { id: matchAId },
      data: { courtName: matchB.courtName, startAt: matchB.startAt },
      include: { teamA: true, teamB: true },
    }),
    prisma.match.update({
      where: { id: matchBId },
      data: { courtName: matchA.courtName, startAt: matchA.startAt },
      include: { teamA: true, teamB: true },
    }),
  ]);

  return Response.json({ matchA: updatedA, matchB: updatedB });
}
