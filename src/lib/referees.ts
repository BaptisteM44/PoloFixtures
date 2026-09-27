/**
 * Arbitrage par équipe (côté serveur) : réglages du tournoi, lancement de la
 * répartition automatique (moteur pur : engine/referees), droits des joueurs
 * de l'équipe arbitre, et rappels « ton match / ton arbitrage dans 15 min ».
 */
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notify";
import { tournamentTimezone } from "@/lib/timezone";
import { assignRefereeTeams, REFEREE_RULES, type RefMatch, type RefereeRule, type RefConflict } from "@/engine/referees";

export type RefereeSettings = {
  /** Règle par étape (id de l'étape, ou "default" pour un tournoi sans étapes). */
  rules: Record<string, RefereeRule>;
  /** Désignations cachées aux joueurs (par défaut : visibles avec le planning). */
  hidden: boolean;
};

export function parseRefereeSettings(raw: unknown): RefereeSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as { rules?: Record<string, unknown>; hidden?: unknown };
  const rules: Record<string, RefereeRule> = {};
  for (const [k, v] of Object.entries(r.rules ?? {})) {
    if (REFEREE_RULES.includes(v as RefereeRule)) rules[k] = v as RefereeRule;
  }
  return { rules, hidden: r.hidden === true };
}

export const hasAutoRule = (s: RefereeSettings) => Object.values(s.rules).some((r) => r !== "manual");

/**
 * Lance la répartition et l'enregistre. `fill` : matchs sans arbitre ;
 * `recompute` : aussi ceux désignés automatiquement (jamais les choix manuels).
 */
export async function runRefereeAssignment(tournamentId: string, mode: "fill" | "recompute"): Promise<{ assigned: number; conflicts: RefConflict[] }> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      refereeSettings: true,
      teams: { where: { selected: true }, select: { id: true } },
      matches: {
        select: {
          id: true, startAt: true, courtName: true, teamAId: true, teamBId: true, stageId: true, groupKey: true,
          status: true, refereeTeamId: true, refereeAuto: true,
        },
      },
    },
  });
  if (!t) return { assigned: 0, conflicts: [] };
  const settings = parseRefereeSettings(t.refereeSettings);
  const matches: RefMatch[] = t.matches.map((m) => ({
    id: m.id, startAt: m.startAt, courtName: m.courtName, teamAId: m.teamAId, teamBId: m.teamBId,
    stageKey: m.stageId ?? "default", groupKey: m.groupKey, status: m.status,
    refereeTeamId: m.refereeTeamId, refereeAuto: m.refereeAuto,
  }));
  const { assignments, conflicts } = assignRefereeTeams({
    matches, teamIds: t.teams.map((x) => x.id), rules: settings.rules, mode,
  });
  for (const [matchId, teamId] of assignments) {
    await prisma.match.update({ where: { id: matchId }, data: { refereeTeamId: teamId, refereeAuto: true } });
  }
  return { assigned: assignments.size, conflicts };
}

/**
 * Après un changement (étape lancée, match terminé → équipes du bracket
 * connues) : complète les désignations manquantes si une règle auto existe.
 */
export async function autoFillReferees(tournamentId: string) {
  try {
    const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { refereeSettings: true } });
    if (!t || !hasAutoRule(parseRefereeSettings(t.refereeSettings))) return;
    await runRefereeAssignment(tournamentId, "fill");
  } catch (e) {
    console.error("[referees] auto-fill failed:", e);
  }
}

/** Le joueur fait-il partie de l'équipe désignée pour arbitrer ce match ? */
export async function isRefereeTeamMember(playerId: string | null | undefined, refereeTeamId: string | null | undefined): Promise<boolean> {
  if (!playerId || !refereeTeamId) return false;
  return !!(await prisma.teamPlayer.findFirst({ where: { teamId: refereeTeamId, playerId }, select: { id: true } }));
}

const REMINDER_WINDOW_MS = 20 * 60_000;

/**
 * Rappels ~15 min avant : les joueurs des deux équipes (« ton match
 * commence ») et ceux de l'équipe arbitre (« tu arbitres »), une seule fois
 * par match. Tournois en cours, publics, hors mode test.
 */
export async function sweepMatchReminders(now = new Date()) {
  const matches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      remindersSentAt: null,
      startAt: { gt: now, lte: new Date(now.getTime() + REMINDER_WINDOW_MS) },
      teamAId: { not: null },
      teamBId: { not: null },
      tournament: { status: "LIVE", hidden: false, testMode: false },
    },
    select: {
      id: true, startAt: true, courtName: true, refereeTeamId: true,
      teamA: { select: { id: true, name: true, players: { select: { playerId: true } } } },
      teamB: { select: { id: true, name: true, players: { select: { playerId: true } } } },
      refereeTeam: { select: { name: true, players: { select: { playerId: true } } } },
      tournament: { select: { id: true, slug: true, name: true, timezone: true, country: true, lng: true, refereeSettings: true } },
    },
    take: 200,
  });

  for (const m of matches) {
    // Marqué d'abord : un balayage concurrent ne renvoie pas les mêmes rappels.
    const claimed = await prisma.match.updateMany({ where: { id: m.id, remindersSentAt: null }, data: { remindersSentAt: now } });
    if (claimed.count === 0) continue;
    const t = m.tournament;
    const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: tournamentTimezone(t) || "UTC" }).format(m.startAt);
    const base = { tournamentId: t.id, tournamentSlug: t.slug ?? "", tournamentName: t.name, matchId: m.id, court: m.courtName ?? "", time };
    const withAccount = async (ids: string[]) =>
      (await prisma.player.findMany({ where: { id: { in: ids }, account: { isNot: null }, status: "ACTIVE" }, select: { id: true } })).map((p) => p.id);

    for (const [team, opponent] of [[m.teamA, m.teamB], [m.teamB, m.teamA]] as const) {
      if (!team || !opponent) continue;
      for (const id of await withAccount(team.players.map((p) => p.playerId))) {
        await createNotification(id, "MATCH_SOON", { ...base, opponent: opponent.name });
      }
    }
    const hidden = parseRefereeSettings(t.refereeSettings).hidden;
    if (m.refereeTeam && !hidden) {
      const matchLabel = `${m.teamA?.name ?? "?"} – ${m.teamB?.name ?? "?"}`;
      for (const id of await withAccount(m.refereeTeam.players.map((p) => p.playerId))) {
        await createNotification(id, "REFEREE_SOON", { ...base, matchLabel });
      }
    }
  }
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
