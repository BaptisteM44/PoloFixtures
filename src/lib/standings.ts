import { Match, Team } from "@prisma/client";
import { standingsTable, type MatchLite } from "@/engine/stage-standings";

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

/**
 * Tableau de classement affiché (poules, Swiss…). Délègue au moteur
 * (engine/stage-standings) : ce que voient les joueurs est EXACTEMENT ce qui
 * décide des qualifications (même départage, BYE = victoire 1-0).
 */
export function computeStandings(teams: Team[], matches: Match[], scoringSystem?: string | null): StandingRow[] {
  const names = new Map(teams.map((t) => [t.id, t.name]));
  return standingsTable(teams.map((t) => t.id), matches as unknown as MatchLite[], getScoringConfig(scoringSystem))
    .map((r) => ({ ...r, name: names.get(r.teamId) ?? "" }));
}
