/**
 * Utilitaire centralisé pour créer des notifications en base.
 * Crée silencieusement (ne throw pas) pour ne pas bloquer les mutations.
 * Respecte les préférences de notification du joueur.
 */
import { prisma } from "@/lib/db";
import { NotificationType } from "@prisma/client";
import { sendMail } from "@/lib/mailer";
import { sendPushToPlayer } from "@/lib/web-push";

/** Build a human-readable push payload from notification type + payload */
function toPushPayload(
  type: NotificationType,
  payload: Record<string, string | number>
): { title: string; body: string; url: string; tag: string } {
  const p = payload as Record<string, string>;
  switch (type) {
    case "SQUAD_INVITE":
      return { title: "Team Invite", body: `${p.invitedByName} invited you to ${p.squadName}`, url: "/my-teams", tag: `squad-${p.squadId}` };
    case "SQUAD_INVITE_ACCEPTED":
      return { title: "Invite Accepted", body: `${p.playerName} joined ${p.squadName}`, url: `/my-teams/${p.squadId}`, tag: `squad-${p.squadId}` };
    case "TEAM_REGISTERED":
      return { title: "Team Registered", body: `${p.teamName} — ${p.tournamentName}`, url: `/tournament/${p.tournamentSlug ?? p.tournamentId}?tab=inscription`, tag: `reg-${p.tournamentId}` };
    case "TEAM_SELECTED":
      return { title: "You're In!", body: `${p.teamName} selected for ${p.tournamentName}`, url: `/tournament/${p.tournamentSlug ?? p.tournamentId}`, tag: `sel-${p.tournamentId}` };
    case "TEAM_WAITLISTED":
      return { title: "Waitlisted", body: `${p.teamName} is #${p.rank} on waitlist — ${p.tournamentName}`, url: `/tournament/${p.tournamentSlug ?? p.tournamentId}`, tag: `wl-${p.tournamentId}` };
    case "BADGE_UNLOCKED":
      return { title: "Badge Unlocked!", body: p.badgeName, url: "/account", tag: `badge-${p.badgeKey}` };
    case "DIRECT_MESSAGE_REQUEST":
    case "DIRECT_MESSAGE_RECEIVED":
      return { title: p.senderName, body: p.preview ?? "New message", url: "/messages", tag: `dm-${p.conversationId}` };
    case "CLUB_ANNOUNCEMENT":
      return { title: p.clubName, body: p.announcementTitle ?? "New announcement", url: p.clubId ? `/club/${p.clubId}?tab=announcements` : "/clubs", tag: `club-${p.clubId}` };
    case "CLUB_SESSION":
      return { title: "New Session", body: p.message ?? "New club session", url: p.clubId ? `/club/${p.clubId}?tab=sessions` : "/clubs", tag: `session-${p.clubId}` };
    default:
      return { title: "Poloperator", body: "New notification", url: "/", tag: type };
  }
}

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

    // Fire-and-forget push notification
    sendPushToPlayer(playerId, toPushPayload(type, payload)).catch(() => {});
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
