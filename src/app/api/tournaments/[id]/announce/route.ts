import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasAtLeastRole } from "@/lib/rbac";
import { sendMail } from "@/lib/mailer";
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

  const { subject, message, target } = parsed.data;

  // Fetch recipients
  const teamPlayers = await prisma.teamPlayer.findMany({
    where: {
      team: { tournamentId: params.id, selected: true },
      ...(target === "captains" ? { isCaptain: true } : {}),
    },
    include: {
      player: {
        select: {
          name: true,
          status: true,
          country: true,
          account: { select: { email: true } },
        },
      },
      team: { select: { name: true } },
    },
  });

  const messageHtml = message.replace(/\n/g, "<br>");

  let sent = 0;
  const errors: string[] = [];

  for (const tp of teamPlayers) {
    const email = tp.player.account?.email;
    if (!email || tp.player.status !== "ACTIVE") continue;

    const lang = getLangFromCountry((tp.player as any).country);
    const recipientLabel = tp.team.name;
    const appUrl = process.env.NEXTAUTH_URL ?? "https://poloperator.com";
    const tournamentUrl = `${appUrl}/tournament/${tournament.slug ?? tournament.id}`;
    const { subject: emailSubject, html } = announceEmail(lang, {
      tournamentName: tournament.name,
      tournamentUrl,
      subject,
      messageHtml,
      recipientLabel,
    });

    try {
      await sendMail({ to: email, subject: emailSubject, html });
      sent++;
    } catch {
      errors.push(email);
    }
  }

  return NextResponse.json({ ok: true, sent, errors });
}
