import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { createNotification } from "@/lib/notify";

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

  // Notifie les autres membres de l'équipe (in-app + push) — pas l'auteur.
  // Équipe = petit groupe (quelques joueurs), contrairement au chat tournoi
  // (broadcast à tous) qui ne notifie personne pour éviter le bruit.
  const team = await prisma.team.findUnique({
    where: { id: params.teamId },
    select: {
      name: true,
      players: { where: { playerId: { not: playerId } }, select: { playerId: true } },
    },
  });
  if (team) {
    for (const tp of team.players) {
      createNotification(tp.playerId, "TEAM_MESSAGE_RECEIVED", {
        teamId: params.teamId,
        teamName: team.name,
        senderName: message.author.name,
        preview: content.slice(0, 80),
      }).catch(() => {});
    }
  }

  return NextResponse.json(message, { status: 201 });
}
