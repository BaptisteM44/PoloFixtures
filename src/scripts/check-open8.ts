import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const tId = 'cmnh1p5ae0001lp4vvlfr8vpr';
  const matches = await prisma.match.findMany({
    where: { tournamentId: tId, phase: 'MTP_DE' },
    select: { id: true, roundIndex: true, bracketSide: true, positionInRound: true, 
              nextMatchWinId: true, nextMatchLoseId: true, nextSlotWin: true, nextSlotLose: true },
    orderBy: [{ bracketSide: 'asc' }, { roundIndex: 'asc' }, { positionInRound: 'asc' }]
  });

  const matchById = new Map(matches.map(m => [m.id, m]));
  
  // Check collisions
  const slotMap = new Map<string, string[]>();
  for (const m of matches) {
    const label = `${m.bracketSide}R${m.roundIndex}p${m.positionInRound}`;
    if (m.nextMatchWinId && m.nextSlotWin) {
      const key = `${m.nextMatchWinId}:${m.nextSlotWin}`;
      if (!slotMap.has(key)) slotMap.set(key, []);
      slotMap.get(key)!.push(`${label}(win)`);
    }
    if (m.nextMatchLoseId && m.nextSlotLose) {
      const key = `${m.nextMatchLoseId}:${m.nextSlotLose}`;
      if (!slotMap.has(key)) slotMap.set(key, []);
      slotMap.get(key)!.push(`${label}(lose)`);
    }
  }
  
  console.log('=== COLLISIONS ===');
  let hasCollision = false;
  for (const [key, sources] of slotMap) {
    if (sources.length > 1) {
      const [mid, slot] = key.split(':');
      const t = matchById.get(mid);
      const tl = t ? `${t.bracketSide}R${t.roundIndex}p${t.positionInRound}` : mid;
      console.log(`COLLISION on ${tl} slot${slot}: ${sources.join(' AND ')}`);
      hasCollision = true;
    }
  }
  if (!hasCollision) console.log('No collisions');

  console.log('\n=== LB WIN LINKS ===');
  for (const m of matches.filter(m2 => m2.bracketSide === 'L')) {
    const wt = m.nextMatchWinId ? matchById.get(m.nextMatchWinId) : null;
    const wLabel = wt ? `${wt.bracketSide}R${wt.roundIndex}p${wt.positionInRound}(slot${m.nextSlotWin})` : (m.nextMatchWinId ? 'GF' : 'NULL');
    console.log(`LB R${m.roundIndex} pos${m.positionInRound} → ${wLabel}`);
  }
  
  console.log('\n=== WB LOSE LINKS ===');
  for (const m of matches.filter(m2 => m2.bracketSide === 'W')) {
    const lt = m.nextMatchLoseId ? matchById.get(m.nextMatchLoseId) : null;
    const lLabel = lt ? `${lt.bracketSide}R${lt.roundIndex}p${lt.positionInRound}(slot${m.nextSlotLose})` : 'NULL';
    console.log(`WB R${m.roundIndex} pos${m.positionInRound} → lose: ${lLabel}`);
  }
  
  await prisma.$disconnect();
}
main().catch(console.error);
