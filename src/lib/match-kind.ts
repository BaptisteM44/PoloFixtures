/**
 * Match à élimination (pas de nul possible, golden goal en prolongation).
 * Ne pas se fier à phase === "BRACKET" : depuis le moteur de formats, les
 * tableaux SE/DE sont en phase "STAGE". Un match de tableau se reconnaît à sa
 * place dans le tableau (bracketSide) ; MTP_BARRAGE (ancien format) n'en a pas.
 */
export function isEliminationMatch(m: { phase: string; bracketSide?: string | null }): boolean {
  return !!m.bracketSide || m.phase === "BRACKET" || m.phase === "MTP_BARRAGE";
}
