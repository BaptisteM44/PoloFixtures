/**
 * Utilitaire centralisé pour créer des notifications en base.
 * Crée silencieusement (ne throw pas) pour ne pas bloquer les mutations.
 */
import { prisma } from "@/lib/db";
import { NotificationType } from "@prisma/client";

export async function createNotification(
  playerId: string,
  type: NotificationType,
  payload: Record<string, string | number>
) {
  try {
    await prisma.notification.create({
      data: { playerId, type, payload },
    });
  } catch (e) {
    console.error("[notify] Failed to create notification:", type, e);
  }
}

/**
 * Envoie une notification à tous les joueurs ACTIVE d'une équipe
 * (ceux qui ont un compte PlayerAccount lié).
 */
export async function notifyTeamPlayers(
  teamId: string,
  type: NotificationType,
  payload: Record<string, string | number>
) {
  const teamPlayers = await prisma.teamPlayer.findMany({
    where: { teamId },
    include: {
      player: {
        select: {
          id: true,
          status: true,
          account: { select: { id: true } },
        },
      },
    },
  });

  for (const tp of teamPlayers) {
    // Seulement les joueurs qui ont un compte actif
    if (tp.player.status === "ACTIVE" && tp.player.account) {
      await createNotification(tp.player.id, type, payload);
    }
  }
}
