"use server";

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { createNotification, notifySessionJoin } from "@/lib/notify";
import { apiMsg } from "@/lib/api-messages";
import { ensureRecurringSessions } from "@/lib/club-sessions";
import { notifyMentions } from "@/lib/chat-mentions";

async function getClubRole(clubId: string) {
  const session = await auth();
  const playerId = (session?.user as any)?.playerId;
  if (!playerId) return { playerId: null, isManager: false, isAdmin: false, isMember: false };

  const club = await prisma.club.findUnique({ where: { id: clubId }, select: { managerId: true } });
  const isManager = club?.managerId === playerId;

  const adminRole = await prisma.clubAdmin.findUnique({ where: { clubId_playerId: { clubId, playerId } } });
  const isAdmin = isManager || !!adminRole;

  const membership = await prisma.clubMember.findUnique({ where: { clubId_playerId: { clubId, playerId } } });
  const isMember = membership?.status === "MEMBER";

  return { playerId, isManager, isAdmin, isMember };
}

// ── Admin management ──────────────────────────────────────────────────────

export async function addClubAdminAction(clubId: string, playerId: string) {
  const { isManager } = await getClubRole(clubId);
  if (!isManager) return { error: apiMsg("act_seul_manager_peut_ajouter_admins") };

  const membership = await prisma.clubMember.findUnique({ where: { clubId_playerId: { clubId, playerId } } });
  if (membership?.status !== "MEMBER") return { error: apiMsg("act_joueur_n_pas_membre_club") };

  await prisma.clubAdmin.upsert({
    where: { clubId_playerId: { clubId, playerId } },
    create: { clubId, playerId },
    update: {},
  });
  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

export async function removeClubAdminAction(clubId: string, playerId: string) {
  const { isManager } = await getClubRole(clubId);
  if (!isManager) return { error: apiMsg("act_seul_manager_peut_retirer_admins") };

  await prisma.clubAdmin.deleteMany({ where: { clubId, playerId } });
  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

// ── Transfer manager ─────────────────────────────────────────────────────

export async function transferManagerAction(clubId: string, newManagerPlayerId: string) {
  const { playerId, isManager } = await getClubRole(clubId);
  if (!isManager || !playerId) return { error: apiMsg("act_seul_manager_peut_transferer_gestion") };

  const membership = await prisma.clubMember.findUnique({
    where: { clubId_playerId: { clubId, playerId: newManagerPlayerId } },
  });
  if (membership?.status !== "MEMBER") return { error: apiMsg("act_joueur_n_pas_membre_club") };

  await prisma.club.update({ where: { id: clubId }, data: { managerId: newManagerPlayerId } });
  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

// ── Sessions ──────────────────────────────────────────────────────────────

export async function createSessionAction(clubId: string, data: {
  title?: string;
  date: string;
  duration: number;
  venueId?: string;
  location?: string;
  notes?: string;
  recurring: boolean;
  recurrenceDay?: number;
  recurrenceTime?: string;
  color?: string;
}) {
  const { playerId, isMember } = await getClubRole(clubId);
  if (!playerId || !isMember) return { error: apiMsg("act_reserve_membres_club") };

  await prisma.clubSession.create({
    data: {
      clubId,
      title: data.title || null,
      date: new Date(data.date),
      duration: data.duration,
      venueId: data.venueId || null,
      location: data.location || null,
      notes: data.notes || null,
      recurring: data.recurring,
      recurrenceDay: data.recurrenceDay ?? null,
      recurrenceTime: data.recurrenceTime ?? null,
      color: data.color || null,
      createdById: playerId,
    },
  });
  if (data.recurring) await ensureRecurringSessions([clubId]);

  // Notify all club members
  const members = await prisma.clubMember.findMany({
    where: { clubId, status: "MEMBER", playerId: { not: playerId } },
    select: { playerId: true },
  });
  const club = await prisma.club.findUnique({ where: { id: clubId }, select: { name: true } });
  for (const m of members) {
    await createNotification(m.playerId, "CLUB_SESSION", {
      message: `Nouvelle session ajoutée dans ${club?.name ?? "ton club"}`,
      clubId,
    });
  }

  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

export async function deleteSessionAction(clubId: string, sessionId: string) {
  const { playerId, isAdmin } = await getClubRole(clubId);
  if (!playerId) return { error: apiMsg("not_logged_in") };

  const session = await prisma.clubSession.findUnique({ where: { id: sessionId } });
  if (!session || session.clubId !== clubId) return { error: apiMsg("act_session_introuvable") };

  // Creator or admin can delete
  if (session.createdById !== playerId && !isAdmin) return { error: apiMsg("not_authorized") };

  // Une date issue d'une série serait recréée à la prochaine génération : on la
  // garde, masquée (DELETED). La séance modèle, elle, porte la série : la
  // supprimer arrête la récurrence.
  if (session.seriesId) {
    await prisma.clubSession.update({ where: { id: sessionId }, data: { status: "DELETED" } });
  } else {
    await prisma.clubSession.delete({ where: { id: sessionId } });
  }
  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

export async function updateSessionAction(clubId: string, sessionId: string, data: {
  title?: string;
  datetime?: string;
  duration?: number;
  venueId?: string | null;
  location?: string;
  notes?: string;
  recurrenceDay?: number;
  recurrenceTime?: string;
  color?: string;
}) {
  const { playerId, isAdmin } = await getClubRole(clubId);
  if (!playerId) return { error: apiMsg("not_logged_in") };

  const session = await prisma.clubSession.findUnique({ where: { id: sessionId } });
  if (!session || session.clubId !== clubId) return { error: apiMsg("act_session_introuvable") };
  if (session.createdById !== playerId && !isAdmin) return { error: apiMsg("not_authorized") };

  const updateData: any = {};
  if (data.title !== undefined) updateData.title = data.title || null;
  if (data.datetime) updateData.date = new Date(data.datetime);
  if (data.duration !== undefined) updateData.duration = data.duration;
  if (data.venueId !== undefined) updateData.venueId = data.venueId || null;
  if (data.location !== undefined) updateData.location = data.location || null;
  if (data.notes !== undefined) updateData.notes = data.notes || null;
  if (data.recurrenceDay !== undefined) updateData.recurrenceDay = data.recurrenceDay;
  if (data.recurrenceTime !== undefined) updateData.recurrenceTime = data.recurrenceTime || null;
  if (data.color !== undefined) updateData.color = data.color || null;

  await prisma.clubSession.update({ where: { id: sessionId }, data: updateData });

  // Série dont le jour ou l'heure change : les dates futures encore vides
  // (aucun inscrit, aucun message) sont refaites au nouveau créneau.
  const scheduleChanged =
    (data.recurrenceDay !== undefined && data.recurrenceDay !== session.recurrenceDay) ||
    (data.recurrenceTime !== undefined && (data.recurrenceTime || null) !== session.recurrenceTime);
  if (session.recurring && scheduleChanged) {
    await prisma.clubSession.deleteMany({
      where: { seriesId: sessionId, status: "ACTIVE", date: { gt: new Date() }, attendees: { none: {} }, messages: { none: {} } },
    });
    await ensureRecurringSessions([clubId], { timeOverrides: data.recurrenceTime ? { [sessionId]: data.recurrenceTime } : {} });
  }

  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

/** Relance une série endormie : ses dates des 4 prochaines semaines se recréent. */
export async function reviveSeriesAction(clubId: string, sessionId: string) {
  const { playerId, isAdmin } = await getClubRole(clubId);
  if (!playerId) return { error: apiMsg("not_logged_in") };
  const session = await prisma.clubSession.findUnique({ where: { id: sessionId } });
  if (!session || session.clubId !== clubId || !session.recurring) return { error: apiMsg("act_session_introuvable") };
  if (session.createdById !== playerId && !isAdmin) return { error: apiMsg("not_authorized") };

  await ensureRecurringSessions([clubId], { revive: [sessionId] });
  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

/** Arrête une série : plus de nouvelles dates (celles déjà prévues restent). */
export async function stopSeriesAction(clubId: string, sessionId: string) {
  const { playerId, isAdmin } = await getClubRole(clubId);
  if (!playerId) return { error: apiMsg("not_logged_in") };
  const session = await prisma.clubSession.findUnique({ where: { id: sessionId } });
  if (!session || session.clubId !== clubId) return { error: apiMsg("act_session_introuvable") };
  if (session.createdById !== playerId && !isAdmin) return { error: apiMsg("not_authorized") };

  await prisma.clubSession.update({ where: { id: sessionId }, data: { recurring: false } });
  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

// ── Session attendance ────────────────────────────────────────────────────

export async function joinSessionAction(
  clubId: string,
  sessionId: string,
  opts?: { arrivalTime?: string; minPlayers?: number }
) {
  const { playerId, isMember } = await getClubRole(clubId);
  if (!playerId) return { error: apiMsg("not_logged_in") };

  const session = await prisma.clubSession.findUnique({ where: { id: sessionId } });
  if (!session || session.clubId !== clubId) return { error: apiMsg("act_session_introuvable") };

  const data = {
    arrivalTime: opts?.arrivalTime || null,
    minPlayers: opts?.minPlayers || null,
  };

  if (isMember) {
    await prisma.clubSessionAttendee.upsert({
      where: { sessionId_playerId: { sessionId, playerId } },
      create: { sessionId, playerId, status: "CONFIRMED", ...data },
      update: { status: "CONFIRMED", ...data },
    });

    // Notif groupée : notifier les autres inscrits confirmés qu'un joueur a rejoint
    const allConfirmed = await prisma.clubSessionAttendee.findMany({
      where: { sessionId, status: "CONFIRMED" },
    });
    const confirmedCount = allConfirmed.length;
    const sessionDate = session.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

    for (const attendee of allConfirmed) {
      if (attendee.playerId === playerId) continue;
      // Notif groupée inscription
      await notifySessionJoin(attendee.playerId, sessionId, sessionDate, clubId);
      // Notif seuil minPlayers atteint
      if (attendee.minPlayers && confirmedCount >= attendee.minPlayers) {
        await createNotification(attendee.playerId, "CLUB_SESSION", {
          message: `Le seuil de ${attendee.minPlayers} joueurs est atteint pour la session du ${sessionDate} ! (${confirmedCount} inscrits)`,
          clubId,
        });
      }
    }
  } else {
    await prisma.clubSessionAttendee.upsert({
      where: { sessionId_playerId: { sessionId, playerId } },
      create: { sessionId, playerId, status: "PENDING", ...data },
      update: { status: "PENDING", ...data },
    });

    // Notif aux admins si guest (non-membre) rejoint
    const joiningPlayer = await prisma.player.findUnique({ where: { id: playerId }, select: { name: true } });
    const club = await prisma.club.findUnique({ where: { id: clubId }, select: { name: true, managerId: true } });
    const admins = await prisma.clubAdmin.findMany({ where: { clubId }, select: { playerId: true } });
    const adminIds = new Set([club?.managerId, ...admins.map(a => a.playerId)].filter(Boolean));
    const sessionDate = session.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    for (const adminId of adminIds) {
      await createNotification(adminId as string, "CLUB_SESSION", {
        message: `${joiningPlayer?.name ?? "Quelqu'un"} demande à rejoindre la session du ${sessionDate} (hors club)`,
        clubId,
      });
    }
  }

  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

export async function leaveSessionAction(clubId: string, sessionId: string) {
  const { playerId } = await getClubRole(clubId);
  if (!playerId) return { error: apiMsg("not_logged_in") };

  await prisma.clubSessionAttendee.deleteMany({ where: { sessionId, playerId } });
  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

export async function approveSessionAttendeeAction(clubId: string, sessionId: string, playerId: string) {
  const { isAdmin } = await getClubRole(clubId);
  if (!isAdmin) return { error: apiMsg("act_reserve_admins") };

  await prisma.clubSessionAttendee.updateMany({
    where: { sessionId, playerId, status: "PENDING" },
    data: { status: "CONFIRMED" },
  });

  await createNotification(playerId, "CLUB_SESSION", {
    message: "Ta demande de participation a été acceptée !",
    clubId,
  });

  // Vérifier si des inscrits conditionnels ont leur seuil atteint
  const allConfirmed = await prisma.clubSessionAttendee.findMany({
    where: { sessionId, status: "CONFIRMED" },
  });
  const confirmedCount = allConfirmed.length;
  const conditionals = allConfirmed.filter(a => a.minPlayers && confirmedCount >= a.minPlayers && a.playerId !== playerId);
  for (const c of conditionals) {
    await createNotification(c.playerId, "CLUB_SESSION", {
      message: `Le seuil de ${c.minPlayers} joueurs est atteint pour ta session ! (${confirmedCount} inscrits)`,
      clubId,
    });
  }

  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

export async function rejectSessionAttendeeAction(clubId: string, sessionId: string, playerId: string) {
  const { isAdmin } = await getClubRole(clubId);
  if (!isAdmin) return { error: apiMsg("act_reserve_admins") };

  await prisma.clubSessionAttendee.deleteMany({ where: { sessionId, playerId } });
  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

export async function cancelSessionAction(clubId: string, sessionId: string) {
  const { playerId, isAdmin } = await getClubRole(clubId);
  if (!playerId || !isAdmin) return { error: apiMsg("act_reserve_admins") };

  const session = await prisma.clubSession.findUnique({ where: { id: sessionId }, select: { clubId: true, date: true, title: true, club: { select: { name: true } } } });
  if (!session || session.clubId !== clubId) return { error: apiMsg("act_session_introuvable") };

  await prisma.clubSession.update({
    where: { id: sessionId },
    data: { status: "CANCELLED" },
  });

  // Notif à tous les inscrits CONFIRMED
  const attendees = await prisma.clubSessionAttendee.findMany({
    where: { sessionId, status: "CONFIRMED", playerId: { not: playerId } },
    select: { playerId: true },
  });
  for (const a of attendees) {
    await createNotification(a.playerId, "CLUB_SESSION_CANCELLED", {
      clubId,
      clubName: session.club.name,
      sessionId,
      date: session.date.toISOString(),
      title: session.title ?? "",
    });
  }

  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

// ── Chat ──────────────────────────────────────────────────────────────────

export async function sendClubMessageAction(clubId: string, content: string) {
  const { playerId, isMember } = await getClubRole(clubId);
  if (!playerId || !isMember) return { error: apiMsg("act_reserve_membres_club") };
  if (!content.trim()) return { error: apiMsg("act_message_vide") };

  await prisma.clubMessage.create({
    data: { clubId, playerId, content: content.trim() },
  });
  void notifyMentions("club", clubId, playerId, content.trim());

  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

export async function deleteClubMessageAction(clubId: string, messageId: string) {
  const { playerId, isAdmin } = await getClubRole(clubId);
  if (!playerId) return { error: apiMsg("not_logged_in") };

  const msg = await prisma.clubMessage.findUnique({ where: { id: messageId } });
  if (!msg || msg.clubId !== clubId) return { error: apiMsg("message_not_found") };
  if (msg.playerId !== playerId && !isAdmin) return { error: apiMsg("not_authorized") };

  await prisma.clubMessage.delete({ where: { id: messageId } });
  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

// ── Session Chat ─────────────────────────────────────────────────────────────

export async function sendSessionMessageAction(clubId: string, sessionId: string, content: string) {
  const { playerId, isMember } = await getClubRole(clubId);
  if (!playerId || !isMember) return { error: apiMsg("act_reserve_membres_club") };
  if (!content.trim()) return { error: apiMsg("act_message_vide") };

  const session = await prisma.clubSession.findUnique({ where: { id: sessionId } });
  if (!session || session.clubId !== clubId) return { error: apiMsg("act_session_introuvable") };

  await prisma.clubSessionMessage.create({
    data: { sessionId, playerId, content: content.trim() },
  });
  await notifySessionMessage(sessionId, playerId, content.trim());
  void notifyMentions("session", sessionId, playerId, content.trim());

  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

export async function deleteSessionMessageAction(clubId: string, messageId: string) {
  const { playerId, isAdmin } = await getClubRole(clubId);
  if (!playerId) return { error: apiMsg("not_logged_in") };

  const msg = await prisma.clubSessionMessage.findUnique({ where: { id: messageId } });
  if (!msg) return { error: apiMsg("message_not_found") };
  if (msg.playerId !== playerId && !isAdmin) return { error: apiMsg("not_authorized") };

  await prisma.clubSessionMessage.delete({ where: { id: messageId } });
  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

// ── Venues ────────────────────────────────────────────────────────────────────

export async function createVenueAction(clubId: string, data: {
  name: string;
  address?: string;
  mapLink?: string;
  notes?: string;
  color?: string;
}) {
  const { isMember, isAdmin } = await getClubRole(clubId);
  if (!isMember && !isAdmin) return { error: apiMsg("act_reserve_membres_club") };
  if (!data.name.trim()) return { error: apiMsg("name_required") };

  await prisma.clubVenue.create({
    data: {
      clubId,
      name: data.name.trim(),
      address: data.address?.trim() || null,
      mapLink: data.mapLink?.trim() || null,
      notes: data.notes?.trim() || null,
      color: data.color?.trim() || null,
    },
  });

  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

export async function updateVenueAction(clubId: string, venueId: string, data: {
  name: string;
  address?: string;
  mapLink?: string;
  notes?: string;
  color?: string;
}) {
  const { isMember, isAdmin } = await getClubRole(clubId);
  if (!isMember && !isAdmin) return { error: apiMsg("act_reserve_membres_club") };

  await prisma.clubVenue.update({
    where: { id: venueId },
    data: {
      name: data.name.trim(),
      address: data.address?.trim() || null,
      mapLink: data.mapLink?.trim() || null,
      notes: data.notes?.trim() || null,
      color: data.color?.trim() || null,
    },
  });

  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

export async function deleteVenueAction(clubId: string, venueId: string) {
  const { isAdmin } = await getClubRole(clubId);
  if (!isAdmin) return { error: apiMsg("act_reserve_admins") };

  await prisma.clubVenue.delete({ where: { id: venueId } });
  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

/**
 * Message sur un entraînement → notif aux inscrits confirmés + au créateur.
 * Une seule notif non lue par séance : les messages suivants mettent à jour
 * son compteur et l'aperçu au lieu d'en empiler une par message.
 */
async function notifySessionMessage(sessionId: string, senderId: string, content: string) {
  try {
    const session = await prisma.clubSession.findUnique({
      where: { id: sessionId },
      select: {
        clubId: true, date: true, createdById: true, club: { select: { name: true } },
        attendees: { where: { status: "CONFIRMED" }, select: { playerId: true } },
      },
    });
    if (!session) return;
    const sender = await prisma.player.findUnique({ where: { id: senderId }, select: { name: true } });
    const recipients = new Set([session.createdById, ...session.attendees.map((a) => a.playerId)]);
    recipients.delete(senderId);
    const preview = content.length > 120 ? content.slice(0, 117) + "…" : content;
    for (const playerId of recipients) {
      const existing = await prisma.notification.findFirst({
        where: { playerId, type: "CLUB_SESSION_MESSAGE", read: false, payload: { path: ["sessionId"], equals: sessionId } },
        select: { id: true, payload: true },
      });
      const base = {
        clubId: session.clubId, clubName: session.club.name, sessionId,
        date: session.date.toISOString(), senderName: sender?.name ?? "", preview,
      };
      if (existing) {
        const prev = existing.payload as Record<string, string | number>;
        await prisma.notification.update({
          where: { id: existing.id },
          data: { payload: { ...base, count: (Number(prev.count) || 1) + 1 }, createdAt: new Date() },
        });
      } else {
        await createNotification(playerId, "CLUB_SESSION_MESSAGE", { ...base, count: 1 });
      }
    }
  } catch (e) {
    console.error("[club] notif message séance", e);
  }
}
