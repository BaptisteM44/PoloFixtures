import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { MessagesClient } from "./MessagesClient";

export default async function MessagesPage() {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) redirect("/");

  const conversations = await prisma.directConversation.findMany({
    where: { OR: [{ playerAId: playerId }, { playerBId: playerId }] },
    include: {
      playerA: { select: { id: true, name: true, photoPath: true, slug: true } },
      playerB: { select: { id: true, name: true, photoPath: true, slug: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Attach unread count and "other" player per conversation
  const data = await Promise.all(
    conversations.map(async (conv) => {
      const unread = await prisma.directMessage.count({
        where: { conversationId: conv.id, authorId: { not: playerId }, read: false },
      });
      const other = conv.playerAId === playerId ? conv.playerB : conv.playerA;
      return {
        id: conv.id,
        other,
        lastMessage: conv.messages[0]
          ? { content: conv.messages[0].content, createdAt: conv.messages[0].createdAt.toISOString(), authorId: conv.messages[0].authorId }
          : null,
        unread,
      };
    })
  );

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 24 }}>
        <div>
          <h1>Messages</h1>
          <p>Tes conversations privées</p>
        </div>
      </div>
      <MessagesClient conversations={data} currentPlayerId={playerId} />
    </div>
  );
}
