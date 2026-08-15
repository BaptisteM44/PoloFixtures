import { describe, it, expect } from "vitest";
import { isAfterEndThreshold } from "./tournament-status";

/**
 * Un tournoi (pipeline) ne doit devenir FINISHED qu'à partir de 21h heure LOCALE
 * du dernier jour — pas en plein après-midi juste parce que tous les matchs sont
 * saisis. Ces tests verrouillent le calcul du seuil (fuseau + heure).
 */
describe("isAfterEndThreshold (21h locale du dernier jour)", () => {
  // dateEnd = 5 août 2026 (midi UTC → jour calendaire non ambigu tous fuseaux).
  const dateEnd = new Date("2026-08-05T12:00:00Z");
  const tz = "Europe/Brussels"; // été → UTC+2

  it("l'après-midi du dernier jour : PAS encore terminé", () => {
    // 16h00 heure de Bruxelles = 14h00 UTC
    const now = new Date("2026-08-05T14:00:00Z");
    expect(isAfterEndThreshold(dateEnd, tz, now)).toBe(false);
  });

  it("juste avant 21h local : PAS encore terminé", () => {
    // 20h59 Bruxelles = 18h59 UTC
    const now = new Date("2026-08-05T18:59:00Z");
    expect(isAfterEndThreshold(dateEnd, tz, now)).toBe(false);
  });

  it("à 21h local pile : terminé", () => {
    // 21h00 Bruxelles = 19h00 UTC
    const now = new Date("2026-08-05T19:00:00Z");
    expect(isAfterEndThreshold(dateEnd, tz, now)).toBe(true);
  });

  it("le lendemain : terminé", () => {
    const now = new Date("2026-08-06T09:00:00Z");
    expect(isAfterEndThreshold(dateEnd, tz, now)).toBe(true);
  });

  it("la veille : PAS terminé", () => {
    const now = new Date("2026-08-04T23:00:00Z");
    expect(isAfterEndThreshold(dateEnd, tz, now)).toBe(false);
  });

  it("fuseau absent → calcul en UTC (21h UTC)", () => {
    expect(isAfterEndThreshold(dateEnd, null, new Date("2026-08-05T20:59:00Z"))).toBe(false);
    expect(isAfterEndThreshold(dateEnd, null, new Date("2026-08-05T21:00:00Z"))).toBe(true);
  });

  it("fuseau plus à l'ouest (New York, UTC-4 l'été) : 21h local = 01h UTC le lendemain", () => {
    // dateEnd à midi UTC → le jour calendaire est le même (5 août) dans tous les
    // fuseaux usuels, ce qui évite l'ambiguïté d'un minuit UTC qui glisse à la veille.
    const nyEnd = new Date("2026-08-05T12:00:00Z");
    // 20h00 New York (5 août) = 00h00 UTC (le 6) → pas encore 21h local
    expect(isAfterEndThreshold(nyEnd, "America/New_York", new Date("2026-08-06T00:00:00Z"))).toBe(false);
    // 21h00 New York (5 août) = 01h00 UTC (le 6)
    expect(isAfterEndThreshold(nyEnd, "America/New_York", new Date("2026-08-06T01:00:00Z"))).toBe(true);
  });
});
