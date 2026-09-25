import { describe, it, expect } from "vitest";
import { areResultsVisibleToVoters, isPollOpen, isVoterEligible, isPollRestricted } from "./poll-vote";

describe("areResultsVisibleToVoters", () => {
  const base = { status: "OPEN" as const, resultsAt: null as Date | null };

  it("IMMEDIATE : toujours visible", () => {
    expect(areResultsVisibleToVoters({ ...base, showResults: "IMMEDIATE" })).toBe(true);
    expect(areResultsVisibleToVoters({ ...base, showResults: "IMMEDIATE", status: "CLOSED" })).toBe(true);
  });

  it("HIDDEN : jamais visible, même sondage fermé", () => {
    expect(areResultsVisibleToVoters({ ...base, showResults: "HIDDEN" })).toBe(false);
    expect(areResultsVisibleToVoters({ ...base, showResults: "HIDDEN", status: "CLOSED" })).toBe(false);
  });

  it("AT_CLOSE : visible seulement quand status=CLOSED", () => {
    expect(areResultsVisibleToVoters({ ...base, showResults: "AT_CLOSE", status: "OPEN" })).toBe(false);
    expect(areResultsVisibleToVoters({ ...base, showResults: "AT_CLOSE", status: "CLOSED" })).toBe(true);
  });

  it("AT_DATE : visible seulement après resultsAt", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const future = new Date("2026-06-20T00:00:00Z");
    const past = new Date("2026-06-01T00:00:00Z");
    expect(areResultsVisibleToVoters({ ...base, showResults: "AT_DATE", resultsAt: future }, now)).toBe(false);
    expect(areResultsVisibleToVoters({ ...base, showResults: "AT_DATE", resultsAt: past }, now)).toBe(true);
  });

  it("AT_DATE sans resultsAt défini : jamais visible (pas de date = pas d'ouverture)", () => {
    expect(areResultsVisibleToVoters({ ...base, showResults: "AT_DATE", resultsAt: null })).toBe(false);
  });
});

describe("isPollOpen (non régression)", () => {
  const opts = ["Oui", "Non"];
  it("DRAFT n'est jamais ouvert", () => {
    expect(isPollOpen({ id: "1", status: "DRAFT", options: opts, multipleChoice: false, openAt: null, closeAt: null })).toBe(false);
  });
  it("OPEN sans dates est ouvert", () => {
    expect(isPollOpen({ id: "1", status: "OPEN", options: opts, multipleChoice: false, openAt: null, closeAt: null })).toBe(true);
  });
  it("un sondage bloqué par la modération n'est jamais ouvert", () => {
    expect(isPollOpen({ id: "1", status: "OPEN", options: opts, multipleChoice: false, openAt: null, closeAt: null, blockedAt: new Date() })).toBe(false);
  });
});

describe("isVoterEligible (ciblage des votants)", () => {
  const none = { eligibleClubIds: [], eligibleCountries: [], eligibleContinents: [] };
  const brussels = { country: "Belgium", continent: "EU", clubIds: ["club-bxl"] };
  const lyon = { country: "France", continent: "EU", clubIds: ["club-lyon"] };
  const nyc = { country: "United States", continent: "NA", clubIds: [] };

  it("sans restriction : tout le monde, y compris les invités", () => {
    expect(isPollRestricted(none)).toBe(false);
    expect(isVoterEligible(none, null)).toBe(true);
    expect(isVoterEligible(none, nyc)).toBe(true);
  });

  it("avec restriction : un invité ne peut jamais voter", () => {
    expect(isVoterEligible({ ...none, eligibleContinents: ["EU"] }, null)).toBe(false);
  });

  it("club : membre d'au moins un des clubs visés", () => {
    const poll = { ...none, eligibleClubIds: ["club-bxl", "club-gand"] };
    expect(isVoterEligible(poll, brussels)).toBe(true);
    expect(isVoterEligible(poll, lyon)).toBe(false);
  });

  it("pays : comparaison insensible à la casse", () => {
    const poll = { ...none, eligibleCountries: ["belgium", "Netherlands"] };
    expect(isVoterEligible(poll, brussels)).toBe(true);
    expect(isVoterEligible(poll, lyon)).toBe(false);
  });

  it("continent", () => {
    const poll = { ...none, eligibleContinents: ["EU"] };
    expect(isVoterEligible(poll, lyon)).toBe(true);
    expect(isVoterEligible(poll, nyc)).toBe(false);
  });

  it("plusieurs critères : un seul suffit (OU) — ajouter une cible élargit", () => {
    const poll = { ...none, eligibleClubIds: ["club-bxl"], eligibleCountries: ["France"] };
    expect(isVoterEligible(poll, brussels)).toBe(true); // via le club
    expect(isVoterEligible(poll, lyon)).toBe(true);     // via le pays
    expect(isVoterEligible(poll, nyc)).toBe(false);
  });

  it("joueur sans pays renseigné exclu d'un ciblage par pays", () => {
    const poll = { ...none, eligibleCountries: ["France"] };
    expect(isVoterEligible(poll, { country: null, continent: null, clubIds: [] })).toBe(false);
  });
});
