/**
 * Arbitrage par équipe (côté serveur) : réglages du tournoi, répartition
 * automatique (moteur pur : engine/referees) et sa réparation quand le
 * planning glisse, droits des joueurs de l'équipe arbitre, notifications
 * (désignation, « c'est bientôt à vous »).
 */
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notify";
import { tournamentTimezone } from "@/lib/timezone";
import {
  assignRefereeTeams, checkRefereeAssignments, DEFAULT_SLOT_MS, REFEREE_RULES, REST_POLICIES,
  type RefMatch, type RefereeRule, type RefConflict, type RestPolicy, type RefOptions,
} from "@/engine/referees";

export type RefereeSettings = {
  /** Règle par étape (id de l'étape, ou "default" pour un tournoi sans étapes). */
  rules: Record<string, RefereeRule>;
  /** Repos garanti entre jouer et arbitrer. */
  rest: RestPolicy;
  /** Équipes dispensées d'arbitrage (forfait, équipe incomplète…). */
  excluded: string[];
  /** Désignations cachées aux joueurs (par défaut : visibles avec le planning). */
  hidden: boolean;
};

export function parseRefereeSettings(raw: unknown): RefereeSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as { rules?: Record<string, unknown>; rest?: unknown; excluded?: unknown; hidden?: unknown };
  const rules: Record<string, RefereeRule> = {};
  for (const [k, v] of Object.entries(r.rules ?? {})) {
    if (REFEREE_RULES.includes(v as RefereeRule)) rules[k] = v as RefereeRule;
  }
  return {
    rules,
    rest: REST_POLICIES.includes(r.rest as RestPolicy) ? (r.rest as RestPolicy) : "after",
    excluded: Array.isArray(r.excluded) ? r.excluded.filter((x): x is string => typeof x === "string") : [],
    hidden: r.hidden === true,
  };
}

export const hasAutoRule = (s: RefereeSettings) => Object.values(s.rules).some((r) => r !== "manual");

/** Durée d'un créneau : le match + le battement du recalage automatique (4 min). */
export const slotMsFor = (gameDurationMin: number | null | undefined) =>
  gameDurationMin ? (gameDurationMin + 4) * 60_000 : DEFAULT_SLOT_MS;

export const refOptions = (s: RefereeSettings, gameDurationMin: number | null | undefined): RefOptions =>
  ({ rules: s.rules, rest: s.rest, excluded: s.excluded, slotMs: slotMsFor(gameDurationMin) });

/** Sélection Prisma d'un match pour le moteur. */
export const refMatchSelect = {
  id: true, startAt: true, courtName: true, teamAId: true, teamBId: true, stageId: true, groupKey: true,
  status: true, refereeTeamId: true, refereeAuto: true,
  events: { where: { type: "START" as const }, select: { id: true }, take: 1 },
};
type RefMatchRow = {
  id: string; startAt: Date; courtName: string | null; teamAId: string | null; teamBId: string | null;
  stageId: string | null; groupKey: string | null; status: string; refereeTeamId: string | null; refereeAuto: boolean;
  events: { id: string }[];
};
/** Le jeu a vraiment commencé (fini, ou chrono lancé) — un match juste « mis sur le terrain » par le recalage ne compte pas. */
export const toRefMatch = (m: RefMatchRow): RefMatch => ({
  id: m.id, startAt: m.startAt, courtName: m.courtName, teamAId: m.teamAId, teamBId: m.teamBId,
  stageKey: m.stageId ?? "default", groupKey: m.groupKey, status: m.status,
  started: m.status === "FINISHED" || (m.status === "LIVE" && m.events.length > 0),
  refereeTeamId: m.refereeTeamId, refereeAuto: m.refereeAuto,
});

/**
 * Lance la répartition et l'enregistre (jamais les choix manuels).
 * `fill` : matchs sans arbitre ; `repair` : + désignations auto devenues
 * impossibles ; `recompute` : + toutes les désignations auto.
 * Les équipes dont les arbitrages changent sont prévenues.
 */
export async function runRefereeAssignment(
  tournamentId: string,
  mode: "fill" | "repair" | "recompute",
): Promise<{ assigned: number; conflicts: RefConflict[] }> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      refereeSettings: true, gameDurationMin: true,
      teams: { where: { selected: true }, select: { id: true } },
      matches: { select: refMatchSelect },
    },
  });
  if (!t) return { assigned: 0, conflicts: [] };
  const settings = parseRefereeSettings(t.refereeSettings);
  const matches = t.matches.map(toRefMatch);
  const { assignments, conflicts } = assignRefereeTeams({
    matches, teamIds: t.teams.map((x) => x.id), options: refOptions(settings, t.gameDurationMin), mode,
  });
  const before = new Map(matches.map((m) => [m.id, m.refereeTeamId]));
  const changed = new Set<string>();
  for (const [matchId, teamId] of assignments) {
    const prev = before.get(matchId);
    if (prev === teamId) continue;
    await prisma.match.update({ where: { id: matchId }, data: { refereeTeamId: teamId, refereeAuto: true } });
    changed.add(teamId);
    if (prev) changed.add(prev);
  }
  // Matchs à repourvoir restés sans arbitre : on retire l'ancienne désignation impossible.
  for (const c of conflicts) {
    if (c.reason !== "no_candidate") continue;
    const prev = before.get(c.matchId);
    const m = matches.find((x) => x.id === c.matchId);
    if (prev && m?.refereeAuto) {
      await prisma.match.update({ where: { id: c.matchId }, data: { refereeTeamId: null } });
      changed.add(prev);
    }
  }
  if (changed.size > 0) await notifyRefereeAssignments(tournamentId, [...changed]);
  return { assigned: [...assignments].filter(([id, team]) => before.get(id) !== team).length, conflicts };
}

