import { prisma } from "@/lib/db";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { createNotification } from "@/lib/notify";
import { sendMail } from "@/lib/mailer";
import { accommodationAssignedEmail, accommodationHostEmail, getLangFromCountry } from "@/lib/email-templates";

/**
 * Notifie tous les logés/logeurs PAS ENCORE prévenus (notifiedAt null) de ce
 * tournoi : notif in-app + push + email. Déclenché par le bouton « Notifier »
 * du dashboard orga, une fois les assignations stabilisées — pas d'envoi
 * automatique à chaque assignation (l'orga tâtonne souvent).
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const orgaId = await getOrgaPlayerId(params.id);
  if (!orgaId) return new Response("Forbidden", { status: 403 });

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, slug: true },
  });
  if (!tournament) return new Response("Not found", { status: 404 });

  // Logés pas encore prévenus, avec leur logeur et leur compte (email + pays)
  const pending = await prisma.accommodationGuest.findMany({
    where: { notifiedAt: null, host: { tournamentId: params.id } },
    include: {
      host: { select: { id: true, name: true, contact: true, playerId: true } },
      teamPlayer: {
        include: {
          player: { select: { id: true, name: true, country: true, status: true, account: { select: { email: true } } } },
          team: { select: { name: true } },
        },
      },
    },
  });

  if (pending.length === 0) {
    return Response.json({ notifiedGuests: 0, notifiedHosts: 0 });
  }

  const payloadBase = {
    tournamentName: tournament.name,
    tournamentId: tournament.id,
    tournamentSlug: tournament.slug ?? tournament.id,
  };

  // 1. Chaque logé : notif in-app + push + email
  for (const g of pending) {
    const player = g.teamPlayer.player;
    await createNotification(player.id, "ACCOMMODATION_ASSIGNED", {
      ...payloadBase,
      hostName: g.host.name,
    });
    const email = player.account?.email;
    if (email && player.status === "ACTIVE") {
      const lang = getLangFromCountry(player.country);
      const mail = accommodationAssignedEmail(lang, {
        hostName: g.host.name,
        hostContact: g.host.contact,
        tournamentName: tournament.name,
        tournamentId: tournament.id,
        tournamentSlug: tournament.slug,
      });
      await sendMail({ to: email, ...mail }).catch((e) =>
        console.error("[accommodation] mail logé échec:", email, e)
      );
    }
  }

  // 2. Chaque logeur AVEC compte : une seule notif/mail listant ses nouveaux invités
  const byHost = new Map<string, typeof pending>();
  for (const g of pending) {
    const arr = byHost.get(g.host.id) ?? [];
    arr.push(g);
    byHost.set(g.host.id, arr);
  }
  let notifiedHosts = 0;
  for (const guests of byHost.values()) {
    const host = guests[0].host;
    if (!host.playerId) continue; // logeur externe (pas de compte) : contact hors plateforme
    const guestLines = guests.map((g) => `${g.teamPlayer.player.name} (${g.teamPlayer.team.name})`);
    await createNotification(host.playerId, "ACCOMMODATION_GUEST_ADDED", {
      ...payloadBase,
      count: guests.length,
    });
    const hostPlayer = await prisma.player.findUnique({
      where: { id: host.playerId },
      select: { country: true, status: true, account: { select: { email: true } } },
    });
    const email = hostPlayer?.account?.email;
    if (email && hostPlayer?.status === "ACTIVE") {
      const lang = getLangFromCountry(hostPlayer.country);
      const mail = accommodationHostEmail(lang, {
        guestLines,
        tournamentName: tournament.name,
        tournamentId: tournament.id,
        tournamentSlug: tournament.slug,
      });
      await sendMail({ to: email, ...mail }).catch((e) =>
        console.error("[accommodation] mail logeur échec:", email, e)
      );
    }
    notifiedHosts++;
  }

  // 3. Marquer comme prévenus
  await prisma.accommodationGuest.updateMany({
    where: { id: { in: pending.map((g) => g.id) } },
    data: { notifiedAt: new Date() },
  });

  return Response.json({ notifiedGuests: pending.length, notifiedHosts });
}
