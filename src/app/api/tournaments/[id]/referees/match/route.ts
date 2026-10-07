import { prisma } from "@/lib/db";
import { z } from "zod";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import {
  parseRefereeSettings, refOptions, refMatchSelect, toRefMatch, runRefereeAssignment, notifyRefereeAssignments,
} from "@/lib/referees";
import { rankCandidates, isHardBlocked } from "@/engine/referees";

const schema = z.object({
  matchId: z.string().min(1),
  teamId: z.string().min(1).nullable(),
  /** Rendre la main à l'automatique pour ce match. */
  auto: z.boolean().optional(),
});

/**
 * Désignation manuelle d'un match (orga) : verrouillée, jamais recalculée par
 * l'automatique. Refusée si l'équipe joue (ce match ou en même temps), arbitre
 * déjà en même temps, ou est dispensée — si je joue, je n'arbitre pas.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!(await getOrgaPlayerId(params.id))) return new Response("Non autorisé", { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const { matchId, teamId, auto } = parsed.data;
  const t = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: { refereeSettings: true, gameDurationMin: true, teams: { where: { selected: true }, select: { id: true } }, matches: { select: refMatchSelect } },
  });
  const match = t?.matches.find((m) => m.id === matchId);
  if (!t || !match) return Response.json({ error: "not_found" }, { status: 404 });
  const prev = match.refereeTeamId;

  if (auto) {
    await prisma.match.update({ where: { id: matchId }, data: { refereeTeamId: null, refereeAuto: false } });
    const res = await runRefereeAssignment(params.id, "fill");
    if (prev) await notifyRefereeAssignments(params.id, [prev]);
    return Response.json({ ok: true, ...res });
  }
  if (teamId) {
    if (!t.teams.some((x) => x.id === teamId)) return Response.json({ error: "invalid_team" }, { status: 400 });
    const state = rankCandidates({
      matches: t.matches.map(toRefMatch), teamIds: [teamId],
      options: refOptions(parseRefereeSettings(t.refereeSettings), t.gameDurationMin), matchId,
    })[0]?.state;
    if (state && isHardBlocked(state)) return Response.json({ error: state }, { status: 400 });
  }
  await prisma.match.update({ where: { id: matchId }, data: { refereeTeamId: teamId, refereeAuto: false } });
  if (prev !== teamId) await notifyRefereeAssignments(params.id, [prev, teamId].filter((x): x is string => !!x));
  return Response.json({ ok: true });
}
