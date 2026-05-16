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
  const playerId = session?.user?.playerId;
  const role = session?.user?.role;
  const isAdmin = !!role && hasAtLeastRole(role, "ADMIN");

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    include: { teams: true, pools: true, coOrganizers: { select: { playerId: true } } }
  });

  if (!tournament) return new Response("Not found", { status: 404 });

  const isCreator = !!playerId && tournament.creatorId === playerId;
  const isCoOrga = !!playerId && tournament.coOrganizers.some((co) => co.playerId === playerId);
  const isScopedOrga = !!role && role === "ORGA" && session?.user?.tournamentId === params.id;
  if (!isAdmin && !isCreator && !isCoOrga && !isScopedOrga) {
    return new Response("Unauthorized", { status: 401 });
  }

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

      const createdMatches = [] as Array<{ id: string; roundIndex: number; positionInRound: number; bracketSide: string | null; startAt: Date }>;
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
            positionInRound: match.positionInRound ?? 0,
            teamAId: match.teamAId,
            teamBId: match.teamBId,
            scoreA: 0,
            scoreB: 0
          }
        });
        createdMatches.push({ id: created.id, roundIndex: match.roundIndex, positionInRound: match.positionInRound ?? 0, bracketSide: created.bracketSide, startAt: created.startAt });
      }

      if (createdMatches.length > 1 && tournament.sundayFormat === "SE") {
        // Wire each SE match to the next round match based on positionInRound
        // Only include W/G bracketSide matches (exclude "L" = 3rd place)
        const mainMatches = createdMatches.filter((m) => m.bracketSide !== "L");
        const roundNums = [...new Set(mainMatches.map((m) => m.roundIndex))].sort((a, b) => a - b);

        for (let ri = 0; ri < roundNums.length - 1; ri++) {
          const curRound = mainMatches.filter((m) => m.roundIndex === roundNums[ri])
            .sort((a, b) => a.positionInRound - b.positionInRound);
          const nextRound = mainMatches.filter((m) => m.roundIndex === roundNums[ri + 1])
            .sort((a, b) => a.positionInRound - b.positionInRound);

          for (let i = 0; i < curRound.length; i++) {
            const nextPos = Math.floor(i / 2);
            const nextMatch = nextRound[nextPos];
            if (nextMatch) {
              await tx.match.update({
                where: { id: curRound[i].id },
                data: { nextMatchWinId: nextMatch.id, nextSlotWin: i % 2 === 0 ? "A" : "B" }
              });
            }
          }
        }
      }

      if (createdMatches.length > 1 && tournament.sundayFormat === "DE") {
        // ── Full DE linking for any number of teams ──────────────────────
        // Groups by side + roundIndex
        const byWB = new Map<number, typeof createdMatches>();
        const byLB = new Map<number, typeof createdMatches>();
        for (const m of createdMatches) {
          if (m.bracketSide === "W") {
            if (!byWB.has(m.roundIndex)) byWB.set(m.roundIndex, []);
            byWB.get(m.roundIndex)!.push(m);
          } else if (m.bracketSide === "L") {
            if (!byLB.has(m.roundIndex)) byLB.set(m.roundIndex, []);
            byLB.get(m.roundIndex)!.push(m);
          }
        }
        // Sort each round by positionInRound
        for (const arr of [...byWB.values(), ...byLB.values()]) {
          arr.sort((a, b) => a.positionInRound - b.positionInRound);
        }

        const wbRounds = [...byWB.keys()].sort((a, b) => a - b);
        const lbRounds = [...byLB.keys()].sort((a, b) => a - b);
        const maxWB = Math.max(...wbRounds);
        const maxLB = lbRounds.length > 0 ? Math.max(...lbRounds) : 0;
        const grandFinal = createdMatches.find((m) => m.bracketSide === "G");

        // ── WB: wire winners forward, losers down to LB ─────────────────
        // WB Rk loser → LB injection round R(2k-2) for k≥2, or LB R1 for k=1
        // WB Rk winner → WB R(k+1)
        for (const wbRound of wbRounds) {
          const wbMatches = byWB.get(wbRound)!;
          const nextWB = byWB.get(wbRound + 1);

          // Determine target LB injection round for losers of WB Rk
          // WB R1 losers → LB R1 (consolidation)
          // WB Rk (k≥2) losers → LB R(2k-2) (injection)
          const lbInjectRound = wbRound === 1 ? 1 : 2 * wbRound - 2;
          const lbInjectMatches = byLB.get(lbInjectRound);

          for (let i = 0; i < wbMatches.length; i++) {
            const updates: Record<string, unknown> = {};

            // Winner → next WB round
            if (nextWB) {
              const nextPos = Math.floor(i / 2);
              const target = nextWB[nextPos];
              if (target) {
                updates.nextMatchWinId = target.id;
                updates.nextSlotWin = i % 2 === 0 ? "A" : "B";
              }
            } else if (grandFinal && wbRound === maxWB) {
              // WB Final winner → GF slot A
              updates.nextMatchWinId = grandFinal.id;
              updates.nextSlotWin = "A";
            }

            // Loser → LB injection round
            if (lbInjectMatches && lbInjectMatches.length > 0) {
              // Map WB position to LB slot
              // WB R1: losers pair off in LB R1, position i → match floor(i/2), slot i%2
              // WB Rk (k≥2): loser at position i → LB inject match i (1:1 mapping)
              let lbMatchIdx: number;
              let lbSlot: "A" | "B";
              if (wbRound === 1) {
                lbMatchIdx = Math.floor(i / 2);
                lbSlot = i % 2 === 0 ? "A" : "B";
              } else {
                lbMatchIdx = i;
                lbSlot = "B"; // WB losers always fill slot B in injection rounds
              }
              const lbTarget = lbInjectMatches[lbMatchIdx];
              if (lbTarget) {
                updates.nextMatchLoseId = lbTarget.id;
                updates.nextSlotLose = lbSlot;
              }
            }

            if (Object.keys(updates).length > 0) {
              await tx.match.update({ where: { id: wbMatches[i].id }, data: updates });
            }
          }
        }

        // ── LB: wire winners through consolidation → injection → … → GF ─
        // LB rounds alternate: odd = consolidation (survivors pair off),
        //                       even = injection (LB survivor vs WB loser)
        // Winner of LB Rk → LB R(k+1), winner of last LB → GF slot B
        for (const lbRound of lbRounds) {
          const lbMatches = byLB.get(lbRound)!;
          const nextLB = byLB.get(lbRound + 1);

          for (let i = 0; i < lbMatches.length; i++) {
            const updates: Record<string, unknown> = {};

            if (nextLB && nextLB.length > 0) {
              // Odd LB round (consolidation): 2 winners → 1 next match
              // Even LB round (injection): winner → next consolidation match 1:1
              let nextPos: number;
              let nextSlot: "A" | "B";
              if (lbRound % 2 === 1) {
                // consolidation: pairs feed into injection round
                nextPos = Math.floor(i / 2);
                nextSlot = i % 2 === 0 ? "A" : "B";
              } else {
                // injection: 1:1 into next consolidation
                nextPos = i;
                nextSlot = i % 2 === 0 ? "A" : "B";
              }
              const target = nextLB[nextPos];
              if (target) {
                updates.nextMatchWinId = target.id;
                updates.nextSlotWin = nextSlot;
              }
            } else if (grandFinal && lbRound === maxLB) {
              // Last LB match winner → GF slot B
              updates.nextMatchWinId = grandFinal.id;
              updates.nextSlotWin = "B";
            }

            if (Object.keys(updates).length > 0) {
              await tx.match.update({ where: { id: lbMatches[i].id }, data: updates });
            }
          }
        }
      }
    });

    return Response.json({ ok: true });
  }

  return Response.json({ ok: false }, { status: 400 });
}
