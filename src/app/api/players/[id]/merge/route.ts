import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

// POST /api/players/:id/merge
// Body: { targetPlayerId: string }
// Merges the fictitious player (:id) into targetPlayer, then deletes :id.
// All TeamPlayer, MatchEvent, TournamentSoloEntry, etc. are reassigned.
// Only orga (of a tournament containing :id) or admin can do this.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const isAdmin = session.user.role === "ADMIN";
  const currentPlayerId = (session.user as { playerId?: string }).playerId;

  if (!isAdmin) {
    const playerInOrgaTournament = await prisma.teamPlayer.findFirst({
      where: {
        playerId: params.id,
        team: {
          tournament: {
            OR: [
              { creatorId: currentPlayerId ?? "" },
              { coOrganizers: { some: { playerId: currentPlayerId ?? "" } } },
            ],
          },
        },
      },
    });
    if (!playerInOrgaTournament) return new Response("Forbidden", { status: 403 });
  }

  const { targetPlayerId } = await request.json();
  if (!targetPlayerId || targetPlayerId === params.id) {
    return Response.json({ error: "targetPlayerId invalide" }, { status: 400 });
  }

  // Verify both players exist
  const [source, target] = await Promise.all([
    prisma.player.findUnique({ where: { id: params.id } }),
    prisma.player.findUnique({ where: { id: targetPlayerId } }),
  ]);
  if (!source) return Response.json({ error: "Joueur source introuvable" }, { status: 404 });
  if (!target) return Response.json({ error: "Joueur cible introuvable" }, { status: 404 });

  // Check source has no account (only fictitious players should be merged)
  const sourceAccount = await prisma.playerAccount.findUnique({ where: { playerId: params.id } });
  if (sourceAccount) {
    return Response.json({ error: "Ce joueur possède un compte — fusion non autorisée" }, { status: 409 });
  }

  // Run everything in a transaction
  await prisma.$transaction(async (tx) => {
    // Reassign TeamPlayer — skip duplicates (same player already in same team)
    const targetTeamPlayers = await tx.teamPlayer.findMany({
      where: { playerId: targetPlayerId },
      select: { teamId: true },
    });
    const targetTeamIds = new Set(targetTeamPlayers.map((tp) => tp.teamId));

    const sourceTeamPlayers = await tx.teamPlayer.findMany({
      where: { playerId: params.id },
      select: { id: true, teamId: true },
    });

    for (const tp of sourceTeamPlayers) {
      if (targetTeamIds.has(tp.teamId)) {
        // Target already in this team — just delete the duplicate
        await tx.teamPlayer.delete({ where: { id: tp.id } });
      } else {
        await tx.teamPlayer.update({ where: { id: tp.id }, data: { playerId: targetPlayerId } });
      }
    }

    // Reassign MatchEvents
    await tx.matchEvent.updateMany({ where: { playerId: params.id }, data: { playerId: targetPlayerId } });

    // Reassign TournamentSoloEntry — skip duplicates
    const targetSoloEntries = await tx.tournamentSoloEntry.findMany({
      where: { playerId: targetPlayerId },
      select: { tournamentId: true },
    });
    const targetSoloTournamentIds = new Set(targetSoloEntries.map((e) => e.tournamentId));

    const sourceSoloEntries = await tx.tournamentSoloEntry.findMany({
      where: { playerId: params.id },
      select: { id: true, tournamentId: true },
    });
    for (const e of sourceSoloEntries) {
      if (targetSoloTournamentIds.has(e.tournamentId)) {
        await tx.tournamentSoloEntry.delete({ where: { id: e.id } });
      } else {
        await tx.tournamentSoloEntry.update({ where: { id: e.id }, data: { playerId: targetPlayerId } });
      }
    }

    // Reassign FreeAgent entries
    await tx.freeAgent.updateMany({ where: { playerId: params.id }, data: { playerId: targetPlayerId } });

    // Reassign SquadMember
    await tx.squadMember.updateMany({ where: { playerId: params.id }, data: { playerId: targetPlayerId } });

    // Reassign SquadInvitation
    await tx.squadInvitation.updateMany({ where: { playerId: params.id }, data: { inviteeId: targetPlayerId } });

    // Reassign ClubMember
    await tx.clubMember.updateMany({ where: { playerId: params.id }, data: { playerId: targetPlayerId } });

    // Reassign TournamentFollow
    await tx.tournamentFollow.updateMany({ where: { playerId: params.id }, data: { playerId: targetPlayerId } });

    // Reassign Notifications
    await tx.notification.updateMany({ where: { playerId: params.id }, data: { playerId: targetPlayerId } });

    // Reassign NotificationPreference
    const existingPref = await tx.notificationPreference.findUnique({ where: { playerId: targetPlayerId } });
    if (!existingPref) {
      await tx.notificationPreference.updateMany({ where: { playerId: params.id }, data: { playerId: targetPlayerId } });
    } else {
      await tx.notificationPreference.deleteMany({ where: { playerId: params.id } });
    }

    // Reassign tournament creator/co-organizer references
    await tx.tournament.updateMany({ where: { creatorId: params.id }, data: { creatorId: targetPlayerId } });
    await tx.tournamentOrganizer.updateMany({ where: { playerId: params.id }, data: { playerId: targetPlayerId } });

    // Reassign OrgaTask/Note/Link assigned to this player
    await tx.orgaTask.updateMany({ where: { assignedToId: params.id }, data: { assignedToId: targetPlayerId } });

    // Delete the fictitious player
    await tx.player.delete({ where: { id: params.id } });
  });

  return Response.json({ ok: true, targetPlayerName: target.name });
}
