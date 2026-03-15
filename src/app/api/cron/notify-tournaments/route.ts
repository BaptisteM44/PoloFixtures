import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/mailer";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const newTournaments = await prisma.tournament.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id: true,
      name: true,
      city: true,
      country: true,
      continentCode: true,
      dateStart: true,
    },
  });

  if (newTournaments.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prefs = await (prisma as any).notificationPreference.findMany({
    where: { enabled: true },
    include: {
      player: {
        select: {
          id: true,
          name: true,
          account: { select: { email: true } },
        },
      },
    },
  });

  let sent = 0;

  for (const pref of prefs) {
    const email = pref.player.account?.email;
    if (!email) continue;

    const hasNoFilter = pref.continents.length === 0 && pref.countries.length === 0;

    const matchingTournaments = newTournaments.filter((t) => {
      if (hasNoFilter) return true;
      if (pref.continents.includes(t.continentCode)) return true;
      if (pref.countries.includes(t.country)) return true;
      return false;
    });

    if (matchingTournaments.length === 0) continue;

    const tournamentList = matchingTournaments
      .map(
        (t) =>
          `<li><strong>${t.name}</strong> — ${t.city}, ${t.country} (${new Date(t.dateStart).toLocaleDateString("fr-FR")})</li>`
      )
      .join("");

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Nouveaux tournois de Bike Polo</h2>
        <p>Bonjour ${pref.player.name},</p>
        <p>${matchingTournaments.length} nouveau${matchingTournaments.length > 1 ? "x" : ""} tournoi${matchingTournaments.length > 1 ? "s" : ""} ${matchingTournaments.length > 1 ? "ont été ajoutés" : "a été ajouté"} dans votre zone géographique :</p>
        <ul>${tournamentList}</ul>
        <p>
          <a href="${process.env.NEXTAUTH_URL ?? "https://poloperator.app"}/tournaments"
             style="background: #60c9cf; color: #1a1a1a; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Voir les tournois
          </a>
        </p>
        <p style="color: #666; font-size: 12px; margin-top: 32px;">
          Vous recevez cet email car vous avez activé les notifications sur Poloperator.<br>
          <a href="${process.env.NEXTAUTH_URL ?? "https://poloperator.app"}/settings/notifications">Gérer mes préférences</a>
        </p>
      </div>
    `;

    await sendMail({
      to: email,
      subject: `${matchingTournaments.length} nouveau${matchingTournaments.length > 1 ? "x" : ""} tournoi${matchingTournaments.length > 1 ? "s" : ""} de Bike Polo`,
      html,
    });

    sent++;
  }

  return NextResponse.json({ ok: true, sent });
}
