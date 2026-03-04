import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { TournamentRefereePanel } from "@/components/TournamentRefereePanel";

export default async function RefereeMatchPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const role = session?.user?.role;
  const playerId = session?.user?.playerId ?? null;

  if (!role && !playerId) {
    redirect(`/login?next=/tournament/${params.id}/referee`);
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    include: {
      teams: {
        where: { selected: true },
        include: {
          players: { include: { player: { select: { id: true, name: true } } } },
        },
        orderBy: { seed: "asc" },
      },
      matches: {
        include: { teamA: true, teamB: true, events: { orderBy: { createdAt: "asc" } } },
        orderBy: [{ dayIndex: "asc" }, { startAt: "asc" }],
      },
      coOrganizers: { select: { playerId: true, role: true } },
    },
  });

  if (!tournament) return notFound();

  // ── Vérification des droits ──────────────────────────────────────────────
  const isAdmin = role === "ADMIN";
  const isOrgaForTournament =
    role === "ORGA" && session?.user?.tournamentId === tournament.id;
  const isRefForTournament =
    role === "REF" &&
    (!session?.user?.tournamentId || session.user.tournamentId === tournament.id);
  const isCreator = playerId && playerId === tournament.creatorId;
  const isCoOrga =
    playerId && tournament.coOrganizers.some((co) => co.playerId === playerId);

  const hasAccess =
    isAdmin || isOrgaForTournament || isRefForTournament || isCreator || isCoOrga;

  if (!hasAccess) {
    redirect(`/tournament/${params.id}?error=unauthorized`);
  }

  const canManageRefs =
    isAdmin || isOrgaForTournament || isCreator ||
    (playerId && tournament.coOrganizers.some((co) => co.playerId === playerId && co.role === "ORGA"));

  return (
    <TournamentRefereePanel
      tournament={{
        id: tournament.id,
        name: tournament.name,
        gameDurationMin: tournament.gameDurationMin,
        teams: tournament.teams.map((t) => ({
          id: t.id,
          name: t.name,
          color: t.color,
          players: t.players.map((tp) => ({
            id: tp.player.id,
            name: tp.player.name,
          })),
        })),
        matches: tournament.matches.map((m) => ({
          id: m.id,
          phase: m.phase,
          roundIndex: m.roundIndex,
          courtName: m.courtName,
          dayIndex: m.dayIndex,
          startAt: m.startAt.toISOString(),
          status: m.status,
          teamAId: m.teamAId,
          teamBId: m.teamBId,
          teamAName: m.teamA?.name ?? null,
          teamBName: m.teamB?.name ?? null,
          scoreA: m.scoreA,
          scoreB: m.scoreB,
          events: m.events.map((e) => ({
            id: e.id,
            type: e.type,
            matchClockSec: e.matchClockSec,
            payload: e.payload as Record<string, unknown>,
          })),
        })),
      }}
      canManageRefs={!!canManageRefs}
    />
  );
}
