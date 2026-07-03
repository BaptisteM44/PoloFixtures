/**
 * Moteur Double Élimination — génère le PLAN complet d'un bracket DE
 * pour n'importe quel nombre d'équipes.
 *
 * Conventions (compatibles BracketView / route de score) :
 *   - side "W" : winner bracket, rounds 1..k (k = log2(P))
 *   - side "L" : loser bracket, rounds 1..2k-2
 *       LB R1        = perdants du WB R1 appariés
 *       LB R2        = injection des perdants WB R2
 *       LB R(2j-3)   = consolidation (avant WB Rj),  j ≥ 3
 *       LB R(2j-2)   = injection des perdants WB Rj, j ≥ 3
 *   - side "G"  : grande finale — slot A = vainqueur WB, slot B = vainqueur LB
 *   - side "BG" : reset de la grande finale (optionnel), slots vides,
 *                 activé par la route de score si le joueur LB gagne la GF
 *
 * Ordre d'émission = ordre chronologique : W1, L1, W2, L2,
 * puis pour j=3..k : L(2j-3), Wj, L(2j-2), puis G, BG.
 */
import {
  bracketSeeding,
  contractPhantoms,
  nextPowerOf2,
  type BracketPlan,
  type PlannedMatch,
} from "./bracket-core";

export type DEOptions = {
  gfReset?: boolean;
};

/**
 * Permutation anti-rematch pour l'injection des perdants du WB round r
 * dans le LB (variante standard : rounds pairs inversés, impairs demi-décalés).
 * N'importe quelle bijection est structurellement valide ; celle-ci évite que
 * deux équipes se recroisent immédiatement après s'être affrontées en WB.
 */
function injectionPerm(j: number, count: number, wbRound: number): number {
  if (count <= 1) return 0;
  if (wbRound % 2 === 0) return count - 1 - j; // inversé
  return (j + count / 2) % count; // demi-décalage
}

export function planDE(teamCount: number, options: DEOptions = {}): BracketPlan {
  if (teamCount < 3) throw new Error(`DE requiert au moins 3 équipes (reçu ${teamCount})`);
  const P = nextPowerOf2(teamCount);
  const k = Math.log2(P);

  const graph: PlannedMatch[] = [];
  const order = bracketSeeding(P);

  // ── WB R1 : seeds directs ──
  for (let i = 0; i < P / 2; i++) {
    graph.push({
      key: `W1-${i}`,
      side: "W",
      roundIndex: 1,
      positionInRound: i,
      slotA: { type: "seed", seed: order[2 * i] },
      slotB: { type: "seed", seed: order[2 * i + 1] },
    });
  }

  // ── LB R1 : perdants du WB R1 appariés ──
  if (k >= 2) {
    for (let i = 0; i < P / 4; i++) {
      graph.push({
        key: `L1-${i}`,
        side: "L",
        roundIndex: 1,
        positionInRound: i,
        slotA: { type: "loserOf", key: `W1-${2 * i}` },
        slotB: { type: "loserOf", key: `W1-${2 * i + 1}` },
      });
    }
  }

  // ── WB R2 ──
  if (k >= 2) {
    for (let i = 0; i < P / 4; i++) {
      graph.push({
        key: `W2-${i}`,
        side: "W",
        roundIndex: 2,
        positionInRound: i,
        slotA: { type: "winnerOf", key: `W1-${2 * i}` },
        slotB: { type: "winnerOf", key: `W1-${2 * i + 1}` },
      });
    }
    // ── LB R2 : injection des perdants WB R2 ──
    for (let i = 0; i < P / 4; i++) {
      graph.push({
        key: `L2-${i}`,
        side: "L",
        roundIndex: 2,
        positionInRound: i,
        slotA: { type: "winnerOf", key: `L1-${i}` },
        slotB: { type: "loserOf", key: `W2-${injectionPerm(i, P / 4, 2)}` },
      });
    }
  }

  // ── Rounds suivants : consolidation LB, WB Rj, injection LB ──
  for (let j = 3; j <= k; j++) {
    const count = P / Math.pow(2, j);

    // Consolidation LB R(2j-3) : les survivants du LB précédent s'affrontent
    for (let i = 0; i < count; i++) {
      graph.push({
        key: `L${2 * j - 3}-${i}`,
        side: "L",
        roundIndex: 2 * j - 3,
        positionInRound: i,
        slotA: { type: "winnerOf", key: `L${2 * j - 4}-${2 * i}` },
        slotB: { type: "winnerOf", key: `L${2 * j - 4}-${2 * i + 1}` },
      });
    }

    // WB Rj
    for (let i = 0; i < count; i++) {
      graph.push({
        key: `W${j}-${i}`,
        side: "W",
        roundIndex: j,
        positionInRound: i,
        slotA: { type: "winnerOf", key: `W${j - 1}-${2 * i}` },
        slotB: { type: "winnerOf", key: `W${j - 1}-${2 * i + 1}` },
      });
    }

    // Injection LB R(2j-2) : consolidés vs perdants WB Rj
    for (let i = 0; i < count; i++) {
      graph.push({
        key: `L${2 * j - 2}-${i}`,
        side: "L",
        roundIndex: 2 * j - 2,
        positionInRound: i,
        slotA: { type: "winnerOf", key: `L${2 * j - 3}-${i}` },
        slotB: { type: "loserOf", key: `W${j}-${injectionPerm(i, count, j)}` },
      });
    }
  }

  // ── Grande finale : vainqueur WB (slot A) vs vainqueur LB (slot B) ──
  graph.push({
    key: "G1-0",
    side: "G",
    roundIndex: 1,
    positionInRound: 0,
    slotA: { type: "winnerOf", key: `W${k}-0` },
    slotB: { type: "winnerOf", key: `L${2 * k - 2}-0` },
  });

  // Contraction des byes (seeds fantômes > teamCount)
  const matches = contractPhantoms(graph, teamCount);

  // ── GF reset (optionnel) : slots vides, activé au runtime par la route ──
  if (options.gfReset) {
    matches.push({
      key: "BG1-0",
      side: "BG",
      roundIndex: 2,
      positionInRound: 0,
      slotA: { type: "seed", seed: 0 },
      slotB: { type: "seed", seed: 0 },
      seedA: null,
      seedB: null,
    });
  }

  return { matches, teamCount, bracketSize: P };
}
