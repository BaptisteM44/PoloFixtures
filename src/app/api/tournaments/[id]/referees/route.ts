import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { parseRefereeSettings } from "@/lib/referees";
import { assignRefereeTeams, REFEREE_RULES, type RefMatch } from "@/engine/referees";

export const dynamic = "force-dynamic";

/**
 * Onglet Arbitrage : réglages, matchs avec leur équipe arbitre, charge par
 * équipe, conflits (pour l'orga) et les arbitrages de mon équipe. Si l'orga
 * a caché les désignations, les joueurs ne voient rien.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const t = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: {
      id: true, refereeSettings: true, usesPipeline: true,
      stages: { orderBy: { order: "asc" }, select: { id: true, name: true } },
      teams: { where: { selected: true }, orderBy: { name: "asc" }, select: { id: true, name: true } },
      matches: {
        orderBy: [{ startAt: "asc" }, { courtName: "asc" }],
        select: {
          id: true, startAt: true, courtName: true, status: true, stageId: true, groupKey: true, phase: true,
          teamAId: true, teamBId: true, refereeTeamId: true, refereeAuto: true,
          teamA: { select: { name: true } }, teamB: { select: { name: true } }, refereeTeam: { select: { name: true } },
        },
      },
    },
  });
  if (!t) return new Response("Not found", { status: 404 });
  const session = await auth();
  const playerId = session?.user?.playerId ?? null;
  const canManage = !!(await getOrgaPlayerId(t.id));
  const settings = parseRefereeSettings(t.refereeSettings);
  const visible = canManage || !settings.hidden;

  const myTeamIds = playerId
    ? (await prisma.teamPlayer.findMany({ where: { playerId, team: { tournamentId: t.id } }, select: { teamId: true } })).map((x) => x.teamId)
    : [];

  // Conflits sur les désignations actuelles (aucune nouvelle désignation : règles vides).
  const refMatches: RefMatch[] = t.matches.map((m) => ({
    id: m.id, startAt: m.startAt, courtName: m.courtName, teamAId: m.teamAId, teamBId: m.teamBId,
    stageKey: m.stageId ?? "default", groupKey: m.groupKey, status: m.status,
    refereeTeamId: m.refereeTeamId, refereeAuto: m.refereeAuto,
  }));
  const conflicts = canManage
    ? assignRefereeTeams({ matches: refMatches, teamIds: t.teams.map((x) => x.id), rules: {}, mode: "fill" }).conflicts
    : [];

  const load = new Map<string, number>();
  for (const m of t.matches) if (m.refereeTeamId) load.set(m.refereeTeamId, (load.get(m.refereeTeamId) ?? 0) + 1);

  return Response.json({
    canManage,
    hidden: settings.hidden,
    visible,
    rules: settings.rules,
    stages: t.usesPipeline && t.stages.length > 0 ? t.stages.map((s) => ({ key: s.id, name: s.name })) : [{ key: "default", name: null }],
    teams: t.teams.map((x) => ({ ...x, count: visible ? (load.get(x.id) ?? 0) : 0 })),
    myTeamIds,
    conflicts,
    matches: t.matches.map((m) => ({
      id: m.id, startAt: m.startAt.toISOString(), court: m.courtName, status: m.status,
      stageKey: m.stageId ?? "default", groupKey: m.groupKey,
      teamA: m.teamA?.name ?? null, teamB: m.teamB?.name ?? null, teamAId: m.teamAId, teamBId: m.teamBId,
      refereeTeamId: visible ? m.refereeTeamId : null,
      refereeTeam: visible ? (m.refereeTeam?.name ?? null) : null,
      refereeAuto: m.refereeAuto,
    })),
  });
}

const patchSchema = z.object({
  rules: z.record(z.enum(REFEREE_RULES as [string, ...string[]])).optional(),
  hidden: z.boolean().optional(),
});

/** Réglages d'arbitrage (orga) : règle par étape, désignations cachées ou non. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await getOrgaPlayerId(params.id))) return new Response("Non autorisé", { status: 403 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const t = await prisma.tournament.findUnique({ where: { id: params.id }, select: { refereeSettings: true } });
  if (!t) return new Response("Not found", { status: 404 });
  const current = parseRefereeSettings(t.refereeSettings);
  const next = {
    rules: { ...current.rules, ...(parsed.data.rules ?? {}) },
    hidden: parsed.data.hidden ?? current.hidden,
  };
  await prisma.tournament.update({ where: { id: params.id }, data: { refereeSettings: next } });
  return Response.json({ ok: true, settings: next });
}
