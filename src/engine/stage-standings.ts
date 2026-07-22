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
  points: number;
};

// ─── Étapes à points (RR / Swiss / Cross-pool) ───────────────────────────────

/**
 * Classement aux points. `teamIds` fixe la population (et l'ordre en cas
 * d'égalité parfaite : l'ordre d'entrée = seed du stage fait foi).
 * Départage : points > diff > buts marqués > confrontation directe.
 */
export function pointsStandings(
  teamIds: string[],
  matches: MatchLite[],
  scoring: ScoringConfig = DEFAULT_SCORING
): string[] {
  const rows = new Map<string, StandingRow>();
  for (const id of teamIds) {
    rows.set(id, { teamId: id, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 });
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
    if (a) {
      a.played++;
      a.goalsFor += m.scoreA; a.goalsAgainst += m.scoreB;
      if (m.scoreA > m.scoreB) { a.wins++; a.points += scoring.win; }
      else if (m.scoreB > m.scoreA) { a.losses++; a.points += scoring.loss; }
      else { a.draws++; a.points += scoring.draw; }
    }
    if (b) {
      b.played++;
      b.goalsFor += m.scoreB; b.goalsAgainst += m.scoreA;
      if (m.scoreB > m.scoreA) { b.wins++; b.points += scoring.win; }
      else if (m.scoreA > m.scoreB) { b.losses++; b.points += scoring.loss; }
      else { b.draws++; b.points += scoring.draw; }
    }
  }

  // BYE = victoire ? Convention existante : match sans teamB terminé = pas compté.

  const order = new Map(teamIds.map((id, i) => [id, i]));
  const sorted = [...rows.values()].sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    const dx = x.goalsFor - x.goalsAgainst;
    const dy = y.goalsFor - y.goalsAgainst;
    if (dy !== dx) return dy - dx;
    if (y.goalsFor !== x.goalsFor) return y.goalsFor - x.goalsFor;
    // Confrontation directe
    const h2h = headToHead(x.teamId, y.teamId, finished);
    if (h2h !== 0) return h2h;
    return (order.get(x.teamId) ?? 0) - (order.get(y.teamId) ?? 0);
  });
  return sorted.map((r) => r.teamId);
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
