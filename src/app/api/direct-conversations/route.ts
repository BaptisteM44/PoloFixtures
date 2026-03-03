import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  recipientId: z.string(),
  message: z.string().min(1).max(2000),
  freeAgentId: z.string().optional(),
});

export async function GET() {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const conversations = await prisma.directConversation.findMany({
    where: { OR: [{ playerAId: playerId }, { playerBId: playerId }] },
    include: {
      playerA: { select: { id: true, name: true, photoPath: true, slug: true } },
      playerB: { select: { id: true, name: true, photoPath: true, slug: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Count unread per conversation
  const withUnread = await Promise.all(
    conversations.map(async (conv) => {
      const unread = await prisma.directMessage.count({
        where: { conversationId: conv.id, authorId: { not: playerId }, read: false },
      });
      const other = conv.playerAId === playerId ? conv.playerB : conv.playerA;
      return { ...conv, unread, other };
    })
  );

  return NextResponse.json(withUnread);
}

export async function POST(req: Request) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { recipientId, message, freeAgentId } = parsed.data;

  if (recipientId === playerId)
    return NextResponse.json({ error: "Impossible de se contacter soi-même" }, { status: 400 });

  // Ensure consistent ordering (smaller id = playerA) to satisfy @@unique
  const [aId, bId] = [playerId, recipientId].sort();

  const conversation = await prisma.directConversation.upsert({
    where: { playerAId_playerBId: { playerAId: aId, playerBId: bId } },
    create: { playerAId: aId, playerBId: bId, freeAgentId },
    update: { updatedAt: new Date() },
  });

  const newMessage = await prisma.directMessage.create({
    data: { conversationId: conversation.id, authorId: playerId, content: message },
  });

  // Notify recipient
  const sender = await prisma.player.findUnique({
    where: { id: playerId },
    select: { name: true },
  });

  const isFirstMessage =
    (await prisma.directMessage.count({ where: { conversationId: conversation.id } })) === 1;

  await prisma.notification.create({
    data: {
      playerId: recipientId,
      type: isFirstMessage ? "DIRECT_MESSAGE_REQUEST" : "DIRECT_MESSAGE_RECEIVED",
      payload: {
        conversationId: conversation.id,
        senderId: playerId,
        senderName: sender?.name ?? "Quelqu'un",
        preview: message.slice(0, 80),
      },
    },
  });

  return NextResponse.json({ conversation, message: newMessage });
}
