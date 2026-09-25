import { auth } from "@/lib/auth";
import { countPendingPolls } from "@/lib/poll-access";

export const dynamic = "force-dynamic";

/** Pastille du menu Outils : sondages ouverts qui me concernent, pas encore votés. */
export async function GET() {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return Response.json({ count: 0 });
  return Response.json({ count: await countPendingPolls(playerId) });
}
