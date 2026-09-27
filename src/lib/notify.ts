/**
 * Utilitaire centralisé pour créer des notifications en base.
 * Crée silencieusement (ne throw pas) pour ne pas bloquer les mutations.
 * Respecte les préférences de notification du joueur.
 */
import { prisma } from "@/lib/db";
import { NotificationType } from "@prisma/client";
import { sendMail } from "@/lib/mailer";
import { sendPushToPlayer } from "@/lib/web-push";
import { sameCountry } from "@/lib/country-utils";

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
    case "TEAM_MESSAGE_RECEIVED":
      return { title: `${p.teamName}`, body: p.preview ?? "New message", url: "/my-tournaments", tag: `team-${p.teamId}` };
    case "TEAM_FEE_CONFIRMED":
      return { title: "Payment confirmed", body: `${p.teamName} — ${p.tournamentName}`, url: `/tournament/${p.tournamentSlug ?? p.tournamentId}`, tag: `fee-${p.teamId}` };
    case "CLUB_ANNOUNCEMENT":
      return { title: p.clubName, body: p.announcementTitle ?? "New announcement", url: p.clubId ? `/club/${p.clubId}?tab=announcements` : "/clubs", tag: `club-${p.clubId}` };
    case "CLUB_SESSION":
      return { title: "New Session", body: p.message ?? "New club session", url: p.clubId ? `/club/${p.clubId}?tab=sessions` : "/clubs", tag: `session-${p.clubId}` };
    case "COMMUNITY_STATUS_CHANGED":
      return { title: "Poloperator Labs", body: p.message ?? `"${p.itemTitle}"`, url: p.itemId ? `/labs?id=${p.itemId}` : "/labs", tag: `labs-${p.itemId}` };
    case "ACCOMMODATION_ASSIGNED":
      return { title: "Accommodation assigned 🏠", body: `${p.hostName} — ${p.tournamentName}`, url: `/tournament/${p.tournamentSlug ?? p.tournamentId}?tab=hebergement`, tag: `acco-${p.tournamentId}` };
    case "ACCOMMODATION_GUEST_ADDED":
      return { title: "New guests at your place 🏠", body: `${p.tournamentName}`, url: `/tournament/${p.tournamentSlug ?? p.tournamentId}?tab=hebergement`, tag: `acco-host-${p.tournamentId}` };
    case "TOURNAMENT_NEEDS_APPROVAL":
      return { title: "Tournoi à valider", body: `${p.tournamentName} — ${p.city}, ${p.country}`, url: "/admin", tag: `admin-t-${p.tournamentId}` };
    case "CLUB_NEEDS_APPROVAL":
      return { title: "Club à valider", body: `${p.clubName} — ${p.city}, ${p.country}`, url: "/admin", tag: `admin-c-${p.clubId}` };
    case "NEW_TOURNAMENT_PUBLISHED":
      return { title: "Nouveau tournoi 🚴", body: `${p.tournamentName} — ${p.city}, ${p.country}`, url: `/tournament/${p.tournamentSlug || p.tournamentId}`, tag: `new-t-${p.tournamentId}` };
    case "POLL_REPORTED":
      return { title: "Sondage signalé ⚠️", body: `${p.pollQuestion} — ${p.reason}`, url: "/admin/polls", tag: `poll-report-${p.pollId}` };
    case "POLL_BLOCKED":
      return { title: "Sondage bloqué", body: p.pollQuestion, url: "/polls", tag: `poll-blocked-${p.pollId}` };
    case "MATCH_SOON":
      return { title: `🏑 Ton match à ${p.time}${p.court ? ` — ${p.court}` : ""}`, body: `vs ${p.opponent} · ${p.tournamentName}`, url: `/tournament/${p.tournamentSlug || p.tournamentId}?tab=schedule`, tag: `match-${p.matchId}` };
    case "REFEREE_SOON":
      return { title: `🟨 Tu arbitres à ${p.time}${p.court ? ` — ${p.court}` : ""}`, body: `${p.matchLabel} · ${p.tournamentName}`, url: `/tournament/${p.tournamentSlug || p.tournamentId}?tab=referees`, tag: `ref-${p.matchId}` };
    case "POLL_OPENED":
      return { title: "Nouveau sondage 📊", body: p.pollQuestion, url: `/poll/${p.pollId}`, tag: `poll-open-${p.pollId}` };
    case "POLL_APPROVAL_REQUESTED":
      return { title: "Sondage à valider 🎯", body: `${p.requesterName} — ${p.pollQuestion}`, url: "/polls#approvals", tag: `poll-approval-${p.pollId}` };
    case "POLL_APPROVAL_DECIDED":
      return { title: p.approved === "1" ? "Ciblage accepté ✅" : "Ciblage refusé", body: p.pollQuestion, url: "/polls", tag: `poll-decided-${p.pollId}` };
    case "POLL_UNBLOCKED":
      return { title: "Sondage débloqué", body: p.pollQuestion, url: "/polls", tag: `poll-unblocked-${p.pollId}` };
    case "POLL_REPORT_HANDLED":
      return { title: "Signalement traité", body: p.pollQuestion, url: "/polls", tag: `poll-report-done-${p.pollId}` };
    case "POLL_RESULTS_AVAILABLE":
      return { title: "Résultats disponibles 📊", body: p.pollQuestion, url: `/poll/${p.pollId}`, tag: `poll-results-${p.pollId}` };
    case "POLL_CLOSING_SOON":
      return { title: "Sondage : dernier jour ⏳", body: p.pollQuestion, url: `/poll/${p.pollId}`, tag: `poll-closing-${p.pollId}` };
    case "TOURNAMENT_PHOTOS_REVEALED": // fin de tournoi : galerie à compléter
      return { title: `📸 ${p.count} photos dans la galerie`, body: `${p.tournamentName} — ajoute les tiennes !`, url: `/tournament/${p.tournamentSlug || p.tournamentId}?tab=photos`, tag: `gallery-${p.tournamentId}` };
    case "TOURNAMENT_PHOTOS_REQUESTED":
      return { title: "📸 Photos à valider", body: `${p.tournamentName} — ${p.count} en attente`, url: `/tournament/${p.tournamentSlug || p.tournamentId}?tab=photos`, tag: `gallery-req-${p.tournamentId}` };
    case "TOURNAMENT_PHOTOS_DECIDED":
      return { title: Number(p.approved) > 0 ? "📸 Tes photos sont en ligne" : "📸 Photos non retenues", body: p.tournamentName, url: `/tournament/${p.tournamentSlug || p.tournamentId}?tab=photos`, tag: `gallery-dec-${p.tournamentId}` };
    case "TOURNAMENT_PHOTO_REPORTED":
      return { title: p.autoHidden === "1" ? "Photo masquée (signalements) ⚠️" : "Photo signalée ⚠️", body: `${p.authorName} — ${p.tournamentName}`, url: "/admin/photos", tag: `photo-report-${p.photoId}` };
    case "PLAYER_MERGE_REQUESTED":
      return { title: "Profile merge request", body: `${p.requesterName} says they are ${p.ghostName}`, url: "/merge-requests", tag: `merge-req-${p.ghostSlug}-${p.requesterSlug}` };
    case "PLAYER_MERGE_DECIDED":
      return { title: p.decision === "approved" ? "Profiles merged ✓" : "Merge request declined", body: p.ghostName, url: p.decision === "approved" ? `/player/${p.requesterSlug}` : "/account", tag: `merge-dec-${p.requesterSlug}` };
    case "POLL_VOTE_MILESTONE":
      return { title: `${p.count} vote(s) 🎉`, body: p.pollQuestion, url: `/poll/${p.pollId}/results`, tag: `poll-milestone-${p.pollId}` };
    default:
      return { title: "Poloperator", body: "New notification", url: "/", tag: type };
  }
}

