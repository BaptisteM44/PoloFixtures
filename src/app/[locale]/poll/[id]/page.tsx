import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { hashPlayerVoter } from "@/lib/poll-hash";
import { areResultsVisibleToVoters, isPollRestricted, isVoterEligible } from "@/lib/poll-vote";
import { canManagePoll, loadVoterProfile } from "@/lib/poll-access";
import { PollVote, type PollData } from "@/components/PollVote";

export const dynamic = "force-dynamic"; // résultats/état de vote toujours frais

const KNOWN_CONTINENTS = ["EU", "NA", "SA", "AS", "AF", "OC"];

export default async function PollPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { verify?: string };
}) {
  const t = await getTranslations("poll");
  const tHome = await getTranslations("home");

  const poll = await prisma.poll.findUnique({
    where: { id: params.id },
    select: {
      id: true, question: true, description: true, options: true,
      multipleChoice: true, minChoices: true, maxChoices: true, allowComment: true,
      allowGuests: true, guestFields: true, status: true,
      showResults: true, resultsAt: true, closeAt: true,
      createdById: true, blockedAt: true,
      eligibleClubIds: true, eligibleCountries: true, eligibleContinents: true,
    },
  });
  if (!poll || poll.status === "DRAFT") notFound();

  const session = await auth();
  const playerId = session?.user?.playerId;
  const isLoggedIn = !!playerId;
  const isManager = canManagePoll(poll, session);
  const manageHref = isManager ? `/polls/mine/${poll.id}` : null;

  const verifyMsg = searchParams.verify;
  const verifyBanner = verifyMsg && (
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
        verifyMsg === "expired" ? "verify_expired" :
        verifyMsg === "blocked" ? "verify_blocked" : "verify_invalid"
      )}
    </div>
  );

  // Sondage bloqué par la modération : plus de vote ni de résultats publics.
  if (poll.blockedAt) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {verifyBanner}
        <div className="panel" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 10 }}>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 24 }}>{poll.question}</h1>
          <p style={{ margin: 0, color: "var(--danger)", fontWeight: 600 }}>🚫 {t("blocked")}</p>
          {manageHref && <Link href={manageHref} className="ghost" style={{ fontSize: 13, alignSelf: "start" }}>{t("manage_link")}</Link>}
        </div>
      </div>
    );
  }

  // Ciblage : qui peut voter, et le visiteur en fait-il partie ?
  const restricted = isPollRestricted(poll);
  let eligible = true;
  let eligibilityLabel: string | null = null;
  if (restricted) {
    eligible = playerId ? isVoterEligible(poll, await loadVoterProfile(playerId)) : false;
    const clubs = poll.eligibleClubIds.length > 0
      ? await prisma.club.findMany({ where: { id: { in: poll.eligibleClubIds } }, select: { name: true } })
      : [];
    eligibilityLabel = [
      ...clubs.map((c) => c.name),
      ...poll.eligibleCountries,
      ...poll.eligibleContinents.map((code) =>
        KNOWN_CONTINENTS.includes(code) ? tHome(`continent_${code.toLowerCase()}` as never) : code),
    ].join(", ");
  }

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
  // le créateur autorise à les montrer MAINTENANT (showResults). Le créateur et
  // l'admin les voient toujours.
  const canSeeResults = isManager || areResultsVisibleToVoters(poll);
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

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      {verifyBanner}
      <PollVote
        poll={poll as unknown as PollData}
        isLoggedIn={isLoggedIn}
        hasVoted={hasVoted}
        initialResults={initialResults}
        eligibilityLabel={eligibilityLabel}
        eligible={eligible}
        canReport={isLoggedIn && poll.createdById !== playerId}
        manageHref={manageHref}
      />
    </div>
  );
}
