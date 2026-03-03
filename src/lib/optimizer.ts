import { Match, Team } from "@prisma/client";
import { computeElo } from "@/lib/elo";

export type OptimizeOptions = {
  avoidSameCity?: boolean;
  avoidSameCountry?: boolean;
  iterations?: number;
};

function pairKey(a: string, b: string) {
  return [a, b].sort().join(":");
}

function buildHistory(matches: Match[]) {
  const set = new Set<string>();
  matches
    .filter((m) => m.teamAId && m.teamBId)
    .forEach((m) => {
      set.add(pairKey(m.teamAId!, m.teamBId!));
    });
  return set;
}

function costForOrder(teams: Team[], elo: Record<string, number>, history: Set<string>, options: OptimizeOptions) {
  let cost = 0;
  const n = teams.length;
  const pairs = [] as Array<[Team, Team]>;

  for (let i = 0; i < Math.floor(n / 2); i += 1) {
    pairs.push([teams[i], teams[n - 1 - i]]);
  }

  for (const [a, b] of pairs) {
    const diff = Math.abs((elo[a.id] ?? 1000) - (elo[b.id] ?? 1000));
    cost += diff;

    if (history.has(pairKey(a.id, b.id))) cost += 500;
    if (options.avoidSameCity && a.city && b.city && a.city === b.city) cost += 150;
    if (options.avoidSameCountry && a.country && b.country && a.country === b.country) cost += 100;
  }

  return cost;
}

export function optimizeSeeds(teams: Team[], matches: Match[], options: OptimizeOptions = {}) {
  const elo = computeElo(teams, matches, 1000);
  const history = buildHistory(matches);
  const iterations = options.iterations ?? 200;

  let best = [...teams].sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0));
  let bestScore = costForOrder(best, elo, history, options);

  for (let i = 0; i < iterations; i += 1) {
    const candidate = [...best];
    const idxA = Math.floor(Math.random() * candidate.length);
    const idxB = Math.floor(Math.random() * candidate.length);
    [candidate[idxA], candidate[idxB]] = [candidate[idxB], candidate[idxA]];

    const score = costForOrder(candidate, elo, history, options);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return {
    order: best,
    score: bestScore
  };
}
