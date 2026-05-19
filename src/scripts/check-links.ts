import { prisma } from '../lib/db';
import { nextPowerOf2 } from '../lib/bracket';
async function main() {
  const tournamentId = 'cmobofcrv0007m6u3x2aw9ci8';
  const matches = await prisma.match.findMany({
    where: { tournamentId, phase: 'BRACKET' },
    select: { id: true, roundIndex: true, bracketSide: true, positionInRound: true, nextMatchWinId: true, nextMatchLoseId: true, nextSlotWin: true, nextSlotLose: true, teamAId: true, teamBId: true },
    orderBy: [{ bracketSide: 'asc' }, { roundIndex: 'asc' }, { positionInRound: 'asc' }]
  });
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { teams: true } });
  const N = tournament!.teams.length;
  const size = nextPowerOf2(N);
  const w2 = size / 4;
  console.log(`N=${N}, size=${size}, w2=${w2}`);

  // Group WB R1
  const wbR1 = matches.filter(m => m.bracketSide === 'W' && m.roundIndex === 1);
  console.log('WB R1 matches:', wbR1.map(m => `pos${m.positionInRound}`));
  const wbR1RealPositions = wbR1.map(m => m.positionInRound);

  const r2PosWithR1Loser = new Map<number, number[]>();
  for (const pos of wbR1RealPositions) {
    const r2Pos = Math.floor(pos / 2);
    if (!r2PosWithR1Loser.has(r2Pos)) r2PosWithR1Loser.set(r2Pos, []);
    r2PosWithR1Loser.get(r2Pos)!.push(pos);
  }
  console.log('r2PosWithR1Loser:', [...r2PosWithR1Loser.entries()].map(([k,v]) => `r2Pos${k}→[${v}]`).join(', '));

  const lbR1InjectionR2Pos: number[] = [];
  const lbR1ConsolidationR2Pos: number[] = [];
  const lbR1ByeR2Pos: number[] = [];
  for (let r2Pos = 0; r2Pos < w2; r2Pos++) {
    const count = (r2PosWithR1Loser.get(r2Pos) ?? []).length;
    if (count >= 2) lbR1ConsolidationR2Pos.push(r2Pos);
    else if (count === 1) lbR1InjectionR2Pos.push(r2Pos);
    else lbR1ByeR2Pos.push(r2Pos);
  }
  console.log('lbR1ConsolidationR2Pos:', lbR1ConsolidationR2Pos);
  console.log('lbR1InjectionR2Pos:', lbR1InjectionR2Pos);
  console.log('lbR1ByeR2Pos:', lbR1ByeR2Pos);

  const lbR1R2PosOrder: number[] = [];
  for (let r2Pos = 0; r2Pos < w2; r2Pos++) {
    const count = (r2PosWithR1Loser.get(r2Pos) ?? []).length;
    if (count > 0) lbR1R2PosOrder.push(r2Pos);
  }
  console.log('lbR1R2PosOrder:', lbR1R2PosOrder);

  // Per WB R1 match, what LB R1 match should it point to?
  const lbR1Matches = matches.filter(m => m.bracketSide === 'L' && m.roundIndex === 1);
  console.log('\nExpected WB R1 lose links:');
  for (const m of wbR1) {
    const pos = m.positionInRound;
    const r2Pos = Math.floor(pos / 2);
    const lbR1Idx = lbR1R2PosOrder.indexOf(r2Pos);
    const targetLBR1 = lbR1Matches[lbR1Idx];
    console.log(`  WB R1 pos${pos} → r2Pos=${r2Pos}, lbR1Idx=${lbR1Idx}, targetLBR1=pos${targetLBR1?.positionInRound ?? 'NONE'}, actual lose: ${m.nextMatchLoseId ? 'SET' : 'NULL'}`);
  }

  // Per WB R2 match, what should it point to?
  const wbR2 = matches.filter(m => m.bracketSide === 'W' && m.roundIndex === 2);
  const lbR2Matches = matches.filter(m => m.bracketSide === 'L' && m.roundIndex === 2);
  const wbR2ToLBR2: number[] = [];
  for (let r2Pos = 0; r2Pos < w2; r2Pos++) {
    if (!lbR1InjectionR2Pos.includes(r2Pos)) wbR2ToLBR2.push(r2Pos);
  }
  console.log('\nExpected WB R2 lose links:');
  for (let i = 0; i < wbR2.length; i++) {
    const m = wbR2[i];
    const r2Pos = m.positionInRound;
    if (lbR1InjectionR2Pos.includes(r2Pos)) {
      const lbR1Idx = lbR1R2PosOrder.indexOf(r2Pos);
      const target = lbR1Matches[lbR1Idx];
      console.log(`  WB R2 pos${r2Pos} → LB R1 pos${target?.positionInRound ?? 'NONE'} slot A, actual lose: ${m.nextMatchLoseId ? 'SET' : 'NULL'}`);
    } else {
      const toR2Idx = wbR2ToLBR2.indexOf(r2Pos);
      const target = lbR2Matches[toR2Idx];
      console.log(`  WB R2 pos${r2Pos} → LB R2 pos${target?.positionInRound ?? 'NONE'} slot B, actual lose: ${m.nextMatchLoseId ? 'SET' : 'NULL'}`);
    }
  }

  console.log('\nAll matches:');
  for (const m of matches) {
    console.log(`${m.bracketSide} R${m.roundIndex} pos${m.positionInRound} | win->${m.nextMatchWinId ? 'SET('+m.nextSlotWin+')' : 'NULL'} lose->${m.nextMatchLoseId ? 'SET('+m.nextSlotLose+')' : 'NULL'}`);
  }
  await prisma.$disconnect();
}
main();
