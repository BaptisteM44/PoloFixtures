import { describe, it, expect } from "vitest";
import { areResultsVisibleToVoters, isPollOpen } from "./poll-vote";

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
});
