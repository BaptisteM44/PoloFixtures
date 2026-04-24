import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { ScoreOverlay } from "@/components/ScoreOverlay";

export default async function OverlayPage({
  params,
  searchParams,
}: {
  params: { id: string; locale: string };
  searchParams: { court?: string; theme?: string };
}) {
  const tournament = await prisma.tournament.findFirst({
    where: { OR: [{ id: params.id }, { slug: params.id }] },
    select: {
      id: true,
      name: true,
      gameDurationMin: true,
      status: true,
      matches: {
        include: {
          teamA: { select: { id: true, name: true } },
          teamB: { select: { id: true, name: true } },
          events: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { startAt: "asc" },
      },
    },
  });

  if (!tournament) return notFound();

  const court = searchParams.court ?? "1";
  const theme = searchParams.theme ?? "dark";

  return (
    <ScoreOverlay
      tournamentId={tournament.id}
      tournamentName={tournament.name}
      initialMatches={tournament.matches}
      gameDurationMin={tournament.gameDurationMin}
      court={court}
      theme={theme}
    />
  );
}
