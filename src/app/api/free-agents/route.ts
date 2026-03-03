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
