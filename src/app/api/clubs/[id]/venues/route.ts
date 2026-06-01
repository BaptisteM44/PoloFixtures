import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const venues = await prisma.clubVenue.findMany({
    where: { clubId: params.id },
    orderBy: { createdAt: "asc" },
  });
  return Response.json(venues);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const playerId = (session?.user as any)?.playerId;
  if (!playerId) return new Response("Non autorisé", { status: 401 });

  const isSiteAdmin = (session?.user as any)?.role === "ADMIN";

  const club = await prisma.club.findUnique({ where: { id: params.id } });
  if (!club) return new Response("Introuvable", { status: 404 });

  const isManager = club.managerId === playerId;
  const adminRole = await prisma.clubAdmin.findUnique({ where: { clubId_playerId: { clubId: params.id, playerId } } });
  if (!isManager && !adminRole && !isSiteAdmin) return new Response("Non autorisé", { status: 403 });

  const body = await req.json();
  if (!body.name?.trim()) return Response.json({ error: "Nom requis" }, { status: 400 });

  const venue = await prisma.clubVenue.create({
    data: {
      clubId: params.id,
      name: body.name.trim(),
      address: body.address?.trim() || null,
      mapLink: body.mapLink?.trim() || null,
      notes: body.notes?.trim() || null,
      color: body.color?.trim() || null,
    },
  });
  return Response.json(venue);
}
