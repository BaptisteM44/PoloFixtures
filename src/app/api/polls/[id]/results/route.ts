import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { areResultsVisibleToVoters } from "@/lib/poll-vote";

/**
 * Résultats AGRÉGÉS et anonymes d'un sondage : nombre de bulletins par option.
 * Ne renvoie JAMAIS de lien votant↔choix (impossible de toute façon, les deux
 * tables n'ont pas de relation). L'orga (admin) peut aussi récupérer la liste
 * des émargements (qui a participé), toujours sans savoir quoi.
 *
 * Visibilité : l'admin voit TOUJOURS les compteurs. Pour un votant normal, les
 * compteurs ne sont renvoyés que si showResults l'autorise MAINTENANT — sinon
 * on renvoie visible:false sans les chiffres (pas juste masqués côté client).
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const poll = await prisma.poll.findUnique({
    where: { id: params.id },
    select: {
      id: true, question: true, description: true, options: true, status: true, allowGuests: true,
      showResults: true, resultsAt: true,
    },
  });
  if (!poll) return new Response("Sondage introuvable", { status: 404 });

  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const visible = isAdmin || areResultsVisibleToVoters(poll);

  const pollOut = { id: poll.id, question: poll.question, description: poll.description, options: poll.options, status: poll.status };

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

  // L'admin voit en plus la liste des participants (émargement) — qui, pas quoi.
  if (isAdmin) {
    const voters = await prisma.pollVoter.findMany({
      where: { pollId: params.id, verified: true },
      select: { isGuest: true, guestInfo: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ ...base, voters });
  }

  return Response.json(base);
}
