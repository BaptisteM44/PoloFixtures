import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { publishMatchUpdate, publishNewMatches } from "@/lib/sse";
import { syncTournamentCompletionById } from "@/lib/tournament-status";
import { generateSwissRoundAction } from "@/app/[locale]/tournament/[id]/edit/actions";
import { z } from "zod";

const schema = z.object({
  type: z.enum(["START", "PAUSE", "GOAL", "GOLDEN_GOAL", "PENALTY", "TIMEOUT", "TIME_ADJUST", "END", "SWAP_SIDES"]),
  matchClockSec: z.number().min(0),
  teamId: z.string().optional().nullable(),
  playerId: z.string().optional().nullable(),
  delta: z.number().optional().nullable(),
  timeoutType: z.string().optional().nullable()
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const match = await prisma.match.findUnique({ where: { id: params.id }, include: { tournament: { select: { gfReset: true } } } });
  if (!match) return new Response("Not found", { status: 404 });

  // Auth: allow REF/ADMIN/ORGA roles OR tournament creator/co-organizer
  const hasRole = session?.user?.role && hasAtLeastRole(session.user.role, "REF");
  let isOrganizer = false;
  const playerId = session?.user?.playerId;
  if (!hasRole && playerId) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: match.tournamentId },
      select: { creatorId: true, coOrganizers: { select: { playerId: true } } },
    });
    isOrganizer = tournament?.creatorId === playerId ||
      tournament?.coOrganizers.some((co) => co.playerId === playerId) || false;
  }
  const isAssignedReferee = playerId != null &&
    (match.refereePlayerId === playerId || match.coRefereePlayerId === playerId);
  if (!hasRole && !isOrganizer && !isAssignedReferee) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = {
    teamId: parsed.data.teamId ?? undefined,
    playerId: parsed.data.playerId ?? undefined,
    delta: parsed.data.delta ?? undefined,
    timeoutType: parsed.data.timeoutType ?? undefined
  };

  let scoreA = match.scoreA;
  let scoreB = match.scoreB;
  let status = match.status;
  let winnerTeamId = match.winnerTeamId;
  let goldenGoal = match.goldenGoal;

  if (parsed.data.type === "GOAL" && parsed.data.teamId) {
    const delta = parsed.data.delta ?? 1;
    if (parsed.data.teamId === match.teamAId) scoreA = Math.max(0, scoreA + delta);
    if (parsed.data.teamId === match.teamBId) scoreB = Math.max(0, scoreB + delta);
  }

  // Golden goal: score +1 for the team, end the match, mark goldenGoal = true
  if (parsed.data.type === "GOLDEN_GOAL" && parsed.data.teamId) {
    if (parsed.data.teamId === match.teamAId) { scoreA += 1; winnerTeamId = match.teamAId; }
    if (parsed.data.teamId === match.teamBId) { scoreB += 1; winnerTeamId = match.teamBId; }
    status = "FINISHED";
    goldenGoal = true;
  }

  if (parsed.data.type === "START") {
    // Block START if another match on the same court is already LIVE
    const alreadyLive = await prisma.match.findFirst({
      where: { tournamentId: match.tournamentId, courtName: match.courtName, status: "LIVE", id: { not: match.id } },
    });
    if (alreadyLive) {
      return Response.json({ error: "Un match est déjà en cours sur ce terrain." }, { status: 409 });
    }
    status = "LIVE";
  }
  // PAUSE garde le match LIVE — c'est juste une pause du chrono local
  if (parsed.data.type === "END") {
    // Block ending a BRACKET match on a draw
    if (match.phase === "BRACKET" && scoreA === scoreB) {
      return Response.json({ error: "Impossible de terminer un match de bracket sur une égalité. Utilisez le Golden Goal pour désigner un vainqueur." }, { status: 422 });
    }
    status = "FINISHED";
    if (match.teamAId && match.teamBId) {
      if (scoreA > scoreB) winnerTeamId = match.teamAId;
      if (scoreB > scoreA) winnerTeamId = match.teamBId;
    }
  }

  const event = await prisma.matchEvent.create({
    data: {
      matchId: match.id,
      type: parsed.data.type,
      matchClockSec: parsed.data.matchClockSec,
      payload
    }
  });

  const updated = await prisma.match.update({
    where: { id: match.id },
    data: { scoreA, scoreB, status, winnerTeamId, goldenGoal }
  });

  const triggerAdvance = (parsed.data.type === "END" || parsed.data.type === "GOLDEN_GOAL") && winnerTeamId;
  const advancedMatches: Record<string, unknown>[] = [];

  if (triggerAdvance) {
    if (match.nextMatchWinId && match.nextSlotWin) {
      const updatedWin = await prisma.match.update({
        where: { id: match.nextMatchWinId },
        data:
          match.nextSlotWin === "A"
            ? { teamAId: winnerTeamId }
            : { teamBId: winnerTeamId },
        include: { teamA: true, teamB: true }
      });
      advancedMatches.push(updatedWin);
    }
    if (match.nextMatchLoseId && match.nextSlotLose && match.teamAId && match.teamBId) {
      const loserId = winnerTeamId === match.teamAId ? match.teamBId : match.teamAId;
      const updatedLose = await prisma.match.update({
        where: { id: match.nextMatchLoseId },
        data:
          match.nextSlotLose === "A"
            ? { teamAId: loserId }
            : { teamBId: loserId },
        include: { teamA: true, teamB: true }
      });
      advancedMatches.push(updatedLose);
    }
  }

  // GF Reset: if this is the Grand Final and the LB winner (teamB) wins,
  // activate the bracket reset match with both teams.
  // Supports both DE (bracketSide=G, roundIndex=1, reset=G/2) and
  // MTP_DE (bracketSide=G, roundIndex=7, reset=BG/8)
  const isNowFinishedGF = status === "FINISHED" && match.status !== "FINISHED"
    && match.bracketSide === "G"
    && (match as any).tournament?.gfReset;
  if (isNowFinishedGF && winnerTeamId && match.teamAId && match.teamBId) {
    // LB winner is teamB (slot B = LB side). If teamB wins, reset is needed.
    const lbWinnerId = match.teamBId;
    if (winnerTeamId === lbWinnerId) {
      // Try both reset formats: DE (G/roundIndex+1) and MTP_DE (BG/roundIndex+1)
      const resetMatch = await prisma.match.findFirst({
        where: {
          tournamentId: match.tournamentId,
          bracketSide: { in: ["G", "BG"] },
          roundIndex: match.roundIndex + 1,
        },
      });
      if (resetMatch) {
        // WB champ = teamA, LB champ = teamB (same sides as GF)
        const updatedReset = await prisma.match.update({
          where: { id: resetMatch.id },
          data: { teamAId: match.teamAId, teamBId: match.teamBId, status: "SCHEDULED" },
          include: { teamA: true, teamB: true },
        });
        advancedMatches.push(updatedReset);
      }
    }
  }

  // Auto-advance + cascade reschedule: when a match finishes, shift all upcoming matches on same court
  const isNowFinished = status === "FINISHED" && match.status !== "FINISHED";
  if (isNowFinished) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: match.tournamentId },
      select: { gameDurationMin: true },
    });
    const slotMin = (tournament?.gameDurationMin ?? 15) + 4;

    const upcomingOnCourt = await prisma.match.findMany({
      where: {
        tournamentId: match.tournamentId,
        courtName: match.courtName,
        status: { in: ["SCHEDULED", "LIVE"] },
      },
      orderBy: { startAt: "asc" },
    });

    if (upcomingOnCourt.length > 0) {
      const realFinishTime = new Date();
      let cursor = new Date(realFinishTime.getTime() + 4 * 60 * 1000);

      for (let i = 0; i < upcomingOnCourt.length; i++) {
        const m = upcomingOnCourt[i];
        const newData: Record<string, unknown> = { startAt: new Date(cursor) };
        if (i === 0 && m.status === "SCHEDULED") newData.status = "LIVE";

        const cascaded = await prisma.match.update({ where: { id: m.id }, data: newData });
        publishMatchUpdate({ matchId: cascaded.id, tournamentId: cascaded.tournamentId, type: "match_update", data: cascaded });

        cursor = new Date(cursor.getTime() + slotMin * 60 * 1000);
      }
    }
  }

  // Auto-generate next Swiss round when all matches of current round are finished
  if (isNowFinished && match.phase === "SWISS") {
    const roundMatches = await prisma.match.findMany({
      where: { tournamentId: match.tournamentId, phase: "SWISS", roundIndex: match.roundIndex },
    });
    const allDone = roundMatches.every((m) => m.status === "FINISHED");
    if (allDone) {
      const result = await generateSwissRoundAction(match.tournamentId).catch(() => null);
      if (result && "round" in result && result.round) {
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

  // Broadcaster le match terminé
  publishMatchUpdate({
    matchId: match.id,
    tournamentId: match.tournamentId,
    type: "match_event",
    data: { event, match: updated }
  });

  // Broadcaster chaque match avancé (pour que les panels se mettent à jour)
  for (const adv of advancedMatches) {
    const advMatch = adv as { id: string };
    publishMatchUpdate({
      matchId: advMatch.id,
      tournamentId: match.tournamentId,
      type: "match_update",
      data: adv
    });
  }

  await syncTournamentCompletionById(match.tournamentId);

  return Response.json({ event, match: updated, advancedMatches });
}
