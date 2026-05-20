import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasAtLeastRole } from "@/lib/rbac";
import { sendMail } from "@/lib/mailer";
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
          account: { select: { email: true } },
        },
      },
      team: { select: { name: true } },
    },
  });

  const appUrl = process.env.NEXTAUTH_URL ?? "https://poloperator.com";
  const tournamentUrl = `${appUrl}/tournament/${tournament.slug ?? tournament.id}`;

  const messageHtml = message.replace(/\n/g, "<br>");

  let sent = 0;
  const errors: string[] = [];

  for (const tp of teamPlayers) {
    const email = tp.player.account?.email;
    if (!email || tp.player.status !== "ACTIVE") continue;

    const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1a1a1a">📢 ${tournament.name}</h2>
      <p style="color:#444;font-size:13px">Message de l'organisation · ${target === "captains" ? `Capitaine de ${tp.team.name}` : tp.team.name}</p>
      <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:16px 0;font-size:15px;line-height:1.6">
        ${messageHtml}
      </div>
      <p><a href="${tournamentUrl}" style="background:#60c9cf;color:#1a1a1a;padding:10px 20px;text-decoration:none;border-radius:6px;font-weight:bold">Voir le tournoi</a></p>
      <p style="color:#666;font-size:12px;margin-top:32px">Poloperator — <a href="${appUrl}">poloperator.com</a></p>
    </div>`;

    try {
      await sendMail({ to: email, subject: `[${tournament.name}] ${subject}`, html });
      sent++;
    } catch {
      errors.push(email);
    }
  }

  return NextResponse.json({ ok: true, sent, errors });
}
