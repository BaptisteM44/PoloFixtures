import { NextRequest, NextResponse } from "next/server";
import { sweepPolls } from "@/lib/poll-notify";
import { sweepGalleryEnds } from "@/lib/tournament-photos";
import { sweepMatchReminders } from "@/lib/referees";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Cron principal — à appeler TOUTES LES 5 MIN avec CRON_SECRET :
 * sondages (ouvertures programmées, rappels, résultats, fermeture), fin de
 * tournoi des galeries, rappels « c'est bientôt à vous », ménage des vieilles
 * notifications. Les visites déclenchent aussi une partie de ces balayages,
 * mais seul le cron garantit la ponctualité (nuit, premier match du jour).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await sweepPolls();
  // Même cron : notif de fin de tournoi des galeries photos (21h le dernier jour).
  await sweepGalleryEnds();
  // Rappels « c'est bientôt à vous » (premier match d'un terrain, direct pas utilisé).
  await sweepMatchReminders();
  // Ménage : notifications lues de plus de 90 jours, et toutes celles de plus de 180 jours.
  const now = Date.now();
  const purged = await prisma.notification.deleteMany({
    where: {
      OR: [
        { read: true, createdAt: { lt: new Date(now - 90 * 86400_000) } },
        { createdAt: { lt: new Date(now - 180 * 86400_000) } },
      ],
    },
  });
  return NextResponse.json({ ok: true, purgedNotifications: purged.count });
}
