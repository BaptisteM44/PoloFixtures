import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

// GET /api/notifications — notifications du joueur connecté
export async function GET() {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const notifications = await prisma.notification.findMany({
    where: { playerId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(notifications);
}

// DELETE /api/notifications?id=xxx — supprimer une notif
export async function DELETE(request: Request) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await prisma.notification.deleteMany({ where: { id, playerId } });
  return NextResponse.json({ ok: true });
}

// POST /api/notifications — marquer tout comme lu
export async function POST() {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  await prisma.notification.updateMany({
    where: { playerId, read: false },
    data: { read: true },
  });

  return NextResponse.json({ ok: true });
}
