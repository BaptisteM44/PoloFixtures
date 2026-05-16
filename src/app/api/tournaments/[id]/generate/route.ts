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
        // ── Full DE linking — mirrors generateDoubleElim structure ───────
        const { nextPowerOf2 } = await import("@/lib/bracket");
        const N = tournament.teams.length;
        const size = nextPowerOf2(N);
        const upperRounds = Math.log2(size);
        const r1Count = size / 2;
        const w2 = size / 4; // = r2Count

        // Determine WB R1 real match count (w1) from generated WB R1 matches
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

        const wbR1Matches = byWB.get(1) ?? [];
        const w1 = wbR1Matches.length;
        const lbR1IsConsolidation = w1 > w2;

        // Build wbRound → lbInjectionRound mapping (mirrors generation logic)
        // WB R1 always → LB R1
        // WB R2 → LB R2 (always, whether case A injection or case B consolidation)
        // WB Rk (k≥3): track lbRoundIdx as in generation
        const wbToLBInj = new Map<number, number>();
        wbToLBInj.set(1, 1);
        wbToLBInj.set(2, 2);

        // Recompute lbSurvivors and lbRoundIdx to find injection rounds for k≥3
        const lbR1Count = lbR1IsConsolidation ? Math.floor(w1 / 2) : w1;
        const lbR2Count = lbR1IsConsolidation ? w2 : Math.floor(w2 / 2);
        let lbSurvivors = lbR1IsConsolidation ? w2 : Math.floor(w2 / 2) + (w2 % 2);
        let lbRoundIdx = 3;

        for (let k = 3; k <= upperRounds; k++) {
          const wbCount = size / Math.pow(2, k);
          // Consolidation rounds before injection
          while (lbSurvivors > wbCount) {
            const consCount = Math.floor(lbSurvivors / 2);
            if (consCount > 0) lbRoundIdx++;
            lbSurvivors = consCount + (lbSurvivors % 2);
          }
          // Injection round
          wbToLBInj.set(k, lbRoundIdx++);
        }

        // ── WB: wire winners forward, losers down to LB ─────────────────
        for (const wbRound of wbRounds) {
          const wbMatches = byWB.get(wbRound)!;
          const nextWB = byWB.get(wbRound + 1);
          const lbInjRound = wbToLBInj.get(wbRound);
          const lbInjMatches = lbInjRound !== undefined ? (byLB.get(lbInjRound) ?? []) : [];

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
            if (lbInjMatches.length > 0) {
              let lbMatchIdx: number;
              let lbSlot: "A" | "B";

              if (wbRound === 1) {
                if (lbR1IsConsolidation) {
                  // Case A: WB R1 losers pair off → position i → LB R1 match floor(i/2), slot i%2
                  // But WB R1 matches have non-contiguous positionInRound values.
                  // Use sequential index within wbMatches (already sorted by positionInRound).
                  lbMatchIdx = Math.floor(i / 2);
                  lbSlot = i % 2 === 0 ? "A" : "B";
                } else {
                  // Case B: WB R1 loser i faces WB R2 loser from same branch in LB R1
                  // LB R1 match index maps to the r2Pos that has a WB R1 loser.
                  // Generation creates LB R1 matches in r2Pos order for positions with real WB R1 matches.
                  // wbR1Match[i].positionInRound is the WB R1 position → r2Pos = floor(pos/2).
                  // We find the index of this r2Pos among lbR1MatchR2Positions.
                  const r2Pos = Math.floor(wbMatches[i].positionInRound / 2);
                  // lbInjMatches are in order of r2Pos that have real WB R1 match
                  // We need to find which lbInjMatch corresponds to this r2Pos.
                  // Since matches are sorted by positionInRound and generation adds them in r2Pos order,
                  // we can use the index of wbR1Matches that share the same r2Pos.
                  // Actually: lbR1 matches are created in order of r2Pos, so lbMatchIdx = index of
                  // this r2Pos among the lbR1MatchR2Positions array.
                  // Reconstruct lbR1MatchR2Pos from wbR1RealPositions:
                  const lbR1MatchR2Positions = [...new Set(wbR1Matches.map((m) => Math.floor(m.positionInRound / 2)))].sort((a, b) => a - b);
                  lbMatchIdx = lbR1MatchR2Positions.indexOf(r2Pos);
                  lbSlot = "B"; // WB R1 loser → slot B in Challonge (WB R2 loser is slot A)
                }
              } else {
                // WB Rk (k≥2): loser at position i → LB inject match i (1:1)
                lbMatchIdx = i;
                lbSlot = "B";
              }

              const lbTarget = lbMatchIdx >= 0 ? lbInjMatches[lbMatchIdx] : undefined;
              if (lbTarget) { updates.nextMatchLoseId = lbTarget.id; updates.nextSlotLose = lbSlot; }
            }

            if (Object.keys(updates).length > 0) {
              await tx.match.update({ where: { id: wbMatches[i].id }, data: updates });
            }
          }
        }

        // ── WB R2 → LB (special handling) ───────────────────────────────
        // WB R2 losers go to LB R1 (case B injection) or LB R2 (case A injection)
        // This is handled by wbToLBInj.get(2) = 2, which is either injection or consolidation.
        // The slot assignment for WB R2 losers is:
        //   Case A (LB R2 is injection): WB R2 loser i → LB R2 match i, slot B
        //   Case B (LB R2 is consolidation): WB R2 losers are mixed with LB R1 winners
        //     - WB R2 BYE positions → LB R2 first, in order
        //     - WB R2 non-BYE positions → handled via LB R1 winner advancing to LB R2
        // The above wbRound loop already handled WB R1 → LB R1 for case B.
        // WB R2 → LB R2 linking:
        {
          const wbR2Matches = byWB.get(2) ?? [];
          const lbR2Matches = byLB.get(2) ?? [];

          if (lbR1IsConsolidation) {
            // Case A: LB R2 is injection. WB R2 loser i → LB R2 match i, slot B
            // Already handled by the wbRounds loop above (wbRound=2, lbInjRound=2)
            // But the loop above uses slot "B" for k≥2 which is correct here.
          } else {
            // Case B: LB R2 is consolidation.
            // WB R2 losers that had LB R1 match → those winners flow to LB R2 automatically
            // WB R2 losers with BYE (no LB R1 match) → they need nextMatchLoseId → LB R2
            // Reconstruct lbR1MatchR2Pos and lbR1ByeR2Pos
            const lbR1MatchR2Positions = new Set(wbR1Matches.map((m) => Math.floor(m.positionInRound / 2)));
            const lbR1ByeR2Positions: number[] = [];
            for (let r2Pos = 0; r2Pos < w2; r2Pos++) {
              if (!lbR1MatchR2Positions.has(r2Pos)) lbR1ByeR2Positions.push(r2Pos);
            }
            // WB R2 losers at byeR2Positions need to go directly to LB R2
            // LB R2 consolidation receives: [lbR1Match0_winner, lbR1Match1_winner, ..., byeWBR2loser0, byeWBR2loser1, ...]
            // The pairing in LB R2 is: positions are interleaved (lbR1 winner pairs with adjacent byeWBR2)
            // Generation interleaves: first lbR1Count positions are LB R1 winners advancing,
            // then lbR1ByeR2Positions.length positions are WB R2 BYE losers.
            // Total r2Count teams pair off: match 0 = teams[0] vs teams[1], etc.
            // Since lbR1Count = w1 and byeCount = w2 - w1, we have r2Count = w2 total.
            // Pairing: match j in LB R2 pairs team[2j] vs team[2j+1].
            // Teams order: [lbR1W0, lbR1W1, ..., byeWBR2_0, byeWBR2_1, ...]
            // So WB R2 loser at byeR2Pos index b → LB R2 match floor((w1+b)/2), slot (w1+b)%2
            for (let b = 0; b < lbR1ByeR2Positions.length; b++) {
              const r2Pos = lbR1ByeR2Positions[b];
              const teamIdx = w1 + b; // position in the ordered list of r2Count teams
              const lbR2MatchIdx = Math.floor(teamIdx / 2);
              const lbR2Slot: "A" | "B" = teamIdx % 2 === 0 ? "A" : "B";
              // Find the WB R2 match at this r2Pos
              const wbR2Match = wbR2Matches[r2Pos];
              const lbR2Match = lbR2Matches[lbR2MatchIdx];
              if (wbR2Match && lbR2Match) {
                await tx.match.update({
                  where: { id: wbR2Match.id },
                  data: { nextMatchLoseId: lbR2Match.id, nextSlotLose: lbR2Slot }
                });
              }
            }
          }
        }

        // ── LB: wire winners forward through consolidation → injection → GF ─
        // For each LB round, determine if it's consolidation or injection:
        // - Consolidation: match i winner → next LB match floor(i/2), slot i%2
        // - Injection: match i winner → next LB match i (1:1), slot A or B
        // We determine this by comparing match counts: if nextRound has fewer matches, it's consolidation.
        for (const lbRound of lbRounds) {
          const lbMatches = byLB.get(lbRound)!;
          const nextLB = byLB.get(lbRound + 1);

          for (let i = 0; i < lbMatches.length; i++) {
            const updates: Record<string, unknown> = {};

            if (nextLB && nextLB.length > 0) {
              // If next round has fewer matches → this round consolidates (2→1 per match)
              // If next round has same or more matches → this round is injection (1→1)
              const isConsolidation = nextLB.length < lbMatches.length;
              let nextPos: number;
              let nextSlot: "A" | "B";
              if (isConsolidation) {
                nextPos = Math.floor(i / 2);
                nextSlot = i % 2 === 0 ? "A" : "B";
              } else {
                nextPos = i;
                nextSlot = "A"; // LB survivors take slot A in next injection round
              }
              const target = nextLB[nextPos];
              if (target) { updates.nextMatchWinId = target.id; updates.nextSlotWin = nextSlot; }
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
