import { prisma } from "@/lib/db";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  contact: z.string().max(500).nullable().optional(),
  capacity: z.number().int().min(1).max(50).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const hostInclude = {
  player: { select: { id: true, name: true, photoPath: true } },
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
};

export async function PATCH(req: Request, { params }: { params: { id: string; hostId: string } }) {
  const playerId = await getOrgaPlayerId(params.id);
  if (!playerId) return new Response("Forbidden", { status: 403 });

  const existing = await prisma.accommodationHost.findUnique({ where: { id: params.hostId } });
  if (!existing || existing.tournamentId !== params.id) return new Response("Not found", { status: 404 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.accommodationHost.update({
    where: { id: params.hostId },
    data: parsed.data,
    include: hostInclude,
  });

  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string; hostId: string } }) {
  const playerId = await getOrgaPlayerId(params.id);
  if (!playerId) return new Response("Forbidden", { status: 403 });

  const existing = await prisma.accommodationHost.findUnique({ where: { id: params.hostId } });
  if (!existing || existing.tournamentId !== params.id) return new Response("Not found", { status: 404 });

  await prisma.accommodationHost.delete({ where: { id: params.hostId } });
  return new Response(null, { status: 204 });
}
