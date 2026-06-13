import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { publishMatchUpdate, publishNewMatches, publishTournamentUpdate } from "@/lib/sse";
import { syncTournamentCompletionById } from "@/lib/tournament-status";
import { generateSwissRoundAction } from "@/app/[locale]/tournament/[id]/edit/actions";
import {
  generateFridaySwissRoundAction,
  generateSaturdaySwissRoundAction,
  generateSundaySwissRoundAction,
  computeSaturdayGroupsAction,
} from "@/app/[locale]/tournament/[id]/edit/berlin-mixed-actions";
import { z } from "zod";

const schema = z.object({
  status: z.enum(["SCHEDULED", "LIVE", "FINISHED"]).optional(),
  scoreA: z.number().optional(),
  scoreB: z.number().optional(),
  teamAId: z.string().nullable().optional(),
  teamBId: z.string().nullable().optional(),
  refereePlayerId: z.string().nullable().optional(),
  coRefereePlayerId: z.string().nullable().optional(),
});

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Fetch match before update to check current state and next-match links
  const existing = await prisma.match.findUnique({ where: { id: params.id } });
  if (!existing) return new Response("Not found", { status: 404 });

  // Auth: allow REF/ADMIN/ORGA roles OR tournament creator/co-organizer
  const hasRole = session?.user?.role && hasAtLeastRole(session.user.role, "REF");
  let isOrganizer = false;
  const playerId = session?.user?.playerId;
  if (!hasRole && playerId) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: existing.tournamentId },
      select: { creatorId: true, coOrganizers: { select: { playerId: true } } },
    });
    isOrganizer = tournament?.creatorId === playerId ||
      tournament?.coOrganizers.some((co) => co.playerId === playerId) || false;
  }
  const isAssignedReferee = playerId != null &&
    (existing.refereePlayerId === playerId || existing.coRefereePlayerId === playerId);
  if (!hasRole && !isOrganizer && !isAssignedReferee) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Team assignment: allowed on any match (for bracket corrections / manual overrides)

  const scoreA = parsed.data.scoreA ?? existing.scoreA ?? 0;
  const scoreB = parsed.data.scoreB ?? existing.scoreB ?? 0;

  // Block finishing a BRACKET match on a draw
  if (parsed.data.status === "FINISHED" && existing.phase === "BRACKET" && scoreA === scoreB) {
    return Response.json({ error: "Impossible de clôturer un match de bracket sur une égalité. Un vainqueur est obligatoire." }, { status: 422 });
  }

  const match = await prisma.match.update({
    where: { id: params.id },
    data: parsed.data
  });

  // Cascade: when a match becomes FINISHED, advance winner to next match
  const isNowFinished = parsed.data.status === "FINISHED" && existing.status !== "FINISHED";
  const wasAlreadyFinished = parsed.data.status === "FINISHED" && existing.status === "FINISHED";
  const advancedMatchesPut: Record<string, unknown>[] = [];

  // Helper to propagate winner/loser into next matches
  const propagateBracket = async (winnerId: string | null, loserId: string | null) => {
    if (winnerId) {
      await prisma.match.update({ where: { id: match.id }, data: { winnerTeamId: winnerId } });
    }
    if (winnerId && match.nextMatchWinId) {
      const updatedWin = await prisma.match.update({
        where: { id: match.nextMatchWinId },
        data: match.nextSlotWin === "A" ? { teamAId: winnerId } : { teamBId: winnerId },
        include: { teamA: true, teamB: true }
      });
      advancedMatchesPut.push(updatedWin);
    }
    if (loserId && match.nextMatchLoseId && match.nextSlotLose) {
      const updatedLose = await prisma.match.update({
        where: { id: match.nextMatchLoseId },
        data: match.nextSlotLose === "A" ? { teamAId: loserId } : { teamBId: loserId },
        include: { teamA: true, teamB: true }
      });
      advancedMatchesPut.push(updatedLose);
    }
  };

  if (isNowFinished && existing.phase === "BRACKET") {
    const winnerId = scoreA > scoreB ? existing.teamAId : existing.teamBId;
    const loserId = winnerId === existing.teamAId ? existing.teamBId : existing.teamAId;
    await propagateBracket(winnerId, loserId);

    // GF Reset: if this is the Grand Final (bracketSide "G") and the LB player wins,
    // activate the reset match (bracketSide "BG") with both teams.
    // Convention: WB player = slot A, LB player = slot B in the GF.
    if (existing.bracketSide === "G") {
      const lbPlayerId = existing.teamBId; // LB always feeds GF slot B
      const lbPlayerWon = winnerId === lbPlayerId;
      if (lbPlayerWon) {
        const resetMatch = await prisma.match.findFirst({
          where: { tournamentId: existing.tournamentId, bracketSide: "BG" },
        });
        if (resetMatch) {
          const updated = await prisma.match.update({
            where: { id: resetMatch.id },
            data: { teamAId: existing.teamAId, teamBId: existing.teamBId },
            include: { teamA: true, teamB: true },
          });
          advancedMatchesPut.push(updated);
        }
      }
    }
  } else if (isNowFinished) {
    // Non-bracket: original logic (draw allowed)
    const winnerId = scoreA > scoreB ? existing.teamAId : scoreB > scoreA ? existing.teamBId : null;
    const loserId = winnerId === existing.teamAId ? existing.teamBId : existing.teamAId;
    if (winnerId) {
      await prisma.match.update({ where: { id: match.id }, data: { winnerTeamId: winnerId } });
    }
    if (winnerId && match.nextMatchWinId) {
      const updatedWin = await prisma.match.update({
        where: { id: match.nextMatchWinId },
        data: match.nextSlotWin === "A" ? { teamAId: winnerId } : { teamBId: winnerId },
        include: { teamA: true, teamB: true }
      });
      advancedMatchesPut.push(updatedWin);
    }
    if (loserId && match.nextMatchLoseId && match.nextSlotLose) {
      const updatedLose = await prisma.match.update({
        where: { id: match.nextMatchLoseId },
        data: match.nextSlotLose === "A" ? { teamAId: loserId } : { teamBId: loserId },
        include: { teamA: true, teamB: true }
      });
      advancedMatchesPut.push(updatedLose);
    }
  } else if (wasAlreadyFinished && existing.phase === "BRACKET") {
    // Score correction on already-finished BRACKET match: re-propagate with new winner
    const newWinnerId = scoreA > scoreB ? existing.teamAId : existing.teamBId;
    const newLoserId = newWinnerId === existing.teamAId ? existing.teamBId : existing.teamAId;
    const oldWinnerId = existing.winnerTeamId;

    // Only re-propagate if winner changed
    if (newWinnerId !== oldWinnerId) {
      await propagateBracket(newWinnerId, newLoserId);
    }
  }

  // Auto-advance + cascade reschedule: fire-and-forget in background
  if (isNowFinished) {
    (async () => {
      try {
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
            const isFirst = i === 0;
            const newData: Record<string, unknown> = { startAt: new Date(cursor) };
            if (isFirst && m.status === "SCHEDULED") newData.status = "LIVE";

            const updated = await prisma.match.update({
              where: { id: m.id },
              data: newData,
            });
            publishMatchUpdate({
              matchId: updated.id,
              tournamentId: updated.tournamentId,
              type: "match_update",
              data: updated,
            });

            cursor = new Date(cursor.getTime() + slotMin * 60 * 1000);
          }
        }
      } catch {
        // Non-blocking: reschedule failure doesn't affect the save response
      }
    })();
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

  // Auto-generate next Berlin Mixed round when all matches of current round are finished
  const berlinPhases = ["FRIDAY_A", "FRIDAY_B", "SATURDAY_A", "SATURDAY_B", "SUNDAY_SWISS"] as const;
  type BerlinPhase = typeof berlinPhases[number];
  if (isNowFinished && berlinPhases.includes(match.phase as BerlinPhase)) {
    const tid = match.tournamentId;
    const phase = match.phase as BerlinPhase;
    const roundMatches = await prisma.match.findMany({
      where: { tournamentId: tid, phase, roundIndex: match.roundIndex },
    });
    const allDone = roundMatches.every((m) => m.status === "FINISHED");
    if (allDone) {
      (() => {
        // Run in background — non-blocking
        (async () => {
          try {
            const tournament = await prisma.tournament.findUnique({
              where: { id: tid },
              select: { fridayRounds: true, saturdayRounds: true, sundayRounds: true },
            });
            const fridayRounds = (tournament as any)?.fridayRounds ?? 5;
            const saturdayRounds = (tournament as any)?.saturdayRounds ?? 5;
            const sundayRounds = (tournament as any)?.sundayRounds ?? 2;

            let result: any = null;
            if (phase === "FRIDAY_A" || phase === "FRIDAY_B") {
              if (match.roundIndex < fridayRounds) {
                result = await generateFridaySwissRoundAction(tid, phase === "FRIDAY_A" ? "A" : "B");
              } else {
                // Last round finished — check if both groups are fully done and sat groups not yet assigned
                const alreadyAssigned = await prisma.team.count({ where: { tournamentId: tid, saturdayGroup: { not: null } } });
                if (alreadyAssigned === 0) {
                  const friAUnfinished = await prisma.match.count({ where: { tournamentId: tid, phase: "FRIDAY_A", roundIndex: fridayRounds, status: { not: "FINISHED" } } });
                  const friBUnfinished = await prisma.match.count({ where: { tournamentId: tid, phase: "FRIDAY_B", roundIndex: fridayRounds, status: { not: "FINISHED" } } });
                  const friAExists = await prisma.match.count({ where: { tournamentId: tid, phase: "FRIDAY_A", roundIndex: fridayRounds } });
                  const friBExists = await prisma.match.count({ where: { tournamentId: tid, phase: "FRIDAY_B", roundIndex: fridayRounds } });
                  if (friAUnfinished === 0 && friBUnfinished === 0 && friAExists > 0 && friBExists > 0) {
                    await computeSaturdayGroupsAction(tid);
                  }
                }
              }
            } else if (phase === "SATURDAY_A" && match.roundIndex < saturdayRounds) {
              result = await generateSaturdaySwissRoundAction(tid, "A");
            } else if (phase === "SATURDAY_B" && match.roundIndex < saturdayRounds) {
              result = await generateSaturdaySwissRoundAction(tid, "B");
            } else if (phase === "SUNDAY_SWISS" && match.roundIndex < sundayRounds) {
              result = await generateSundaySwissRoundAction(tid);
            }

            if (result && !("error" in result)) {
              const newPhase = phase;
              const newRound = match.roundIndex + 1;
              const newMatches = await prisma.match.findMany({
                where: { tournamentId: tid, phase: newPhase, roundIndex: newRound },
                include: { teamA: true, teamB: true },
              });
              if (newMatches.length > 0) {
                publishNewMatches({ tournamentId: tid, type: "new_matches", matches: newMatches as unknown as Record<string, unknown>[] });
              }
            }
          } catch { /* non-blocking */ }
        })();
      })();
    }
  }

  publishMatchUpdate({
    matchId: match.id,
    tournamentId: match.tournamentId,
    type: "match_update",
    data: match
  });

  // Broadcaster les matches avancés (bracket)
  for (const adv of advancedMatchesPut) {
    const advMatch = adv as { id: string };
    publishMatchUpdate({
      matchId: advMatch.id,
      tournamentId: match.tournamentId,
      type: "match_update",
      data: adv
    });
  }

  const newStatus = await syncTournamentCompletionById(match.tournamentId);
  if (newStatus === "COMPLETED") {
    publishTournamentUpdate({
      tournamentId: match.tournamentId,
      type: "tournament_completed",
      status: "COMPLETED",
    });
  }

  return Response.json(match);
}
