import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const matches = await prisma.match.findMany({
    where: {
      tournamentId: params.id,
      status: { in: ["LIVE", "SCHEDULED"] },
    },
    include: {
      teamA: true,
      teamB: true,
      events: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { startAt: "asc" },
  });

  return Response.json({ matches });
}
