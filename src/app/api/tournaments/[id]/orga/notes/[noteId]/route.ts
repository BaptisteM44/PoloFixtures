import { prisma } from "@/lib/db";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { auth } from "@/lib/auth";
import { z } from "zod";

const updateSchema = z.object({
  content: z.string().min(1).max(5000),
});

export async function PATCH(req: Request, { params }: { params: { id: string; noteId: string } }) {
  const playerId = await getOrgaPlayerId(params.id);
  if (!playerId) return new Response("Forbidden", { status: 403 });

  const existing = await prisma.orgaNote.findUnique({ where: { id: params.noteId } });
  if (!existing || existing.tournamentId !== params.id) return new Response("Not found", { status: 404 });

  // Only author or ADMIN can edit
  const session = await auth();
  if (existing.authorId !== playerId && session?.user?.role !== "ADMIN") {
    return new Response("Forbidden", { status: 403 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.orgaNote.update({
    where: { id: params.noteId },
    data: { content: parsed.data.content },
    include: { author: { select: { id: true, name: true } } },
  });

  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string; noteId: string } }) {
  const playerId = await getOrgaPlayerId(params.id);
  if (!playerId) return new Response("Forbidden", { status: 403 });

  const existing = await prisma.orgaNote.findUnique({ where: { id: params.noteId } });
  if (!existing || existing.tournamentId !== params.id) return new Response("Not found", { status: 404 });

  const session = await auth();
  if (existing.authorId !== playerId && session?.user?.role !== "ADMIN") {
    return new Response("Forbidden", { status: 403 });
  }

  await prisma.orgaNote.delete({ where: { id: params.noteId } });
  return new Response(null, { status: 204 });
}
