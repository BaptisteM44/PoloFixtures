import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function POST() {
  const session = await auth();
  const playerId = (session?.user as { playerId?: string } | undefined)?.playerId;
  if (!session?.user || !playerId) return new Response("Unauthorized", { status: 401 });

  await prisma.playerAccount.update({
    where: { playerId },
    data: { charterAcceptedAt: new Date() },
  });

  return new Response(null, { status: 204 });
}
