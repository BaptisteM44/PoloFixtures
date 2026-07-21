import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { createNotification } from "@/lib/notify";

const patchSchema = z.object({
  isKeyReply: z.boolean(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; replyId: string } }
) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const reply = await prisma.communityReply.findFirst({
    where: { id: params.replyId, itemId: params.id },
    include: { item: { select: { title: true } } },
  });
  if (!reply) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const updated = await prisma.communityReply.update({
    where: { id: params.replyId },
    data: { isKeyReply: parsed.data.isKeyReply },
  });

  if (parsed.data.isKeyReply && !reply.isKeyReply && reply.authorId) {
    await createNotification(reply.authorId, "COMMUNITY_STATUS_CHANGED" as any, {
      itemId: params.id,
      itemTitle: reply.item.title,
      status: "reply_key",
      message: `⭐ Ta réponse sur "${reply.item.title}" a été mise en avant`,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; replyId: string } }
) {
  const session = await auth();
  const playerId = session?.user?.playerId ?? null;
  const isAdmin = session?.user?.role === "ADMIN";

  const reply = await prisma.communityReply.findFirst({
    where: { id: params.replyId, itemId: params.id },
  });
  if (!reply) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  if (!isAdmin && reply.authorId !== playerId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  await prisma.communityReply.delete({ where: { id: params.replyId } });
  return NextResponse.json({ ok: true });
}
