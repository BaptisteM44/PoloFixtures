import { prisma } from "@/lib/db";
import { countryToContinent } from "@/lib/country-utils";
import type { VoterProfile } from "@/lib/poll-vote";

/** Clubs d'un joueur (membre ou gérant) + pays/continent, pour le ciblage. */
export async function loadVoterProfile(playerId: string): Promise<VoterProfile | null> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      country: true,
      clubMemberships: { where: { status: "MEMBER" }, select: { clubId: true } },
      managedClubs: { select: { id: true } },
    },
  });
  if (!player) return null;
  const clubIds = [...new Set([...player.clubMemberships.map((m) => m.clubId), ...player.managedClubs.map((c) => c.id)])];
  return {
    country: player.country || null,
    continent: player.country ? countryToContinent(player.country) : null,
    clubIds,
  };
}

/** Qui peut gérer un sondage (statut, dates, résultats détaillés) : son créateur ou un admin. */
export function canManagePoll(
  poll: { createdById: string | null },
  session: { user?: { role?: string | null; playerId?: string | null } } | null,
): boolean {
  if (session?.user?.role === "ADMIN") return true;
  return !!session?.user?.playerId && poll.createdById === session.user.playerId;
}
