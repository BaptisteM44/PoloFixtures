import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { hashPlayerVoter } from "@/lib/poll-hash";
import { areResultsVisibleToVoters } from "@/lib/poll-vote";
import { PollVote, type PollData } from "@/components/PollVote";

export const dynamic = "force-dynamic"; // résultats/état de vote toujours frais

export default async function PollPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { verify?: string };
}) {
  const t = await getTranslations("poll");

  const poll = await prisma.poll.findUnique({
    where: { id: params.id },
    select: {
      id: true, question: true, description: true, options: true,
      multipleChoice: true, minChoices: true, maxChoices: true, allowComment: true,
      allowGuests: true, guestFields: true, status: true,
      showResults: true, resultsAt: true, closeAt: true,
    },
  });
  if (!poll || poll.status === "DRAFT") notFound();

  const session = await auth();
  const playerId = session?.user?.playerId;
  const isAdmin = session?.user?.role === "ADMIN";
  const isLoggedIn = !!playerId;

  // Un inscrit a-t-il déjà voté ? On recalcule son hash et on cherche l'émargement.
  let hasVoted = false;
  if (playerId) {
    const voterHash = hashPlayerVoter(poll.id, playerId);
    const existing = await prisma.pollVoter.findUnique({
      where: { pollId_voterHash: { pollId: poll.id, voterHash } },
      select: { verified: true },
    });
    hasVoted = !!existing?.verified;
  }

  // Résultats agrégés — seulement si le votant a voté (ou sondage fermé) ET que
  // l'orga autorise à les montrer MAINTENANT (showResults). L'admin voit toujours.
  const canSeeResults = isAdmin || areResultsVisibleToVoters(poll);
  let initialResults = null;
  if ((hasVoted || poll.status === "CLOSED") && canSeeResults) {
    const grouped = await prisma.pollBallot.groupBy({
      by: ["choice"], where: { pollId: poll.id }, _count: { choice: true },
    });
    const counts: Record<string, number> = {};
    for (const opt of poll.options) counts[opt] = 0;
    for (const g of grouped) counts[g.choice] = g._count.choice;
    const totalBallots = Object.values(counts).reduce((a, b) => a + b, 0);
    const voterCount = await prisma.pollVoter.count({ where: { pollId: poll.id, verified: true } });
    initialResults = { counts, totalBallots, voterCount };
  }

  const verifyMsg = searchParams.verify;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      {verifyMsg && (
        <div
          style={{
            padding: "12px 16px", borderRadius: 10,
            border: "2px solid var(--border)",
            background: verifyMsg === "success" ? "var(--teal)" : "var(--yellow)",
            fontWeight: 600, fontSize: 14,
          }}
        >
          {t(
            verifyMsg === "success" ? "verify_success" :
            verifyMsg === "already" ? "verify_already" :
            verifyMsg === "expired" ? "verify_expired" : "verify_invalid"
          )}
        </div>
      )}
      <PollVote
        poll={poll as unknown as PollData}
        isLoggedIn={isLoggedIn}
        hasVoted={hasVoted}
        initialResults={initialResults}
      />
    </div>
  );
}
