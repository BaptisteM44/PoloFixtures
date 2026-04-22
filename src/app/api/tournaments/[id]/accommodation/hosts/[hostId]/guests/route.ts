import { prisma } from "@/lib/db";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { z } from "zod";

const addGuestSchema = z.object({
  teamPlayerId: z.string(),
  notes: z.string().max(500).optional().nullable(),
});

export async function POST(req: Request, { params }: { params: { id: string; hostId: string } }) {
  const playerId = await getOrgaPlayerId(params.id);
  if (!playerId) return new Response("Forbidden", { status: 403 });

  const host = await prisma.accommodationHost.findUnique({ where: { id: params.hostId } });
  if (!host || host.tournamentId !== params.id) return new Response("Not found", { status: 404 });

  const body = await req.json();
  const parsed = addGuestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  // Verify teamPlayer belongs to this tournament
  const teamPlayer = await prisma.teamPlayer.findUnique({
    where: { id: parsed.data.teamPlayerId },
    include: { team: { select: { tournamentId: true } } },
  });
  if (!teamPlayer || teamPlayer.team.tournamentId !== params.id) {
    return Response.json({ error: "Joueur introuvable dans ce tournoi." }, { status: 400 });
  }

  const guest = await prisma.accommodationGuest.create({
    data: {
      hostId: params.hostId,
      teamPlayerId: parsed.data.teamPlayerId,
      notes: parsed.data.notes ?? null,
    },
    include: {
      teamPlayer: {
        include: {
          player: { select: { id: true, name: true, photoPath: true } },
          team: { select: { id: true, name: true } },
        },
      },
    },
  });

  return Response.json(guest, { status: 201 });
}
