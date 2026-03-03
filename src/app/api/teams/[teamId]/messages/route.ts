import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

/** Check whether the authenticated player belongs to this team */
async function isMember(playerId: string, teamId: string) {
  const tp = await prisma.teamPlayer.findUnique({
    where: { teamId_playerId: { teamId, playerId } },
  });
  return !!tp;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { teamId: string } }
) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const isAdmin = session?.user?.role === "ADMIN";
  if (!isAdmin && !(await isMember(playerId, params.teamId))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const messages = await prisma.teamMessage.findMany({
    where: { teamId: params.teamId },
    include: { author: { select: { id: true, name: true, photoPath: true } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return NextResponse.json(messages);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { teamId: string } }
) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const isAdmin = session?.user?.role === "ADMIN";
  if (!isAdmin && !(await isMember(playerId, params.teamId))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const body = await req.json();
  const content = (body.content ?? "").trim();
  if (!content || content.length > 1000) {
    return NextResponse.json({ error: "Message invalide" }, { status: 400 });
  }

  const message = await prisma.teamMessage.create({
    data: { teamId: params.teamId, authorId: playerId, content },
    include: { author: { select: { id: true, name: true, photoPath: true } } },
  });

  return NextResponse.json(message, { status: 201 });
}
