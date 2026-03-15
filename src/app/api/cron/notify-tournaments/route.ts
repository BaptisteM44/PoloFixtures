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

  // Tournois avec inscriptions fermant dans 3 jours (fenêtre de 24h pour ne pas renvoyer)
  const in3days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const in2days = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const closingSoonTournaments = await prisma.tournament.findMany({
    where: { registrationEnd: { gte: in2days, lte: in3days } },
    select: { id: true, name: true, city: true, country: true, continentCode: true, registrationEnd: true },
  });

  // ── Passe 3 : tournois suivis dont les inscriptions ferment dans 3 jours ──
  // Fetch follows for closing-soon tournaments (same window)
  const closingSoonIds = closingSoonTournaments.map((t) => t.id);
  const followedClosingFollows = closingSoonIds.length > 0
    ? await (prisma as any).tournamentFollow.findMany({
        where: { tournamentId: { in: closingSoonIds } },
        include: {
          player: {
            select: {
              id: true,
              name: true,
              account: { select: { email: true } },
              notificationPreference: true,
            },
          },
          tournament: {
            select: { id: true, name: true, city: true, country: true, continentCode: true, registrationEnd: true },
          },
        },
      })
    : [];

  // Group by player: map playerId -> { player, tournaments[] }
  const followedByPlayer = new Map<string, { player: any; tournaments: any[] }>();
  for (const follow of followedClosingFollows) {
    const pref = follow.player.notificationPreference;
    // Skip if player explicitly disabled notifyFollowedClosing
    if (pref && pref.notifyFollowedClosing === false) continue;
    // Skip if global notifications disabled
    if (pref && pref.enabled === false) continue;
    if (!follow.player.account?.email) continue;
    const existing = followedByPlayer.get(follow.player.id);
    if (existing) {
      existing.tournaments.push(follow.tournament);
    } else {
      followedByPlayer.set(follow.player.id, {
        player: follow.player,
        tournaments: [follow.tournament],
      });
    }
  }

  if (newTournaments.length === 0 && closingSoonTournaments.length === 0 && followedByPlayer.size === 0) {
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

  // Track players who already received an email via geo filter (to avoid double send on followed-closing pass)
  const sentViaGeoFilter = new Set<string>();

  for (const pref of prefs) {
    const email = pref.player.account?.email;
    if (!email) continue;

    const hasNoFilter = pref.continents.length === 0 && pref.countries.length === 0;
    const matches = (t: { continentCode: string; country: string }) => {
      if (hasNoFilter) return true;
      if (pref.continents.includes(t.continentCode)) return true;
      if (pref.countries.includes(t.country)) return true;
      return false;
    };

    // Respect per-type flags (default true if no pref row or missing field)
    const wantsNew = pref.notifyNewTournaments !== false;
    const wantsClosing = pref.notifyFollowedClosing !== false;

    const matchingNew = wantsNew ? newTournaments.filter(matches) : [];
    const matchingClosing = wantsClosing ? closingSoonTournaments.filter(matches) : [];

    if (matchingNew.length === 0 && matchingClosing.length === 0) continue;

    const appUrl = process.env.NEXTAUTH_URL ?? "https://poloperator.app";

    const newList = matchingNew
      .map((t) => `<li><strong>${t.name}</strong> — ${t.city}, ${t.country} (${new Date(t.dateStart).toLocaleDateString("fr-FR")})<br><a href="${appUrl}/tournaments/${t.id}">Voir le tournoi</a></li>`)
      .join("");

    const closingList = matchingClosing
      .map((t) => `<li><strong>${t.name}</strong> — ${t.city}, ${t.country} · Inscriptions jusqu'au <strong>${new Date((t as any).registrationEnd).toLocaleDateString("fr-FR")}</strong><br><a href="${appUrl}/tournaments/${t.id}">S'inscrire</a></li>`)
      .join("");

    const sections = [
      matchingNew.length > 0 ? `<h3>🆕 Nouveaux tournois</h3><ul>${newList}</ul>` : "",
      matchingClosing.length > 0 ? `<h3>⏳ Inscriptions qui ferment bientôt</h3><ul>${closingList}</ul>` : "",
    ].join("");

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Bike Polo — Actualités tournois</h2>
        <p>Bonjour ${pref.player.name},</p>
        ${sections}
        <p>
          <a href="${appUrl}/tournaments"
             style="background: #60c9cf; color: #1a1a1a; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Voir tous les tournois
          </a>
        </p>
        <p style="color: #666; font-size: 12px; margin-top: 32px;">
          Vous recevez cet email car vous avez activé les notifications sur Poloperator.<br>
          <a href="${appUrl}/settings/notifications">Gérer mes préférences</a>
        </p>
      </div>
    `;

    const subjectParts = [];
    if (matchingNew.length > 0) subjectParts.push(`${matchingNew.length} nouveau${matchingNew.length > 1 ? "x" : ""} tournoi${matchingNew.length > 1 ? "s" : ""}`);
    if (matchingClosing.length > 0) subjectParts.push(`${matchingClosing.length} inscription${matchingClosing.length > 1 ? "s" : ""} qui ferme${matchingClosing.length > 1 ? "nt" : ""} bientôt`);

    await sendMail({
      to: email,
      subject: `Bike Polo — ${subjectParts.join(" · ")}`,
      html,
    });

    sentViaGeoFilter.add(pref.player.id);
    sent++;
  }

  // ── Passe 3 : envoyer aux joueurs qui suivent des tournois mais n'ont pas déjà reçu l'email ──
  const appUrl = process.env.NEXTAUTH_URL ?? "https://poloperator.app";
  for (const [playerId, { player, tournaments }] of followedByPlayer.entries()) {
    // Skip if already notified via geo filter
    if (sentViaGeoFilter.has(playerId)) continue;
    const email = player.account?.email;
    if (!email) continue;

    const closingList = tournaments
      .map((t: any) => `<li><strong>${t.name}</strong> — ${t.city}, ${t.country} · Inscriptions jusqu'au <strong>${new Date(t.registrationEnd).toLocaleDateString("fr-FR")}</strong><br><a href="${appUrl}/tournament/${t.id}">S'inscrire</a></li>`)
      .join("");

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Bike Polo — Inscriptions qui ferment bientôt</h2>
        <p>Bonjour ${player.name},</p>
        <h3>⭐ Tournois que vous suivez</h3>
        <ul>${closingList}</ul>
        <p>
          <a href="${appUrl}/tournaments"
             style="background: #60c9cf; color: #1a1a1a; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Voir tous les tournois
          </a>
        </p>
        <p style="color: #666; font-size: 12px; margin-top: 32px;">
          Vous recevez cet email car vous suivez ces tournois sur Poloperator.<br>
          <a href="${appUrl}/settings/notifications">Gérer mes préférences</a>
        </p>
      </div>
    `;

    await sendMail({
      to: email,
      subject: `Bike Polo — ${tournaments.length} tournoi${tournaments.length > 1 ? "s suivis ferment" : " suivi ferme"} bientôt`,
      html,
    });

    sent++;
  }

  return NextResponse.json({ ok: true, sent });
}
