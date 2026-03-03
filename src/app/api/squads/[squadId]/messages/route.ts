import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { z } from "zod";

// GET /api/squads/[squadId]/messages
export async function GET(_req: Request, { params }: { params: { squadId: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const member = await prisma.squadMember.findUnique({
    where: { squadId_playerId: { squadId: params.squadId, playerId } },
  });
  if (!member) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const messages = await prisma.squadMessage.findMany({
    where: { squadId: params.squadId },
    include: { author: { select: { id: true, name: true, photoPath: true } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return NextResponse.json(messages);
}

// POST /api/squads/[squadId]/messages
export async function POST(req: Request, { params }: { params: { squadId: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const member = await prisma.squadMember.findUnique({
    where: { squadId_playerId: { squadId: params.squadId, playerId } },
  });
  if (!member) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = z.object({ content: z.string().min(1).max(1000) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Message invalide" }, { status: 400 });

  const message = await prisma.squadMessage.create({
    data: { squadId: params.squadId, authorId: playerId, content: parsed.data.content },
    include: { author: { select: { id: true, name: true, photoPath: true } } },
  });

  return NextResponse.json(message, { status: 201 });
}
