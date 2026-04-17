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

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const items = await prisma.clubEquipment.findMany({
    where: { clubId: params.id },
    orderBy: { createdAt: "asc" },
    include: { borrower: { select: { name: true } } },
  });
  return Response.json(items.map((e) => ({ ...e, borrowerName: e.borrower?.name ?? null })));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.playerId) return new Response("Non autorisé", { status: 401 });
  const { isAdmin } = await getClubRole(params.id, session.user.playerId);
  if (!isAdmin) return new Response("Réservé aux admins", { status: 403 });

  const { name, category, notes } = await req.json();
  if (!name || !category) return new Response("Données manquantes", { status: 400 });

  const item = await prisma.clubEquipment.create({
    data: { clubId: params.id, name, category, notes: notes ?? null },
    include: { borrower: { select: { name: true } } },
  });
  return Response.json({ ...item, borrowerName: item.borrower?.name ?? null }, { status: 201 });
}
