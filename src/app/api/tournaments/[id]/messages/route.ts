import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: { chatMode: true },
  });
  if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (tournament.chatMode === "DISABLED") {
    return NextResponse.json([]);
  }

  // Find orga player IDs: creator + operators with ORGA/ADMIN role linked to a player
  const orgaOperators = await prisma.operator.findMany({
    where: {
      playerId: { not: null },
      OR: [
        { roles: { has: "ADMIN" } },
        { roles: { has: "ORGA" }, tournamentIds: { has: params.id } },
      ],
    },
    select: { playerId: true },
  });

  const tournamentInfo = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: { creatorId: true, coOrganizers: { select: { playerId: true } } },
  });

  const orgaIds = new Set([
    ...(tournamentInfo?.creatorId ? [tournamentInfo.creatorId] : []),
    ...orgaOperators.filter((o) => o.playerId).map((o) => o.playerId!),
    ...(tournamentInfo?.coOrganizers.map((co) => co.playerId) ?? []),
  ]);

  const messages = await prisma.tournamentMessage.findMany({
    where: { tournamentId: params.id },
    include: { author: { select: { id: true, name: true, photoPath: true } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return NextResponse.json(messages.map((m) => ({
    ...m,
    isOrga: orgaIds.has(m.authorId),
  })));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.playerId) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: { chatMode: true, creatorId: true, coOrganizers: { select: { playerId: true } } },
  });
  if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (tournament.chatMode === "DISABLED") {
    return NextResponse.json({ error: "Chat désactivé" }, { status: 403 });
  }

  const isOrga =
    session.user.role === "ADMIN" ||
    (session.user.role === "ORGA" && session.user.tournamentId === params.id) ||
    tournament.creatorId === session.user.playerId ||
    tournament.coOrganizers.some((co) => co.playerId === session.user.playerId);

  if (tournament.chatMode === "ORG_ONLY" && !isOrga) {
    return NextResponse.json({ error: "Réservé à l'organisateur" }, { status: 403 });
  }

  const body = await req.json();
  const content = (body.content ?? "").trim();
  if (!content || content.length > 1000) {
    return NextResponse.json({ error: "Message invalide" }, { status: 400 });
  }

  const message = await prisma.tournamentMessage.create({
    data: { tournamentId: params.id, authorId: session.user.playerId, content },
    include: { author: { select: { id: true, name: true, photoPath: true } } },
  });

  return NextResponse.json(message, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.playerId) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: { creatorId: true, coOrganizers: { select: { playerId: true } } },
  });
  if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOrga =
    session.user.role === "ADMIN" ||
    (session.user.role === "ORGA" && session.user.tournamentId === params.id) ||
    tournament.creatorId === session.user.playerId ||
    tournament.coOrganizers.some((co) => co.playerId === session.user.playerId);

  if (!isOrga) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get("messageId");
  if (!messageId) {
    return NextResponse.json({ error: "messageId requis" }, { status: 400 });
  }

  const message = await prisma.tournamentMessage.findUnique({
    where: { id: messageId },
  });
  if (!message || message.tournamentId !== params.id) {
    return NextResponse.json({ error: "Message introuvable" }, { status: 404 });
  }

  await prisma.tournamentMessage.delete({ where: { id: messageId } });

  return NextResponse.json({ ok: true });
}
