import { NextRequest, NextResponse } from "next/server";
import { sweepPolls } from "@/lib/poll-notify";
import { sweepGalleryEnds } from "@/lib/tournament-photos";
import { sweepMatchReminders } from "@/lib/referees";

export const dynamic = "force-dynamic";

/**
 * Balayage des sondages (ouvertures programmées, rappels avant fermeture,
 * résultats à date, fermeture automatique). Optionnel : le même balayage est
 * déjà déclenché par les visites (au plus toutes les 5 min) — ce cron assure
 * juste la ponctualité la nuit. À appeler toutes les 15 min avec CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await sweepPolls();
  // Même cron : notif de fin de tournoi des galeries photos (21h le dernier jour).
  await sweepGalleryEnds();
  // Rappels « ton match / ton arbitrage dans 15 min » (idéalement toutes les 5 min).
  await sweepMatchReminders();
  return NextResponse.json({ ok: true });
}
