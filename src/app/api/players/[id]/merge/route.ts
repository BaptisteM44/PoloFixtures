import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

// POST /api/players/:id/merge
// Body: { targetPlayerId: string }
// Merges the fictitious player (:id) into targetPlayer, then deletes :id.
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

  const [source, target] = await Promise.all([
    prisma.player.findUnique({ where: { id: params.id } }),
    prisma.player.findUnique({ where: { id: targetPlayerId } }),
  ]);
  if (!source) return Response.json({ error: "Joueur source introuvable" }, { status: 404 });
  if (!target) return Response.json({ error: "Joueur cible introuvable" }, { status: 404 });

  const sourceAccount = await prisma.playerAccount.findUnique({ where: { playerId: params.id } });
  if (sourceAccount) {
    return Response.json({ error: "Ce joueur possède un compte — fusion non autorisée" }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    // TeamPlayer — skip if target already in same team
    const targetTeamIds = new Set(
      (await tx.teamPlayer.findMany({ where: { playerId: targetPlayerId }, select: { teamId: true } }))
        .map((tp) => tp.teamId)
    );
    const sourceTeamPlayers = await tx.teamPlayer.findMany({ where: { playerId: params.id }, select: { id: true, teamId: true } });
    for (const tp of sourceTeamPlayers) {
      if (targetTeamIds.has(tp.teamId)) {
        await tx.teamPlayer.delete({ where: { id: tp.id } });
      } else {
        await tx.teamPlayer.update({ where: { id: tp.id }, data: { playerId: targetPlayerId } });
      }
    }

    // TournamentSoloEntry — skip duplicates
    const targetSoloTournamentIds = new Set(
      (await tx.tournamentSoloEntry.findMany({ where: { playerId: targetPlayerId }, select: { tournamentId: true } }))
        .map((e) => e.tournamentId)
    );
    const sourceSoloEntries = await tx.tournamentSoloEntry.findMany({ where: { playerId: params.id }, select: { id: true, tournamentId: true } });
    for (const e of sourceSoloEntries) {
      if (targetSoloTournamentIds.has(e.tournamentId)) {
        await tx.tournamentSoloEntry.delete({ where: { id: e.id } });
      } else {
        await tx.tournamentSoloEntry.update({ where: { id: e.id }, data: { playerId: targetPlayerId } });
      }
    }

    // FreeAgent
    await tx.freeAgent.updateMany({ where: { playerId: params.id }, data: { playerId: targetPlayerId } });

    // SquadMember
    await tx.squadMember.updateMany({ where: { playerId: params.id }, data: { playerId: targetPlayerId } });

    // SquadInvitation (invitedPlayerId and invitedById are separate fields)
    await tx.squadInvitation.updateMany({ where: { invitedPlayerId: params.id }, data: { invitedPlayerId: targetPlayerId } });
    await tx.squadInvitation.updateMany({ where: { invitedById: params.id }, data: { invitedById: targetPlayerId } });

    // ClubMember
    await tx.clubMember.updateMany({ where: { playerId: params.id }, data: { playerId: targetPlayerId } });

    // TournamentFollow
    await tx.tournamentFollow.updateMany({ where: { playerId: params.id }, data: { playerId: targetPlayerId } });

    // Notification
    await tx.notification.updateMany({ where: { playerId: params.id }, data: { playerId: targetPlayerId } });

    // NotificationPreference (unique on playerId)
    const existingPref = await tx.notificationPreference.findUnique({ where: { playerId: targetPlayerId } });
    if (!existingPref) {
      await tx.notificationPreference.updateMany({ where: { playerId: params.id }, data: { playerId: targetPlayerId } });
    } else {
      await tx.notificationPreference.deleteMany({ where: { playerId: params.id } });
    }

    // Tournament creator
    await tx.tournament.updateMany({ where: { creatorId: params.id }, data: { creatorId: targetPlayerId } });

    // TournamentOrganizer (co-organizer)
    await tx.tournamentOrganizer.updateMany({ where: { playerId: params.id }, data: { playerId: targetPlayerId } });

    // OrgaTask assignees
    await tx.orgaTaskAssignee.updateMany({ where: { playerId: params.id }, data: { playerId: targetPlayerId } });

    // MatchEvent payload — JSON field containing playerId
    // Raw SQL needed since Prisma can't filter/update inside JSON
    await tx.$executeRaw`
      UPDATE "MatchEvent"
      SET payload = jsonb_set(payload, '{playerId}', to_jsonb(${targetPlayerId}::text))
      WHERE payload->>'playerId' = ${params.id}
    `;

    // Delete fictitious player
    await tx.player.delete({ where: { id: params.id } });
  });

  return Response.json({ ok: true, targetPlayerName: target.name });
}
