import { prisma } from "@/lib/db";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { z } from "zod";

const createSchema = z.object({
  label: z.string().min(1).max(100),
  url: z.string().url(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const playerId = await getOrgaPlayerId(params.id);
  if (!playerId) return new Response("Forbidden", { status: 403 });

  const links = await prisma.orgaLink.findMany({
    where: { tournamentId: params.id },
    include: { addedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(links);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const playerId = await getOrgaPlayerId(params.id);
  if (!playerId || playerId === "admin") return new Response("Forbidden — a linked player account is required to add links", { status: 403 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const link = await prisma.orgaLink.create({
    data: {
      tournamentId: params.id,
      label: parsed.data.label,
      url: parsed.data.url,
      addedById: playerId,
    },
    include: { addedBy: { select: { id: true, name: true } } },
  });

  return Response.json(link, { status: 201 });
}