/**
 * Catégories réglables par le joueur (page Paramètres). null = essentiel,
 * toujours envoyé (modération, validation admin, tâches d'orga).
 */
export const NOTIF_CATEGORIES = ["matches", "messages", "registrations", "squads", "clubs", "polls", "photos", "badges", "labs"] as const;
export type NotifCategory = (typeof NOTIF_CATEGORIES)[number];

const TYPE_CATEGORY: Partial<Record<NotificationType, NotifCategory>> = {
  MATCH_SOON: "matches", REFEREE_SOON: "matches",
  DIRECT_MESSAGE_REQUEST: "messages", DIRECT_MESSAGE_RECEIVED: "messages", TEAM_MESSAGE_RECEIVED: "messages",
  TEAM_REGISTERED: "registrations", TEAM_SELECTED: "registrations", TEAM_WAITLISTED: "registrations",
  TEAM_FEE_CONFIRMED: "registrations", ACCOMMODATION_ASSIGNED: "registrations", ACCOMMODATION_GUEST_ADDED: "registrations",
  SQUAD_INVITE: "squads", SQUAD_INVITE_ACCEPTED: "squads", SQUAD_INVITE_DECLINED: "squads", SQUAD_ROLE_CHANGED: "squads",
  CLUB_JOIN_REQUEST: "clubs", CLUB_SESSION: "clubs", CLUB_SESSION_JOIN: "clubs", CLUB_ANNOUNCEMENT: "clubs",
  POLL_OPENED: "polls", POLL_CLOSING_SOON: "polls", POLL_RESULTS_AVAILABLE: "polls", POLL_VOTE_MILESTONE: "polls",
  POLL_APPROVAL_REQUESTED: "polls", POLL_APPROVAL_DECIDED: "polls",
  TOURNAMENT_PHOTOS_REVEALED: "photos", TOURNAMENT_PHOTOS_REQUESTED: "photos", TOURNAMENT_PHOTOS_DECIDED: "photos",
  BADGE_UNLOCKED: "badges",
  COMMUNITY_STATUS_CHANGED: "labs",
};

