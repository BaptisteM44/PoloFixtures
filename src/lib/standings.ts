import { Match, Team } from "@prisma/client";

export type StandingRow = {
  teamId: string;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
};

export function computeStandings(teams: Team[], matches: Match[]) {
  const rows = new Map<string, StandingRow>();

  teams.forEach((team) => {
    rows.set(team.id, {
      teamId: team.id,
      name: team.name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0
    });
  });

  matches
    .filter((m) => m.status === "FINISHED")
    .forEach((match) => {
      if (!match.teamAId || !match.teamBId) return;
      const rowA = rows.get(match.teamAId);
      const rowB = rows.get(match.teamBId);
      if (!rowA || !rowB) return;

      rowA.played += 1;
      rowB.played += 1;
      rowA.goalsFor += match.scoreA;
      rowA.goalsAgainst += match.scoreB;
      rowB.goalsFor += match.scoreB;
      rowB.goalsAgainst += match.scoreA;

      if (match.scoreA > match.scoreB) {
        rowA.wins += 1;
        rowB.losses += 1;
        rowA.points += 3;
      } else if (match.scoreB > match.scoreA) {
        rowB.wins += 1;
        rowA.losses += 1;
        rowB.points += 3;
      } else {
        rowA.draws += 1;
        rowB.draws += 1;
        rowA.points += 1;
        rowB.points += 1;
      }
    });

  rows.forEach((row) => {
    row.goalDiff = row.goalsFor - row.goalsAgainst;
  });

  return Array.from(rows.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    return b.goalsFor - a.goalsFor;
  });
}
