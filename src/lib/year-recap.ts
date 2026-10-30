/**
 * Récap « Ton année en bike polo » — forme des données affichées et petits
 * calculs (distances). Les vrais calculs en base viendront ici ; pour l'instant
 * la maquette /demo-recap fournit des chiffres inventés.
 *
 * Règle : uniquement les tournois qui se sont vraiment JOUÉS avec Poloperator
 * (des matchs terminés sur la plateforme), pas ceux seulement annoncés ou
 * listés. Jamais de classement.
 */

export type RecapTournament = { name: string; city: string; country: string; date: string; lat: number; lng: number };

export type YearRecapData = {
  year: number;
  firstName: string;
  firstSeason: boolean;
  card: {
    name: string; country: string; city: string | null; clubName: string | null; photoPath: string | null;
    badges: string[]; pinnedBadges: string[]; startYear: number | null;
  };
  /** Ville du profil, géocodée (null : pas d'écran « kilomètres »). */
  home: { city: string; lat: number; lng: number } | null;
  /** Tournois joués dans l'année, dans l'ordre des dates. */
  tournaments: RecapTournament[];
  teammates: { count: number; names: string[]; buddy: { name: string; together: number } | null };
  pitch: { matches: number; minutes: number; goals: number; opponents: number; opponentCountries: number };
  scene: { refereed: number; organized: number; hosted: number; photos: number; trainings: number };
  /** Collection de badges à ce jour (leur date d'obtention n'est pas connue). */
  badges: string[];
  community: { tournaments: number; countries: number; players: number; matches: number; goals: number };
  /** Carte Saison offerte en fin de récap (n° dans la série de l'année). */
  gift: { serial: string } | null;
};

export const EARTH_KM = 40_075;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Kilomètres à vol d'oiseau : un aller-retour depuis chez soi pour chaque tournoi. */
export function travelKm(home: { lat: number; lng: number } | null, tournaments: RecapTournament[]): number {
  if (!home) return 0;
  return Math.round(tournaments.reduce((sum, t) => sum + 2 * haversineKm(home, t), 0));
}
