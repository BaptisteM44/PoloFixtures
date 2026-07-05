import { describe, it, expect } from "vitest";
import { planDE } from "./de";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simule le déroulement complet d'un plan DE : joue chaque match dans l'ordre
 * d'émission, propage vainqueur/perdant via winTo/loseTo, et vérifie que la
 * structure est jouable de bout en bout.
 */
function simulatePlan(teamCount: number, gfReset: boolean, rngSeed: number) {
  const plan = planDE(teamCount, { gfReset });
  const rng = mulberry32(rngSeed);

  // état des slots de chaque match
  const slots = new Map<string, { A: number | null; B: number | null }>();
  for (const m of plan.matches) {
    slots.set(m.key, { A: m.seedA, B: m.seedB });
  }

  const losses = new Map<number, number>();
  let champion: number | null = null;

  for (const m of plan.matches) {
    if (m.side === "BG") continue; // reset conditionnel, hors simulation
    const s = slots.get(m.key)!;
    if (s.A === null || s.B === null) {
      throw new Error(`Match ${m.key} incomplet au moment de le jouer: A=${s.A} B=${s.B}`);
    }
    const winner = rng() < 0.5 ? s.A : s.B;
    const loser = winner === s.A ? s.B : s.A;
    losses.set(loser, (losses.get(loser) ?? 0) + 1);

    if (m.winTo) {
      const target = slots.get(m.winTo.key)!;
      if (target[m.winTo.slot] !== null) throw new Error(`Slot ${m.winTo.key}:${m.winTo.slot} déjà occupé (winTo depuis ${m.key})`);
      target[m.winTo.slot] = winner;
    } else if (m.side === "G") {
      champion = winner;
    }
    if (m.loseTo) {
      const target = slots.get(m.loseTo.key)!;
      if (target[m.loseTo.slot] !== null) throw new Error(`Slot ${m.loseTo.key}:${m.loseTo.slot} déjà occupé (loseTo depuis ${m.key})`);
      target[m.loseTo.slot] = loser;
    }
  }

  return { plan, losses, champion };
}

describe("planDE — structure", () => {
  for (let n = 3; n <= 32; n++) {
    it(`n=${n} : plan cohérent (${2 * n - 2} matchs, liens complets)`, () => {
      const plan = planDE(n);
      const real = plan.matches.filter((m) => m.side !== "BG");

      // 2n-2 matchs exactement (propriété mathématique du DE)
      expect(real).toHaveLength(2 * n - 2);

      // Chaque équipe entre dans le bracket exactement une fois
      const placed = real.flatMap((m) => [m.seedA, m.seedB]).filter((s): s is number => s !== null);
      expect([...placed].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1));

      // Liens : tout match a un winTo sauf la GF ; tout match W a un loseTo ;
      // les matchs L n'ont pas de loseTo (perdant éliminé)
      for (const m of real) {
        if (m.side === "G") {
          expect(m.winTo, `GF ne doit pas avoir de winTo`).toBeUndefined();
        } else {
          expect(m.winTo, `${m.key} doit avoir un winTo`).toBeDefined();
        }
        if (m.side === "W") {
          expect(m.loseTo, `${m.key} (WB) doit avoir un loseTo`).toBeDefined();
        }
        if (m.side === "L" || m.side === "G") {
          expect(m.loseTo, `${m.key} ne doit pas avoir de loseTo`).toBeUndefined();
        }
      }
    });
  }

  it("n=16 : structure LB conforme (rounds 1..6, pattern MTP)", () => {
    const plan = planDE(16);
    const lbByRound = new Map<number, number>();
    for (const m of plan.matches.filter((m) => m.side === "L")) {
      lbByRound.set(m.roundIndex, (lbByRound.get(m.roundIndex) ?? 0) + 1);
    }
    // LB: R1=4, R2=4 (inj), R3=2 (cons), R4=2 (inj), R5=1 (cons), R6=1 (inj)
    expect([...lbByRound.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [1, 4], [2, 4], [3, 2], [4, 2], [5, 1], [6, 1],
    ]);
  });

  it("gfReset : ajoute un match BG vide", () => {
    const plan = planDE(8, { gfReset: true });
    const bg = plan.matches.filter((m) => m.side === "BG");
    expect(bg).toHaveLength(1);
    expect(bg[0].seedA).toBeNull();
    expect(bg[0].seedB).toBeNull();
    expect(bg[0].winTo).toBeUndefined();
  });

  it("seeding WB R1 : 1v16, paires équilibrées (somme = 17)", () => {
    const plan = planDE(16);
    const r1 = plan.matches.filter((m) => m.side === "W" && m.roundIndex === 1);
    expect(r1).toHaveLength(8);
    for (const m of r1) {
      expect((m.seedA ?? 0) + (m.seedB ?? 0)).toBe(17);
    }
  });
});

describe("planDE — grandes tailles (48, 64)", () => {
  for (const n of [40, 48, 56, 64]) {
    it(`n=${n} : structure ${2 * n - 2} matchs + simulation jouable`, () => {
      const plan = planDE(n);
      expect(plan.matches.filter((m) => m.side !== "BG")).toHaveLength(2 * n - 2);
      const { champion } = simulatePlan(n, true, 42);
      expect(champion).not.toBeNull();
    });
  }
});

describe("planDE — simulation complète (le bracket est jouable de bout en bout)", () => {
  for (let n = 3; n <= 32; n++) {
    for (const seed of [1, 42, 1337]) {
      it(`n=${n}, rng=${seed} : tous les matchs jouables, 1 champion, éliminations correctes`, () => {
        const { losses, champion } = simulatePlan(n, n % 2 === 0, seed);

        // Un champion existe
        expect(champion).not.toBeNull();
        const championLosses = losses.get(champion!) ?? 0;
        // Le champion a au plus 1 défaite (si 1 : scénario reset, hors plan de base)
        expect(championLosses).toBeLessThanOrEqual(1);

        const eliminated = [...losses.entries()].filter(([team]) => team !== champion);
        const withTwo = eliminated.filter(([, l]) => l === 2).length;
        const withOne = eliminated.filter(([, l]) => l === 1).length;
        if (championLosses === 0) {
          // Champion via WB : tous les éliminés ont exactement 2 défaites
          expect(withTwo).toBe(n - 1);
        } else {
          // Champion via LB : le perdant de la GF (joueur WB) n'a qu'1 défaite
          expect(withTwo).toBe(n - 2);
          expect(withOne).toBe(1);
        }
      });
    }
  }
});