/**
 * Après un changement (étape lancée, match terminé → planning recalé,
 * équipes du tableau connues) : complète les désignations manquantes et
 * remplace celles devenues impossibles, si une règle auto existe.
 */
export async function autoFillReferees(tournamentId: string) {
  try {
    const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { refereeSettings: true } });
    if (!t || !hasAutoRule(parseRefereeSettings(t.refereeSettings))) return;
    await runRefereeAssignment(tournamentId, "repair");
  } catch (e) {
    console.error("[referees] auto-fill failed:", e);
  }
}

/** Problèmes actuels (pour l'orga). */
export async function refereeConflicts(tournamentId: string): Promise<RefConflict[]> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { refereeSettings: true, gameDurationMin: true, teams: { where: { selected: true }, select: { id: true } }, matches: { select: refMatchSelect } },
  });
  if (!t) return [];
  return checkRefereeAssignments({
    matches: t.matches.map(toRefMatch), teamIds: t.teams.map((x) => x.id),
    options: refOptions(parseRefereeSettings(t.refereeSettings), t.gameDurationMin),
  });
}

/** Le joueur fait-il partie de l'équipe désignée pour arbitrer ce match ? */
export async function isRefereeTeamMember(playerId: string | null | undefined, refereeTeamId: string | null | undefined): Promise<boolean> {
  if (!playerId || !refereeTeamId) return false;
  return !!(await prisma.teamPlayer.findFirst({ where: { teamId: refereeTeamId, playerId }, select: { id: true } }));
}

const fmtTime = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: tz || "UTC" }).format(d);

const accountsOf = async (ids: string[]) =>
  (await prisma.player.findMany({ where: { id: { in: ids }, account: { isNot: null }, status: "ACTIVE" }, select: { id: true } })).map((p) => p.id);

/**
 * « Ton équipe arbitre N matchs » : prévient les joueurs des équipes dont les
 * arbitrages ont changé (une seule notif à jour par tournoi). Seulement si
 * les désignations sont visibles, tournoi public hors mode test.
 */
export async function notifyRefereeAssignments(tournamentId: string, teamIds: string[]) {
  try {
    const t = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, slug: true, name: true, status: true, hidden: true, testMode: true, timezone: true, country: true, lng: true, refereeSettings: true },
    });
    if (!t || t.hidden || t.testMode || t.status === "COMPLETED" || teamIds.length === 0) return;
    if (parseRefereeSettings(t.refereeSettings).hidden) return;
    const tz = tournamentTimezone(t) || "UTC";
    const teams = await prisma.team.findMany({
      where: { id: { in: teamIds }, tournamentId },
      select: {
        id: true, name: true, players: { select: { playerId: true } },
        refereedMatchesAsTeam: {
          where: { status: { not: "FINISHED" } }, orderBy: { startAt: "asc" },
          select: { startAt: true, courtName: true, teamA: { select: { name: true } }, teamB: { select: { name: true } } },
        },
      },
    });
    for (const team of teams) {
      const next = team.refereedMatchesAsTeam[0];
      const payload: Record<string, string | number> = {
        tournamentId: t.id, tournamentSlug: t.slug ?? "", tournamentName: t.name, teamName: team.name,
        count: team.refereedMatchesAsTeam.length,
        ...(next ? { nextLabel: `${next.teamA?.name ?? "?"} – ${next.teamB?.name ?? "?"}`, nextTime: fmtTime(next.startAt, tz), nextCourt: next.courtName ?? "" } : {}),
      };
      for (const id of await accountsOf(team.players.map((p) => p.playerId))) {
        await createNotification(id, "REFEREE_ASSIGNED", payload);
      }
    }
  } catch (e) {
    console.error("[referees] notify assignments failed:", e);
  }
}

/** Équipes qui ont au moins un arbitrage à venir (pour prévenir tout le monde d'un coup). */
export async function teamsWithDuties(tournamentId: string): Promise<string[]> {
  const rows = await prisma.match.findMany({
    where: { tournamentId, refereeTeamId: { not: null }, status: { not: "FINISHED" } },
    select: { refereeTeamId: true }, distinct: ["refereeTeamId"],
  });
  return rows.map((r) => r.refereeTeamId!).filter(Boolean);
}

const REMINDER_LEAD_MS = 15 * 60_000;

