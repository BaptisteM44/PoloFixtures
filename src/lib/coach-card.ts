/** Édition de la carte Coach actuellement distribuée. */
export const COACH_EDITION = { tournament: "Newbalaya 2026", city: "Bordeaux" } as const;

/** Prochain n° d'exemplaire (« 01 », « 02 »…) : le plus grand déjà donné + 1. */
export function nextCollectorNumber(taken: string[]): string {
  const max = taken.reduce((m, n) => Math.max(m, parseInt(n, 10) || 0), 0);
  return String(max + 1).padStart(2, "0");
}
