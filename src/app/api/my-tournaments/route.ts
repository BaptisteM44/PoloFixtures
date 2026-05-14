import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { syncLiveTournamentsCompletion } from "@/lib/tournament-status";

export async function GET() {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  await syncLiveTournamentsCompletion();

  // Get all teams the player belongs to, with tournament + teammates
  const teamPlayers = await prisma.teamPlayer.findMany({
    where: { playerId },
    include: {
      team: {
        include: {
          tournament: {
            select: {
              id: true,
              slug: true,
              name: true,
              city: true,
              country: true,
              dateStart: true,
              dateEnd: true,
              status: true,
              bannerPath: true,
            },
          },
          players: {
            include: {
              player: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  photoPath: true,
                  country: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { team: { tournament: { dateStart: "desc" } } },
  });

  const entries = teamPlayers.map((tp) => ({
    teamId: tp.team.id,
    teamName: tp.team.name,
    teamColor: tp.team.color,
    isCaptain: tp.isCaptain,
    tournament: tp.team.tournament,
    teammates: tp.team.players
      .map((p) => ({
        id: p.player.id,
        name: p.player.name,
        slug: p.player.slug,
        photoPath: p.player.photoPath,
        country: p.player.country,
        isCaptain: p.isCaptain,
      }))
      .sort((a, b) => (a.isCaptain === b.isCaptain ? 0 : a.isCaptain ? -1 : 1)),
  }));

  // Tournaments created by this player
  const createdTournaments = await prisma.tournament.findMany({
    where: { creatorId: playerId },
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      country: true,
      dateStart: true,
      dateEnd: true,
      status: true,
      approved: true,
      bannerPath: true,
      _count: { select: { teams: true } },
    },
    orderBy: { dateStart: "desc" },
  });

  // Tournaments where player is a co-organizer (role ORGA, not REF), excluding ones already created
  const createdIds = new Set(createdTournaments.map((t) => t.id));
  const coOrgLinks = await prisma.tournamentOrganizer.findMany({
    where: { playerId, role: "ORGA" },
    include: {
      tournament: {
        select: {
          id: true,
          slug: true,
          name: true,
          city: true,
          country: true,
          dateStart: true,
          dateEnd: true,
          status: true,
          approved: true,
          bannerPath: true,
          _count: { select: { teams: true } },
        },
      },
    },
    orderBy: { tournament: { dateStart: "desc" } },
  });

  const coOrganizedTournaments = coOrgLinks
    .map((link) => link.tournament)
    .filter((t) => !createdIds.has(t.id));

  return NextResponse.json({ entries, createdTournaments, coOrganizedTournaments });
}
