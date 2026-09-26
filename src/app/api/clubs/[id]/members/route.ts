import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { apiMsg } from "@/lib/api-messages";

// POST : manager invite un joueur  OR  un joueur demande à rejoindre
const postSchema = z.object({
  playerId: z.string().optional(), // manager fournit l'id du joueur
  action: z.enum(["invite", "request", "join"]).default("join"),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.playerId) return new Response(apiMsg("not_authorized"), { status: 401 });

  const club = await prisma.club.findUnique({ where: { id: params.id } });
  if (!club) return new Response(apiMsg("club_not_found"), { status: 404 });
  if (!club.approved) return new Response(apiMsg("club_pending_approval"), { status: 403 });

  const body = await request.json();
  const data = postSchema.safeParse(body);
  if (!data.success) return Response.json({ error: data.error.flatten() }, { status: 400 });

  const isManager = club.managerId === session.user.playerId;

  if (data.data.action === "invite") {
    // Seulement le manager peut inviter
    if (!isManager) return new Response(apiMsg("club_manager_only"), { status: 403 });
    const targetId = data.data.playerId;
    if (!targetId) return Response.json({ error: "playerId requis" }, { status: 400 });

    const existing = await prisma.clubMember.findUnique({ where: { clubId_playerId: { clubId: params.id, playerId: targetId } } });
    if (existing) return Response.json({ error: apiMsg("already_member_or_invited") }, { status: 409 });

    const member = await prisma.clubMember.create({
      data: { clubId: params.id, playerId: targetId, status: "PENDING_BY_MANAGER" },
    });
    return Response.json(member, { status: 201 });
  } else if (data.data.action === "join") {
    // Le joueur rejoint directement sans validation
    const existing = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId: params.id, playerId: session.user.playerId } },
    });
    if (existing) return Response.json({ error: apiMsg("already_member_or_pending") }, { status: 409 });

    const member = await prisma.clubMember.create({
      data: { clubId: params.id, playerId: session.user.playerId, status: "MEMBER" },
    });
    return Response.json(member, { status: 201 });
  } else {
    // Le joueur connecté demande à rejoindre (request = avec validation manager)
    const existing = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId: params.id, playerId: session.user.playerId } },
    });
    if (existing) return Response.json({ error: apiMsg("already_member_or_pending") }, { status: 409 });

    const member = await prisma.clubMember.create({
      data: { clubId: params.id, playerId: session.user.playerId, status: "PENDING_BY_PLAYER" },
    });
    return Response.json(member, { status: 201 });
  }
}

// PATCH : accepter ou refuser une demande / invitation
const patchSchema = z.object({
  playerId: z.string(),
  action: z.enum(["accept", "reject"]),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.playerId) return new Response(apiMsg("not_authorized"), { status: 401 });

  const club = await prisma.club.findUnique({ where: { id: params.id } });
  if (!club) return new Response(apiMsg("club_not_found"), { status: 404 });

  const body = await request.json();
  const data = patchSchema.safeParse(body);
  if (!data.success) return Response.json({ error: data.error.flatten() }, { status: 400 });

  const membership = await prisma.clubMember.findUnique({
    where: { clubId_playerId: { clubId: params.id, playerId: data.data.playerId } },
  });
  if (!membership) return new Response("Membership introuvable", { status: 404 });

  const isManager = club.managerId === session.user.playerId;
  const isTargetPlayer = data.data.playerId === session.user.playerId;

  // Manager accepte/refuse une demande de joueur
  if (membership.status === "PENDING_BY_PLAYER" && !isManager) {
    return new Response(apiMsg("club_manager_only"), { status: 403 });
  }
  // Joueur accepte/refuse une invitation
  if (membership.status === "PENDING_BY_MANAGER" && !isTargetPlayer) {
    return new Response(apiMsg("player_only"), { status: 403 });
  }

  if (data.data.action === "accept") {
    const updated = await prisma.clubMember.update({
      where: { clubId_playerId: { clubId: params.id, playerId: data.data.playerId } },
      data: { status: "MEMBER" },
    });
    return Response.json(updated);
  } else {
    await prisma.clubMember.delete({
      where: { clubId_playerId: { clubId: params.id, playerId: data.data.playerId } },
    });
    return new Response(null, { status: 204 });
  }
}

// DELETE : retirer un membre (manager ou le joueur lui-même)
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.playerId) return new Response(apiMsg("not_authorized"), { status: 401 });

  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get("playerId") ?? session.user.playerId;

  const club = await prisma.club.findUnique({ where: { id: params.id } });
  if (!club) return new Response(apiMsg("club_not_found"), { status: 404 });

  const isManager = club.managerId === session.user.playerId;
  const isSelf = playerId === session.user.playerId;

  if (!isManager && !isSelf) return new Response(apiMsg("not_authorized"), { status: 403 });

  // Si le manager quitte, transférer le managership au prochain membre
  if (playerId === club.managerId) {
    const nextManager = await prisma.clubMember.findFirst({
      where: { clubId: params.id, playerId: { not: playerId }, status: "MEMBER" },
      orderBy: { joinedAt: "asc" },
    });
    if (nextManager) {
      await prisma.club.update({
        where: { id: params.id },
        data: { managerId: nextManager.playerId },
      });
    }
    // S'il est le seul membre, le club reste (la ville sera reprise plus tard)
  }

  await prisma.clubMember.deleteMany({ where: { clubId: params.id, playerId } });
  return new Response(null, { status: 204 });
}
