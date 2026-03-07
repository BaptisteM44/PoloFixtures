import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Returns the current playerId if the session user is an organizer
 * of the given tournament (ADMIN, creator, or co-organizer).
 * Returns null otherwise.
 */
export async function getOrgaPlayerId(tournamentId: string): Promise<string | null> {
  const session = await auth();
  if (!session?.user) return null;

  const role = session.user.role;
  const playerId = session.user.playerId;

  if (role === "ADMIN") return playerId ?? "admin";

  if (!playerId) return null;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { creatorId: true },
  });
  if (tournament?.creatorId === playerId) return playerId;

  const coOrg = await prisma.tournamentOrganizer.findUnique({
    where: { tournamentId_playerId: { tournamentId, playerId } },
  });
  if (coOrg) return playerId;

  if (role === "ORGA" && session.user.tournamentId === tournamentId) return playerId;

  return null;
}
