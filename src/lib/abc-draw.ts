/**
 * ABC Chapeau — niveaux et tirage des équipes (logique pure, sans base).
 * Utilisé par la route de tirage et par le panneau orga (équilibre A/B/C).
 */

export const ABC_LEVELS = ["C", "C+", "B-", "B", "B+", "A-", "A", "A+"] as const;
export type AbcLevel = (typeof ABC_LEVELS)[number];

export const LEVEL_SCORE: Record<string, number> = {
  "C": 1, "C+": 2, "B-": 3, "B": 4, "B+": 5, "A-": 6, "A": 7, "A+": 8,
};

export function isAbcLevel(level: string): level is AbcLevel {
  return (ABC_LEVELS as readonly string[]).includes(level);
}

export function getTier(level: string): "A" | "B" | "C" {
  const score = LEVEL_SCORE[level] ?? 4;
  if (score >= 6) return "A";
  if (score >= 3) return "B";
  return "C";
}

/** Nombre de joueurs A, B et C d'une équipe — pour afficher son équilibre. */
export function tierMix(levels: string[]): { A: number; B: number; C: number } {
  const mix = { A: 0, B: 0, C: 0 };
  for (const l of levels) mix[getTier(l)]++;
  return mix;
}

/**
 * Forme floor(n / 3) équipes de 3 : idéalement 1 A + 1 B + 1 C, chaque tier
 * trié du meilleur au moins bon, et un tier insuffisant est comblé par les
 * autres. Les joueurs en trop (n non multiple de 3) restent non placés.
 */
export function buildTriplets<T extends { level: string }>(entries: T[]): T[][] {
  const sorted = [...entries].sort((a, b) => (LEVEL_SCORE[b.level] ?? 4) - (LEVEL_SCORE[a.level] ?? 4));
  const poolA = sorted.filter((e) => getTier(e.level) === "A");
  const poolB = sorted.filter((e) => getTier(e.level) === "B");
  const poolC = sorted.filter((e) => getTier(e.level) === "C");

  const teamCount = Math.floor(entries.length / 3);
  const triplets: T[][] = [];
  for (let i = 0; i < teamCount; i++) {
    const team: T[] = [];
    for (const pool of [poolA, poolB, poolC]) {
      if (pool.length > 0) team.push(pool.shift()!);
    }
    while (team.length < 3) {
      const fill = poolA.shift() ?? poolB.shift() ?? poolC.shift();
      if (!fill) break;
      team.push(fill);
    }
    if (team.length > 0) triplets.push(team);
  }
  return triplets;
}

/** Premier nom « Équipe N » libre, pour une équipe créée à la main. */
export function nextTeamName(existingNames: string[], prefix = "Équipe"): string {
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  for (let i = 1; ; i++) {
    const name = `${prefix} ${i}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}
