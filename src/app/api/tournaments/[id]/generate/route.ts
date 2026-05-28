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
    const matches = generatePoolMatches(pools, courtNames, startAt, tournament.gameDurationMin, { mazzaSequential: tournament.sundayFormat === "SPLIT_SE" });

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
        // ── DE linking — slot-reservation approach ──────────────────────────────
        // Uses a claimed-slot map to avoid collisions. WB losers claim their LB
        // slots first, then LB winners fill remaining free slots.

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

        // ── Classify r2Pos branches ──────────────────────────────────────────────
        const w2 = size / 4;
        const wbR1Matches = byWB.get(1) ?? [];
        const wbR1RealPositions = wbR1Matches.map((m) => m.positionInRound);

        const r2PosWithR1Loser = new Map<number, number[]>();
        for (const pos of wbR1RealPositions) {
          const r2Pos = Math.floor(pos / 2);
          if (!r2PosWithR1Loser.has(r2Pos)) r2PosWithR1Loser.set(r2Pos, []);
          r2PosWithR1Loser.get(r2Pos)!.push(pos);
        }

        const lbR1InjectionR2Pos: number[] = [];
        const lbR1R2PosOrder: number[] = [];
        for (let r2Pos = 0; r2Pos < w2; r2Pos++) {
          const count = (r2PosWithR1Loser.get(r2Pos) ?? []).length;
          if (count === 1) lbR1InjectionR2Pos.push(r2Pos);
          if (count > 0) lbR1R2PosOrder.push(r2Pos);
        }
        const lbR1Count = lbR1R2PosOrder.length;

        // ── Slot reservation tracking ────────────────────────────────────────────
        const claimed = new Set<string>();
        function claimSlot(matchId: string, slot: "A" | "B") {
          claimed.add(`${matchId}:${slot}`);
        }
        function findFreeSlot(matchId: string): "A" | "B" | null {
          if (!claimed.has(`${matchId}:A`)) return "A";
          if (!claimed.has(`${matchId}:B`)) return "B";
          return null;
        }

        // ── Build wbToLBRound mapping ────────────────────────────────────────────
        const lbR1ConsolidationR2Pos: number[] = [];
        const lbR1ByeR2Pos: number[] = [];
        for (let r2Pos = 0; r2Pos < w2; r2Pos++) {
          const count = (r2PosWithR1Loser.get(r2Pos) ?? []).length;
          if (count >= 2) lbR1ConsolidationR2Pos.push(r2Pos);
          else if (count === 0) lbR1ByeR2Pos.push(r2Pos);
        }
        const lbR2Teams = lbR1Count + lbR1ConsolidationR2Pos.length + lbR1ByeR2Pos.length;
        const lbR2RoundIdx = lbR1Count > 0 ? 2 : 1;
        const lbR2Count = (byLB.get(lbR2RoundIdx) ?? []).length;

        const wbToLBRound = new Map<number, number>();
        wbToLBRound.set(2, lbR2RoundIdx);
        {
          let lbSurvivors = lbR2Count + (lbR2Teams % 2);
          let lbRI = lbR2RoundIdx + 1;
          for (let k = 3; k <= upperRounds; k++) {
            const wbCount = size / Math.pow(2, k);
            wbToLBRound.set(k, lbRI);
            const injCount = Math.min(lbSurvivors, wbCount);
            lbSurvivors = injCount + Math.abs(lbSurvivors - wbCount);
            lbRI++;
            if (k < upperRounds && lbSurvivors > 1) {
              lbSurvivors = Math.floor(lbSurvivors / 2) + (lbSurvivors % 2);
              lbRI++;
            }
          }
        }

        // ── WB R1: wire winners and losers ───────────────────────────────────────
        const wbR2Matches = byWB.get(2) ?? [];
        const lbR1Matches = byLB.get(1) ?? [];
        for (let i = 0; i < wbR1Matches.length; i++) {
          const m = wbR1Matches[i];
          const pos = m.positionInRound;
          const r2Pos = Math.floor(pos / 2);
          const updates: Record<string, unknown> = {};

          const nextWBMatch = wbR2Matches[r2Pos];
          if (nextWBMatch) {
            updates.nextMatchWinId = nextWBMatch.id;
            updates.nextSlotWin = pos % 2 === 0 ? "A" : "B";
          }

          const lbR1Idx = lbR1R2PosOrder.indexOf(r2Pos);
          if (lbR1Idx >= 0 && lbR1Matches[lbR1Idx]) {
            const r1LosersForR2Pos = r2PosWithR1Loser.get(r2Pos) ?? [];
            if (r1LosersForR2Pos.length >= 2) {
              const posInPair = r1LosersForR2Pos.indexOf(pos);
              const slot: "A" | "B" = posInPair === 0 ? "A" : "B";
              updates.nextMatchLoseId = lbR1Matches[lbR1Idx].id;
              updates.nextSlotLose = slot;
              claimSlot(lbR1Matches[lbR1Idx].id, slot);
            } else {
              updates.nextMatchLoseId = lbR1Matches[lbR1Idx].id;
              updates.nextSlotLose = "B";
              claimSlot(lbR1Matches[lbR1Idx].id, "B");
            }
          }

          if (Object.keys(updates).length > 0) {
            await tx.match.update({ where: { id: m.id }, data: updates });
          }
        }

        // ── WB R3+ losers → LB injection rounds, slot B (claim first) ───────────
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
            if (target) {
              updates.nextMatchLoseId = target.id;
              updates.nextSlotLose = "B";
              claimSlot(target.id, "B");
            }

            if (Object.keys(updates).length > 0) {
              await tx.match.update({ where: { id: wbMatches[i].id }, data: updates });
            }
          }
        }

        // ── WB R2 losers → LB R1 (injection) or LB R2 (free slot) ───────────────
        const lbR2Matches = byLB.get(lbR2RoundIdx) ?? [];
        const wbR2Overflow: string[] = [];

        for (let i = 0; i < wbR2Matches.length; i++) {
          const m = wbR2Matches[i];
          const r2Pos = i;
          const updates: Record<string, unknown> = {};

          // Winner → WB R3 or GF
          const nextWB = byWB.get(3);
          if (nextWB) {
            const target = nextWB[Math.floor(i / 2)];
            if (target) { updates.nextMatchWinId = target.id; updates.nextSlotWin = i % 2 === 0 ? "A" : "B"; }
          } else if (grandFinal && maxWB === 2) {
            updates.nextMatchWinId = grandFinal.id;
            updates.nextSlotWin = "A";
          }

          // Loser → LB
          const mirrorR2Pos = w2 - 1 - r2Pos;
          const lbR1IdxForMirror = lbR1R2PosOrder.indexOf(mirrorR2Pos);

          if (lbR1IdxForMirror >= 0 && lbR1InjectionR2Pos.includes(mirrorR2Pos)) {
            const target = lbR1Matches[lbR1IdxForMirror];
            if (target) {
              updates.nextMatchLoseId = target.id;
              updates.nextSlotLose = "A";
              claimSlot(target.id, "A");
            }
          } else {
            // Find free slot in LB R2 (prefer slot B first, then slot A)
            let placed = false;
            for (let j = 0; j < lbR2Matches.length; j++) {
              const freeSlot = findFreeSlot(lbR2Matches[j].id);
              if (freeSlot === "B") {
                updates.nextMatchLoseId = lbR2Matches[j].id;
                updates.nextSlotLose = "B";
                claimSlot(lbR2Matches[j].id, "B");
                placed = true;
                break;
              }
            }
            if (!placed) {
              for (let j = 0; j < lbR2Matches.length; j++) {
                const freeSlot = findFreeSlot(lbR2Matches[j].id);
                if (freeSlot === "A") {
                  updates.nextMatchLoseId = lbR2Matches[j].id;
                  updates.nextSlotLose = "A";
                  claimSlot(lbR2Matches[j].id, "A");
                  placed = true;
                  break;
                }
              }
            }
            if (!placed) {
              wbR2Overflow.push(m.id);
            }
          }

          if (Object.keys(updates).length > 0) {
            await tx.match.update({ where: { id: m.id }, data: updates });
          }
        }

        // Handle WB R2 overflow: BYE past LB R2 → find first free slot in later LB rounds
        for (const overflowMatchId of wbR2Overflow) {
          for (const lr of lbRounds) {
            if (lr <= lbR2RoundIdx) continue;
            const roundMatches = byLB.get(lr)!;
            let placed = false;
            for (const rm of roundMatches) {
              const freeSlot = findFreeSlot(rm.id);
              if (freeSlot) {
                await tx.match.update({ where: { id: overflowMatchId }, data: { nextMatchLoseId: rm.id, nextSlotLose: freeSlot } });
                claimSlot(rm.id, freeSlot);
                placed = true;
                break;
              }
            }
            if (placed) break;
          }
        }

        // ── LB: wire winners forward ─────────────────────────────────────────────
        // LB R1 winners → LB R2 slot A (one-to-one, deterministic)
        // All other LB rounds → find next round with free slot
        for (const lbRound of lbRounds) {
          const lbMatches = byLB.get(lbRound)!;

          for (let i = 0; i < lbMatches.length; i++) {
            if (lbRound === maxLB) {
              if (grandFinal) {
                await tx.match.update({ where: { id: lbMatches[i].id }, data: { nextMatchWinId: grandFinal.id, nextSlotWin: "B" } });
              }
              continue;
            }

            // LB R1 → LB R2: deterministic slot A assignment (LBR1[i] → LBR2[i] slotA)
            // This ensures each LB R2 match pairs one LB R1 winner (slotA) with one WB R2 loser (slotB)
            if (lbRound === 1) {
              const nextMatches = byLB.get(lbR2RoundIdx) ?? [];
              const target = nextMatches[i];
              if (target) {
                await tx.match.update({ where: { id: lbMatches[i].id }, data: { nextMatchWinId: target.id, nextSlotWin: "A" } });
                claimSlot(target.id, "A");
              }
              continue;
            }

            // All other LB rounds: find next round with a free slot
            let placed = false;
            for (const nextRound of lbRounds) {
              if (nextRound <= lbRound) continue;
              const nextMatches = byLB.get(nextRound)!;
              for (const nm of nextMatches) {
                const freeSlot = findFreeSlot(nm.id);
                if (freeSlot) {
                  await tx.match.update({ where: { id: lbMatches[i].id }, data: { nextMatchWinId: nm.id, nextSlotWin: freeSlot } });
                  claimSlot(nm.id, freeSlot);
                  placed = true;
                  break;
                }
              }
              if (placed) break;
            }

            if (!placed && grandFinal) {
              await tx.match.update({ where: { id: lbMatches[i].id }, data: { nextMatchWinId: grandFinal.id, nextSlotWin: "B" } });
            }
          }
        }
      }
    });

    return Response.json({ ok: true });
  }

  return Response.json({ ok: false }, { status: 400 });
}
