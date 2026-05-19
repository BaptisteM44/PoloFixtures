/**
 * Relinks the MTP_DE bracket for a given tournament.
 * Uses the same hardcoded N=16 logic as actions.ts generateMtpDEAction.
 * Does NOT touch scores, teamAId, teamBId, or status.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function relinkMtpDE(tournamentId: string) {
  const allMatches = await prisma.match.findMany({
    where: { tournamentId, phase: 'MTP_DE' },
    select: { id: true, bracketSide: true, roundIndex: true, positionInRound: true },
    orderBy: [{ bracketSide: 'asc' }, { roundIndex: 'asc' }, { positionInRound: 'asc' }]
  });

  const wbMatches = allMatches.filter(m => m.bracketSide === 'W');
  const lbMatches = allMatches.filter(m => m.bracketSide === 'L');
  const gfMatch = allMatches.find(m => m.bracketSide === 'G');

  const wb = (r: number) => wbMatches.filter(m => m.roundIndex === r).sort((a, b) => (a.positionInRound ?? 0) - (b.positionInRound ?? 0));
  const lb = (r: number) => lbMatches.filter(m => m.roundIndex === r).sort((a, b) => (a.positionInRound ?? 0) - (b.positionInRound ?? 0));

  const updates: Array<{ id: string; data: Record<string, string | null> }> = [];
  const u = (id: string, data: Record<string, string | null>) => {
    const existing = updates.find(x => x.id === id);
    if (existing) Object.assign(existing.data, data);
    else updates.push({ id, data });
  };

  // Clear all links first
  for (const m of allMatches) {
    u(m.id, { nextMatchWinId: null, nextSlotWin: null, nextMatchLoseId: null, nextSlotLose: null });
  }

  // WB R1→R2→R3→R4 winners
  for (let ri = 0; ri < 3; ri++) {
    const cur = wb(ri + 1);
    const next = wb(ri + 2);
    for (let i = 0; i < cur.length; i++) {
      const nextM = next[Math.floor(i / 2)];
      if (nextM) u(cur[i].id, { nextMatchWinId: nextM.id, nextSlotWin: i % 2 === 0 ? 'A' : 'B' });
    }
  }

  // WB Final → GF slot A
  const wbFinal = wb(4)[0];
  if (wbFinal && gfMatch) u(wbFinal.id, { nextMatchWinId: gfMatch.id, nextSlotWin: 'A' });

  // LB R1→R2→R3→R4→R5 winners
  for (let ri = 1; ri <= 4; ri++) {
    const cur = lb(ri);
    const next = lb(ri + 1);
    for (let i = 0; i < cur.length; i++) {
      const nextM = next[Math.floor(i / 2)] ?? next[0];
      if (nextM) u(cur[i].id, { nextMatchWinId: nextM.id, nextSlotWin: i % 2 === 0 ? 'A' : 'B' });
    }
  }

  // LB Final (R5) → GF slot B
  const lbFinal = lb(5)[0];
  if (lbFinal && gfMatch) u(lbFinal.id, { nextMatchWinId: gfMatch.id, nextSlotWin: 'B' });

  // WB R1 losers → LB R1 (losers 0-3 → LB R1 slot B, losers 4-7 → LB R1 slot A)
  const wbR1 = wb(1);
  const lbR1 = lb(1);
  for (let i = 0; i < lbR1.length; i++) {
    if (wbR1[i + 4]) u(wbR1[i + 4].id, { nextMatchLoseId: lbR1[i].id, nextSlotLose: 'A' });
    if (wbR1[i]) u(wbR1[i].id, { nextMatchLoseId: lbR1[i].id, nextSlotLose: 'B' });
  }

  // WB R2 losers → LB R2 slot A
  const wbR2 = wb(2);
  const lbR2 = lb(2);
  for (let i = 0; i < wbR2.length; i++) {
    if (lbR2[i]) u(wbR2[i].id, { nextMatchLoseId: lbR2[i].id, nextSlotLose: 'A' });
  }

  // WB R3 losers → LB R4 slot A
  const wbR3 = wb(3);
  const lbR4 = lb(4);
  for (let i = 0; i < wbR3.length; i++) {
    if (lbR4[i]) u(wbR3[i].id, { nextMatchLoseId: lbR4[i].id, nextSlotLose: 'A' });
  }

  // WB Final loser → LB Final (R5) slot A
  if (wbFinal && lbFinal) u(wbFinal.id, { nextMatchLoseId: lbFinal.id, nextSlotLose: 'A' });

  console.log(`Applying ${updates.length} updates...`);
  await prisma.$transaction(updates.map(({ id, data }) => prisma.match.update({ where: { id }, data })));
  console.log('Done!');
  await prisma.$disconnect();
}

relinkMtpDE('cmnh1p5ae0001lp4vvlfr8vpr').catch(console.error);
