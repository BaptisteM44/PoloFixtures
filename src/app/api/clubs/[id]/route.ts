import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const club = await prisma.club.findUnique({
    where: { id: params.id },
    include: {
      manager: { select: { id: true, name: true, slug: true, photoPath: true } },
      members: {
        include: {
          player: { select: { id: true, name: true, slug: true, country: true, city: true, photoPath: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!club) return new Response("Club introuvable", { status: 404 });
  return Response.json(club);
}

const updateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  city: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional().nullable(),
  website: z.string().optional().nullable(),
  logoPath: z.string().optional().nullable(),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.playerId) return new Response("Non autorisé", { status: 401 });

  const club = await prisma.club.findUnique({ where: { id: params.id } });
  if (!club) return new Response("Introuvable", { status: 404 });
  if (club.managerId !== session.user.playerId && session.user.role !== "ADMIN") {
    return new Response("Non autorisé", { status: 403 });
  }

  const body = await request.json();
  const data = updateSchema.safeParse(body);
  if (!data.success) return Response.json({ error: data.error.flatten() }, { status: 400 });

  const updated = await prisma.club.update({ where: { id: params.id }, data: data.data });
  return Response.json(updated);
}
