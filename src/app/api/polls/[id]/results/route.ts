import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { areResultsVisibleToVoters } from "@/lib/poll-vote";
import { canManagePoll } from "@/lib/poll-access";

/**
 * Résultats AGRÉGÉS et anonymes d'un sondage : nombre de bulletins par option.
 * Ne renvoie JAMAIS de lien votant↔choix (impossible de toute façon, les deux
 * tables n'ont pas de relation).
 *
 * Visibilité :
 *  - créateur du sondage et admin : compteurs TOUJOURS visibles, + commentaires
 *    anonymes, + répartition des participants par club/ville/pays (sans nom) ;
 *  - admin seulement : la liste NOMINATIVE des participants (émargement) — le
 *    texte montré aux votants promet que leur identité ne sert qu'à l'anti-double
 *    vote et aux stats globales, donc un créateur lambda ne voit pas les noms ;
 *  - votant normal : compteurs seulement si showResults l'autorise MAINTENANT
 *    (sinon visible:false sans les chiffres, pas juste masqués côté client).
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const poll = await prisma.poll.findUnique({
    where: { id: params.id },
    select: {
      id: true, question: true, description: true, options: true, status: true, allowGuests: true,
      showResults: true, resultsAt: true, createdById: true, blockedAt: true, blockedReason: true,
      eligibleClubIds: true, eligibleCountries: true, eligibleContinents: true,
    },
  });
  if (!poll) return new Response("Sondage introuvable", { status: 404 });

  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const isManager = canManagePoll(poll, session);
  const visible = isManager || areResultsVisibleToVoters(poll);

  const pollOut = {
    id: poll.id, question: poll.question, description: poll.description, options: poll.options, status: poll.status,
    // Infos de gestion utiles à la page résultats (créateur/admin uniquement).
    ...(isManager
      ? {
          blockedAt: poll.blockedAt, blockedReason: poll.blockedReason,
          eligibleClubIds: poll.eligibleClubIds, eligibleCountries: poll.eligibleCountries, eligibleContinents: poll.eligibleContinents,
        }
      : {}),
  };

  if (!visible) {
    return Response.json({ poll: pollOut, visible: false, showResults: poll.showResults, resultsAt: poll.resultsAt });
  }

  // Comptage des bulletins par choix (urne).
  const grouped = await prisma.pollBallot.groupBy({
    by: ["choice"],
    where: { pollId: params.id },
    _count: { choice: true },
  });
  const counts: Record<string, number> = {};
  for (const opt of poll.options) counts[opt] = 0;
  for (const g of grouped) counts[g.choice] = g._count.choice;
  const totalBallots = Object.values(counts).reduce((a, b) => a + b, 0);

  // Nombre de votants (émargements vérifiés) — anti-double-vote, pas relié au choix.
  const voterCount = await prisma.pollVoter.count({
    where: { pollId: params.id, verified: true },
  });

  const base = { poll: pollOut, visible: true, counts, totalBallots, voterCount };
  if (!isManager) return Response.json(base);

  // Participants (émargement) — qui, jamais quoi. Pour un INSCRIT on résout son
  // profil (club/ville/pays) ; toujours sans lien vers son choix voté.
  const voters = await prisma.pollVoter.findMany({
    where: { pollId: params.id, verified: true },
    select: {
      isGuest: true, guestInfo: true, createdAt: true,
      player: {
        select: {
          name: true, city: true, country: true,
          clubMemberships: {
            where: { status: "MEMBER" },
            take: 1,
            select: { club: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Commentaires ANONYMES (attachés aux bulletins) — visibles sans savoir qui
  // les a écrits (aucun lien bulletin↔votant).
  const commentBallots = await prisma.pollBallot.findMany({
    where: { pollId: params.id, comment: { not: null } },
    select: { comment: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const comments = commentBallots.map((b) => ({ comment: b.comment, createdAt: b.createdAt }));

  const pick = (info: unknown, ...keys: string[]): string | null => {
    const o = (info ?? {}) as Record<string, unknown>;
    for (const k of keys) if (typeof o[k] === "string" && (o[k] as string).trim()) return (o[k] as string).trim();
    return null;
  };

  // Répartition démographique SANS identité (créateur et admin).
  const demographics = voters.map((v) => ({
    isGuest: v.isGuest,
    club: v.player?.clubMemberships[0]?.club.name ?? pick(v.guestInfo, "club"),
    city: v.player?.city ?? pick(v.guestInfo, "city", "ville"),
    country: v.player?.country ?? pick(v.guestInfo, "country", "pays"),
  }));

  // Liste nominative : admin uniquement.
  const votersOut = isAdmin
    ? voters.map((v) => ({
        isGuest: v.isGuest,
        guestInfo: v.guestInfo,
        createdAt: v.createdAt,
        player: v.player
          ? { name: v.player.name, city: v.player.city, country: v.player.country, club: v.player.clubMemberships[0]?.club.name ?? null }
          : null,
      }))
    : undefined;

  return Response.json({ ...base, comments, demographics, voters: votersOut, canSeeParticipants: isAdmin });
}
