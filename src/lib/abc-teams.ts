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
