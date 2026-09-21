/**
 * Repos minimum entre deux matchs consécutifs d'une même équipe dans un
 * bracket DE. Retour terrain : une équipe qui vient de perdre pouvait
 * enchaîner directement le match suivant (0 minute de repos), là où une
 * équipe qui reste en winner bracket bénéficie toujours d'une pause entre ses
 * matchs. Seule exception acceptée : la toute fin du loser bracket (2 équipes
 * restantes, enchaînement structurellement inévitable avant la grande finale).
 *
 * Ce test réplique le calcul de planning de persist-plan.ts (mêmes règles,
 * y compris le garde-fou anti-enchaînement) pour vérifier l'invariant sans
 * dépendre d'une base de données.
 */
import { describe, it, expect } from "vitest";
import { planDE } from "./de";

function schedule(plan: ReturnType<typeof planDE>, courts: number, slotMin = 15) {
  const groupSizes = new Map<string, number>();
  for (const m of plan.matches) {
    const g = `${m.side}${m.roundIndex}`;
    groupSizes.set(g, (groupSizes.get(g) ?? 0) + 1);
  }
  const endByKey = new Map<string, number>();
  const startByKey = new Map<string, number>();
  let roundStart = 0;
  let prevGroup = "";
  let indexInRound = 0;
  let roundSize = 0;

  for (const m of plan.matches) {
    const group = `${m.side}${m.roundIndex}`;
    if (group !== prevGroup) {
      if (prevGroup !== "") roundStart += Math.ceil(roundSize / courts) * slotMin;
      prevGroup = group;
      indexInRound = 0;
      roundSize = groupSizes.get(group) ?? 1;

      const roundMatches = plan.matches.filter((mm) => `${mm.side}${mm.roundIndex}` === group);
      let latestFeederEnd = -Infinity;
      for (const rm of roundMatches) {
        for (const slot of [rm.slotA, rm.slotB]) {
          if (slot && (slot.type === "winnerOf" || slot.type === "loserOf")) {
            const feederEnd = endByKey.get(slot.key);
            if (feederEnd !== undefined && feederEnd > latestFeederEnd) latestFeederEnd = feederEnd;
          }
        }
      }
      if (latestFeederEnd >= roundStart) roundStart += slotMin;
    }
    const start = roundStart + Math.floor(indexInRound / courts) * slotMin;
    indexInRound++;
    startByKey.set(m.key, start);
    endByKey.set(m.key, start + slotMin);
  }
  return { startByKey, endByKey };
}

function restViolations(n: number, courts: number, slotMin = 15): string[] {
  const plan = planDE(n, { gfReset: true });
  const { startByKey, endByKey } = schedule(plan, courts, slotMin);
  const violations: string[] = [];
  for (const m of plan.matches) {
    for (const slot of [m.slotA, m.slotB]) {
      if (slot && slot.type === "loserOf" && endByKey.has(slot.key)) {
        const rest = startByKey.get(m.key)! - endByKey.get(slot.key)!;
        if (rest < slotMin) violations.push(`${m.key} repos=${rest}min (feed ${slot.key})`);
      }
    }
  }
  return violations;
}

describe("DE — repos minimum après une défaite", () => {
  for (const n of [8, 12, 16, 24, 32]) {
    for (const courts of [1, 2, 3, 4]) {
      it(`${n} équipes / ${courts} terrain(s) : jamais 0 repos après une défaite`, () => {
        expect(restViolations(n, courts)).toEqual([]);
      });
    }
  }
});
