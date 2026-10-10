/**
 * Pause entre deux matchs sur un même terrain (changement d'équipes, mise en
 * place). UNE seule valeur pour tout le site : planning des étapes, recalage
 * automatique en fin de match, arbitrage. Avant : 5 min au planning mais
 * 4 min au recalage, d'où un planning qui « dérivait » d'1 min par match.
 */
export const CHANGEOVER_MIN = 5;

/** Durée d'un créneau (match + pause), en minutes. */
export const slotMinutes = (gameDurationMin: number | null | undefined) => (gameDurationMin ?? 15) + CHANGEOVER_MIN;
