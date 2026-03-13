import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.playerId) return new Response("Unauthorized", { status: 401 });

  const memberships = await prisma.clubMember.findMany({
    where: { playerId: session.user.playerId },
    include: { club: true },
    orderBy: { joinedAt: "asc" },
  });

  return Response.json(memberships);
}
