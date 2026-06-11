import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, city: true, country: true, dateStart: true, dateEnd: true, slug: true },
  });
  if (!tournament) return new Response("Not found", { status: 404 });

  const matches = await prisma.match.findMany({
    where: { tournamentId: params.id },
    include: {
      teamA: { select: { id: true, name: true } },
      teamB: { select: { id: true, name: true } },
      events: { orderBy: { matchClockSec: "asc" } },
    },
    orderBy: [{ phase: "asc" }, { roundIndex: "asc" }, { positionInRound: "asc" }],
  });

  const data = {
    tournament: {
      id: tournament.id,
      slug: tournament.slug,
      name: tournament.name,
      city: tournament.city,
      country: tournament.country,
      dateStart: tournament.dateStart,
      dateEnd: tournament.dateEnd,
    },
    matches: matches.map((m) => ({
      id: m.id,
      phase: m.phase,
      bracketSide: m.bracketSide,
      roundIndex: m.roundIndex,
      positionInRound: m.positionInRound,
      courtName: m.courtName,
      startAt: m.startAt,
      status: m.status,
      teamA: m.teamA ? { id: m.teamA.id, name: m.teamA.name } : null,
      teamB: m.teamB ? { id: m.teamB.id, name: m.teamB.name } : null,
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      events: m.events.map((e) => ({
        id: e.id,
        type: e.type,
        clockSec: e.matchClockSec,
        payload: e.payload,
      })),
    })),
  };

  return Response.json(data, {
    headers: {
      "Content-Disposition": `attachment; filename="export_${tournament.slug ?? tournament.id}.json"`,
    },
  });
}
