import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  tournamentId: z.string().optional().nullable(),
  name: z.string().min(2),
  email: z.string().email(),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Link to player account if logged in
  const session = await auth();
  const playerId = session?.user?.playerId ?? null;

  const created = await prisma.freeAgent.create({ data: { ...parsed.data, playerId } });
  return Response.json(created);
}

export async function DELETE(request: Request) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const agent = await prisma.freeAgent.findUnique({ where: { id } });
  if (!agent) return new Response("Not found", { status: 404 });
  if (agent.playerId !== playerId) return new Response("Forbidden", { status: 403 });

  await prisma.freeAgent.delete({ where: { id } });
  return Response.json({ ok: true });
}
