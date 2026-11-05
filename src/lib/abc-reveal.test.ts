import { describe, expect, it } from "vitest";
import { abcTeamsHidden } from "./abc-reveal";

describe("abcTeamsHidden", () => {
  const abc = { format: "ABC Chapeau", status: "UPCOMING", teamsRevealedAt: null };

  it("cache les équipes d'un ABC Chapeau à venir, pas encore dévoilé", () => {
    expect(abcTeamsHidden(abc)).toBe(true);
  });
  it("les montre une fois dévoilées", () => {
    expect(abcTeamsHidden({ ...abc, teamsRevealedAt: new Date() })).toBe(false);
  });
  it("les montre dès que le tournoi est lancé ou terminé", () => {
    expect(abcTeamsHidden({ ...abc, status: "LIVE" })).toBe(false);
    expect(abcTeamsHidden({ ...abc, status: "COMPLETED" })).toBe(false);
  });
  it("ne touche pas aux autres formats", () => {
    expect(abcTeamsHidden({ ...abc, format: "3v3" })).toBe(false);
  });
});
