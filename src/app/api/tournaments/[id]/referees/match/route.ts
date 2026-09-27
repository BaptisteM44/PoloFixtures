import { prisma } from "@/lib/db";
import { z } from "zod";
import { getOrgaPlayerId } from "@/lib/orga-auth";

const schema = z.object({ matchId: z.string().min(1), teamId: z.string().min(1).nullable() });

/** Désignation manuelle d'un match (orga) : verrouillée, jamais recalculée par l'automatique. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!(await getOrgaPlayerId(params.id))) return new Response("Non autorisé", { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const { matchId, teamId } = parsed.data;
  const match = await prisma.match.findFirst({ where: { id: matchId, tournamentId: params.id }, select: { teamAId: true, teamBId: true } });
  if (!match) return Response.json({ error: "not_found" }, { status: 404 });
  if (teamId) {
    const team = await prisma.team.findFirst({ where: { id: teamId, tournamentId: params.id }, select: { id: true } });
    if (!team) return Response.json({ error: "invalid_team" }, { status: 400 });
    if (teamId === match.teamAId || teamId === match.teamBId) return Response.json({ error: "own_match" }, { status: 400 });
  }
  await prisma.match.update({ where: { id: matchId }, data: { refereeTeamId: teamId, refereeAuto: false } });
  return Response.json({ ok: true });
}
