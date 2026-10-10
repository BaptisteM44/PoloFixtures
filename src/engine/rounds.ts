/**
 * Moteurs à rounds — briques génériques du pipeline :
 *   - Round Robin (circle method, tous les rounds connus d'avance)
 *   - Swiss (round suivant calculé depuis le classement, évite les rematches)
 *   - Cross-pool (confrontations croisées entre 2 groupes par rang)
 *   - Placement (duels directs par rang : 1erA vs 1erB, 2eA vs 2eB…)
 *
 * Fonctions pures : entrées = ids d'équipes (ordonnés), sorties = appariements.
 * Aucune dépendance DB — testables exhaustivement.
 */

export type Pairing = {
  roundIndex: number;   // 1-based
  positionInRound: number;
  groupKey: string;     // "" si mono-groupe
  teamAId: string;
  teamBId: string | null; // null = BYE
};

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

// ─── Round Robin ─────────────────────────────────────────────────────────────

export type RRGroup = { key: string; teamIds: string[] };
export type RROptions = {
  doubleRound?: boolean; // aller-retour
  maxRounds?: number;    // RR partiel (n premiers rounds seulement)
};

/**
 * Circle method : n-1 rounds (n pair) où chaque équipe joue une fois par round.
 * Nombre impair d'équipes : BYE tournant (teamBId null).
 */
export function rrRounds(groups: RRGroup[], options: RROptions = {}): Pairing[] {
  const out: Pairing[] = [];

  for (const group of groups) {
    const list: (string | null)[] = [...group.teamIds];
    if (list.length % 2 !== 0) list.push(null);
    const n = list.length;
    const baseRounds = n - 1;
    const totalRounds = options.doubleRound ? baseRounds * 2 : baseRounds;
    const limit = options.maxRounds ? Math.min(options.maxRounds, totalRounds) : totalRounds;

    const rotation: (string | null)[] = [...list];
    for (let r = 0; r < limit; r++) {
      const isReturn = r >= baseRounds;
      let pos = 0;
      for (let i = 0; i < n / 2; i++) {
        const p1 = rotation[i];
        const p2 = rotation[n - 1 - i];
        if (p1 === null && p2 === null) continue;
        if (p1 === null || p2 === null) {
          // BYE : l'équipe réelle seule en slot A
          out.push({ roundIndex: r + 1, positionInRound: pos++, groupKey: group.key, teamAId: (p1 ?? p2)!, teamBId: null });
          continue;
        }
        const [home, away] = isReturn ? [p2, p1] : [p1, p2];
        out.push({ roundIndex: r + 1, positionInRound: pos++, groupKey: group.key, teamAId: home, teamBId: away });
      }
      const last = rotation.pop()!;
      rotation.splice(1, 0, last);
    }
  }

  return out;
}

// ─── Swiss ───────────────────────────────────────────────────────────────────

export type SwissOptions = {
  /** Autoriser un rematch si aucun adversaire frais n'existe (défaut true). */
  allowRematchFallback?: boolean;
};

/**
 * Appariement du round suivant : les équipes arrivent TRIÉES par classement
 * (meilleure d'abord). Greedy : chaque équipe rencontre la plus proche au
 * classement qu'elle n'a pas encore affrontée. Impair → BYE à la moins bien
 * classée n'ayant pas encore eu de BYE.
 */
