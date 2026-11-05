import { prisma } from "@/lib/db";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { z } from "zod";
import { apiMsg } from "@/lib/api-messages";

/** Admin, créateur, co-organisateur (rôle ORGA) ou code ORGA du tournoi :
 *  tous peuvent gérer co-orgas et arbitres (seule la suppression du tournoi
 *  reste réservée au créateur). */
async function canManageOrganizers(tournamentId: string) {
  return !!(await getOrgaPlayerId(tournamentId));
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const organizers = await prisma.tournamentOrganizer.findMany({
    where: { tournamentId: params.id },
    include: { player: { select: { id: true, name: true, country: true, city: true, photoPath: true } } },
    orderBy: { addedAt: "asc" },
  });
  return Response.json(organizers);
}

const addSchema = z.object({
  playerId: z.string().cuid(),
  role: z.enum(["ORGA", "REF"]).default("ORGA"),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!await canManageOrganizers(params.id)) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = await req.json();
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const player = await prisma.player.findUnique({ where: { id: parsed.data.playerId } });
  if (!player) return Response.json({ error: apiMsg("player_not_found") }, { status: 404 });

  const organizer = await prisma.tournamentOrganizer.upsert({
    where: { tournamentId_playerId: { tournamentId: params.id, playerId: parsed.data.playerId } },
    create: { tournamentId: params.id, playerId: parsed.data.playerId, role: parsed.data.role },
    update: { role: parsed.data.role },
    include: { player: { select: { id: true, name: true, country: true, city: true, photoPath: true } } },
  });

  return Response.json(organizer, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  if (!await canManageOrganizers(params.id)) {
    return new Response("Forbidden", { status: 403 });
  }

  const { playerId } = await req.json();
  await prisma.tournamentOrganizer.deleteMany({
    where: { tournamentId: params.id, playerId },
  });

  return Response.json({ ok: true });
}
