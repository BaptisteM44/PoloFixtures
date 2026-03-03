import { Match, Team } from "@prisma/client";

export type EloMap = Record<string, number>;

const K = 32;

function expectedScore(eloA: number, eloB: number) {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

export function computeElo(teams: Team[], matches: Match[], base = 1000): EloMap {
  const ratings: EloMap = {};
  teams.forEach((t) => {
    ratings[t.id] = base + (t.seed ? Math.max(0, 10 - t.seed) * 10 : 0);
  });

  matches
    .filter((m) => m.status === "FINISHED" && m.teamAId && m.teamBId)
    .forEach((match) => {
      const aId = match.teamAId!;
      const bId = match.teamBId!;
      const aElo = ratings[aId] ?? base;
      const bElo = ratings[bId] ?? base;
      const expA = expectedScore(aElo, bElo);
      const expB = expectedScore(bElo, aElo);

      const scoreA = match.scoreA;
      const scoreB = match.scoreB;
      let resultA = 0.5;
      let resultB = 0.5;

      if (scoreA > scoreB) {
        resultA = 1;
        resultB = 0;
      } else if (scoreB > scoreA) {
        resultA = 0;
        resultB = 1;
      }

      ratings[aId] = aElo + K * (resultA - expA);
      ratings[bId] = bElo + K * (resultB - expB);
    });

  return ratings;
}