export function swissPairings(
  rankedTeamIds: string[],
  playedPairs: Set<string>,
  hadBye: Set<string>,
  roundIndex: number,
  groupKey = "",
  options: SwissOptions = {}
): Pairing[] {
  const allowFallback = options.allowRematchFallback ?? true;
  const pool = [...rankedTeamIds];
  const pairs: Array<[string, string]> = [];
  let bye: string | null = null;

  // BYE d'abord (si impair) : la moins bien classée sans BYE préalable
  if (pool.length % 2 !== 0) {
    for (let i = pool.length - 1; i >= 0; i--) {
      if (!hadBye.has(pool[i])) {
        bye = pool.splice(i, 1)[0];
        break;
      }
    }
    if (bye === null) bye = pool.pop()!; // toutes ont déjà eu un BYE
  }

  // Appariement par BACKTRACKING : cherche un jumelage complet SANS rematch,
  // en essayant les adversaires par proximité de classement. Un simple glouton
  // (apparier chaque équipe au 1er adversaire frais) « vole » des adversaires
  // et force de faux rematchs alors qu'un jumelage parfait existe — d'où ce
  // solveur récursif. Ne retombe sur un rematch que si c'est réellement
  // impossible (round-robin quasi complet).
  const solution: Array<[string, string]> = [];
  const solve = (remaining: string[]): boolean => {
    if (remaining.length === 0) return true;
    const a = remaining[0];
    const rest = remaining.slice(1);
    for (const b of rest) {
      if (playedPairs.has(pairKey(a, b))) continue;
      solution.push([a, b]);
      if (solve(rest.filter((x) => x !== b))) return true;
      solution.pop();
    }
    return false;
  };

  if (solve(pool)) {
    pairs.push(...solution);
  } else {
    // Aucun jumelage sans rematch possible → glouton avec rematch minimal,
    // au plus proche du classement.
    if (!allowFallback) throw new Error(`Swiss: aucun jumelage sans rematch au round ${roundIndex}`);
    while (pool.length >= 2) {
      const a = pool.shift()!;
      let idx = pool.findIndex((b) => !playedPairs.has(pairKey(a, b)));
      if (idx === -1) idx = 0;
      pairs.push([a, pool.splice(idx, 1)[0]]);
    }
  }

  const out: Pairing[] = pairs.map(([a, b], i) => ({
    roundIndex,
    positionInRound: i,
    groupKey,
    teamAId: a,
    teamBId: b,
  }));
  if (bye !== null) {
    out.push({ roundIndex, positionInRound: out.length, groupKey, teamAId: bye, teamBId: null });
  }
  return out;
}

// ─── Cross-pool ──────────────────────────────────────────────────────────────

/**
 * Chaque équipe du groupe A affronte `opponents` équipes du groupe B, par
 * décalage de rang : round r (0-based) → A[i] vs B[(i + r) % n], n = taille
 * du plus grand groupe. Les deux groupes arrivent TRIÉS par classement.
 *
 * Groupes inégaux (ex: 7 contre 6) : l'équipe en surnombre ne joue pas ce
 * round (BYE, compté 1-0 au classement) — et ce n'est pas toujours la même,
 * le décalage la fait tourner. Avant, une équipe du petit groupe jouait deux
 * fois dans le même round.
 */
export function crossPoolPairings(
  rankedA: string[],
  rankedB: string[],
  opponents: number
): Pairing[] {
  const out: Pairing[] = [];
  const nA = rankedA.length;
  const nB = rankedB.length;
  if (nB === 0 || nA === 0) return out;
  const n = Math.max(nA, nB);

  const rounds = Math.min(opponents, n);
  for (let r = 0; r < rounds; r++) {
    let pos = 0;
    for (let i = 0; i < n; i++) {
      const a = i < nA ? rankedA[i] : null;
      const j = (i + r) % n;
      const b = j < nB ? rankedB[j] : null;
      if (!a && !b) continue;
      out.push({
        roundIndex: r + 1,
        positionInRound: pos++,
        groupKey: "",
        teamAId: (a ?? b)!,
        teamBId: a && b ? b : null, // null = BYE
      });
    }
  }
  return out;
}

// ─── Placement ───────────────────────────────────────────────────────────────

/**
 * Duels directs par rang entre 2 groupes triés : rang i de A vs rang i de B,
 * pour i = 0..count-1. (1erA vs 1erB → places 1/2, 2eA vs 2eB → 3/4, etc.)
 */
export function placementPairings(
  rankedA: string[],
  rankedB: string[],
  count: number
): Pairing[] {
  const out: Pairing[] = [];
  const n = Math.min(count, rankedA.length, rankedB.length);
  for (let i = 0; i < n; i++) {
    out.push({
      roundIndex: 1,
      positionInRound: i,
      groupKey: "",
      teamAId: rankedA[i],
      teamBId: rankedB[i],
    });
  }
  return out;
}
