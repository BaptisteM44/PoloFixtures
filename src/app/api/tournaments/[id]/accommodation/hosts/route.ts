import { prisma } from "@/lib/db";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { z } from "zod";

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

const createSchema = z.object({
  playerId: z.string().optional(),
  name: z.string().min(1).max(200),
  contact: z.string().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const playerId = await getOrgaPlayerId(params.id);
  if (!playerId) return new Response("Forbidden", { status: 403 });

  const hosts = await prisma.accommodationHost.findMany({
    where: { tournamentId: params.id },
    include: hostInclude,
    orderBy: { createdAt: "asc" },
  });

  return Response.json(hosts);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const playerId = await getOrgaPlayerId(params.id);
  if (!playerId) return new Response("Forbidden", { status: 403 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const host = await prisma.accommodationHost.create({
    data: {
      tournamentId: params.id,
      playerId: parsed.data.playerId ?? null,
      name: parsed.data.name,
      contact: parsed.data.contact ?? null,
      notes: parsed.data.notes ?? null,
    },
    include: hostInclude,
  });

  return Response.json(host, { status: 201 });
}
