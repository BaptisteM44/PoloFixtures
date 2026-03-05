import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { publishMatchUpdate, publishNewMatches } from "@/lib/sse";
import { generateSwissRoundAction } from "@/app/[locale]/tournament/[id]/edit/actions";
import { z } from "zod";

const schema = z.object({
  status: z.enum(["SCHEDULED", "LIVE", "FINISHED"]).optional(),
  scoreA: z.number().optional(),
  scoreB: z.number().optional()
});

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.role || !hasAtLeastRole(session.user.role, "REF")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Fetch match before update to check current state and next-match links
  const existing = await prisma.match.findUnique({ where: { id: params.id } });
  if (!existing) return new Response("Not found", { status: 404 });

  const match = await prisma.match.update({
    where: { id: params.id },
    data: parsed.data
  });

  // Cascade: when a match becomes FINISHED, advance winner to next match
  const isNowFinished = parsed.data.status === "FINISHED" && existing.status !== "FINISHED";
  const scoreA = parsed.data.scoreA ?? existing.scoreA ?? 0;
  const scoreB = parsed.data.scoreB ?? existing.scoreB ?? 0;

  if (isNowFinished) {
    const winnerId = scoreA >= scoreB ? existing.teamAId : existing.teamBId;
    const loserId = scoreA >= scoreB ? existing.teamBId : existing.teamAId;

    if (winnerId && match.nextMatchWinId) {
      await prisma.match.update({
        where: { id: match.nextMatchWinId },
        data:
          match.nextSlotWin === "A"
            ? { teamAId: winnerId }
            : { teamBId: winnerId }
      });
    }

    if (loserId && match.nextMatchLoseId && match.nextSlotLose) {
      await prisma.match.update({
        where: { id: match.nextMatchLoseId },
        data:
          match.nextSlotLose === "A"
            ? { teamAId: loserId }
            : { teamBId: loserId }
      });
    }
  }

  // Auto-advance: when a match finishes, set the next SCHEDULED match on the same court to LIVE
  if (isNowFinished) {
    const nextOnCourt = await prisma.match.findFirst({
      where: {
        tournamentId: match.tournamentId,
        courtName: match.courtName,
        status: "SCHEDULED",
      },
      orderBy: { startAt: "asc" },
    });

    if (nextOnCourt) {
      const advanced = await prisma.match.update({
        where: { id: nextOnCourt.id },
        data: { status: "LIVE" },
      });
      publishMatchUpdate({
        matchId: advanced.id,
        tournamentId: advanced.tournamentId,
        type: "match_update",
        data: advanced,
      });
    }
  }

  // Auto-generate next Swiss round when all matches of current round are finished
  if (isNowFinished && match.phase === "SWISS") {
    const roundMatches = await prisma.match.findMany({
      where: { tournamentId: match.tournamentId, phase: "SWISS", roundIndex: match.roundIndex }
    });
    const allDone = roundMatches.every((m) => m.status === "FINISHED");
    if (allDone) {
      const result = await generateSwissRoundAction(match.tournamentId).catch(() => null);
      if (result && "round" in result && result.round) {
        // Fetch newly created matches and broadcast them via SSE
        const newMatches = await prisma.match.findMany({
          where: { tournamentId: match.tournamentId, phase: "SWISS", roundIndex: result.round },
          include: { teamA: true, teamB: true },
        });
        if (newMatches.length > 0) {
          publishNewMatches({
            tournamentId: match.tournamentId,
            type: "new_matches",
            matches: newMatches as unknown as Record<string, unknown>[],
          });
        }
      }
    }
  }

  publishMatchUpdate({
    matchId: match.id,
    tournamentId: match.tournamentId,
    type: "match_update",
    data: match
  });

  return Response.json(match);
}
