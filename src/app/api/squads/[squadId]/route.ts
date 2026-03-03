import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  color: z.string().nullable().optional(),
  bio: z.string().max(500).nullable().optional(),
  logoPath: z.string().nullable().optional(),
});

// GET /api/squads/[squadId]
export async function GET(_req: Request, { params }: { params: { squadId: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const squad = await prisma.squad.findUnique({
    where: { id: params.squadId },
    include: {
      members: {
        include: { player: { select: { id: true, name: true, slug: true, photoPath: true, country: true, city: true } } },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      },
      invitations: {
        where: { status: "PENDING" },
        include: {
          invitedPlayer: { select: { id: true, name: true, photoPath: true, country: true } },
          invitedBy: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!squad) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const isMember = squad.members.some((m) => m.playerId === playerId);
  if (!isMember) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  return NextResponse.json(squad);
}

// PATCH /api/squads/[squadId] — modifier nom/couleur/bio (capitaine only)
export async function PATCH(req: Request, { params }: { params: { squadId: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const member = await prisma.squadMember.findUnique({
    where: { squadId_playerId: { squadId: params.squadId, playerId } },
  });
  if (!member || member.role !== "CAPTAIN") return NextResponse.json({ error: "Capitaine requis" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides" }, { status: 400 });

  const squad = await prisma.squad.update({
    where: { id: params.squadId },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.color !== undefined && { color: parsed.data.color }),
      ...(parsed.data.bio !== undefined && { bio: parsed.data.bio }),
      ...(parsed.data.logoPath !== undefined && { logoPath: parsed.data.logoPath }),
    },
  });

  return NextResponse.json(squad);
}

// DELETE /api/squads/[squadId] — supprimer (capitaine only)
export async function DELETE(_req: Request, { params }: { params: { squadId: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const member = await prisma.squadMember.findUnique({
    where: { squadId_playerId: { squadId: params.squadId, playerId } },
  });
  if (!member || member.role !== "CAPTAIN") return NextResponse.json({ error: "Capitaine requis" }, { status: 403 });

  await prisma.squad.delete({ where: { id: params.squadId } });
  return NextResponse.json({ ok: true });
}
