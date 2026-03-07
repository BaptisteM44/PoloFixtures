import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { z } from "zod";

const recapSchema = z.object({
  recapText:       z.string().max(5000).optional().nullable(),
  photoFinishPath: z.string().max(500).optional().nullable(),
  podiumNote:      z.string().max(500).optional().nullable(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    include: { coOrganizers: true },
  });
  if (!tournament) return new Response("Not found", { status: 404 });

  // Autorisation : admin, créateur, ou co-organisateur
  const playerId = (session.user as { playerId?: string }).playerId;
  const isAdmin = session.user.role === "ADMIN";
  const isCreator = tournament.creatorId === playerId;
  const isCoOrga = tournament.coOrganizers.some((o) => o.playerId === playerId);
  if (!isAdmin && !isCreator && !isCoOrga) {
    return new Response("Forbidden", { status: 403 });
  }

  const json = await request.json();
  const parsed = recapSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.tournament.update({
    where: { id: params.id },
    data: parsed.data,
    select: { recapText: true, photoFinishPath: true, podiumNote: true },
  });

  return Response.json(updated);
}
