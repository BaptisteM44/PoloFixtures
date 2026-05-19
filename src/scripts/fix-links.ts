import { prisma } from '../lib/db';
import { nextPowerOf2 } from '../lib/bracket';

async function main() {
  const tournamentId = 'cmobofcrv0007m6u3x2aw9ci8';
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { teams: true } });
  const N = tournament!.teams.length;
  const size = nextPowerOf2(N);
  const w2 = size / 4;

  const matches = await prisma.match.findMany({
    where: { tournamentId, phase: 'BRACKET' },
    select: { id: true, roundIndex: true, bracketSide: true, positionInRound: true },
    orderBy: [{ bracketSide: 'asc' }, { roundIndex: 'asc' }, { positionInRound: 'asc' }]
  });

  const byWB = new Map<number, typeof matches>();
  const byLB = new Map<number, typeof matches>();
  for (const m of matches) {
    if (m.bracketSide === 'W') { if (!byWB.has(m.roundIndex)) byWB.set(m.roundIndex, []); byWB.get(m.roundIndex)!.push(m); }
    else if (m.bracketSide === 'L') { if (!byLB.has(m.roundIndex)) byLB.set(m.roundIndex, []); byLB.get(m.roundIndex)!.push(m); }
  }
  for (const arr of [...byWB.values(), ...byLB.values()]) arr.sort((a, b) => a.positionInRound - b.positionInRound);

  const wbR1Matches = byWB.get(1) ?? [];
  const r2PosWithR1Loser = new Map<number, number[]>();
  for (const m of wbR1Matches) {
    const r2Pos = Math.floor(m.positionInRound / 2);
    if (!r2PosWithR1Loser.has(r2Pos)) r2PosWithR1Loser.set(r2Pos, []);
    r2PosWithR1Loser.get(r2Pos)!.push(m.positionInRound);
  }
  const lbR1R2PosOrder: number[] = [];
  for (let r2Pos = 0; r2Pos < w2; r2Pos++) {
    if ((r2PosWithR1Loser.get(r2Pos) ?? []).length > 0) lbR1R2PosOrder.push(r2Pos);
  }

  const lbR1Matches = byLB.get(1) ?? [];
  const wbR2Matches = byWB.get(2) ?? [];

  console.log(`N=${N}, w2=${w2}, lbR1R2PosOrder=[${lbR1R2PosOrder}]`);
  console.log('Fixing WB R2 losers with Challonge mirror rule...');
  for (const m of wbR2Matches) {
    const r2Pos = m.positionInRound;
    const mirrorR2Pos = w2 - 1 - r2Pos;
    const lbR1Idx = lbR1R2PosOrder.indexOf(mirrorR2Pos);
    if (lbR1Idx >= 0 && lbR1Matches[lbR1Idx]) {
      const target = lbR1Matches[lbR1Idx];
      await prisma.match.update({ where: { id: m.id }, data: { nextMatchLoseId: target.id, nextSlotLose: 'A' } });
      console.log(`  WB R2 pos${r2Pos} → LB R1 pos${target.positionInRound} slot A (mirrorR2Pos=${mirrorR2Pos}) ✓`);
    } else {
      await prisma.match.update({ where: { id: m.id }, data: { nextMatchLoseId: null, nextSlotLose: null } });
      console.log(`  WB R2 pos${r2Pos} → no LB R1 match (BYE, mirrorR2Pos=${mirrorR2Pos})`);
    }
  }
  console.log('Done.');
  await prisma.$disconnect();
}
main();
