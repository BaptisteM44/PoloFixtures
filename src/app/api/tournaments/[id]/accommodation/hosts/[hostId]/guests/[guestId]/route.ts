import { prisma } from "@/lib/db";
import { getOrgaPlayerId } from "@/lib/orga-auth";

export async function DELETE(_req: Request, { params }: { params: { id: string; hostId: string; guestId: string } }) {
  const playerId = await getOrgaPlayerId(params.id);
  if (!playerId) return new Response("Forbidden", { status: 403 });

  const guest = await prisma.accommodationGuest.findUnique({
    where: { id: params.guestId },
    include: { host: { select: { tournamentId: true } } },
  });
  if (!guest || guest.hostId !== params.hostId || guest.host.tournamentId !== params.id) {
    return new Response("Not found", { status: 404 });
  }

  await prisma.accommodationGuest.delete({ where: { id: params.guestId } });
  return new Response(null, { status: 204 });
}
