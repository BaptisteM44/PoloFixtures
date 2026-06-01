import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

async function checkAdmin(clubId: string, playerId: string, role?: string) {
  if (role === "ADMIN") return true;
  const club = await prisma.club.findUnique({ where: { id: clubId } });
  if (!club) return false;
  if (club.managerId === playerId) return true;
  const adminRole = await prisma.clubAdmin.findUnique({ where: { clubId_playerId: { clubId, playerId } } });
  return !!adminRole;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; venueId: string } }) {
  const session = await auth();
  const playerId = (session?.user as any)?.playerId;
  if (!playerId) return new Response("Non autorisé", { status: 401 });
  const role = (session?.user as any)?.role;
  if (!await checkAdmin(params.id, playerId, role)) return new Response("Non autorisé", { status: 403 });

  const body = await req.json();
  if (!body.name?.trim()) return Response.json({ error: "Nom requis" }, { status: 400 });

  const venue = await prisma.clubVenue.update({
    where: { id: params.venueId },
    data: {
      name: body.name.trim(),
      address: body.address?.trim() || null,
      mapLink: body.mapLink?.trim() || null,
      notes: body.notes?.trim() || null,
      color: body.color?.trim() || null,
    },
  });
  return Response.json(venue);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string; venueId: string } }) {
  const session = await auth();
  const playerId = (session?.user as any)?.playerId;
  if (!playerId) return new Response("Non autorisé", { status: 401 });
  const role = (session?.user as any)?.role;
  if (!await checkAdmin(params.id, playerId, role)) return new Response("Non autorisé", { status: 403 });

  await prisma.clubVenue.delete({ where: { id: params.venueId } });
  return Response.json({ ok: true });
}
