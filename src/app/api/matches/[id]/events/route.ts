import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { publishMatchUpdate } from "@/lib/sse";
import { z } from "zod";

const schema = z.object({
  type: z.enum(["START", "PAUSE", "GOAL", "PENALTY", "TIMEOUT", "TIME_ADJUST", "END"]),
  matchClockSec: z.number().min(0),
  teamId: z.string().optional().nullable(),
  playerId: z.string().optional().nullable(),
  delta: z.number().optional().nullable(),
  timeoutType: z.string().optional().nullable()
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.role || !hasAtLeastRole(session.user.role, "REF")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const match = await prisma.match.findUnique({ where: { id: params.id } });
  if (!match) return new Response("Not found", { status: 404 });

  const payload = {
    teamId: parsed.data.teamId ?? undefined,
    playerId: parsed.data.playerId ?? undefined,
    delta: parsed.data.delta ?? undefined,
    timeoutType: parsed.data.timeoutType ?? undefined
  };

  const event = await prisma.matchEvent.create({
    data: {
      matchId: match.id,
      type: parsed.data.type,
      matchClockSec: parsed.data.matchClockSec,
      payload
    }
  });

  let scoreA = match.scoreA;
  let scoreB = match.scoreB;
  let status = match.status;
  let winnerTeamId = match.winnerTeamId;

  if (parsed.data.type === "GOAL" && parsed.data.teamId) {
    const delta = parsed.data.delta ?? 1;
    if (parsed.data.teamId === match.teamAId) scoreA = Math.max(0, scoreA + delta);
    if (parsed.data.teamId === match.teamBId) scoreB = Math.max(0, scoreB + delta);
  }

  if (parsed.data.type === "START") status = "LIVE";
  if (parsed.data.type === "PAUSE") status = "SCHEDULED";
  if (parsed.data.type === "END") {
    status = "FINISHED";
    if (match.teamAId && match.teamBId) {
      if (scoreA > scoreB) winnerTeamId = match.teamAId;
      if (scoreB > scoreA) winnerTeamId = match.teamBId;
    }
  }

  const updated = await prisma.match.update({
    where: { id: match.id },
    data: { scoreA, scoreB, status, winnerTeamId }
  });

  if (parsed.data.type === "END" && winnerTeamId) {
    if (match.nextMatchWinId && match.nextSlotWin) {
      await prisma.match.update({
        where: { id: match.nextMatchWinId },
        data:
          match.nextSlotWin === "A"
            ? { teamAId: winnerTeamId }
            : { teamBId: winnerTeamId }
      });
    }
    if (match.nextMatchLoseId && match.nextSlotLose && match.teamAId && match.teamBId) {
      const loserId = winnerTeamId === match.teamAId ? match.teamBId : match.teamAId;
      await prisma.match.update({
        where: { id: match.nextMatchLoseId },
        data:
          match.nextSlotLose === "A"
            ? { teamAId: loserId }
            : { teamBId: loserId }
      });
    }
  }

  publishMatchUpdate({
    matchId: match.id,
    tournamentId: match.tournamentId,
    type: "match_event",
    data: { event, match: updated }
  });

  return Response.json({ event, match: updated });
}
