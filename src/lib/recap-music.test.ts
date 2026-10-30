import { describe, expect, it } from "vitest";
import { BARS, STEPS, STEPS_PER_BAR, songEvents } from "./recap-music";

describe("musique du récap", () => {
  const ev = songEvents();

  it("toutes les notes sont jouables (pas dans la boucle, hauteur valide)", () => {
    for (const e of ev) {
      expect(e.step).toBeGreaterThanOrEqual(0);
      expect(e.step).toBeLessThan(STEPS);
      expect(e.len).toBeGreaterThan(0);
      expect(e.vol).toBeGreaterThan(0);
      if (["lead", "bass", "stab", "shred"].includes(e.inst)) {
        expect(Number.isFinite(e.midi)).toBe(true);
        expect(e.midi!).toBeGreaterThanOrEqual(24);
        expect(e.midi!).toBeLessThanOrEqual(96);
      }
    }
  });

  it("grosse caisse à chaque temps, basse à chaque croche", () => {
    expect(ev.filter((e) => e.inst === "kick")).toHaveLength(BARS * 4);
    expect(ev.filter((e) => e.inst === "bass")).toHaveLength(BARS * 8);
  });

  it("8 mesures de riff puis 8 mesures de solo à la double croche", () => {
    const soloStart = 8 * STEPS_PER_BAR;
    expect(ev.filter((e) => e.inst === "lead").every((e) => e.step < soloStart)).toBe(true);
    const shred = ev.filter((e) => e.inst === "shred");
    expect(shred).toHaveLength(8 * STEPS_PER_BAR);
    expect(shred.every((e) => e.step >= soloStart)).toBe(true);
  });
});
