import { prisma } from "@/lib/db";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { z } from "zod";

const createSchema = z.object({
  content: z.string().min(1).max(5000),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const playerId = await getOrgaPlayerId(params.id);
  if (!playerId) return new Response("Forbidden", { status: 403 });

  const notes = await prisma.orgaNote.findMany({
    where: { tournamentId: params.id },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(notes);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const playerId = await getOrgaPlayerId(params.id);
  if (!playerId || playerId === "admin") return new Response("Forbidden — a linked player account is required to create notes", { status: 403 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const note = await prisma.orgaNote.create({
    data: {
      tournamentId: params.id,
      content: parsed.data.content,
      authorId: playerId,
    },
    include: { author: { select: { id: true, name: true } } },
  });

  return Response.json(note, { status: 201 });
}
