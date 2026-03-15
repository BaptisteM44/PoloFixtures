import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { sendMail } from "@/lib/mailer";
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
    select: { name: true, account: { select: { email: true } } },
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

  // Notification
  await prisma.notification.create({
    data: {
      playerId: invitedPlayerId,
      type: "SQUAD_INVITE",
      payload: {
        invitationId: invitation.id,
        squadId: params.squadId,
        squadName: squad?.name ?? "",
        invitedById: currentPlayerId,
        invitedByName: inviter?.name ?? "",
      },
    },
  });

  // Email au joueur invité (sauf si désactivé dans ses prefs)
  const wantsSquadInviteEmail = invitedPlayerPrefs?.notifySquadInvite !== false;
  const invitedEmail = invitedPlayer?.account?.email;
  if (invitedEmail && wantsSquadInviteEmail) {
    const appUrl = process.env.NEXTAUTH_URL ?? "https://poloperator.app";
    await sendMail({
      to: invitedEmail,
      subject: `${inviter?.name ?? "Quelqu'un"} t'invite à rejoindre ${squad?.name ?? "une équipe"}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Invitation à rejoindre une équipe</h2>
          <p>Bonjour ${invitedPlayer?.name ?? ""},</p>
          <p><strong>${inviter?.name ?? "Un joueur"}</strong> t'invite à rejoindre l'équipe <strong>${squad?.name ?? ""}</strong> sur Poloperator.</p>
          <p style="margin: 24px 0;">
            <a href="${appUrl}/my-teams"
               style="background: #60c9cf; color: #1a1a1a; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Voir l'invitation
            </a>
          </p>
          <p style="color: #666; font-size: 12px; margin-top: 32px;">
            Vous pouvez accepter ou refuser cette invitation depuis votre espace <a href="${appUrl}/my-teams">Mes équipes</a>.
          </p>
        </div>
      `,
    });
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
