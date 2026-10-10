/**
 * Classement d'une étape — le pipeline expose un classement 1→N pour CHAQUE
 * type d'étape. C'est ce que consomment les transitions (rangs X-Y), le
 * classement final du tournoi, l'ELO et les badges.
 *
 * Fonctions pures sur des matchs "lite" (pas de dépendance Prisma).
 */

export type MatchLite = {
  groupKey?: string | null;
  roundIndex: number;
  positionInRound: number;
  bracketSide?: string | null;
  status: string;
  teamAId: string | null;
  teamBId: string | null;
  scoreA: number;
  scoreB: number;
  winnerTeamId?: string | null;
};

export type ScoringConfig = { win: number; draw: number; loss: number };
export const DEFAULT_SCORING: ScoringConfig = { win: 3, draw: 1, loss: 0 };

export type StandingRow = {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  /** Somme des points des adversaires rencontrés (force du calendrier). */
  buchholz: number;
  /** Somme des points des adversaires battus. */
  sonnebornBerger: number;
};

// ─── Étapes à points (RR / Swiss / Cross-pool) ───────────────────────────────

const isBye = (m: MatchLite) => m.status === "FINISHED" && !!m.teamAId && !m.teamBId;

/**
 * LE classement à points — utilisé à la fois par le moteur (qui se qualifie)
 * et par les tableaux affichés aux joueurs : les deux sont toujours identiques.
 *
 * `teamIds` fixe la population (et l'ordre en cas d'égalité parfaite : l'ordre
 * d'entrée = seed du stage fait foi). Un BYE compte comme une victoire 1-0.
 * Départage : points > différence de buts > Buchholz > Sonneborn-Berger >
 * buts marqués > confrontation directe > ordre d'entrée.
 */
export function standingsTable(
  teamIds: string[],
  matches: MatchLite[],
  scoring: ScoringConfig = DEFAULT_SCORING
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const id of teamIds) {
    rows.set(id, { teamId: id, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0, buchholz: 0, sonnebornBerger: 0 });
  }
  const opponents = new Map<string, string[]>();
  const defeated = new Map<string, string[]>();
  const push = (map: Map<string, string[]>, k: string, v: string) => { if (!map.has(k)) map.set(k, []); map.get(k)!.push(v); };

  for (const m of matches) {
    // BYE = victoire 1-0 (pas d'adversaire, donc rien pour le Buchholz).
    if (isBye(m)) {
      const a = rows.get(m.teamAId!);
      if (a) { a.played++; a.wins++; a.goalsFor += 1; a.points += scoring.win; }
    }
  }
  const finished = matches.filter((m) => m.status === "FINISHED" && m.teamAId && m.teamBId);
  for (const m of finished) {
    const a = rows.get(m.teamAId!);
    const b = rows.get(m.teamBId!);
    // Un match hérité peut opposer une équipe du classement courant à une
    // équipe absente (ex: match de poule contre une tête de série qui n'a
    // pas rejoint le Swiss) — on compte quand même les stats de l'équipe
    // présente, sans créer de ligne pour l'adversaire absent.
    if (!a && !b) continue;
    if (a && b) { push(opponents, a.teamId, b.teamId); push(opponents, b.teamId, a.teamId); }
    if (a) {
      a.played++;
      a.goalsFor += m.scoreA; a.goalsAgainst += m.scoreB;
      if (m.scoreA > m.scoreB) { a.wins++; a.points += scoring.win; if (b) push(defeated, a.teamId, b.teamId); }
      else if (m.scoreB > m.scoreA) { a.losses++; a.points += scoring.loss; }
      else { a.draws++; a.points += scoring.draw; }
    }
    if (b) {
      b.played++;
      b.goalsFor += m.scoreB; b.goalsAgainst += m.scoreA;
      if (m.scoreB > m.scoreA) { b.wins++; b.points += scoring.win; if (a) push(defeated, b.teamId, a.teamId); }
      else if (m.scoreA > m.scoreB) { b.losses++; b.points += scoring.loss; }
      else { b.draws++; b.points += scoring.draw; }
    }
  }
  for (const r of rows.values()) {
    r.goalDiff = r.goalsFor - r.goalsAgainst;
    r.buchholz = (opponents.get(r.teamId) ?? []).reduce((sum, o) => sum + (rows.get(o)?.points ?? 0), 0);
    r.sonnebornBerger = (defeated.get(r.teamId) ?? []).reduce((sum, o) => sum + (rows.get(o)?.points ?? 0), 0);
  }

  const order = new Map(teamIds.map((id, i) => [id, i]));
  return [...rows.values()].sort((x, y) =>
    compareOnResults(x, y, finished) || (order.get(x.teamId) ?? 0) - (order.get(y.teamId) ?? 0));
}

/** Compare deux lignes sur les résultats seuls (0 = égalité parfaite, que seul l'ordre d'entrée départage). */
function compareOnResults(x: StandingRow, y: StandingRow, finished: MatchLite[]): number {
  if (y.points !== x.points) return y.points - x.points;
  if (y.goalDiff !== x.goalDiff) return y.goalDiff - x.goalDiff;
  if (y.buchholz !== x.buchholz) return y.buchholz - x.buchholz;
  if (y.sonnebornBerger !== x.sonnebornBerger) return y.sonnebornBerger - x.sonnebornBerger;
  if (y.goalsFor !== x.goalsFor) return y.goalsFor - x.goalsFor;
  return headToHead(x.teamId, y.teamId, finished);
}

