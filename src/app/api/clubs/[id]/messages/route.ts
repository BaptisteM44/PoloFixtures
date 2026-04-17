import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clubId } = await params;
  const session = await auth();
  const playerId = (session?.user as any)?.playerId;

  // Only members can read messages
  if (playerId) {
    const membership = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId, playerId } },
    });
    if (membership?.status !== "MEMBER") {
      return Response.json([]);
    }
  } else {
    return Response.json([]);
  }

  const messages = await prisma.clubMessage.findMany({
    where: { clubId },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      content: true,
      createdAt: true,
      player: { select: { id: true, name: true } },
    },
  });

  return Response.json(messages);
}
