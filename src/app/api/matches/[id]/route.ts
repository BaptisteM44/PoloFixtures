import { prisma } from "@/lib/db";
import { CHANGEOVER_MIN, slotMinutes } from "@/lib/match-timing";
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { publishMatchUpdate, publishNewMatches, publishTournamentUpdate } from "@/lib/sse";
import { syncTournamentCompletionById } from "@/lib/tournament-status";
import { autoFillReferees, isRefereeTeamMember, remindNextUp } from "@/lib/referees";
import { z } from "zod";
import { apiMsg } from "@/lib/api-messages";

const schema = z.object({
  status: z.enum(["SCHEDULED", "LIVE", "FINISHED"]).optional(),
  scoreA: z.number().optional(),
  scoreB: z.number().optional(),
  teamAId: z.string().nullable().optional(),
  teamBId: z.string().nullable().optional(),
  refereePlayerId: z.string().nullable().optional(),
  coRefereePlayerId: z.string().nullable().optional(),
  courtName: z.string().optional(),
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
  // Rôle par code d'accès : un code REF/ORGA lié à un tournoi ne vaut que pour
  // CE tournoi (avant, il permettait de modifier les matchs de n'importe quel
  // tournoi). Un code sans tournoi reste global, comme sur la page arbitre.
  const role = session?.user?.role;
  const codeTournament = session?.user?.tournamentId;
  const hasRole = role === "ADMIN" ||
    (!!role && hasAtLeastRole(role, "REF") && (!codeTournament || codeTournament === existing.tournamentId));
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
  // Arbitre désigné : le joueur lui-même, ou un joueur de l'équipe arbitre.
  const isAssignedReferee = playerId != null &&
    (existing.refereePlayerId === playerId || existing.coRefereePlayerId === playerId
      || await isRefereeTeamMember(playerId, existing.refereeTeamId));
  if (!hasRole && !isOrganizer && !isAssignedReferee) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Team assignment: allowed on any match (for bracket corrections / manual overrides)

  const scoreA = parsed.data.scoreA ?? existing.scoreA ?? 0;
  const scoreB = parsed.data.scoreB ?? existing.scoreB ?? 0;

  // Pipeline (nouveau système) : délègue entièrement à applyScore() du moteur
  // — propagation, GF reset, avancement de round Swiss, fin d'étape/tournoi.
  // Un seul chemin de score pour un match de phase STAGE, qu'il vienne du
  // vrai arbitrage (MatchEditPanel/RefereePanel) ou du bac à sable.
  if (existing.phase === "STAGE" && parsed.data.status === "FINISHED") {
    const { applyScore } = await import("@/engine/pipeline-server");
    // IDs des matchs du stage AVANT — pour détecter un round auto-généré (Swiss)
    const beforeIds = new Set(
      (await prisma.match.findMany({ where: { stageId: existing.stageId! }, select: { id: true } })).map((m) => m.id)
    );
    const result = await applyScore(existing.id, scoreA, scoreB);
    if (result.error) return Response.json({ error: result.error }, { status: 422 });
    const updated = await prisma.match.findUniqueOrThrow({ where: { id: existing.id } });
    publishMatchUpdate({ matchId: existing.id, tournamentId: existing.tournamentId, type: "match_update", data: updated });

    // Matchs remplis par la propagation (vainqueur/perdant → match suivant) : push SSE
    for (const nextId of [existing.nextMatchWinId, existing.nextMatchLoseId]) {
      if (!nextId) continue;
      const next = await prisma.match.findUnique({ where: { id: nextId }, include: { teamA: true, teamB: true } });
      if (next) publishMatchUpdate({ matchId: next.id, tournamentId: existing.tournamentId, type: "match_update", data: next });
    }

    // Round auto-généré (ex: Swiss round suivant) : push SSE "new_matches"
    // → le planning affiche le nouveau round sans recharger la page
    const created = await prisma.match.findMany({
      where: { stageId: existing.stageId!, id: { notIn: [...beforeIds] } },
      include: { teamA: true, teamB: true },
    });
    if (created.length > 0) {
      publishNewMatches({
        tournamentId: existing.tournamentId,
        type: "new_matches",
        matches: created as unknown as Record<string, unknown>[],
      });
    }

    // Arbitrage par équipe : équipes du tour suivant connues → désignations
    // complétées ; les suivants sur le terrain sont prévenus.
    await autoFillReferees(existing.tournamentId);
    remindNextUp(existing.tournamentId);
    const newStatus = await syncTournamentCompletionById(existing.tournamentId, { duringActivity: true });
    if (newStatus === "COMPLETED") {
      publishTournamentUpdate({ tournamentId: existing.tournamentId, type: "tournament_completed", status: "COMPLETED" });
    }
    return Response.json(updated);
  }

  // Block finishing a BRACKET match on a draw
  if (parsed.data.status === "FINISHED" && existing.phase === "BRACKET" && scoreA === scoreB) {
    return Response.json({ error: apiMsg("bracket_draw_close") }, { status: 422 });
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
        const slotMin = slotMinutes(tournament?.gameDurationMin);

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
          let cursor = new Date(realFinishTime.getTime() + CHANGEOVER_MIN * 60 * 1000);

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

  if (isNowFinished) await autoFillReferees(match.tournamentId);
  if (isNowFinished || (parsed.data.status === "LIVE" && existing.status !== "LIVE")) remindNextUp(match.tournamentId);
  const newStatus = await syncTournamentCompletionById(match.tournamentId, { duringActivity: true });
  if (newStatus === "COMPLETED") {
    publishTournamentUpdate({
      tournamentId: match.tournamentId,
      type: "tournament_completed",
      status: "COMPLETED",
    });
  }

  return Response.json(match);
}
