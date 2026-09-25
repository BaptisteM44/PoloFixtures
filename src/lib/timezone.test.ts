import { describe, it, expect } from "vitest";
import { guessTimezone, tournamentTimezone } from "./timezone";

describe("guessTimezone", () => {
  it("pays à un seul fuseau, sous toutes ses formes", () => {
    expect(guessTimezone("France")).toBe("Europe/Paris");
    expect(guessTimezone("BE")).toBe("Europe/Brussels");
    expect(guessTimezone("Deutschland")).toBe("Europe/Berlin");
    expect(guessTimezone("Portugal", -8.78)).toBe("Europe/Lisbon"); // pas les Açores
    expect(guessTimezone("Spain", -1.6)).toBe("Europe/Madrid");     // pas les Canaries
  });

  it("grands pays : selon la longitude", () => {
    expect(guessTimezone("United States of America", -75.16)).toBe("America/New_York");   // Philadelphie
    expect(guessTimezone("US", -84.39)).toBe("America/New_York");                          // Atlanta
    expect(guessTimezone("USA", -87.63)).toBe("America/Chicago");                          // Chicago
    expect(guessTimezone("USA", -104.99)).toBe("America/Denver");                          // Denver
    expect(guessTimezone("USA", -122.42)).toBe("America/Los_Angeles");                     // San Francisco
    expect(guessTimezone("Russian Federation", 37.62)).toBe("Europe/Moscow");
    expect(guessTimezone("Russia", 30.31)).toBe("Europe/Moscow");                          // Saint-Pétersbourg
    expect(guessTimezone("Brazil", -48.55)).toBe("America/Sao_Paulo");                     // Florianópolis
    expect(guessTimezone("Australia", 144.96)).toBe("Australia/Sydney");                   // Melbourne (même heure)
    expect(guessTimezone("Australia", 147.33)).toBe("Australia/Sydney");                   // Hobart ≈
    expect(guessTimezone("Canada", -79.38)).toBe("America/Toronto");
  });

  it("inconnu → null ; fuseau renseigné prioritaire", () => {
    expect(guessTimezone("XX")).toBe(null);
    expect(tournamentTimezone({ timezone: "Asia/Tokyo", country: "France" })).toBe("Asia/Tokyo");
    expect(tournamentTimezone({ timezone: null, country: "Portugal", lng: -8.78 })).toBe("Europe/Lisbon");
  });
});
