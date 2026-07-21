import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notify";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string; replyId: string } }
) {
  const session = await auth();
  const playerId = session?.user?.playerId ?? null;
  if (!playerId) return NextResponse.json({ error: "Connexion requise" }, { status: 401 });

  const reply = await prisma.communityReply.findFirst({
    where: { id: params.replyId, itemId: params.id },
    include: { item: { select: { title: true } } },
  });
  if (!reply) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const existingLike = await prisma.communityReplyLike.findUnique({
    where: { replyId_playerId: { replyId: params.replyId, playerId } },
  });

  await prisma.communityReplyLike.upsert({
    where: { replyId_playerId: { replyId: params.replyId, playerId } },
    create: { replyId: params.replyId, playerId },
    update: {},
  });

  if (!existingLike && reply.authorId && reply.authorId !== playerId) {
    await createNotification(reply.authorId, "COMMUNITY_STATUS_CHANGED" as any, {
      itemId: params.id,
      itemTitle: reply.item.title,
      status: "reply_liked",
      message: `👍 Ta réponse sur "${reply.item.title}" a été likée`,
    });
  }

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