/** Classement aux points : teamIds triés (voir standingsTable). */
export function pointsStandings(
  teamIds: string[],
  matches: MatchLite[],
  scoring: ScoringConfig = DEFAULT_SCORING
): string[] {
  return standingsTable(teamIds, matches, scoring).map((r) => r.teamId);
}

/**
 * Égalités parfaites : équipes voisines au classement que RIEN ne départage
 * (points, diff, Buchholz, Sonneborn-Berger, buts, confrontation directe) —
 * seul l'ordre d'entrée les sépare. Renvoie les rangs (1-based) concernés,
 * par paquets : [[4, 5]] = la 4e et la 5e sont à égalité parfaite.
 */
export function perfectTieRanks(
  teamIds: string[],
  matches: MatchLite[],
  scoring: ScoringConfig = DEFAULT_SCORING
): number[][] {
  const table = standingsTable(teamIds, matches, scoring);
  const finished = matches.filter((m) => m.status === "FINISHED" && m.teamAId && m.teamBId);
  const out: number[][] = [];
  let cur: number[] = [1];
  for (let i = 1; i < table.length; i++) {
    if (compareOnResults(table[i - 1], table[i], finished) === 0) cur.push(i + 1);
    else { if (cur.length > 1) out.push(cur); cur = [i + 1]; }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

function headToHead(a: string, b: string, finished: MatchLite[]): number {
  let aWins = 0, bWins = 0;
  for (const m of finished) {
    const isAB = (m.teamAId === a && m.teamBId === b) || (m.teamAId === b && m.teamBId === a);
    if (!isAB) continue;
    const winner = m.winnerTeamId ?? (m.scoreA > m.scoreB ? m.teamAId : m.scoreB > m.scoreA ? m.teamBId : null);
    if (winner === a) aWins++;
    else if (winner === b) bWins++;
  }
  return bWins - aWins; // négatif → a devant
}

// ─── Placement ───────────────────────────────────────────────────────────────

/**
 * Classement d'une étape placement : vainqueur du match 0 = rang 1, perdant =
 * rang 2, vainqueur du match 1 = rang 3, etc.
 */
export function placementStandings(matches: MatchLite[]): string[] {
  const out: string[] = [];
  const sorted = [...matches].sort((a, b) => a.positionInRound - b.positionInRound);
  for (const m of sorted) {
    const winner = m.winnerTeamId ?? (m.scoreA >= m.scoreB ? m.teamAId : m.teamBId);
    const loser = winner === m.teamAId ? m.teamBId : m.teamAId;
    if (winner) out.push(winner);
    if (loser) out.push(loser);
  }
  return out;
}

// ─── Brackets (SE / DE) ──────────────────────────────────────────────────────

/**
 * Classement d'un bracket : champion, finaliste, 3e (match ou demi-perdants),
 * puis par round d'élimination décroissant.
 */
export function bracketStandings(matches: MatchLite[]): string[] {
  const out: string[] = [];
  const pushUnique = (id: string | null | undefined) => {
    if (id && !out.includes(id)) out.push(id);
  };

  const winnerOf = (m: MatchLite) => m.winnerTeamId ?? (m.scoreA > m.scoreB ? m.teamAId : m.scoreB > m.scoreA ? m.teamBId : null);
  const loserOf = (m: MatchLite) => {
    const w = winnerOf(m);
    if (!w) return null;
    return w === m.teamAId ? m.teamBId : m.teamAId;
  };

  // 1. Grande finale (BG reset joué > G)
  const bg = matches.find((m) => m.bracketSide === "BG" && m.status === "FINISHED" && m.teamAId && m.teamBId);
  const g = matches.find((m) => m.bracketSide === "G" && m.status === "FINISHED");
  const decisive = bg ?? g;
  if (decisive) {
    pushUnique(winnerOf(decisive));
    pushUnique(loserOf(decisive));
  }

  // 2. Match pour la 3e place (SE)
  const third = matches.filter((m) => m.bracketSide === "L" && m.status === "FINISHED");
  const isDE = matches.some((m) => m.bracketSide === "L" && m.roundIndex > 1) &&
    matches.filter((m) => m.bracketSide === "L").length > 1;

  if (!isDE && third.length === 1) {
    pushUnique(winnerOf(third[0]));
    pushUnique(loserOf(third[0]));
  }

  // 3. Éliminés par round décroissant (LB pour DE, WB pour SE)
  const elimSide = isDE ? "L" : "W";
  const elim = matches
    .filter((m) => m.bracketSide === elimSide && m.status === "FINISHED")
    .sort((a, b) => b.roundIndex - a.roundIndex || a.positionInRound - b.positionInRound);
  for (const m of elim) pushUnique(loserOf(m));

  // 4. Filet : tous les participants restants (ordre d'apparition)
  for (const m of matches) {
    pushUnique(m.teamAId);
    pushUnique(m.teamBId);
  }
  return out;
}
