import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { z } from "zod";

// POST /api/squads/[squadId]/invite — inviter un joueur
export async function POST(req: Request, { params }: { params: { squadId: string } }) {
  const session = await auth();
  const currentPlayerId = session?.user?.playerId;
  if (!currentPlayerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const member = await prisma.squadMember.findUnique({
    where: { squadId_playerId: { squadId: params.squadId, playerId: currentPlayerId } },
  });
  if (!member) return NextResponse.json({ error: "Pas membre de cette équipe" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = z.object({ playerId: z.string() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "playerId manquant" }, { status: 400 });

  const { playerId: invitedPlayerId } = parsed.data;

  // Déjà membre ?
  const alreadyMember = await prisma.squadMember.findUnique({
    where: { squadId_playerId: { squadId: params.squadId, playerId: invitedPlayerId } },
  });
  if (alreadyMember) return NextResponse.json({ error: "Déjà membre de l'équipe" }, { status: 400 });

  // Invitation déjà en attente ?
  const existing = await prisma.squadInvitation.findUnique({
    where: { squadId_invitedPlayerId: { squadId: params.squadId, invitedPlayerId } },
  });
  if (existing && existing.status === "PENDING") {
    return NextResponse.json({ error: "Invitation déjà envoyée" }, { status: 400 });
  }

  // Recréer l'invitation si elle avait été refusée
  const squad = await prisma.squad.findUnique({ where: { id: params.squadId }, select: { name: true } });
  const inviter = await prisma.player.findUnique({ where: { id: currentPlayerId }, select: { name: true } });

  const invitation = await prisma.squadInvitation.upsert({
    where: { squadId_invitedPlayerId: { squadId: params.squadId, invitedPlayerId } },
    create: { squadId: params.squadId, invitedPlayerId, invitedById: currentPlayerId, status: "PENDING" },
    update: { status: "PENDING", invitedById: currentPlayerId, updatedAt: new Date() },
  });

  // Notification
  await prisma.notification.create({
    data: {
      playerId: invitedPlayerId,
      type: "SQUAD_INVITE",
      payload: {
        invitationId: invitation.id,
        squadId: params.squadId,
        squadName: squad?.name ?? "",
        invitedById: currentPlayerId,
        invitedByName: inviter?.name ?? "",
      },
    },
  });

  return NextResponse.json(invitation, { status: 201 });
}
