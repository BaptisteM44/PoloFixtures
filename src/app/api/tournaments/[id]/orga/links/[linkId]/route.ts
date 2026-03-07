import { prisma } from "@/lib/db";
import { getOrgaPlayerId } from "@/lib/orga-auth";

export async function DELETE(_req: Request, { params }: { params: { id: string; linkId: string } }) {
  const playerId = await getOrgaPlayerId(params.id);
  if (!playerId) return new Response("Forbidden", { status: 403 });

  const existing = await prisma.orgaLink.findUnique({ where: { id: params.linkId } });
  if (!existing || existing.tournamentId !== params.id) return new Response("Not found", { status: 404 });

  await prisma.orgaLink.delete({ where: { id: params.linkId } });
  return new Response(null, { status: 204 });
}
