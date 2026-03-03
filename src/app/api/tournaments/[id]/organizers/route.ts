import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

async function isCreatorOrAdmin(tournamentId: string, role: string | null | undefined, playerId: string | undefined | null) {
  if (role === "ADMIN") return true;
  if (!playerId) return false;
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { creatorId: true } });
  return t?.creatorId === playerId;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const organizers = await prisma.tournamentOrganizer.findMany({
    where: { tournamentId: params.id },
    include: { player: { select: { id: true, name: true, country: true, city: true, photoPath: true } } },
    orderBy: { addedAt: "asc" },
  });
  return Response.json(organizers);
}

const addSchema = z.object({ playerId: z.string().cuid() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!await isCreatorOrAdmin(params.id, session?.user?.role, session?.user?.playerId)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json();
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const player = await prisma.player.findUnique({ where: { id: parsed.data.playerId } });
  if (!player) return Response.json({ error: "Joueur introuvable" }, { status: 404 });

  const organizer = await prisma.tournamentOrganizer.upsert({
    where: { tournamentId_playerId: { tournamentId: params.id, playerId: parsed.data.playerId } },
    create: { tournamentId: params.id, playerId: parsed.data.playerId },
    update: {},
    include: { player: { select: { id: true, name: true, country: true, city: true, photoPath: true } } },
  });

  return Response.json(organizer, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!await isCreatorOrAdmin(params.id, session?.user?.role, session?.user?.playerId)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { playerId } = await req.json();
  await prisma.tournamentOrganizer.deleteMany({
    where: { tournamentId: params.id, playerId },
  });

  return Response.json({ ok: true });
}
