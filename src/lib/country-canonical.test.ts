import { describe, it, expect } from "vitest";
import { countryToIso, canonicalCountryName, sameCountry } from "@/lib/country-utils";
describe("country", () => {
  it("variants", () => {
    expect(["FR","france","FRANCE","France","fr"].map(countryToIso)).toEqual(["FR","FR","FR","FR","FR"]);
    expect(["UK","GB","United Kingdom","England"].map(countryToIso)).toEqual(["GB","GB","GB","GB"]);
    expect(["USA","US","United States","United States of America"].map(countryToIso)).toEqual(["US","US","US","US"]);
    expect(["Deutschland","DE","Allemagne","de"].map(countryToIso)).toEqual(["DE","DE","DE","DE"]);
    expect(countryToIso("XX")).toBe(null);
    expect(canonicalCountryName("USA")).toBe("United States of America");
    expect(canonicalCountryName("BE")).toBe("Belgium");
    expect(sameCountry("FR","France")).toBe(true);
    expect(sameCountry("FR","Belgium")).toBe(false);
  });
});

describe("normalizeCountry", () => {
  it("variantes réelles vues en prod → nom officiel ; inconnu → saisie nettoyée", async () => {
    const { normalizeCountry } = await import("@/lib/country-utils");
    expect(["FR", "france", "Allemagne", "Россия", "🇬🇧", "Swizerland", "Berlin"].map(normalizeCountry))
      .toEqual(["France", "France", "Germany", "Russian Federation", "United Kingdom", "Switzerland", "Germany"]);
    expect(normalizeCountry("  TBA ")).toBe("TBA");
  });
});
