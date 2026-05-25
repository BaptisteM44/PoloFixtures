import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasAtLeastRole } from "@/lib/rbac";
import { sendMail } from "@/lib/mailer";
import { createNotification } from "@/lib/notify";
import { getLangFromCountry, selectionEmail, waitlistEmail } from "@/lib/email-templates";
import { z } from "zod";

const schema = z.object({
  sendNotif: z.boolean().default(true),
  sendMail: z.boolean().default(true),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  const role = session?.user?.role;
  if (!playerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true, slug: true,
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

  const { sendNotif, sendMail: doMail } = parsed.data;

  // Fetch all teams with their players
  const teams = await prisma.team.findMany({
    where: { tournamentId: params.id },
    select: {
      id: true, name: true,
      guaranteed: true,
      waitlistPosition: true,
      players: {
        include: {
          player: {
            select: {
              id: true, name: true, status: true, country: true,
              account: { select: { email: true } },
            },
          },
        },
      },
    },
  });

  let notifSent = 0;
  let mailSent = 0;
  const mailErrors: string[] = [];

  for (const team of teams) {
    const isSelected = team.guaranteed;
    const isWaitlisted = !team.guaranteed && team.waitlistPosition !== null;
    if (!isSelected && !isWaitlisted) continue; // pas encore classée, on skip

    for (const tp of team.players) {
      const p = tp.player;
      if (p.status !== "ACTIVE") continue;

      if (sendNotif && p.account) {
        await createNotification(p.id, isSelected ? "TEAM_SELECTED" : "TEAM_WAITLISTED", {
          teamName: team.name,
          tournamentName: tournament.name,
          tournamentId: tournament.id,
          tournamentSlug: tournament.slug ?? "",
          ...(isWaitlisted ? { rank: team.waitlistPosition! } : {}),
        }).catch(() => null);
        notifSent++;
      }

      if (doMail && p.account?.email) {
        const email = p.account.email;
        const lang = getLangFromCountry((p as any).country);
        const { subject, html } = isSelected
          ? selectionEmail(lang, {
              teamName: team.name,
              tournamentName: tournament.name,
              tournamentId: tournament.id,
              tournamentSlug: tournament.slug ?? "",
            })
          : waitlistEmail(lang, {
              teamName: team.name,
              tournamentName: tournament.name,
              tournamentId: tournament.id,
              tournamentSlug: tournament.slug ?? "",
              rank: team.waitlistPosition!,
            });

        await sendMail({ to: email, subject, html })
          .then(() => mailSent++)
          .catch(() => mailErrors.push(email));
      }
    }
  }

  return NextResponse.json({ ok: true, notifSent, mailSent, mailErrors });
}
