import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { createNotification } from "@/lib/notify";

async function getConvAndPlayer(id: string) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return { error: "Non connecté", status: 401 } as const;

  const conv = await prisma.directConversation.findUnique({ where: { id } });
  if (!conv) return { error: "Conversation introuvable", status: 404 } as const;
  if (conv.playerAId !== playerId && conv.playerBId !== playerId)
    return { error: "Accès refusé", status: 403 } as const;

  const recipientId = conv.playerAId === playerId ? conv.playerBId : conv.playerAId;
  return { playerId, conv, recipientId };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getConvAndPlayer(params.id);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const messages = await prisma.directMessage.findMany({
    where: { conversationId: params.id },
    include: { author: { select: { id: true, name: true, photoPath: true } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  // Mark messages from the other person as read
  await prisma.directMessage.updateMany({
    where: { conversationId: params.id, authorId: { not: ctx.playerId }, read: false },
    data: { read: true },
  });

  return NextResponse.json(messages);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getConvAndPlayer(params.id);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json();
  const parsed = z.object({ content: z.string().min(1).max(2000) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [message] = await prisma.$transaction([
    prisma.directMessage.create({
      data: { conversationId: params.id, authorId: ctx.playerId, content: parsed.data.content },
      include: { author: { select: { id: true, name: true, photoPath: true } } },
    }),
    prisma.directConversation.update({
      where: { id: params.id },
      data: { updatedAt: new Date() },
    }),
  ]);

  const sender = await prisma.player.findUnique({
    where: { id: ctx.playerId },
    select: { name: true },
  });

  await createNotification(
    ctx.recipientId,
    "DIRECT_MESSAGE_RECEIVED",
    {
      conversationId: params.id,
      senderId: ctx.playerId,
      senderName: sender?.name ?? "Quelqu'un",
      preview: parsed.data.content.slice(0, 80),
    }
  );

  return NextResponse.json(message);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getConvAndPlayer(params.id);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json();
  const parsed = z.object({ messageId: z.string() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Only the author can delete their own message
  const message = await prisma.directMessage.findUnique({ where: { id: parsed.data.messageId } });
  if (!message || message.conversationId !== params.id)
    return NextResponse.json({ error: "Message introuvable" }, { status: 404 });
  if (message.authorId !== ctx.playerId)
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  await prisma.directMessage.delete({ where: { id: parsed.data.messageId } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getConvAndPlayer(params.id);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json();
  const parsed = z.object({ messageId: z.string(), content: z.string().min(1).max(2000) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const message = await prisma.directMessage.findUnique({ where: { id: parsed.data.messageId } });
  if (!message || message.conversationId !== params.id)
    return NextResponse.json({ error: "Message introuvable" }, { status: 404 });
  if (message.authorId !== ctx.playerId)
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const updated = await prisma.directMessage.update({
    where: { id: parsed.data.messageId },
    data: { content: parsed.data.content, editedAt: new Date() },
    include: { author: { select: { id: true, name: true, photoPath: true } } },
  });

  return NextResponse.json(updated);
}
