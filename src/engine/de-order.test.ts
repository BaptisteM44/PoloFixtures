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

  it("un round LB « injection » est émis dans l'ordre de ses feeders WB (pas par positionInRound)", () => {
    // Pour chaque round LB qui reçoit un perdant frais du WB (L1, L2, L(2j-2)),
    // l'ordre d'ÉMISSION doit suivre l'instant où le feeder WB correspondant
    // termine — jamais l'inverse, sinon le match qui dépend du DERNIER match WB
    // joué se retrouve programmé en tête du round suivant → 0 repos pour
    // l'équipe qui vient de perdre. Le placement visuel (positionInRound) doit
    // rester intact : on vérifie juste que la SÉQUENCE D'ÉMISSION est cohérente
    // avec le graphe de dépendances (voir aussi le test de repos ci-dessous).
    for (const n of [8, 16, 32]) {
      const plan = planDE(n, { gfReset: true });
      const posInPlan = new Map(plan.matches.map((m, i) => [m.key, i]));
      const lbInjectionRounds = new Set(
        plan.matches.filter((m) => m.side === "L").map((m) => m.roundIndex)
      );
      for (const round of lbInjectionRounds) {
        const roundMatches = plan.matches.filter((m) => m.side === "L" && m.roundIndex === round);
        // Récupère, pour chaque match du round, la position d'émission de son
        // feeder loserOf (WB) s'il existe.
        const withFeeder = roundMatches
          .map((m) => {
            const feederSlot = [m.slotA, m.slotB].find((s) => s.type === "loserOf");
            return feederSlot ? { m, feederPos: posInPlan.get((feederSlot as { key: string }).key)! } : null;
          })
          .filter((x): x is { m: (typeof roundMatches)[number]; feederPos: number } => x !== null);
        if (withFeeder.length < 2) continue;
        // Trié par position d'émission du match lui-même, le feederPos doit
        // être croissant (on joue d'abord celui dont le feeder a fini le plus tôt).
        const sortedByEmission = [...withFeeder].sort((a, b) => posInPlan.get(a.m.key)! - posInPlan.get(b.m.key)!);
        for (let i = 1; i < sortedByEmission.length; i++) {
          expect(
            sortedByEmission[i].feederPos,
            `${n}éq round L${round}: émission incohérente avec l'ordre des feeders WB`
          ).toBeGreaterThanOrEqual(sortedByEmission[i - 1].feederPos);
        }
      }
    }
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