/**
 * « C'est bientôt à vous » — suit le terrain, pas l'horloge : le planning
 * glisse en permanence, donc le rappel d'un match part quand le match
 * PRÉCÉDENT sur le même terrain est lancé (ou mis sur le terrain). Pour le
 * premier match d'un terrain (ou après une pause), ou si l'orga n'utilise
 * pas le direct, on se rabat sur l'heure estimée (15 min avant).
 * Une seule fois par match ; joueurs des deux équipes + équipe arbitre.
 */
export async function sweepMatchReminders(opts: { now?: Date; tournamentId?: string } = {}) {
  const now = opts.now ?? new Date();
  const tournaments = await prisma.tournament.findMany({
    where: { status: "LIVE", hidden: false, testMode: false, ...(opts.tournamentId ? { id: opts.tournamentId } : {}) },
    select: { id: true, slug: true, name: true, timezone: true, country: true, lng: true, refereeSettings: true, gameDurationMin: true },
  });
  for (const t of tournaments) {
    const slotMs = slotMsFor(t.gameDurationMin);
    const matches = await prisma.match.findMany({
      where: { tournamentId: t.id, startAt: { gte: new Date(now.getTime() - 12 * 3600_000), lte: new Date(now.getTime() + 12 * 3600_000) } },
      orderBy: { startAt: "asc" },
      select: {
        id: true, startAt: true, courtName: true, status: true, remindersSentAt: true, teamAId: true, teamBId: true,
        events: { where: { type: "START" }, select: { id: true }, take: 1 },
        teamA: { select: { name: true, players: { select: { playerId: true } } } },
        teamB: { select: { name: true, players: { select: { playerId: true } } } },
        refereeTeam: { select: { name: true, players: { select: { playerId: true } } } },
      },
    });
    const byCourt = new Map<string, typeof matches>();
    for (const m of matches) {
      const k = m.courtName ?? "";
      if (!byCourt.has(k)) byCourt.set(k, []);
      byCourt.get(k)!.push(m);
    }
    const hidden = parseRefereeSettings(t.refereeSettings).hidden;
    const tz = tournamentTimezone(t) || "UTC";

    for (const list of byCourt.values()) {
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        const started = m.status === "FINISHED" || (m.status === "LIVE" && m.events.length > 0);
        if (m.remindersSentAt || started || !m.teamA || !m.teamB) continue;
        const prev = i > 0 ? list[i - 1] : null;
        // Une vraie pause avant ce match (déjeuner, autre jour) : il « ouvre » le terrain.
        const opensCourt = !prev || m.startAt.getTime() - prev.startAt.getTime() > 2.5 * slotMs;
        const soon = m.startAt.getTime() - now.getTime() <= REMINDER_LEAD_MS;
        let due: "next" | "time" | null = null;
        if (opensCourt) due = soon ? "time" : null;
        else if (prev!.status !== "SCHEDULED") due = "next"; // le match d'avant est sur le terrain
        // Direct pas utilisé (le match d'avant aurait dû finir depuis longtemps) : à l'heure.
        else if (prev!.startAt.getTime() + slotMs < now.getTime() && soon) due = "time";
        if (!due) continue;

        // Marqué d'abord : un balayage concurrent ne renvoie pas les mêmes rappels.
        const claimed = await prisma.match.updateMany({ where: { id: m.id, remindersSentAt: null }, data: { remindersSentAt: now } });
        if (claimed.count === 0) continue;
        const base = {
          tournamentId: t.id, tournamentSlug: t.slug ?? "", tournamentName: t.name, matchId: m.id,
          court: m.courtName ?? "", time: fmtTime(m.startAt, tz), next: due === "next" ? 1 : 0,
          ...(due === "next" && prev ? { afterLabel: `${prev.teamA?.name ?? "?"} – ${prev.teamB?.name ?? "?"}` } : {}),
        };
        for (const [team, opponent] of [[m.teamA, m.teamB], [m.teamB, m.teamA]] as const) {
          for (const id of await accountsOf(team.players.map((p) => p.playerId))) {
            await createNotification(id, "MATCH_SOON", { ...base, opponent: opponent.name });
          }
        }
        if (m.refereeTeam && !hidden) {
          const matchLabel = `${m.teamA.name} – ${m.teamB.name}`;
          for (const id of await accountsOf(m.refereeTeam.players.map((p) => p.playerId))) {
            await createNotification(id, "REFEREE_SOON", { ...base, matchLabel });
          }
        }
      }
    }
  }
}

/** Après un lancement / une fin de match : prévient tout de suite les suivants du tournoi. */
export function remindNextUp(tournamentId: string) {
  sweepMatchReminders({ tournamentId }).catch((e) => console.error("[referees] next-up reminders failed:", e));
}

// Balayage opportuniste (sans cron) : au plus toutes les 3 min par instance,
// déclenché par les visites — le jour d'un tournoi, les joueurs naviguent.
let lastSweep = 0;
export function maybeSweepMatchReminders() {
  const now = Date.now();
  if (now - lastSweep < 3 * 60_000) return;
  lastSweep = now;
  sweepMatchReminders().catch((e) => console.error("[referees] reminder sweep failed:", e));
}
