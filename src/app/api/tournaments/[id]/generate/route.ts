import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { generatePools, generatePoolMatches, generateBracket } from "@/lib/bracket";
import { z } from "zod";

const schema = z.object({
  type: z.enum(["pools", "bracket"])
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.role || !hasAtLeastRole(session.user.role, "ORGA")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    include: { teams: true, pools: true }
  });

  if (!tournament) return new Response("Not found", { status: 404 });

  if (parsed.data.type === "pools") {
    const pools = generatePools(tournament.teams, tournament.saturdayFormat);
    const courtNames = Array.from({ length: tournament.courtsCount }, (_, i) => `Court ${i + 1}`);
    const startAt = new Date(tournament.dateStart);
    const matches = generatePoolMatches(pools, courtNames, startAt, tournament.gameDurationMin);

    await prisma.$transaction(async (tx) => {
      await tx.match.deleteMany({ where: { tournamentId: tournament.id, phase: "POOL" } });
      await tx.poolTeam.deleteMany({ where: { pool: { tournamentId: tournament.id } } });
      await tx.pool.deleteMany({ where: { tournamentId: tournament.id } });

      for (const pool of pools) {
        const createdPool = await tx.pool.create({
          data: {
            tournamentId: tournament.id,
            name: pool.name,
            session: pool.session ?? null
          }
        });

        await tx.poolTeam.createMany({
          data: pool.teams.map((team) => ({ poolId: createdPool.id, teamId: team.id }))
        });

        const poolMatches = matches.filter((m) => m.poolName === pool.name);
        for (const match of poolMatches) {
          await tx.match.create({
            data: {
              tournamentId: tournament.id,
              phase: match.phase,
              poolId: createdPool.id,
              bracketSide: null,
              roundIndex: match.roundIndex,
              courtName: match.courtName,
              startAt: match.startAt,
              dayIndex: match.dayIndex,
              status: match.status,
              teamAId: match.teamAId,
              teamBId: match.teamBId,
              scoreA: 0,
              scoreB: 0
            }
          });
        }
      }
    });

    return Response.json({ ok: true });
  }

  if (parsed.data.type === "bracket") {
    const courtNames = Array.from({ length: tournament.courtsCount }, (_, i) => `Court ${i + 1}`);
    const startAt = new Date(tournament.dateEnd);
    const matches = generateBracket(tournament.teams, tournament.sundayFormat, courtNames, startAt, tournament.gameDurationMin);

    await prisma.$transaction(async (tx) => {
      await tx.match.deleteMany({ where: { tournamentId: tournament.id, phase: "BRACKET" } });

      const createdMatches = [] as Array<{ id: string; roundIndex: number; bracketSide: string | null; startAt: Date }>;
      for (const match of matches) {
        const created = await tx.match.create({
          data: {
            tournamentId: tournament.id,
            phase: match.phase,
            bracketSide: match.bracketSide ?? null,
            roundIndex: match.roundIndex,
            courtName: match.courtName,
            startAt: match.startAt,
            dayIndex: match.dayIndex,
            status: match.status,
            teamAId: match.teamAId,
            teamBId: match.teamBId,
            scoreA: 0,
            scoreB: 0
          }
        });
        createdMatches.push({ id: created.id, roundIndex: match.roundIndex, bracketSide: created.bracketSide, startAt: created.startAt });
      }

      if (createdMatches.length > 1 && tournament.sundayFormat === "SE") {
        const final = createdMatches.reduce((prev, current) => (current.roundIndex > prev.roundIndex ? current : prev));
        const firstRound = createdMatches.filter((m) => m.roundIndex === 1);
        for (let i = 0; i < firstRound.length; i += 1) {
          await tx.match.update({
            where: { id: firstRound[i].id },
            data: { nextMatchWinId: final.id, nextSlotWin: i === 0 ? "A" : "B" }
          });
        }
      }

      if (createdMatches.length > 1 && tournament.sundayFormat === "DE") {
        const upper1 = createdMatches.filter((m) => m.bracketSide === "W" && m.roundIndex === 1).sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
        const upperFinal = createdMatches.find((m) => m.bracketSide === "W" && m.roundIndex === 2);
        const lowerFinal = createdMatches.find((m) => m.bracketSide === "L" && m.roundIndex === 2);
        const grandFinal = createdMatches.find((m) => m.bracketSide === "G");

        if (upperFinal && lowerFinal && grandFinal) {
          for (let i = 0; i < upper1.length; i += 1) {
            await tx.match.update({
              where: { id: upper1[i].id },
              data: {
                nextMatchWinId: upperFinal.id,
                nextSlotWin: i === 0 ? "A" : "B",
                nextMatchLoseId: lowerFinal.id,
                nextSlotLose: i === 0 ? "A" : "B"
              }
            });
          }

          await tx.match.update({ where: { id: upperFinal.id }, data: { nextMatchWinId: grandFinal.id, nextSlotWin: "A" } });
          await tx.match.update({ where: { id: lowerFinal.id }, data: { nextMatchWinId: grandFinal.id, nextSlotWin: "B" } });
        }
      }
    });

    return Response.json({ ok: true });
  }

  return Response.json({ ok: false }, { status: 400 });
}
