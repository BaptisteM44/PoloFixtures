import { PrismaClient } from '@prisma/client';
import { generateBracket } from '../src/lib/bracket.ts';

const p = new PrismaClient();

async function test() {
  const tournament = await p.tournament.findUnique({
    where: { id: 'cmnfvkn9m000710tpuputcgmy' },
    include: { teams: { where: { selected: true } }, matches: true }
  });

  let seededTeams = tournament!.teams;
  const bracketSize = (tournament as any).bracketSize ?? 16;
  if (seededTeams.length > bracketSize) seededTeams = seededTeams.slice(0, bracketSize);
  
  console.log('Teams count:', seededTeams.length);
  console.log('Format:', tournament!.sundayFormat);
  
  const courtNames = Array.from({ length: tournament!.courtsCount }, (_, i) => `Court ${i + 1}`);
  const matches = generateBracket(seededTeams, tournament!.sundayFormat, courtNames, new Date(tournament!.dateEnd), tournament!.gameDurationMin, {
    thirdPlaceMatch: (tournament as any).thirdPlaceMatch ?? false,
    gfReset: (tournament as any).gfReset ?? false,
  });
  
  console.log('Generated matches:', matches.length);

  // Now try the actual transaction, same as generateBracketAction
  try {
    await p.$transaction(async (tx) => {
      await tx.match.deleteMany({ where: { tournamentId: tournament!.id, phase: "BRACKET" } });

      const created: Array<{ id: string; roundIndex: number; bracketSide: string | null; positionInRound: number }> = [];
      for (const match of matches) {
        const m = await tx.match.create({
          data: {
            tournamentId: tournament!.id,
            phase: "BRACKET",
            bracketSide: match.bracketSide ?? null,
            roundIndex: match.roundIndex,
            courtName: match.courtName,
            startAt: match.startAt,
            dayIndex: "SUN",
            status: "SCHEDULED",
            positionInRound: match.positionInRound ?? 0,
            teamAId: match.teamAId,
            teamBId: match.teamBId,
          }
        });
        created.push({ id: m.id, roundIndex: m.roundIndex, bracketSide: m.bracketSide, positionInRound: m.positionInRound });
        console.log('Created match:', m.bracketSide, 'R' + m.roundIndex, 'P' + m.positionInRound);
      }
      console.log('All matches created successfully. Rolling back...');
      throw new Error('ROLLBACK_TEST');
    });
  } catch (e: any) {
    if (e.message === 'ROLLBACK_TEST') {
      console.log('Transaction rolled back successfully (test mode).');
    } else {
      console.error('REAL ERROR:', e);
    }
  }
}

test().catch(e => console.error('ERROR:', e)).finally(() => p.$disconnect());
