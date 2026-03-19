import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const conv = await prisma.directConversation.findUnique({ where: { id: params.id } });
  if (!conv) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
  if (conv.playerAId !== playerId && conv.playerBId !== playerId)
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  // Cascade delete handles messages
  await prisma.directConversation.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
