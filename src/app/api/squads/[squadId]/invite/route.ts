import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { sendMail } from "@/lib/mailer";
import { getLangFromCountry, squadInviteEmail } from "@/lib/email-templates";
import { createNotification } from "@/lib/notify";
import { z } from "zod";

// POST /api/squads/[squadId]/invite — inviter un joueur
export async function POST(req: Request, { params }: { params: { squadId: string } }) {
  const session = await auth();
  const currentPlayerId = session?.user?.playerId;
  if (!currentPlayerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const member = await prisma.squadMember.findUnique({
    where: { squadId_playerId: { squadId: params.squadId, playerId: currentPlayerId } },
  });
  if (!member) return NextResponse.json({ error: "Pas membre de cette équipe" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = z.object({ playerId: z.string() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "playerId manquant" }, { status: 400 });

  const { playerId: invitedPlayerId } = parsed.data;

  // Déjà membre ?
  const alreadyMember = await prisma.squadMember.findUnique({
    where: { squadId_playerId: { squadId: params.squadId, playerId: invitedPlayerId } },
  });
  if (alreadyMember) return NextResponse.json({ error: "Déjà membre de l'équipe" }, { status: 400 });

  // Invitation déjà en attente ?
  const existing = await prisma.squadInvitation.findUnique({
    where: { squadId_invitedPlayerId: { squadId: params.squadId, invitedPlayerId } },
  });
  if (existing && existing.status === "PENDING") {
    return NextResponse.json({ error: "Invitation déjà envoyée" }, { status: 400 });
  }

  // Recréer l'invitation si elle avait été refusée
  const squad = await prisma.squad.findUnique({ where: { id: params.squadId }, select: { name: true } });
  const inviter = await prisma.player.findUnique({ where: { id: currentPlayerId }, select: { name: true } });
  const invitedPlayer = await prisma.player.findUnique({
    where: { id: invitedPlayerId },
    select: { name: true, country: true, account: { select: { email: true } } },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invitedPlayerPrefs = await (prisma as any).notificationPreference.findUnique({
    where: { playerId: invitedPlayerId },
    select: { notifySquadInvite: true },
  });

  const invitation = await prisma.squadInvitation.upsert({
    where: { squadId_invitedPlayerId: { squadId: params.squadId, invitedPlayerId } },
    create: { squadId: params.squadId, invitedPlayerId, invitedById: currentPlayerId, status: "PENDING" },
    update: { status: "PENDING", invitedById: currentPlayerId, updatedAt: new Date() },
  });

  // Notification in-app (respecte notifySquadInvite + enabled via createNotification)
  await createNotification(invitedPlayerId, "SQUAD_INVITE", {
    invitationId: invitation.id,
    squadId: params.squadId,
    squadName: squad?.name ?? "",
    invitedById: currentPlayerId,
    invitedByName: inviter?.name ?? "",
  });

  // Email au joueur invité (sauf si désactivé dans ses prefs)
  const wantsSquadInviteEmail = invitedPlayerPrefs?.notifySquadInvite !== false;
  const invitedEmail = invitedPlayer?.account?.email;
  if (invitedEmail && wantsSquadInviteEmail) {
    const lang = getLangFromCountry(invitedPlayer?.country);
    const { subject, html } = squadInviteEmail(lang, {
      inviterName: inviter?.name ?? "Someone",
      squadName: squad?.name ?? "",
      playerName: invitedPlayer?.name ?? "",
    });
    await sendMail({ to: invitedEmail, subject, html });
  }

  return NextResponse.json(invitation, { status: 201 });
}

// DELETE /api/squads/[squadId]/invite?invitationId=xxx — annuler une invitation
export async function DELETE(req: Request, { params }: { params: { squadId: string } }) {
  const session = await auth();
  const currentPlayerId = session?.user?.playerId;
  if (!currentPlayerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const member = await prisma.squadMember.findUnique({
    where: { squadId_playerId: { squadId: params.squadId, playerId: currentPlayerId } },
  });
  if (!member) return NextResponse.json({ error: "Pas membre de cette équipe" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const invitationId = searchParams.get("invitationId");
  if (!invitationId) return NextResponse.json({ error: "invitationId manquant" }, { status: 400 });

  await prisma.squadInvitation.deleteMany({
    where: { id: invitationId, squadId: params.squadId },
  });

  return NextResponse.json({ ok: true });
}
