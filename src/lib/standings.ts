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
  buchholz: number;
  sonnebornBerger: number;
};

export type ScoringConfig = {
  win: number;
  draw: number;
  loss: number;
};

const SCORING_SYSTEMS: Record<string, ScoringConfig> = {
  "3/1": { win: 3, draw: 1, loss: 0 },
  "1/0.5": { win: 1, draw: 0.5, loss: 0 },
};

export function getScoringConfig(scoringSystem?: string | null): ScoringConfig {
  return SCORING_SYSTEMS[scoringSystem ?? "3/1"] ?? SCORING_SYSTEMS["3/1"];
}

export function computeStandings(teams: Team[], matches: Match[], scoringSystem?: string | null) {
  const scoring = getScoringConfig(scoringSystem);
  const rows = new Map<string, StandingRow>();
  const opponents = new Map<string, string[]>();
  const defeated = new Map<string, string[]>();

  teams.forEach((team) => {
    rows.set(team.id, {
      teamId: team.id,
      name: team.name,
      played: 0, wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0, goalDiff: 0,
      points: 0, buchholz: 0, sonnebornBerger: 0,
    });
    opponents.set(team.id, []);
    defeated.set(team.id, []);
  });

  // Pass 1: compute points/goals and track opponents
  matches
    .filter((m) => m.status === "FINISHED")
    .forEach((match) => {
      // BYE match (teamBId is null): award a free win to teamA, no stats
      if (match.teamAId && !match.teamBId) {
        const rowA = rows.get(match.teamAId);
        if (rowA) rowA.points += scoring.win;
        return;
      }
      if (!match.teamAId || !match.teamBId) return;
      const rowA = rows.get(match.teamAId);
      const rowB = rows.get(match.teamBId);
      // Un match hérité peut opposer une équipe du classement courant à une
      // équipe absente (ex: match de poule contre une tête de série qui n'a
      // pas rejoint le Swiss) — on compte quand même les stats de l'équipe
      // présente ; l'adversaire absent n'a simplement pas de ligne à mettre à jour.
      if (!rowA && !rowB) return;

      if (rowA) { rowA.played += 1; rowA.goalsFor += match.scoreA; rowA.goalsAgainst += match.scoreB; }
      if (rowB) { rowB.played += 1; rowB.goalsFor += match.scoreB; rowB.goalsAgainst += match.scoreA; }

      if (rowA && rowB) {
        opponents.get(match.teamAId)!.push(match.teamBId);
        opponents.get(match.teamBId)!.push(match.teamAId);
      }

      if (match.scoreA > match.scoreB) {
        if (rowA) rowA.wins += 1;
        if (rowB) rowB.losses += 1;
        if (rowA) rowA.points += scoring.win;
        if (rowA && rowB) defeated.get(match.teamAId)!.push(match.teamBId);
      } else if (match.scoreB > match.scoreA) {
        if (rowB) rowB.wins += 1;
        if (rowA) rowA.losses += 1;
        if (rowB) rowB.points += scoring.win;
        if (rowA && rowB) defeated.get(match.teamBId)!.push(match.teamAId);
      } else {
        if (rowA) { rowA.draws += 1; rowA.points += scoring.draw; }
        if (rowB) { rowB.draws += 1; rowB.points += scoring.draw; }
      }
    });

  rows.forEach((row) => {
    row.goalDiff = row.goalsFor - row.goalsAgainst;
  });

  // Pass 2: Buchholz (sum of opponents' points) + Sonneborn-Berger (sum of defeated opponents' points)
  rows.forEach((row) => {
    row.buchholz = (opponents.get(row.teamId) ?? [])
      .reduce((sum, oppId) => sum + (rows.get(oppId)?.points ?? 0), 0);
    row.sonnebornBerger = (defeated.get(row.teamId) ?? [])
      .reduce((sum, oppId) => sum + (rows.get(oppId)?.points ?? 0), 0);
  });

  return Array.from(rows.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    if (b.sonnebornBerger !== a.sonnebornBerger) return b.sonnebornBerger - a.sonnebornBerger;
    return b.goalsFor - a.goalsFor;
  });
}
