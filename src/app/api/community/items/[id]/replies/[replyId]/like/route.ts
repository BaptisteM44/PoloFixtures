import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string; replyId: string } }
) {
  const session = await auth();
  const playerId = session?.user?.playerId ?? null;
  if (!playerId) return NextResponse.json({ error: "Connexion requise" }, { status: 401 });

  const reply = await prisma.communityReply.findFirst({
    where: { id: params.replyId, itemId: params.id },
  });
  if (!reply) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  await prisma.communityReplyLike.upsert({
    where: { replyId_playerId: { replyId: params.replyId, playerId } },
    create: { replyId: params.replyId, playerId },
    update: {},
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; replyId: string } }
) {
  const session = await auth();
  const playerId = session?.user?.playerId ?? null;
  if (!playerId) return NextResponse.json({ error: "Connexion requise" }, { status: 401 });

  await prisma.communityReplyLike.deleteMany({
    where: { replyId: params.replyId, playerId },
  });

  return NextResponse.json({ ok: true });
}
