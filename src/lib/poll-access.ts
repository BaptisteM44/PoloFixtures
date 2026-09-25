import { prisma } from "@/lib/db";
import { countryToContinent } from "@/lib/country-utils";
import { hashPlayerVoter } from "@/lib/poll-hash";
import { isPollRestricted, isVoterEligible, type PollEligibility, type VoterProfile } from "@/lib/poll-vote";

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

/**
 * Public visé d'un sondage ciblé : joueurs actifs avec compte qui satisfont le
 * ciblage (mêmes règles que le vote, via isVoterEligible). Sondage non ciblé ⇒
 * liste vide : on ne notifie jamais toute la communauté.
 */
export async function findPollAudience(poll: PollEligibility & { createdById: string | null }): Promise<string[]> {
  if (!isPollRestricted(poll)) return [];
  const candidates = await prisma.player.findMany({
    where: {
      status: "ACTIVE",
      account: { isNot: null },
      // Pré-filtre SQL (OU entre les cibles, comme isVoterEligible) ; les
      // continents se déduisent du pays côté JS, donc pas de pré-filtre s'il y en a.
      ...(poll.eligibleContinents.length > 0
        ? {}
        : {
            OR: [
              ...(poll.eligibleClubIds.length > 0
                ? [
                    { clubMemberships: { some: { clubId: { in: poll.eligibleClubIds }, status: "MEMBER" as const } } },
                    { managedClubs: { some: { id: { in: poll.eligibleClubIds } } } },
                  ]
                : []),
              ...poll.eligibleCountries.map((c) => ({ country: { equals: c.trim(), mode: "insensitive" as const } })),
            ],
          }),
    },
    select: {
      id: true,
      country: true,
      clubMemberships: { where: { status: "MEMBER" }, select: { clubId: true } },
      managedClubs: { select: { id: true } },
    },
  });
  return candidates
    .filter((p) => p.id !== poll.createdById)
    .filter((p) => isVoterEligible(poll, {
      country: p.country || null,
      continent: p.country ? countryToContinent(p.country) : null,
      clubIds: [...p.clubMemberships.map((m) => m.clubId), ...p.managedClubs.map((c) => c.id)],
    }))
    .map((p) => p.id);
}

/**
 * Nombre de sondages ouverts qui concernent le joueur et auxquels il n'a pas
 * encore répondu (pastille du menu Outils). Ses propres sondages sont exclus.
 */
export async function countPendingPolls(playerId: string): Promise<number> {
  const now = new Date();
  const polls = await prisma.poll.findMany({
    where: {
      status: "OPEN",
      blockedAt: null,
      AND: [
        // NOT seul exclurait aussi les sondages sans créateur (NULL en SQL).
        { OR: [{ createdById: null }, { createdById: { not: playerId } }] },
        { OR: [{ openAt: null }, { openAt: { lte: now } }] },
        { OR: [{ closeAt: null }, { closeAt: { gte: now } }] },
      ],
    },
    select: { id: true, eligibleClubIds: true, eligibleCountries: true, eligibleContinents: true },
  });
  if (polls.length === 0) return 0;
  const profile = await loadVoterProfile(playerId);
  const eligible = polls.filter((p) => isVoterEligible(p, profile));
  if (eligible.length === 0) return 0;
  const voted = await prisma.pollVoter.count({
    where: {
      verified: true,
      OR: eligible.map((p) => ({ pollId: p.id, voterHash: hashPlayerVoter(p.id, playerId) })),
    },
  });
  return Math.max(0, eligible.length - voted);
}

/** Qui peut gérer un sondage (statut, dates, résultats détaillés) : son créateur ou un admin. */
export function canManagePoll(
  poll: { createdById: string | null },
  session: { user?: { role?: string | null; playerId?: string | null } } | null,
): boolean {
  if (session?.user?.role === "ADMIN") return true;
  return !!session?.user?.playerId && poll.createdById === session.user.playerId;
}
