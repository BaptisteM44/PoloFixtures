import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(2).max(60),
  color: z.string().optional(),
  bio: z.string().max(500).optional(),
  logoPath: z.string().optional(),
});

// GET /api/squads — squads du joueur connecté
export async function GET() {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const squads = await prisma.squad.findMany({
    where: { members: { some: { playerId } } },
    include: {
      members: {
        include: { player: { select: { id: true, name: true, photoPath: true, country: true, city: true } } },
        orderBy: { joinedAt: "asc" },
      },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(squads);
}

// POST /api/squads — créer une squad
export async function POST(req: Request) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides" }, { status: 400 });

  const squad = await prisma.squad.create({
    data: {
      name: parsed.data.name,
      color: parsed.data.color ?? null,
      bio: parsed.data.bio ?? null,
      logoPath: parsed.data.logoPath ?? null,
      members: {
        create: { playerId, role: "CAPTAIN" },
      },
    },
    include: {
      members: {
        include: { player: { select: { id: true, name: true, photoPath: true, country: true, city: true } } },
      },
    },
  });

  return NextResponse.json(squad, { status: 201 });
}
