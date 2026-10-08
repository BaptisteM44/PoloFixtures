import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Nombre de messages privés non lus (pastille 💬 du header). Une seule requête. */
export async function GET() {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ unread: 0 });
  const unread = await prisma.directMessage.count({
    where: {
      read: false,
      authorId: { not: playerId },
      conversation: { OR: [{ playerAId: playerId }, { playerBId: playerId }] },
    },
  });
  return NextResponse.json({ unread });
}
