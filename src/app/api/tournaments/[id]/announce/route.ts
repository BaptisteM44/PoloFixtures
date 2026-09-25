import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasAtLeastRole } from "@/lib/rbac";
import { sendMail, isMailerConfigured } from "@/lib/mailer";
import { getLangFromCountry, announceEmail } from "@/lib/email-templates";
import { z } from "zod";

const schema = z.object({
  subject: z.string().min(3).max(200),
  message: z.string().min(10).max(5000),
  target: z.enum(["captains", "all"]).default("captains"),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  const role = session?.user?.role;

  if (!playerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check organizer access
  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      slug: true,
      format: true,
      creatorId: true,
      coOrganizers: { select: { playerId: true } },
    },
  });
  if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOrga =
    (role && hasAtLeastRole(role, "ADMIN")) ||
    tournament.creatorId === playerId ||
    tournament.coOrganizers.some((co) => co.playerId === playerId);
  if (!isOrga) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Service email indisponible : on refuse explicitement au lieu de "réussir"
  // sans rien envoyer (sendMail ignore silencieusement si SMTP non configuré),
  // ce qui affichait un faux "X emails envoyés" trompeur à l'orga.
  if (!isMailerConfigured()) {
    return NextResponse.json({ error: "mailer_unavailable" }, { status: 503 });
  }

  const { subject, message, target } = parsed.data;

  // Destinataires : liste unifiée { email, status, country, label }.
  // - ABC Chapeau : inscriptions individuelles sélectionnées (pas d'équipe
  //   ni de capitaine avant le tirage) → on écrit à tous les inscrits solo
  //   IN (waitlisted: false), le ciblage captains/all n'y a pas de sens.
  // - Autres formats : joueur·euses des équipes sélectionnées (option
  //   "captains" = uniquement les capitaines).
  type Recipient = { email: string | null | undefined; status: string; country: string | null; label: string };
  let recipients: Recipient[];

  if (tournament.format === "ABC Chapeau") {
    const solo = await prisma.tournamentSoloEntry.findMany({
      where: { tournamentId: params.id, waitlisted: false },
      include: { player: { select: { name: true, status: true, country: true, account: { select: { email: true } } } } },
    });
    recipients = solo.map((e) => ({
      email: e.player.account?.email,
      status: e.player.status,
      country: e.player.country,
      label: e.player.name,
    }));
  } else {
    const teamPlayers = await prisma.teamPlayer.findMany({
      where: {
        team: { tournamentId: params.id, selected: true },
        ...(target === "captains" ? { isCaptain: true } : {}),
      },
      include: {
        player: { select: { name: true, status: true, country: true, account: { select: { email: true } } } },
        team: { select: { name: true } },
      },
    });
    recipients = teamPlayers.map((tp) => ({
      email: tp.player.account?.email,
      status: tp.player.status,
      country: tp.player.country,
      label: tp.team.name,
    }));
  }

  const messageHtml = message.replace(/\n/g, "<br>");

  let sent = 0;
  const errors: string[] = [];

  for (const r of recipients) {
    if (!r.email || r.status !== "ACTIVE") continue;

    const lang = getLangFromCountry(r.country as any);
    const appUrl = process.env.NEXTAUTH_URL ?? "https://poloperator.com";
    const tournamentUrl = `${appUrl}/tournament/${tournament.slug ?? tournament.id}`;
    const { subject: emailSubject, html } = announceEmail(lang, {
      tournamentName: tournament.name,
      tournamentUrl,
      subject,
      messageHtml,
      recipientLabel: r.label,
    });

    try {
      await sendMail({ to: r.email, subject: emailSubject, html });
      sent++;
    } catch (err) {
      errors.push(r.email);
      // Login refusé ou serveur injoignable : insister multiplierait les
      // tentatives de connexion, exactement ce qui fait bloquer le compte.
      const code = (err as { code?: string })?.code;
      if (code === "EAUTH" || code === "ECONNECTION" || code === "ETIMEDOUT") break;
    }
  }

  return NextResponse.json({ ok: true, sent, errors });
}
