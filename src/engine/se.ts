/**
 * Moteur Élimination Simple — plan complet d'un bracket SE pour n'importe quel
 * nombre d'équipes, avec match pour la 3e place optionnel.
 *
 * Conventions (compatibles BracketView / route de score) :
 *   - side "W" : rounds 1..k-1
 *   - side "G" : la finale (roundIndex k)
 *   - side "L" : le match pour la 3e place (roundIndex k), alimenté par les
 *                perdants des demi-finales
 *
 * Byes gérés par contraction de fantômes (cf. bracket-core).
 */
import {
  bracketSeeding,
  contractPhantoms,
  nextPowerOf2,
  type BracketPlan,
  type PlannedMatch,
} from "./bracket-core";

export type SEOptions = {
  thirdPlace?: boolean;
};

export function planSE(teamCount: number, options: SEOptions = {}): BracketPlan {
  if (teamCount < 2) throw new Error(`SE requiert au moins 2 équipes (reçu ${teamCount})`);
  const P = nextPowerOf2(teamCount);
  const k = Math.log2(P);

  const graph: PlannedMatch[] = [];
  const order = bracketSeeding(P);

  // Rounds 1..k-1, side "W"
  for (let r = 1; r < k; r++) {
    const count = P / Math.pow(2, r);
    for (let i = 0; i < count; i++) {
      graph.push({
        key: `W${r}-${i}`,
        side: "W",
        roundIndex: r,
        positionInRound: i,
        slotA: r === 1
          ? { type: "seed", seed: order[2 * i] }
          : { type: "winnerOf", key: `W${r - 1}-${2 * i}` },
        slotB: r === 1
          ? { type: "seed", seed: order[2 * i + 1] }
          : { type: "winnerOf", key: `W${r - 1}-${2 * i + 1}` },
      });
    }
  }

  // 3e place (avant la finale dans l'ordre chronologique) : perdants des demi-finales
  if (options.thirdPlace && k >= 2) {
    graph.push({
      key: `L${k}-0`,
      side: "L",
      roundIndex: k,
      positionInRound: 0,
      slotA: { type: "loserOf", key: `W${k - 1}-0` },
      slotB: { type: "loserOf", key: `W${k - 1}-1` },
    });
  }

  // Finale, side "G"
  graph.push({
    key: `G${k}-0`,
    side: "G",
    roundIndex: k,
    positionInRound: 0,
    slotA: k === 1 ? { type: "seed", seed: order[0] } : { type: "winnerOf", key: `W${k - 1}-0` },
    slotB: k === 1 ? { type: "seed", seed: order[1] } : { type: "winnerOf", key: `W${k - 1}-1` },
  });

  const matches = contractPhantoms(graph, teamCount);
  return { matches, teamCount, bracketSize: P };
}
