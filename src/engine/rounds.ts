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

  while (pool.length >= 2) {
    const a = pool.shift()!;
    let idx = pool.findIndex((b) => !playedPairs.has(pairKey(a, b)));
    if (idx === -1) {
      if (!allowFallback) throw new Error(`Swiss: aucun adversaire frais pour ${a} au round ${roundIndex}`);
      idx = 0; // rematch inévitable : plus proche au classement
    }
    pairs.push([a, pool.splice(idx, 1)[0]]);
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
 * décalage de rang : round r (0-based) → A[i] vs B[(i + r) % nB].
 * Les deux groupes arrivent TRIÉS par classement.
 */
export function crossPoolPairings(
  rankedA: string[],
  rankedB: string[],
  opponents: number
): Pairing[] {
  const out: Pairing[] = [];
  const nB = rankedB.length;
  if (nB === 0 || rankedA.length === 0) return out;

  const rounds = Math.min(opponents, nB);
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < rankedA.length; i++) {
      out.push({
        roundIndex: r + 1,
        positionInRound: i,
        groupKey: "",
        teamAId: rankedA[i],
        teamBId: rankedB[(i + r) % nB],
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
