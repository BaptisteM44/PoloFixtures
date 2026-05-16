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
        // ── DE linking — mirrors generateDoubleElim structure ────────────
        // Rules:
        //   WB R1 losers → LB R1 (consolidation: pair off, i → match floor(i/2), slot i%2)
        //   WB Rk (k≥2) losers → LB injection round (even LB round), slot B
        //   LB odd rounds = consolidation: winner → next LB match floor(i/2), slot i%2
        //   LB even rounds = injection: winner → next LB match i, slot A
        //   Last LB winner → GF slot B. WB final winner → GF slot A.

        const { nextPowerOf2 } = await import("@/lib/bracket");
        const N = tournament.teams.length;
        const size = nextPowerOf2(N);
        const upperRounds = Math.log2(size);

        // Group matches by side + roundIndex
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
        for (const arr of [...byWB.values(), ...byLB.values()]) {
          arr.sort((a, b) => a.positionInRound - b.positionInRound);
        }

        const wbRounds = [...byWB.keys()].sort((a, b) => a - b);
        const lbRounds = [...byLB.keys()].sort((a, b) => a - b);
        const maxWB = Math.max(...wbRounds);
        const maxLB = lbRounds.length > 0 ? Math.max(...lbRounds) : 0;
        const grandFinal = createdMatches.find((m) => m.bracketSide === "G");

        // ── Build wbRound → lbInjectionRound mapping ─────────────────
        // Replay the same logic as generateDoubleElim to find which LB
        // round index receives losers from each WB round.
        const w1 = (byWB.get(1) ?? []).length;
        const w2 = size / 4;
        const wbLosers: number[] = [0, w1, w2];
        for (let k = 3; k <= upperRounds; k++) wbLosers[k] = size / Math.pow(2, k);

        const wbToLBInj = new Map<number, number>();
        // WB R1 → LB R1 (consolidation, always)
        wbToLBInj.set(1, 1);

        let lbSurvivors = Math.floor(w1 / 2) + (w1 % 2);
        let lbRI = 2; // next LB round index to assign
        let wbInj = 2; // next WB round whose losers will be injected

        while (wbInj <= upperRounds) {
          // Even LB round = injection
          wbToLBInj.set(wbInj, lbRI++);
          const wbLos = wbLosers[wbInj];
          const injCount = Math.min(lbSurvivors, wbLos);
          lbSurvivors = injCount + Math.abs(lbSurvivors - wbLos);
          wbInj++;

          // Odd LB round = consolidation (if needed)
          if (lbSurvivors > 1 && wbInj <= upperRounds) {
            lbRI++; // consolidation round exists
            lbSurvivors = Math.floor(lbSurvivors / 2) + (lbSurvivors % 2);
          }
        }
        // Final consolidation rounds after all injections
        while (lbSurvivors > 1) {
          lbRI++;
          lbSurvivors = Math.floor(lbSurvivors / 2) + (lbSurvivors % 2);
        }

        // ── WB: wire winners forward, losers down to LB ─────────────────
        for (const wbRound of wbRounds) {
          const wbMatches = byWB.get(wbRound)!;
          const nextWB = byWB.get(wbRound + 1);

          for (let i = 0; i < wbMatches.length; i++) {
            const updates: Record<string, unknown> = {};

            // Winner → next WB round or GF
            if (nextWB) {
              const target = nextWB[Math.floor(i / 2)];
              if (target) { updates.nextMatchWinId = target.id; updates.nextSlotWin = i % 2 === 0 ? "A" : "B"; }
            } else if (grandFinal && wbRound === maxWB) {
              updates.nextMatchWinId = grandFinal.id;
              updates.nextSlotWin = "A";
            }

            // Loser → LB
            const lbTargetRound = wbToLBInj.get(wbRound);
            const lbTargetMatches = lbTargetRound !== undefined ? (byLB.get(lbTargetRound) ?? []) : [];

            if (wbRound === 1) {
              // WB R1 losers pair off in LB R1 (consolidation)
              const lbMatchIdx = Math.floor(i / 2);
              const lbSlot: "A" | "B" = i % 2 === 0 ? "A" : "B";
              const target = lbTargetMatches[lbMatchIdx];
              if (target) { updates.nextMatchLoseId = target.id; updates.nextSlotLose = lbSlot; }
            } else {
              // WB Rk (k≥2) losers → injection round, match i, slot B
              const target = lbTargetMatches[i];
              if (target) { updates.nextMatchLoseId = target.id; updates.nextSlotLose = "B"; }
            }

            if (Object.keys(updates).length > 0) {
              await tx.match.update({ where: { id: wbMatches[i].id }, data: updates });
            }
          }
        }

        // ── LB: wire winners forward ─────────────────────────────────────
        // Determine consolidation vs injection by comparing match counts
        // with the next LB round.
        for (const lbRound of lbRounds) {
          const lbMatches = byLB.get(lbRound)!;
          const nextLB = byLB.get(lbRound + 1);

          for (let i = 0; i < lbMatches.length; i++) {
            const updates: Record<string, unknown> = {};

            if (nextLB && nextLB.length > 0) {
              // Fewer matches in next round → this round is consolidation (2→1)
              // Same or more matches → this round is injection (1→1)
              const isConsolidation = nextLB.length < lbMatches.length;
              if (isConsolidation) {
                const target = nextLB[Math.floor(i / 2)];
                if (target) { updates.nextMatchWinId = target.id; updates.nextSlotWin = i % 2 === 0 ? "A" : "B"; }
              } else {
                const target = nextLB[i];
                if (target) { updates.nextMatchWinId = target.id; updates.nextSlotWin = "A"; }
              }
            } else if (grandFinal && lbRound === maxLB) {
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
