/**
 * DÉMO — maquette du récap « Ton année en bike polo » avec des chiffres
 * inventés, pour valider le déroulé et le design avant les vrais calculs.
 * Non indexée (robots + noindex).
 */
import { YearRecapStory } from "@/components/recap/YearRecapStory";
import type { YearRecapData } from "@/lib/year-recap";

export const metadata = { title: "Démo récap 2026", robots: { index: false, follow: false } };

const DEMO: YearRecapData = {
  year: 2026,
  firstName: "Camille",
  firstSeason: false,
  card: {
    name: "Camille Exemple", country: "Belgium", city: "Bruxelles", clubName: "Brussels Bike Polo", photoPath: null,
    badges: ["champion", "on_fire", "road_warrior", "host", "first_training"], pinnedBadges: ["champion", "on_fire", "road_warrior"], startYear: 2019,
  },
  home: { city: "Bruxelles", lat: 50.8503, lng: 4.3517 },
  tournaments: [
    { name: "Snow Polo Cup", city: "Lyon", country: "France", date: "2026-02-21", lat: 45.764, lng: 4.8357 },
    { name: "Bombance Mixed", city: "Bordeaux", country: "France", date: "2026-04-11", lat: 44.8378, lng: -0.5792 },
    { name: "Mazza d'Oro XXI", city: "Milan", country: "Italy", date: "2026-05-23", lat: 45.4642, lng: 9.19 },
    { name: "Hendlbar Open", city: "Graz", country: "Austria", date: "2026-07-04", lat: 47.0707, lng: 15.4395 },
    { name: "Grand Royal XV", city: "Bruxelles", country: "Belgium", date: "2026-09-12", lat: 50.8503, lng: 4.3517 },
    { name: "Poloween", city: "Leipzig", country: "Germany", date: "2026-10-17", lat: 51.3397, lng: 12.3731 },
  ],
  teammates: {
    count: 9,
    names: ["Léa Martin", "Hugo", "Sam", "Inès", "Tom", "Jo", "Alex", "Nour", "Max"],
    buddy: { name: "Léa", together: 4 },
  },
  pitch: { matches: 38, minutes: 456, goals: 14, opponents: 124, opponentCountries: 12 },
  scene: { refereed: 12, organized: 1, hosted: 3, photos: 18, trainings: 23 },
  badges: ["champion", "on_fire", "road_warrior", "first_blood", "hat_trick", "unbeaten", "team_player", "globe_trotter", "host", "welcome", "first_training", "loyal_rider"],
  community: { tournaments: 87, countries: 24, players: 1412, matches: 2630, goals: 9840 },
};

export default function DemoRecapPage() {
  return <YearRecapStory data={DEMO} demo />;
}
