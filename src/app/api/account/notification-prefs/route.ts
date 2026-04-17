import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.playerId) return new Response("Unauthorized", { status: 401 });

  const prefs = await (prisma as any).notificationPreference.findUnique({
    where: { playerId: session.user.playerId },
  });

  return Response.json(prefs ?? {
    enabled: true,
    continents: [],
    countries: [],
    notifyNewTournaments: true,
    notifyFollowedClosing: true,
    notifySquadInvite: true,
  });
}
