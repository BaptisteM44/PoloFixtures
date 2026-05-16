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
        // ── DE linking — mirrors generateDoubleElim structure exactly ────────────
        // Per-branch (r2Pos) classification:
        //   2 WB R1 losers → LB R1 consolidation; WB R2 loser injects at LB R2
        //   1 WB R1 loser  → WB R1 loser vs WB R2 loser in LB R1
        //   0 WB R1 losers → WB R2 loser BYEs to LB R2 (no LB R1 match)
        // WB R3+ losers inject into subsequent LB rounds.
        // LB winners: consolidation round → floor(i/2), slot i%2; injection → same index, slot A.

        const { nextPowerOf2 } = await import("@/lib/bracket");
        const N = tournament.teams.length;
        const size = nextPowerOf2(N);
        const upperRounds = Math.log2(size);

        // Group matches by side + roundIndex, sorted by positionInRound
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

        // ── Classify r2Pos branches (mirrors generateDoubleElim logic) ──────────
        const w1 = (byWB.get(1) ?? []).length;
        const w2 = size / 4;

        // WB R1 real match positions (by positionInRound, sorted)
        const wbR1Matches = byWB.get(1) ?? [];
        const wbR1RealPositions = wbR1Matches.map((m) => m.positionInRound);

        const r2PosWithR1Loser = new Map<number, number[]>();
        for (const pos of wbR1RealPositions) {
          const r2Pos = Math.floor(pos / 2);
          if (!r2PosWithR1Loser.has(r2Pos)) r2PosWithR1Loser.set(r2Pos, []);
          r2PosWithR1Loser.get(r2Pos)!.push(pos);
        }

        const lbR1ConsolidationR2Pos: number[] = []; // 2 WB R1 losers consolidate; WB R2 loser → LB R2
        const lbR1InjectionR2Pos: number[] = [];     // 1 WB R1 loser faces WB R2 loser in LB R1
        const lbR1ByeR2Pos: number[] = [];           // 0 WB R1 losers; WB R2 loser BYEs to LB R2

        for (let r2Pos = 0; r2Pos < w2; r2Pos++) {
          const count = (r2PosWithR1Loser.get(r2Pos) ?? []).length;
          if (count >= 2) lbR1ConsolidationR2Pos.push(r2Pos);
          else if (count === 1) lbR1InjectionR2Pos.push(r2Pos);
          else lbR1ByeR2Pos.push(r2Pos);
        }

        // LB R1 match index: consolidation matches come first (sorted by r2Pos),
        // then injection matches (sorted by r2Pos) — mirrors emitRound order.
        // Actually bracket.ts emits lbR1ConsolidationR2Pos + lbR1InjectionR2Pos in r2Pos order combined,
        // but we need to know which LB R1 match corresponds to which r2Pos.
        // The order is: all r2Pos with >=1 WB R1 loser, iterated 0..w2-1 → those with count>0.
        const lbR1R2PosOrder: number[] = []; // ordered list of r2Pos that generated a LB R1 match
        for (let r2Pos = 0; r2Pos < w2; r2Pos++) {
          const count = (r2PosWithR1Loser.get(r2Pos) ?? []).length;
          if (count > 0) lbR1R2PosOrder.push(r2Pos);
        }
        // lbR1R2PosOrder[i] → LB R1 match at index i

        // ── Build wbRound → lbRound mapping for WB R2+ losers ───────────────────
        const lbR1Count = lbR1R2PosOrder.length;
        const lbR2Teams = lbR1Count + lbR1ConsolidationR2Pos.length + lbR1ByeR2Pos.length;

        const wbToLBRound = new Map<number, number>(); // wbRound → LB round that gets those losers
        let lbRI = 1;
        if (lbR1Count > 0) lbRI = 2; // LB R1 exists, so LB R2 is next
        // WB R2 losers (consolidation and BYE branches) → LB R2
        wbToLBRound.set(2, lbRI);
        let lbSurvivors = Math.floor(lbR2Teams / 2) + (lbR2Teams % 2);
        lbRI++;

        for (let k = 3; k <= upperRounds; k++) {
          const wbCount = size / Math.pow(2, k);
          // Injection round
          wbToLBRound.set(k, lbRI);
          const injCount = Math.min(lbSurvivors, wbCount);
          lbSurvivors = injCount + Math.abs(lbSurvivors - wbCount);
          lbRI++;

          // Consolidation (if more WB rounds remain and lbSurvivors > 1)
          if (k < upperRounds && lbSurvivors > 1) {
            const consCount = Math.floor(lbSurvivors / 2);
            lbSurvivors = consCount + (lbSurvivors % 2);
            lbRI++;
          }
        }

        // ── WB R1: wire winners and losers ───────────────────────────────────────
        const wbR2Matches = byWB.get(2) ?? [];
        for (let i = 0; i < wbR1Matches.length; i++) {
          const m = wbR1Matches[i];
          const pos = m.positionInRound;
          const r2Pos = Math.floor(pos / 2);
          const nextWBMatch = wbR2Matches[r2Pos]; // WB R2 match this feeds into
          const updates: Record<string, unknown> = {};

          // Winner → WB R2
          if (nextWBMatch) {
            updates.nextMatchWinId = nextWBMatch.id;
            updates.nextSlotWin = pos % 2 === 0 ? "A" : "B";
          }

          // Loser → LB R1
          const lbR1Matches = byLB.get(1) ?? [];
          const lbR1Idx = lbR1R2PosOrder.indexOf(r2Pos);
          if (lbR1Idx >= 0 && lbR1Matches[lbR1Idx]) {
            const r1LosersForR2Pos = r2PosWithR1Loser.get(r2Pos) ?? [];
            if (r1LosersForR2Pos.length >= 2) {
              // Consolidation: 2 WB R1 losers pair off (slot A = first loser, slot B = second)
              const posInPair = r1LosersForR2Pos.indexOf(pos);
              updates.nextMatchLoseId = lbR1Matches[lbR1Idx].id;
              updates.nextSlotLose = posInPair === 0 ? "A" : "B";
            } else {
              // Injection: this WB R1 loser faces the WB R2 loser (slot B)
              updates.nextMatchLoseId = lbR1Matches[lbR1Idx].id;
              updates.nextSlotLose = "B";
            }
          }

          if (Object.keys(updates).length > 0) {
            await tx.match.update({ where: { id: m.id }, data: updates });
          }
        }

        // ── WB R2: wire winners and losers ───────────────────────────────────────
        // LB R2 pairing (interleaved): pair[i] = (LBR1winner[i], WBR2loser-entering-LBR2[i])
        //   WB R2 losers that enter LB R2 = consolidation branches + BYE branches, in r2Pos order
        const wbR2ToLBR2: number[] = []; // ordered r2Pos of WB R2 losers that enter LB R2
        for (let r2Pos = 0; r2Pos < w2; r2Pos++) {
          if (!lbR1InjectionR2Pos.includes(r2Pos)) wbR2ToLBR2.push(r2Pos);
        }
        const lbR2RoundIdx = lbR1Count > 0 ? 2 : 1;
        const lbR2Matches = byLB.get(lbR2RoundIdx) ?? [];

        for (let i = 0; i < wbR2Matches.length; i++) {
          const m = wbR2Matches[i];
          const r2Pos = i;
          const updates: Record<string, unknown> = {};

          // Winner → WB R3 (or GF if no WB R3)
          const nextWB = byWB.get(3);
          if (nextWB) {
            const target = nextWB[Math.floor(i / 2)];
            if (target) { updates.nextMatchWinId = target.id; updates.nextSlotWin = i % 2 === 0 ? "A" : "B"; }
          } else if (grandFinal && maxWB === 2) {
            updates.nextMatchWinId = grandFinal.id;
            updates.nextSlotWin = "A";
          }

          // Loser → LB
          if (lbR1InjectionR2Pos.includes(r2Pos)) {
            // WB R2 loser goes to LB R1 slot A (paired with WB R1 loser at slot B)
            const lbR1Idx = lbR1R2PosOrder.indexOf(r2Pos);
            const lbR1Match = (byLB.get(1) ?? [])[lbR1Idx];
            if (lbR1Match) {
              updates.nextMatchLoseId = lbR1Match.id;
              updates.nextSlotLose = "A";
            }
          } else {
            // Consolidation or BYE branch: WB R2 loser goes to LB R2
            const toR2Idx = wbR2ToLBR2.indexOf(r2Pos);
            const lbR2Match = lbR2Matches[toR2Idx];
            if (lbR2Match) {
              updates.nextMatchLoseId = lbR2Match.id;
              updates.nextSlotLose = "B";
            }
          }

          if (Object.keys(updates).length > 0) {
            await tx.match.update({ where: { id: m.id }, data: updates });
          }
        }

        // ── WB R3+: winners forward, losers to LB injection rounds ───────────────
        for (let k = 3; k <= upperRounds; k++) {
          const wbMatches = byWB.get(k) ?? [];
          const nextWB = byWB.get(k + 1);
          const lbTargetRound = wbToLBRound.get(k);
          const lbTargetMatches = lbTargetRound !== undefined ? (byLB.get(lbTargetRound) ?? []) : [];

          for (let i = 0; i < wbMatches.length; i++) {
            const updates: Record<string, unknown> = {};

            if (nextWB) {
              const target = nextWB[Math.floor(i / 2)];
              if (target) { updates.nextMatchWinId = target.id; updates.nextSlotWin = i % 2 === 0 ? "A" : "B"; }
            } else if (grandFinal && k === maxWB) {
              updates.nextMatchWinId = grandFinal.id;
              updates.nextSlotWin = "A";
            }

            const target = lbTargetMatches[i];
            if (target) { updates.nextMatchLoseId = target.id; updates.nextSlotLose = "B"; }

            if (Object.keys(updates).length > 0) {
              await tx.match.update({ where: { id: wbMatches[i].id }, data: updates });
            }
          }
        }

        // ── LB: wire winners forward ─────────────────────────────────────
        for (const lbRound of lbRounds) {
          const lbMatches = byLB.get(lbRound)!;
          const nextLB = byLB.get(lbRound + 1);

          for (let i = 0; i < lbMatches.length; i++) {
            const updates: Record<string, unknown> = {};

            if (nextLB && nextLB.length > 0) {
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
