import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function getClubRole(clubId: string, playerId: string) {
  const club = await prisma.club.findUnique({ where: { id: clubId }, select: { managerId: true } });
  const isManager = club?.managerId === playerId;
  const adminRole = await prisma.clubAdmin.findUnique({ where: { clubId_playerId: { clubId, playerId } } });
  const isAdmin = isManager || !!adminRole;
  const membership = await prisma.clubMember.findUnique({ where: { clubId_playerId: { clubId, playerId } } });
  const isMember = membership?.status === "MEMBER";
  return { isAdmin, isMember };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; equipmentId: string } }) {
  const session = await auth();
  if (!session?.user?.playerId) return new Response("Non autorisé", { status: 401 });
  const { isMember } = await getClubRole(params.id, session.user.playerId);
  if (!isMember) return new Response("Membres uniquement", { status: 403 });

  const { borrowedBy } = await req.json();
  const item = await prisma.clubEquipment.update({
    where: { id: params.equipmentId },
    data: { borrowedBy: borrowedBy ?? null },
    include: { borrower: { select: { name: true } } },
  });
  return Response.json({ ...item, borrowerName: item.borrower?.name ?? null });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string; equipmentId: string } }) {
  const session = await auth();
  if (!session?.user?.playerId) return new Response("Non autorisé", { status: 401 });
  const { isAdmin } = await getClubRole(params.id, session.user.playerId);
  if (!isAdmin) return new Response("Réservé aux admins", { status: 403 });

  await prisma.clubEquipment.delete({ where: { id: params.equipmentId } });
  return new Response(null, { status: 204 });
}
