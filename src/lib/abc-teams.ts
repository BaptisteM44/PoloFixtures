/**
 * ABC Chapeau — garde l'inscription solo (TournamentSoloEntry.teamId) et la
 * composition réelle de l'équipe (TeamPlayer) toujours d'accord.
 *
 * La page publique, les matchs et les fiches d'équipe lisent TeamPlayer ; le
 * panneau de tirage lit soloEntry.teamId. Toute écriture passe donc par ici,
 * sinon les deux divergent (bug de l'ancienne route draw/adjust, qui ne
 * touchait que l'inscription).
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type Tx = Prisma.TransactionClient;

/**
 * Place une inscription dans une équipe (ou la sort de toute équipe si
 * teamId = null). Retire d'abord le joueur de n'importe quelle équipe du
 * tournoi, pour qu'il ne soit jamais dans deux équipes à la fois.
 */
export async function moveSoloEntry(
  tx: Tx,
  tournamentId: string,
  entryId: string,
  teamId: string | null,
): Promise<{ error?: "entry_not_found" | "team_not_found" }> {
  const entry = await tx.tournamentSoloEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.tournamentId !== tournamentId) return { error: "entry_not_found" };

  if (teamId) {
    const team = await tx.team.findUnique({ where: { id: teamId }, select: { tournamentId: true } });
    if (!team || team.tournamentId !== tournamentId) return { error: "team_not_found" };
  }

  await tx.teamPlayer.deleteMany({ where: { playerId: entry.playerId, team: { tournamentId } } });
  if (teamId) {
    await tx.teamPlayer.create({ data: { teamId, playerId: entry.playerId, isCaptain: false } });
  }
  await tx.tournamentSoloEntry.update({ where: { id: entryId }, data: { teamId } });
  return {};
}

/** Supprime une équipe ABC : ses joueurs redeviennent « non placés ». */
export async function deleteAbcTeam(tx: Tx, teamId: string): Promise<void> {
  await tx.tournamentSoloEntry.updateMany({ where: { teamId }, data: { teamId: null } });
  await tx.teamPlayer.deleteMany({ where: { teamId } });
  await tx.poolTeam.deleteMany({ where: { teamId } });
  await tx.match.updateMany({ where: { teamAId: teamId }, data: { teamAId: null } });
  await tx.match.updateMany({ where: { teamBId: teamId }, data: { teamBId: null } });
  await tx.team.delete({ where: { id: teamId } });
}

type DesyncPlan = {
  /** TeamPlayer à supprimer : joueur·euse inscrit·e en solo mais pas (ou plus) dans cette équipe d'après le panneau. */
  remove: string[];
  /** TeamPlayer à créer : placé·e dans une équipe par le panneau, absent·e de la vraie composition. */
  add: { teamId: string; playerId: string }[];
  /** Joueur·euses dans une équipe sans inscription solo (ajouté·es par la gestion classique) : laissé·es tel quel. */
  extra: number;
};

/**
 * Compare la composition réelle (TeamPlayer) à celle du panneau de tirage
 * (soloEntry.teamId). Avant le correctif de nov. 2026, retoucher le tirage
 * ne changeait que le panneau : la page publique et les matchs gardaient
 * l'ancienne composition (ex. Open de Lille 2). Le panneau, que l'orga voit
 * et a ajusté, fait foi.
 */
export async function planAbcResync(tx: Tx, tournamentId: string): Promise<DesyncPlan> {
  const [entries, teamPlayers] = await Promise.all([
    tx.tournamentSoloEntry.findMany({ where: { tournamentId }, select: { playerId: true, teamId: true, waitlisted: true } }),
    tx.teamPlayer.findMany({ where: { team: { tournamentId } }, select: { id: true, teamId: true, playerId: true } }),
  ]);
  const teamIds = new Set((await tx.team.findMany({ where: { tournamentId }, select: { id: true } })).map((t) => t.id));
  // Équipe voulue par joueur·euse inscrit·e en solo (null = non placé·e ou en attente)
  const wanted = new Map(entries.map((e) => [e.playerId, !e.waitlisted && e.teamId && teamIds.has(e.teamId) ? e.teamId : null]));

  const plan: DesyncPlan = { remove: [], add: [], extra: 0 };
  const present = new Set<string>();
  for (const tp of teamPlayers) {
    if (!wanted.has(tp.playerId)) { plan.extra++; continue; }
    if (wanted.get(tp.playerId) === tp.teamId && !present.has(tp.playerId)) present.add(tp.playerId);
    else plan.remove.push(tp.id);
  }
  for (const [playerId, teamId] of wanted) {
    if (teamId && !present.has(playerId)) plan.add.push({ teamId, playerId });
  }
  return plan;
}

/** Applique le plan : la vraie composition devient celle du panneau. */
export async function applyAbcResync(tx: Tx, tournamentId: string): Promise<{ removed: number; added: number; extra: number }> {
  const plan = await planAbcResync(tx, tournamentId);
  if (plan.remove.length) await tx.teamPlayer.deleteMany({ where: { id: { in: plan.remove } } });
  for (const a of plan.add) await tx.teamPlayer.create({ data: { teamId: a.teamId, playerId: a.playerId, isCaptain: false } });
  return { removed: plan.remove.length, added: plan.add.length, extra: plan.extra };
}

/**
 * Réparation automatique, appelée au chargement de la page du tournoi et du
 * tableau de bord : si un tournoi ABC (pas terminé) a divergé, sa vraie
 * composition est recalée sur le panneau. Aucun coût pour les autres formats
 * (une seule petite requête), et rien n'est écrit quand tout est d'accord.
 */
export async function healAbcTeams(idOrSlug: string): Promise<boolean> {
  try {
    const t = await prisma.tournament.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], format: "ABC Chapeau", status: { not: "COMPLETED" } },
      select: { id: true },
    });
    if (!t) return false;
    const plan = await planAbcResync(prisma, t.id);
    if (plan.remove.length === 0 && plan.add.length === 0) return false;
    await prisma.$transaction((tx) => applyAbcResync(tx, t.id), { timeout: 30_000 });
    console.warn(`[abc] équipes recalées sur le panneau de tirage pour ${t.id} (${plan.remove.length} retirées, ${plan.add.length} ajoutées)`);
    return true;
  } catch (e) {
    console.error("[abc] réparation des équipes impossible", e);
    return false;
  }
}
