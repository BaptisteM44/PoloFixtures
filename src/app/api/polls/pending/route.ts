import { auth } from "@/lib/auth";
import { countPendingPolls } from "@/lib/poll-access";
import { maybeSweepPolls } from "@/lib/poll-notify";
import { maybeSweepGalleries } from "@/lib/tournament-photos";

export const dynamic = "force-dynamic";

/** Pastille du menu Outils : sondages ouverts qui me concernent, pas encore votés. */
export async function GET() {
  // Les visites déclenchent aussi le balayage des notifs programmées (throttlé).
  maybeSweepPolls();
  maybeSweepGalleries();
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return Response.json({ count: 0 });
  return Response.json({ count: await countPendingPolls(playerId) });
}
