import { prisma } from "@/lib/db";

// GET /api/community/stats — nombre de propositions par avancement, pour les
// tuiles du haut de /labs. « En attente » = ouvert + on y réfléchit.
export async function GET() {
  const rows = await prisma.communityItem.groupBy({ by: ["status"], _count: { _all: true } });
  const n = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
  return Response.json({
    done: n("done"),
    inProgress: n("in_progress"),
    pending: n("open") + n("thinking"),
  });
}
