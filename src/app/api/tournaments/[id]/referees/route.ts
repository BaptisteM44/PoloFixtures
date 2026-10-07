import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { tournamentTimezone } from "@/lib/timezone";
import {
  parseRefereeSettings, hasAutoRule, refOptions, refMatchSelect, toRefMatch, slotMsFor,
  runRefereeAssignment, notifyRefereeAssignments, teamsWithDuties,
} from "@/lib/referees";
import { checkRefereeAssignments, REFEREE_RULES, REST_POLICIES } from "@/engine/referees";

export const dynamic = "force-dynamic";

/** Nombre de groupes de chaque étape (config, règles d'entrée, ou matchs déjà créés). */
function stageGroupCount(stage: { config: unknown; entryRules: unknown }, matchGroups: Set<string> | undefined) {
  const cfg = (stage.config ?? {}) as { groups?: number };
  const entry = (stage.entryRules ?? {}) as { groups?: number };
  return Math.max(cfg.groups ?? 0, entry.groups ?? 0, matchGroups?.size ?? 0, 1);
}

async function loadTournament(id: string) {
  return prisma.tournament.findUnique({
    where: { id },
    select: {
      id: true, refereeSettings: true, usesPipeline: true, gameDurationMin: true, timezone: true, country: true, lng: true,
      stages: { orderBy: { order: "asc" }, select: { id: true, name: true, config: true, entryRules: true } },
      teams: { where: { selected: true }, orderBy: { name: "asc" }, select: { id: true, name: true } },
      matches: {
        orderBy: [{ startAt: "asc" }, { courtName: "asc" }],
        select: { ...refMatchSelect, teamA: { select: { name: true } }, teamB: { select: { name: true } }, refereeTeam: { select: { name: true } } },
      },
    },
  });
}

/**
 * Onglet Arbitres : réglages, matchs avec leur équipe arbitre, charge par
 * équipe, problèmes (pour l'orga) et les équipes du joueur. Si l'orga a
 * caché les désignations, les joueurs ne voient rien.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const t = await loadTournament(params.id);
  if (!t) return new Response("Not found", { status: 404 });
  const session = await auth();
  const playerId = session?.user?.playerId ?? null;
  const canManage = !!(await getOrgaPlayerId(t.id));
  const settings = parseRefereeSettings(t.refereeSettings);
  const visible = canManage || !settings.hidden;

  const myTeamIds = playerId
    ? (await prisma.teamPlayer.findMany({ where: { playerId, team: { tournamentId: t.id } }, select: { teamId: true } })).map((x) => x.teamId)
    : [];

  const refMatches = t.matches.map(toRefMatch);
  const conflicts = canManage
    ? checkRefereeAssignments({ matches: refMatches, teamIds: t.teams.map((x) => x.id), options: refOptions(settings, t.gameDurationMin) })
    : [];

  const groupsByStage = new Map<string, Set<string>>();
  for (const m of t.matches) {
    if (!m.groupKey) continue;
    const k = m.stageId ?? "default";
    if (!groupsByStage.has(k)) groupsByStage.set(k, new Set());
    groupsByStage.get(k)!.add(m.groupKey);
  }
  const load = new Map<string, number>();
  for (const m of t.matches) if (m.refereeTeamId) load.set(m.refereeTeamId, (load.get(m.refereeTeamId) ?? 0) + 1);

  return Response.json({
    canManage,
    hidden: settings.hidden,
    visible,
    configured: hasAutoRule(settings) || t.matches.some((m) => m.refereeTeamId),
    timezone: tournamentTimezone(t) || "UTC",
    slotMs: slotMsFor(t.gameDurationMin),
    settings: { rules: settings.rules, rest: settings.rest, excluded: canManage ? settings.excluded : [] },
    stages: t.usesPipeline && t.stages.length > 0
      ? t.stages.map((s) => ({ key: s.id, name: s.name, groups: stageGroupCount(s, groupsByStage.get(s.id)) }))
      : [{ key: "default", name: null, groups: Math.max(1, groupsByStage.get("default")?.size ?? 0) }],
    teams: t.teams.map((x) => ({ ...x, count: visible ? (load.get(x.id) ?? 0) : 0 })),
    myTeamIds,
    conflicts,
    matches: t.matches.map((m, i) => ({
      id: m.id, startAt: m.startAt.toISOString(), court: m.courtName, status: m.status, started: refMatches[i].started,
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
  rest: z.enum(REST_POLICIES as [string, ...string[]]).optional(),
  excluded: z.array(z.string().min(1)).max(200).optional(),
  hidden: z.boolean().optional(),
});

/**
 * Réglages d'arbitrage (orga). Effets immédiats :
 *  - une règle automatique choisie → les matchs sont répartis ;
 *  - repos modifié → les désignations auto sont recalculées ;
 *  - équipe dispensée → ses arbitrages auto sont réattribués ;
 *  - désignations rendues visibles → toutes les équipes sont prévenues.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await getOrgaPlayerId(params.id))) return new Response("Non autorisé", { status: 403 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const t = await loadTournament(params.id);
  if (!t) return new Response("Not found", { status: 404 });
  const current = parseRefereeSettings(t.refereeSettings);

  // « Groupes croisés » n'a de sens que dans une étape à plusieurs groupes.
  const groupsByStage = new Map<string, Set<string>>();
  for (const m of t.matches) if (m.groupKey) {
    const k = m.stageId ?? "default";
    if (!groupsByStage.has(k)) groupsByStage.set(k, new Set());
    groupsByStage.get(k)!.add(m.groupKey);
  }
  for (const [key, rule] of Object.entries(parsed.data.rules ?? {})) {
    if (rule !== "cross_groups") continue;
    const stage = t.stages.find((s) => s.id === key);
    const groups = stage ? stageGroupCount(stage, groupsByStage.get(key)) : (groupsByStage.get(key)?.size ?? 0);
    if (groups < 2) return Response.json({ error: "cross_groups_needs_groups" }, { status: 400 });
  }
  const teamIds = new Set(t.teams.map((x) => x.id));
  const next = {
    rules: { ...current.rules, ...((parsed.data.rules ?? {}) as Record<string, (typeof REFEREE_RULES)[number]>) },
    rest: (parsed.data.rest ?? current.rest) as (typeof REST_POLICIES)[number],
    excluded: (parsed.data.excluded ?? current.excluded).filter((id) => teamIds.has(id)),
    hidden: parsed.data.hidden ?? current.hidden,
  };
  await prisma.tournament.update({ where: { id: params.id }, data: { refereeSettings: next } });

  let result: Awaited<ReturnType<typeof runRefereeAssignment>> | null = null;
  if (hasAutoRule(next)) {
    const restChanged = parsed.data.rest !== undefined && parsed.data.rest !== current.rest;
    const rulesChanged = parsed.data.rules !== undefined && JSON.stringify(next.rules) !== JSON.stringify(current.rules);
    const exclChanged = parsed.data.excluded !== undefined && JSON.stringify(next.excluded) !== JSON.stringify(current.excluded);
    if (restChanged || rulesChanged) result = await runRefereeAssignment(params.id, "recompute");
    else if (exclChanged) result = await runRefereeAssignment(params.id, "repair");
  }
  if (current.hidden && !next.hidden) await notifyRefereeAssignments(params.id, await teamsWithDuties(params.id));
  return Response.json({ ok: true, settings: next, ...(result ?? {}) });
}
