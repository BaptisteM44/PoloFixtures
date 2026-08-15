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

  const payload: Record<string, unknown> = {
    teamId: parsed.data.teamId ?? undefined,
    playerId: parsed.data.playerId ?? undefined,
    delta: parsed.data.delta ?? undefined,
    timeoutType: parsed.data.timeoutType ?? undefined
  };

  // Resolve player name to store in payload for display in live feed
  if (parsed.data.playerId) {
    const player = await prisma.player.findUnique({
      where: { id: parsed.data.playerId },
      select: { name: true }
    });
    if (player?.name) payload.playerName = player.name;
  }

  let scoreA = match.scoreA;
  let scoreB = match.scoreB;
  let status = match.status;
  let winnerTeamId = match.winnerTeamId;
  let goldenGoal = match.goldenGoal;
  // Les buts sont écrits ATOMIQUEMENT via increment (voir plus bas). L'update
  // final ne doit alors PAS réécrire scoreA/scoreB : sinon il remet les valeurs
  // lues en début de requête (périmées) et écrase les buts d'une saisie
  // concurrente sur l'autre équipe — d'où des scores faux type « 2-2 → 3-0 ».
  let scoreTouchedAtomically = false;

  // GOAL et GOLDEN_GOAL utilisent un increment atomique en base pour éviter
  // qu'un but soit perdu si deux requêtes lisent le score au même instant
  // (double clic rapide, arbitre + co-arbitre simultanés).
  if (parsed.data.type === "GOAL" && parsed.data.teamId) {
    const delta = parsed.data.delta ?? 1;
    if (parsed.data.teamId === match.teamAId) {
      const locked = await prisma.match.update({ where: { id: match.id }, data: { scoreA: { increment: delta } }, select: { scoreA: true } });
      // Garde-fou anti-négatif : ré-clamp atomiquement à 0 sans réécrire scoreB.
      if (locked.scoreA < 0) {
        const fixed = await prisma.match.update({ where: { id: match.id }, data: { scoreA: 0 }, select: { scoreA: true } });
        scoreA = fixed.scoreA;
      } else {
        scoreA = locked.scoreA;
      }
      scoreTouchedAtomically = true;
    }
    if (parsed.data.teamId === match.teamBId) {
      const locked = await prisma.match.update({ where: { id: match.id }, data: { scoreB: { increment: delta } }, select: { scoreB: true } });
      if (locked.scoreB < 0) {
        const fixed = await prisma.match.update({ where: { id: match.id }, data: { scoreB: 0 }, select: { scoreB: true } });
        scoreB = fixed.scoreB;
      } else {
        scoreB = locked.scoreB;
      }
      scoreTouchedAtomically = true;
    }
  }

  // Golden goal: score +1 for the team, end the match, mark goldenGoal = true
  if (parsed.data.type === "GOLDEN_GOAL" && parsed.data.teamId) {
    if (parsed.data.teamId === match.teamAId) {
      const locked = await prisma.match.update({ where: { id: match.id }, data: { scoreA: { increment: 1 } }, select: { scoreA: true } });
      scoreA = locked.scoreA;
      winnerTeamId = match.teamAId;
      scoreTouchedAtomically = true;
    }
    if (parsed.data.teamId === match.teamBId) {
      const locked = await prisma.match.update({ where: { id: match.id }, data: { scoreB: { increment: 1 } }, select: { scoreB: true } });
      scoreB = locked.scoreB;
      winnerTeamId = match.teamBId;
      scoreTouchedAtomically = true;
    }
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
    // Relit le score FRAIS en base : des GOAL concurrents ont pu arriver depuis
    // le findUnique initial, donc match.scoreA/scoreB en mémoire peuvent être
    // périmés — on ne veut pas désigner un mauvais vainqueur (ni un faux nul).
    const fresh = await prisma.match.findUniqueOrThrow({ where: { id: match.id }, select: { scoreA: true, scoreB: true } });
    scoreA = fresh.scoreA;
    scoreB = fresh.scoreB;
    // Block ending a BRACKET match on a draw
    if (match.phase === "BRACKET" && scoreA === scoreB) {
      return Response.json({ error: "Impossible de terminer un match de bracket sur une égalité. Utilisez le Golden Goal pour désigner un vainqueur." }, { status: 422 });
    }
    status = "FINISHED";
    if (match.teamAId && match.teamBId) {
      if (scoreA > scoreB) winnerTeamId = match.teamAId;
      else if (scoreB > scoreA) winnerTeamId = match.teamBId;
      else winnerTeamId = null; // nul explicite (poules) : pas de vainqueur
    }
  }

  const event = await prisma.matchEvent.create({
    data: {
      matchId: match.id,
      type: parsed.data.type,
      matchClockSec: parsed.data.matchClockSec,
      payload: payload as Parameters<typeof prisma.matchEvent.create>[0]["data"]["payload"]
    }
  });

  // On n'inclut scoreA/scoreB dans l'update QUE s'ils n'ont pas déjà été gérés
  // atomiquement (GOAL/GOLDEN_GOAL) — évite d'écraser une saisie concurrente.
  const updated = await prisma.match.update({
    where: { id: match.id },
    data: {
      status,
      winnerTeamId,
      goldenGoal,
      ...(scoreTouchedAtomically ? {} : { scoreA, scoreB }),
    },
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