/**
 * Le joueur veut-il ce type de notif ? Interrupteur général (enabled),
 * catégorie coupée, et ancien réglage « invitations d'équipe ». Les types
 * essentiels passent toujours. Sans ligne de préférences : tout est actif.
 */
export async function wantsNotification(playerId: string, type: NotificationType): Promise<boolean> {
  const category = TYPE_CATEGORY[type];
  if (!category) return true;
  const prefs = await prisma.notificationPreference.findUnique({
    where: { playerId },
    select: { enabled: true, mutedCategories: true, notifySquadInvite: true },
  });
  if (!prefs) return true;
  if (!prefs.enabled) return false;
  if (prefs.mutedCategories.includes(category)) return false;
  if (type === "SQUAD_INVITE" && prefs.notifySquadInvite === false) return false;
  return true;
}

export async function createNotification(
  playerId: string,
  type: NotificationType,
  payload: Record<string, string | number>
) {
  try {
    if (!(await wantsNotification(playerId, type))) return;

    // Badges : une seule notif non lue, dont le compteur monte (« 3 nouveaux
    // badges »), et jamais de push — ils représentaient 40 % des notifs et
    // noyaient les importantes (sélection, messages…).
    if (type === "BADGE_UNLOCKED") {
      const existing = await prisma.notification.findFirst({
        where: { playerId, type, read: false },
        select: { id: true, payload: true },
      });
      if (existing) {
        const prev = existing.payload as Record<string, string | number>;
        await prisma.notification.update({
          where: { id: existing.id },
          data: { payload: { ...payload, count: (Number(prev.count) || 1) + 1 } },
        });
      } else {
        await prisma.notification.create({ data: { playerId, type, payload: { ...payload, count: 1 } } });
      }
      return;
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
    if (!(await wantsNotification(recipientPlayerId, "CLUB_SESSION_JOIN"))) return;
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
 * Notifie tous les participants d'un fil Labs (auteur du post + toute personne
 * ayant déjà répondu), sauf l'auteur de la nouvelle réponse. Groupé par fil :
 * si une notif "réponses" non lue existe déjà pour cet item, on l'incrémente
 * (« 3 nouvelles réponses sur X ») au lieu d'en empiler plusieurs.
 */
export async function notifyCommunityReply({
  itemId,
  itemTitle,
  itemAuthorId,
  recipientIds,
}: {
  itemId: string;
  itemTitle: string;
  itemAuthorId: string | null;
  recipientIds: string[];
}) {
  await Promise.all(
    recipientIds.map(async (playerId) => {
      try {
        if (!(await wantsNotification(playerId, "COMMUNITY_STATUS_CHANGED"))) return;
        const existing = await prisma.notification.findFirst({
          where: {
            playerId,
            type: "COMMUNITY_STATUS_CHANGED",
            read: false,
            payload: { path: ["itemId"], equals: itemId },
            AND: [{ payload: { path: ["status"], equals: "reply" } }],
          },
        });

        const isParticipant = playerId !== itemAuthorId;
        // La cloche traduit le titre à l'affichage (via count + isParticipant) :
        // on ne stocke PAS de `message` figé dans le payload. Le push natif, lui,
        // n'a pas de contexte i18n → texte de secours en français (préposition
        // "sur" pour l'auteur du post, "dans" pour un participant du fil).
        const prep = isParticipant ? "dans" : "sur";

        if (existing) {
          const payload = existing.payload as Record<string, string | number>;
          const count = (Number(payload.count) || 1) + 1;
          // La notif garde son createdAt (le modèle n'a pas d'updatedAt) : elle
          // reste à sa place mais son compteur monte et reste non lue — même
          // comportement de regroupement que notifySessionJoin.
          await prisma.notification.update({
            where: { id: existing.id },
            data: { payload: { itemId, itemTitle, status: "reply", count, isParticipant: String(isParticipant) } },
          });
          const pushMsg = `💬 ${count} nouvelles réponses ${prep} "${itemTitle}"`;
          sendPushToPlayer(playerId, toPushPayload("COMMUNITY_STATUS_CHANGED", { itemId, itemTitle, status: "reply", message: pushMsg })).catch(() => {});
        } else {
          await prisma.notification.create({
            data: {
              playerId,
              type: "COMMUNITY_STATUS_CHANGED",
              payload: { itemId, itemTitle, status: "reply", count: 1, isParticipant: String(isParticipant) },
            },
          });
          const pushMsg = `💬 Nouvelle réponse ${prep} "${itemTitle}"`;
          sendPushToPlayer(playerId, toPushPayload("COMMUNITY_STATUS_CHANGED", { itemId, itemTitle, status: "reply", message: pushMsg })).catch(() => {});
        }
      } catch (e) {
        console.error("[notify] Failed to create/update community reply notification:", e);
      }
    })
  );
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

/**
 * Notifie tous les admins liés à un joueur (Operator avec rôle ADMIN + playerId).
 * Sert pour la modération : nouveau tournoi/club créé à valider. Les codes admin
 * sans Operator/joueur lié ne reçoivent pas de notif in-app (limite du modèle de
 * rôles actuel).
 */
export async function notifyAllAdmins(
  type: NotificationType,
  payload: Record<string, string | number>
) {
  try {
    const admins = await prisma.operator.findMany({
      where: { playerId: { not: null }, roles: { has: "ADMIN" } },
      select: { playerId: true },
    });
    const ids = [...new Set(admins.map((a) => a.playerId!).filter(Boolean))];
    for (const playerId of ids) {
      await createNotification(playerId, type, payload);
    }
  } catch (e) {
    console.error("[notify] notifyAllAdmins failed:", type, e);
  }
}

/**
 * Notif instantanée (in-app + push) aux joueurs abonnés aux nouveaux tournois
 * quand un tournoi est approuvé/publié. Filtre géographique identique au digest
 * email quotidien (cron/notify-tournaments) : pas de filtre = tous, sinon match
 * par continent ou pays. Cible les joueurs ayant une NotificationPreference.
 */
export async function notifyPlayersNewTournament(t: {
  id: string;
  slug: string | null;
  name: string;
  city: string;
  country: string;
  continentCode: string;
}) {
  try {
    const prefs = await prisma.notificationPreference.findMany({
      where: { enabled: true, notifyNewTournaments: true },
      select: { playerId: true, continents: true, countries: true },
    });
    for (const pref of prefs) {
      if (!prefMatchesTournament(pref, t)) continue;
      await createNotification(pref.playerId, "NEW_TOURNAMENT_PUBLISHED", {
        tournamentId: t.id,
        tournamentSlug: t.slug ?? "",
        tournamentName: t.name,
        city: t.city,
        country: t.country,
      });
    }
  } catch (e) {
    console.error("[notify] notifyPlayersNewTournament failed:", e);
  }
}

/**
 * Le tournoi est-il dans les zones choisies par le joueur ? Pas de zone =
 * partout. Les pays des préférences sont des codes (« FR ») et ceux des
 * tournois des noms (« France ») : comparés via sameCountry — avant, un
 * filtre par pays ne correspondait JAMAIS. « AP » (Asie-Pacifique dans le
 * formulaire) couvre les continents AS et OC.
 */
export function prefMatchesTournament(
  pref: { continents: string[]; countries: string[] },
  t: { continentCode: string; country: string },
): boolean {
  if (pref.continents.length === 0 && pref.countries.length === 0) return true;
  const continents = pref.continents.flatMap((c) => (c === "AP" ? ["AS", "OC"] : [c]));
  if (continents.includes(t.continentCode)) return true;
  return pref.countries.some((c) => sameCountry(c, t.country));
}
