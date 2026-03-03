import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { z } from "zod";

// PATCH /api/invitations/[invitationId] — accepter ou refuser
export async function PATCH(req: Request, { params }: { params: { invitationId: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = z.object({ action: z.enum(["accept", "decline"]) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "action invalide" }, { status: 400 });

  const invitation = await prisma.squadInvitation.findUnique({
    where: { id: params.invitationId },
    include: { squad: { select: { id: true, name: true } } },
  });

  if (!invitation) return NextResponse.json({ error: "Invitation introuvable" }, { status: 404 });
  if (invitation.invitedPlayerId !== playerId) return NextResponse.json({ error: "Pas pour vous" }, { status: 403 });
  if (invitation.status !== "PENDING") return NextResponse.json({ error: "Invitation déjà traitée" }, { status: 400 });

  const invitedPlayer = await prisma.player.findUnique({ where: { id: playerId }, select: { name: true } });

  if (parsed.data.action === "accept") {
    await prisma.$transaction([
      prisma.squadInvitation.update({
        where: { id: params.invitationId },
        data: { status: "ACCEPTED" },
      }),
      prisma.squadMember.create({
        data: { squadId: invitation.squadId, playerId, role: "MEMBER" },
      }),
    ]);

    // Notifier l'invitant
    await prisma.notification.create({
      data: {
        playerId: invitation.invitedById,
        type: "SQUAD_INVITE_ACCEPTED",
        payload: {
          squadId: invitation.squadId,
          squadName: invitation.squad.name,
          playerId,
          playerName: invitedPlayer?.name ?? "",
        },
      },
    });
  } else {
    await prisma.squadInvitation.update({
      where: { id: params.invitationId },
      data: { status: "DECLINED" },
    });

    // Notifier l'invitant
    await prisma.notification.create({
      data: {
        playerId: invitation.invitedById,
        type: "SQUAD_INVITE_DECLINED",
        payload: {
          squadId: invitation.squadId,
          squadName: invitation.squad.name,
          playerId,
          playerName: invitedPlayer?.name ?? "",
        },
      },
    });
  }

  return NextResponse.json({ ok: true });
}
