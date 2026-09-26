import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { createNotification } from "@/lib/notify";
import { apiMsg } from "@/lib/api-messages";

// PATCH /api/squads/[squadId]/members — changer rôle d'un membre (capitaine only)
// body: { playerId, role: "CAPTAIN" | "MEMBER" }
export async function PATCH(req: Request, { params }: { params: { squadId: string } }) {
  const session = await auth();
  const currentPlayerId = session?.user?.playerId;
  if (!currentPlayerId) return NextResponse.json({ error: apiMsg("not_logged_in") }, { status: 401 });

  const captain = await prisma.squadMember.findUnique({
    where: { squadId_playerId: { squadId: params.squadId, playerId: currentPlayerId } },
  });
  if (!captain || captain.role !== "CAPTAIN") return NextResponse.json({ error: apiMsg("captain_required") }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = z.object({
    playerId: z.string(),
    role: z.enum(["CAPTAIN", "MEMBER"]),
  }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: apiMsg("invalid_data") }, { status: 400 });

  // Si on promeut quelqu'un capitaine, l'ancien capitaine devient membre
  if (parsed.data.role === "CAPTAIN") {
    await prisma.$transaction([
      prisma.squadMember.update({
        where: { squadId_playerId: { squadId: params.squadId, playerId: currentPlayerId } },
        data: { role: "MEMBER" },
      }),
      prisma.squadMember.update({
        where: { squadId_playerId: { squadId: params.squadId, playerId: parsed.data.playerId } },
        data: { role: "CAPTAIN" },
      }),
    ]);
    // Notification au nouveau capitaine
    await createNotification(
      parsed.data.playerId,
      "SQUAD_ROLE_CHANGED",
      { squadId: params.squadId, role: "CAPTAIN" }
    );
  } else {
    await prisma.squadMember.update({
      where: { squadId_playerId: { squadId: params.squadId, playerId: parsed.data.playerId } },
      data: { role: "MEMBER" },
    });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/squads/[squadId]/members — exclure un membre (capitaine) ou quitter (membre)
// body: { playerId }
export async function DELETE(req: Request, { params }: { params: { squadId: string } }) {
  const session = await auth();
  const currentPlayerId = session?.user?.playerId;
  if (!currentPlayerId) return NextResponse.json({ error: apiMsg("not_logged_in") }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const targetPlayerId: string = body.playerId ?? currentPlayerId;

  const currentMember = await prisma.squadMember.findUnique({
    where: { squadId_playerId: { squadId: params.squadId, playerId: currentPlayerId } },
  });
  if (!currentMember) return NextResponse.json({ error: apiMsg("not_member") }, { status: 403 });

  // On peut s'exclure soi-même (quitter) ou exclure quelqu'un si on est capitaine
  if (targetPlayerId !== currentPlayerId && currentMember.role !== "CAPTAIN") {
    return NextResponse.json({ error: apiMsg("captain_required_kick") }, { status: 403 });
  }

  // Le capitaine ne peut pas quitter s'il reste des membres — il doit passer la main d'abord
  if (targetPlayerId === currentPlayerId && currentMember.role === "CAPTAIN") {
    const memberCount = await prisma.squadMember.count({ where: { squadId: params.squadId } });
    if (memberCount > 1) {
      return NextResponse.json({ error: apiMsg("hand_over_captain") }, { status: 400 });
    }
    // Dernier membre — on supprime l'équipe
    await prisma.squad.delete({ where: { id: params.squadId } });
    return NextResponse.json({ ok: true, deleted: true });
  }

  await prisma.squadMember.delete({
    where: { squadId_playerId: { squadId: params.squadId, playerId: targetPlayerId } },
  });

  return NextResponse.json({ ok: true });
}
