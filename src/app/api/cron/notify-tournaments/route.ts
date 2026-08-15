import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/mailer";
import { getLangFromCountry, tournamentDigestEmail } from "@/lib/email-templates";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({
      error: "Unauthorized",
      receivedHeader: auth,
      expectedPrefix: `Bearer ${secret?.slice(0, 6)}...`,
    }, { status: 401 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const newTournaments = await prisma.tournament.findMany({
    where: { createdAt: { gte: since }, testMode: false, hidden: false, approved: true },
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
    where: { registrationEnd: { gte: in2days, lte: in3days }, createdViaSandbox: false, hidden: false },
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
              country: true,
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
          country: true,
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

    const lang = getLangFromCountry(pref.player.country);
    const { subject, html } = tournamentDigestEmail(lang, {
      playerName: pref.player.name,
      newTournaments: matchingNew.map((t) => ({
        name: t.name,
        city: t.city,
        country: t.country,
        dateStart: t.dateStart.toISOString(),
        id: t.id,
      })),
      closingTournaments: matchingClosing.map((t) => ({
        name: t.name,
        city: t.city,
        country: t.country,
        registrationEnd: ((t as any).registrationEnd as Date).toISOString(),
        id: t.id,
      })),
    });

    await sendMail({ to: email, subject, html });

    sentViaGeoFilter.add(pref.player.id);
    sent++;
  }

  // ── Passe 3 : envoyer aux joueurs qui suivent des tournois mais n'ont pas déjà reçu l'email ──
  for (const [playerId, { player, tournaments }] of followedByPlayer.entries()) {
    if (sentViaGeoFilter.has(playerId)) continue;
    const email = player.account?.email;
    if (!email) continue;

    const lang = getLangFromCountry((player as any).country);
    const { subject, html } = tournamentDigestEmail(lang, {
      playerName: player.name,
      newTournaments: [],
      closingTournaments: tournaments.map((t: any) => ({
        name: t.name,
        city: t.city,
        country: t.country,
        registrationEnd: t.registrationEnd instanceof Date ? t.registrationEnd.toISOString() : t.registrationEnd,
        id: t.id,
      })),
    });

    await sendMail({ to: email, subject, html });

    sent++;
  }

  return NextResponse.json({ ok: true, sent });
}
