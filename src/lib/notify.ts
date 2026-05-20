/**
 * Utilitaire centralisé pour créer des notifications en base.
 * Crée silencieusement (ne throw pas) pour ne pas bloquer les mutations.
 * Respecte les préférences de notification du joueur.
 */
import { prisma } from "@/lib/db";
import { NotificationType } from "@prisma/client";
import { sendMail } from "@/lib/mailer";

// Types qui respectent le flag global "enabled" (notifs club)
const CLUB_TYPES: NotificationType[] = [
  "CLUB_SESSION",
  "CLUB_SESSION_JOIN",
  "CLUB_ANNOUNCEMENT",
];

// Types qui respectent notifySquadInvite
const SQUAD_INVITE_TYPES: NotificationType[] = [
  "SQUAD_INVITE",
];

export async function createNotification(
  playerId: string,
  type: NotificationType,
  payload: Record<string, string | number>
) {
  try {
    // Vérifier les prefs si le type est concerné
    if (CLUB_TYPES.includes(type) || SQUAD_INVITE_TYPES.includes(type)) {
      const prefs = await prisma.notificationPreference.findUnique({
        where: { playerId },
        select: { enabled: true, notifySquadInvite: true },
      });

      // Notifs globalement désactivées
      if (prefs && prefs.enabled === false) return;

      // Invitations d'équipe désactivées
      if (SQUAD_INVITE_TYPES.includes(type) && prefs && prefs.notifySquadInvite === false) return;
    }

    await prisma.notification.create({
      data: { playerId, type, payload },
    });
  } catch (e) {
    console.error("[notify] Failed to create notification:", type, e);
  }
}

/**
 * Notif groupée pour les inscriptions à une session.
 * Si une notif non lue existe déjà pour ce joueur+session, on incrémente le compteur.
 */
export async function notifySessionJoin(
  recipientPlayerId: string,
  sessionId: string,
  sessionDate: string,
  clubId: string,
) {
  try {
    const existing = await prisma.notification.findFirst({
      where: {
        playerId: recipientPlayerId,
        type: "CLUB_SESSION_JOIN",
        read: false,
        payload: { path: ["sessionId"], equals: sessionId },
      },
    });

    if (existing) {
      const payload = existing.payload as Record<string, string | number>;
      const count = (Number(payload.count) || 1) + 1;
      await prisma.notification.update({
        where: { id: existing.id },
        data: { payload: { ...payload, count, message: `${count} joueurs se sont inscrits à la session du ${sessionDate}` } },
      });
    } else {
      await prisma.notification.create({
        data: {
          playerId: recipientPlayerId,
          type: "CLUB_SESSION_JOIN",
          payload: { sessionId, clubId, count: 1, message: `1 joueur s'est inscrit à la session du ${sessionDate}` },
        },
      });
    }
  } catch (e) {
    console.error("[notify] Failed to create/update CLUB_SESSION_JOIN notification:", e);
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

/**
 * Envoie un email à tous les joueurs ACTIVE d'une équipe qui ont un email.
 * Fire-and-forget (ne throw pas).
 */
export async function mailTeamPlayers(
  teamId: string,
  subject: string,
  html: string
) {
  try {
    const teamPlayers = await prisma.teamPlayer.findMany({
      where: { teamId },
      include: {
        player: {
          select: {
            status: true,
            account: { select: { email: true } },
          },
        },
      },
    });

    for (const tp of teamPlayers) {
      const email = tp.player.account?.email;
      if (tp.player.status === "ACTIVE" && email) {
        await sendMail({ to: email, subject, html }).catch((e) =>
          console.error("[notify] mailTeamPlayers échec:", email, e)
        );
      }
    }
  } catch (e) {
    console.error("[notify] mailTeamPlayers error:", e);
  }
}
