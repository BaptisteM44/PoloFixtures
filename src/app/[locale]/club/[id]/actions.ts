"use server";

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { createNotification, notifySessionJoin } from "@/lib/notify";

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
  if (!isManager) return { error: "Seul le manager peut ajouter des admins." };

  const membership = await prisma.clubMember.findUnique({ where: { clubId_playerId: { clubId, playerId } } });
  if (membership?.status !== "MEMBER") return { error: "Ce joueur n'est pas membre du club." };

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
  if (!isManager) return { error: "Seul le manager peut retirer des admins." };

  await prisma.clubAdmin.deleteMany({ where: { clubId, playerId } });
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
  if (!playerId || !isMember) return { error: "Réservé aux membres du club." };

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
  if (!playerId) return { error: "Non connecté." };

  const session = await prisma.clubSession.findUnique({ where: { id: sessionId } });
  if (!session || session.clubId !== clubId) return { error: "Session introuvable." };

  // Creator or admin can delete
  if (session.createdById !== playerId && !isAdmin) return { error: "Non autorisé." };

  await prisma.clubSession.delete({ where: { id: sessionId } });
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
  if (!playerId) return { error: "Non connecté." };

  const session = await prisma.clubSession.findUnique({ where: { id: sessionId } });
  if (!session || session.clubId !== clubId) return { error: "Session introuvable." };
  if (session.createdById !== playerId && !isAdmin) return { error: "Non autorisé." };

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
  if (!playerId) return { error: "Non connecté." };

  const session = await prisma.clubSession.findUnique({ where: { id: sessionId } });
  if (!session || session.clubId !== clubId) return { error: "Session introuvable." };

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
  if (!playerId) return { error: "Non connecté." };

  await prisma.clubSessionAttendee.deleteMany({ where: { sessionId, playerId } });
  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

export async function approveSessionAttendeeAction(clubId: string, sessionId: string, playerId: string) {
  const { isAdmin } = await getClubRole(clubId);
  if (!isAdmin) return { error: "Réservé aux admins." };

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
  if (!isAdmin) return { error: "Réservé aux admins." };

  await prisma.clubSessionAttendee.deleteMany({ where: { sessionId, playerId } });
  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

export async function cancelSessionAction(clubId: string, sessionId: string) {
  const { playerId, isAdmin } = await getClubRole(clubId);
  if (!playerId || !isAdmin) return { error: "Réservé aux admins." };

  const session = await prisma.clubSession.findUnique({ where: { id: sessionId }, select: { clubId: true, date: true, title: true } });
  if (!session || session.clubId !== clubId) return { error: "Session introuvable." };

  await prisma.clubSession.update({
    where: { id: sessionId },
    data: { status: "CANCELLED" },
  });

  // Notif à tous les inscrits CONFIRMED
  const attendees = await prisma.clubSessionAttendee.findMany({
    where: { sessionId, status: "CONFIRMED", playerId: { not: playerId } },
    select: { playerId: true },
  });
  const dateStr = session.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const label = session.title ? `"${session.title}" du ${dateStr}` : `du ${dateStr}`;
  for (const a of attendees) {
    await createNotification(a.playerId, "CLUB_SESSION", {
      message: `La session ${label} a été annulée.`,
      clubId,
    });
  }

  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

// ── Chat ──────────────────────────────────────────────────────────────────

export async function sendClubMessageAction(clubId: string, content: string) {
  const { playerId, isMember } = await getClubRole(clubId);
  if (!playerId || !isMember) return { error: "Réservé aux membres du club." };
  if (!content.trim()) return { error: "Message vide." };

  await prisma.clubMessage.create({
    data: { clubId, playerId, content: content.trim() },
  });

  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

export async function deleteClubMessageAction(clubId: string, messageId: string) {
  const { playerId, isAdmin } = await getClubRole(clubId);
  if (!playerId) return { error: "Non connecté." };

  const msg = await prisma.clubMessage.findUnique({ where: { id: messageId } });
  if (!msg || msg.clubId !== clubId) return { error: "Message introuvable." };
  if (msg.playerId !== playerId && !isAdmin) return { error: "Non autorisé." };

  await prisma.clubMessage.delete({ where: { id: messageId } });
  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

// ── Auto-generate recurring sessions ──────────────────────────────────────

export async function generateNextRecurringSessionAction(clubId: string) {
  const { isAdmin } = await getClubRole(clubId);
  if (!isAdmin) return { error: "Réservé aux admins." };

  const templates = await prisma.clubSession.findMany({
    where: { clubId, recurring: true, recurrenceDay: { not: null }, recurrenceTime: { not: null } },
  });

  const now = new Date();
  let created = 0;

  for (const tpl of templates) {
    const day = tpl.recurrenceDay!;

    // Utilise la date de la template (déjà en UTC correct) et avance de 7j jusqu'à être dans le futur
    const tplDate = new Date(tpl.date);
    const nextDate = new Date(tplDate);
    while (nextDate <= now) nextDate.setDate(nextDate.getDate() + 7);

    // Vérifie si une session existe déjà à cette date (en excluant la template elle-même)
    const exists = await prisma.clubSession.findFirst({
      where: {
        clubId,
        id: { not: tpl.id },
        date: {
          gte: new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate()),
          lt: new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate() + 1),
        },
      },
    });

    if (!exists) {
      await prisma.clubSession.create({
        data: {
          clubId,
          title: tpl.title,
          date: nextDate,
          duration: tpl.duration,
          venueId: tpl.venueId ?? null,
          location: tpl.location,
          notes: tpl.notes,
          recurring: false,
          recurrenceDay: day,
          color: tpl.color ?? null,
          createdById: tpl.createdById,
        },
      });
      created++;
    }
  }

  revalidatePath(`/club/${clubId}`);
  return { ok: true, created };
}

// ── Session Chat ─────────────────────────────────────────────────────────────

export async function sendSessionMessageAction(clubId: string, sessionId: string, content: string) {
  const { playerId, isMember } = await getClubRole(clubId);
  if (!playerId || !isMember) return { error: "Réservé aux membres du club." };
  if (!content.trim()) return { error: "Message vide." };

  const session = await prisma.clubSession.findUnique({ where: { id: sessionId } });
  if (!session || session.clubId !== clubId) return { error: "Session introuvable." };

  await prisma.clubSessionMessage.create({
    data: { sessionId, playerId, content: content.trim() },
  });

  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}

export async function deleteSessionMessageAction(clubId: string, messageId: string) {
  const { playerId, isAdmin } = await getClubRole(clubId);
  if (!playerId) return { error: "Non connecté." };

  const msg = await prisma.clubSessionMessage.findUnique({ where: { id: messageId } });
  if (!msg) return { error: "Message introuvable." };
  if (msg.playerId !== playerId && !isAdmin) return { error: "Non autorisé." };

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
  const { isAdmin } = await getClubRole(clubId);
  if (!isAdmin) return { error: "Réservé aux admins." };
  if (!data.name.trim()) return { error: "Nom requis." };

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
  const { isAdmin } = await getClubRole(clubId);
  if (!isAdmin) return { error: "Réservé aux admins." };

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
  if (!isAdmin) return { error: "Réservé aux admins." };

  await prisma.clubVenue.delete({ where: { id: venueId } });
  revalidatePath(`/club/${clubId}`);
  return { ok: true };
}
