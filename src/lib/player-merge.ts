import { prisma } from "@/lib/db";

/**
 * Fusionne un profil fictif (sans compte) dans un vrai profil : inscriptions,
 * équipes, clubs, buts… passent au profil cible, puis le fictif est supprimé.
 * Utilisé par l'orga (fusion directe) et par la validation d'une demande de
 * fusion faite par le joueur lui-même.
 */
export async function mergePlayers(sourceId: string, targetId: string) {
  await prisma.$transaction(async (tx) => {
    // TeamPlayer — skip if target already in same team
    const targetTeamIds = new Set(
      (await tx.teamPlayer.findMany({ where: { playerId: targetId }, select: { teamId: true } }))
        .map((tp) => tp.teamId)
    );
    const sourceTeamPlayers = await tx.teamPlayer.findMany({ where: { playerId: sourceId }, select: { id: true, teamId: true } });
    for (const tp of sourceTeamPlayers) {
      if (targetTeamIds.has(tp.teamId)) {
        await tx.teamPlayer.delete({ where: { id: tp.id } });
      } else {
        await tx.teamPlayer.update({ where: { id: tp.id }, data: { playerId: targetId } });
      }
    }

    // TournamentSoloEntry — skip duplicates
    const targetSoloTournamentIds = new Set(
      (await tx.tournamentSoloEntry.findMany({ where: { playerId: targetId }, select: { tournamentId: true } }))
        .map((e) => e.tournamentId)
    );
    const sourceSoloEntries = await tx.tournamentSoloEntry.findMany({ where: { playerId: sourceId }, select: { id: true, tournamentId: true } });
    for (const e of sourceSoloEntries) {
      if (targetSoloTournamentIds.has(e.tournamentId)) {
        await tx.tournamentSoloEntry.delete({ where: { id: e.id } });
      } else {
        await tx.tournamentSoloEntry.update({ where: { id: e.id }, data: { playerId: targetId } });
      }
    }

    // FreeAgent
    await tx.freeAgent.updateMany({ where: { playerId: sourceId }, data: { playerId: targetId } });

    // SquadMember
    await tx.squadMember.updateMany({ where: { playerId: sourceId }, data: { playerId: targetId } });

    // SquadInvitation (invitedPlayerId and invitedById are separate fields)
    await tx.squadInvitation.updateMany({ where: { invitedPlayerId: sourceId }, data: { invitedPlayerId: targetId } });
    await tx.squadInvitation.updateMany({ where: { invitedById: sourceId }, data: { invitedById: targetId } });

    // ClubMember
    await tx.clubMember.updateMany({ where: { playerId: sourceId }, data: { playerId: targetId } });

    // TournamentFollow
    await tx.tournamentFollow.updateMany({ where: { playerId: sourceId }, data: { playerId: targetId } });

    // Notification
    await tx.notification.updateMany({ where: { playerId: sourceId }, data: { playerId: targetId } });

    // NotificationPreference (unique on playerId)
    const existingPref = await tx.notificationPreference.findUnique({ where: { playerId: targetId } });
    if (!existingPref) {
      await tx.notificationPreference.updateMany({ where: { playerId: sourceId }, data: { playerId: targetId } });
    } else {
      await tx.notificationPreference.deleteMany({ where: { playerId: sourceId } });
    }

    // Tournament creator
    await tx.tournament.updateMany({ where: { creatorId: sourceId }, data: { creatorId: targetId } });

    // TournamentOrganizer (co-organizer)
    await tx.tournamentOrganizer.updateMany({ where: { playerId: sourceId }, data: { playerId: targetId } });

    // OrgaTask assignees
    await tx.orgaTaskAssignee.updateMany({ where: { playerId: sourceId }, data: { playerId: targetId } });

    // MatchEvent payload — JSON field containing playerId
    // Raw SQL needed since Prisma can't filter/update inside JSON
    await tx.$executeRaw`
      UPDATE "MatchEvent"
      SET payload = jsonb_set(payload, '{playerId}', to_jsonb(${targetId}::text))
      WHERE payload->>'playerId' = ${sourceId}
    `;

    // Delete fictitious player
    await tx.player.delete({ where: { id: sourceId } });
  });
}

/** Joueurs pouvant valider une fusion de ce profil fictif : les orgas (créateur
 *  + coorganisateurs) des tournois où il apparaît. Vide = seuls les admins. */
export async function ghostApproverIds(ghostId: string): Promise<string[]> {
  const tournaments = await prisma.tournament.findMany({
    where: {
      OR: [
        { teams: { some: { players: { some: { playerId: ghostId } } } } },
        { soloEntries: { some: { playerId: ghostId } } },
      ],
    },
    select: { creatorId: true, coOrganizers: { select: { playerId: true } } },
  });
  const ids = new Set<string>();
  for (const t of tournaments) {
    if (t.creatorId) ids.add(t.creatorId);
    for (const co of t.coOrganizers) ids.add(co.playerId);
  }
  ids.delete(ghostId);
  return [...ids];
}
