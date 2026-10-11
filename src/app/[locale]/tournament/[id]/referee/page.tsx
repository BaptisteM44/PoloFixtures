import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { TournamentRefereePanel } from "@/components/TournamentRefereePanelLoader";

export default async function RefereeMatchPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { token?: string };
}) {
  const session = await auth();
  const role = session?.user?.role;
  const playerId = session?.user?.playerId ?? null;
  const tokenParam = searchParams?.token ?? null;

  // Token URL access: bypass auth if token matches
  const tokenTournament = tokenParam
    ? await prisma.tournament.findFirst({
        where: { OR: [{ id: params.id }, { slug: params.id }], refToken: tokenParam },
        select: { id: true },
      })
    : null;
  const hasTokenAccess = !!tokenTournament;

  if (!hasTokenAccess && !role && !playerId) {
    redirect(`/login?next=/tournament/${params.id}/referee`);
  }

  const tournament = await prisma.tournament.findFirst({
    where: { OR: [{ id: params.id }, { slug: params.id }] },
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

  const fullAccess =
    hasTokenAccess || isAdmin || isOrgaForTournament || isRefForTournament || isCreator || isCoOrga;

  // Arbitrage par équipe : un joueur de l'équipe désignée accède au panneau,
  // limité aux matchs que son équipe arbitre (encore à jouer).
  const myTeamIds = playerId
    ? (await prisma.teamPlayer.findMany({ where: { playerId, team: { tournamentId: tournament.id } }, select: { teamId: true } })).map((x) => x.teamId)
    : [];
  const refereedMatches = !fullAccess && myTeamIds.length > 0
    ? tournament.matches.filter((m) => m.refereeTeamId && myTeamIds.includes(m.refereeTeamId) && m.status !== "FINISHED")
    : [];
  const hasAccess = fullAccess || refereedMatches.length > 0;

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
        slug: tournament.slug,
        name: tournament.name,
        gameDurationMin: tournament.gameDurationMin,
        currentPlayerId: playerId,
        myTeamIds,
        teams: tournament.teams.map((t) => ({
          id: t.id,
          name: t.name,
          color: t.color,
          players: t.players.map((tp) => ({
            id: tp.player.id,
            name: tp.player.name,
          })),
        })),
        matches: (fullAccess ? tournament.matches : refereedMatches).map((m) => ({
          id: m.id,
          phase: m.phase,
          bracketSide: m.bracketSide ?? null,
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
          refereePlayerId: m.refereePlayerId ?? null,
          coRefereePlayerId: m.coRefereePlayerId ?? null,
          refereeTeamId: m.refereeTeamId ?? null,
          refereeTeamName: tournament.teams.find((t) => t.id === m.refereeTeamId)?.name ?? null,
          events: m.events.map((e) => ({
            id: e.id,
            type: e.type,
            matchClockSec: e.matchClockSec,
            payload: e.payload as Record<string, unknown>,
            createdAt: e.createdAt.toISOString(),
          })),
        })),
      }}
      canManageRefs={!!canManageRefs}
      showAllMatches={!!fullAccess}
    />
  );
}
