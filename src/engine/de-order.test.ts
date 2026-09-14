/**
 * Ordre de passage du bracket DE : l'ordre d'émission (= ordre de planification
 * sur les terrains) doit refléter le déroulé d'un vrai tableau de double
 * élimination — on alterne winner bracket et loser bracket par vagues, au lieu
 * de « geler » le WB en enchaînant plusieurs rounds LB. Retour terrain : les
 * matchs paraissaient dans le désordre.
 */
import { describe, it, expect } from "vitest";
import { planDE } from "./de";

const SIDE: Record<string, string> = { W: "WB", L: "LB", G: "GF", BG: "GFr" };

function waveOrder(n: number): string[] {
  const plan = planDE(n, { gfReset: true });
  const seen = new Set<string>();
  const order: string[] = [];
  for (const m of plan.matches) {
    const key = `${SIDE[m.side]}${m.roundIndex}`;
    if (!seen.has(key)) { seen.add(key); order.push(key); }
  }
  return order;
}

describe("DE — ordre de passage des rounds", () => {
  it("8 équipes : WB et LB alternent, WB jamais gelé", () => {
    expect(waveOrder(8)).toEqual([
      "WB1", "LB1", "WB2", "LB2", "WB3", "LB3", "LB4", "GF1", "GFr2",
    ]);
  });

  it("16 équipes : chaque round WB précède les rounds LB qu'il alimente", () => {
    expect(waveOrder(16)).toEqual([
      "WB1", "LB1", "WB2", "LB2", "WB3", "LB3", "LB4", "WB4", "LB5", "LB6", "GF1", "GFr2",
    ]);
  });

  it("ordre topologique : aucun match avant ses feeders (4..32 équipes)", () => {
    for (const n of [4, 5, 6, 8, 12, 16, 24, 32]) {
      const plan = planDE(n, { gfReset: true });
      const pos = new Map(plan.matches.map((m, i) => [m.key, i]));
      const byKey = new Map(plan.matches.map((m) => [m.key, m]));
      for (const m of plan.matches) {
        for (const s of [m.slotA, m.slotB] as Array<{ type: string; key?: string }>) {
          if ((s?.type === "winnerOf" || s?.type === "loserOf") && s.key && byKey.has(s.key)) {
            expect(pos.get(m.key)!, `${n}éq: ${m.key} émis avant ${s.key}`).toBeGreaterThan(pos.get(s.key)!);
          }
        }
      }
    }
  });
});
