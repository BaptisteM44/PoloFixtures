/**
 * Désignation des équipes arbitres (fonction pure, sans base de données).
 *
 * Dans un tournoi de bike polo, ce sont les équipes qui arbitrent : l'équipe
 * désignée s'organise en interne. On désigne donc une ÉQUIPE par match.
 *
 * Règles (au choix de l'orga, par étape) :
 *  - "rotation"     : jouer → repos → arbitrer. Idéal : l'équipe a joué deux
 *                     créneaux plus tôt et se repose au créneau d'avant.
 *  - "cross_groups" : les équipes d'un autre groupe arbitrent (le groupe de
 *                     l'après-midi arbitre le matin, et inversement).
 *  - "manual"       : rien d'automatique.
 *
 * Contraintes dures : jamais son propre match, jamais pendant un de ses
 * matchs (même créneau). Puis l'ÉQUITÉ (on prend parmi les équipes libres les
 * moins chargées), puis le confort : repos au créneau précédent, pas de match
 * au suivant, même terrain que son dernier match, équipe de l'étape.
 */

export type RefereeRule = "rotation" | "cross_groups" | "manual";
export const REFEREE_RULES: RefereeRule[] = ["rotation", "cross_groups", "manual"];

export type RefMatch = {
  id: string;
  startAt: Date;
  courtName: string | null;
  teamAId: string | null;
  teamBId: string | null;
  stageKey: string; // id de l'étape, ou "default" (tournoi sans étapes)
  groupKey: string | null;
  status: string; // SCHEDULED | LIVE | FINISHED
  refereeTeamId: string | null;
  refereeAuto: boolean; // désigné par l'algorithme (recalculable)
};

export type RefConflict = { matchId: string; reason: "no_candidate" | "plays_same_slot" | "own_match" };

/** Créneaux : chaque heure de début distincte du tournoi, dans l'ordre. */
function slotIndex(matches: RefMatch[]): Map<number, number> {
  const times = [...new Set(matches.map((m) => m.startAt.getTime()))].sort((a, b) => a - b);
  return new Map(times.map((t, i) => [t, i]));
}

/**
 * Désigne une équipe arbitre pour les matchs à pourvoir.
 * `mode` : "fill" = seulement les matchs sans arbitre ; "recompute" = aussi
 * ceux désignés automatiquement (jamais ceux choisis à la main par l'orga).
 * Seuls les matchs non commencés, aux deux équipes connues, sont traités.
 * Retourne les nouvelles désignations et les conflits (à signaler à l'orga).
 */
export function assignRefereeTeams(input: {
  matches: RefMatch[]; // TOUS les matchs du tournoi (pour savoir qui joue quand)
  teamIds: string[]; // équipes pouvant arbitrer (sélectionnées)
  rules: Record<string, RefereeRule>; // par stageKey ; absent = "manual"
  mode: "fill" | "recompute";
}): { assignments: Map<string, string>; conflicts: RefConflict[] } {
  const { matches, teamIds, rules, mode } = input;
  const slots = slotIndex(matches);
  const slotOf = (m: RefMatch) => slots.get(m.startAt.getTime()) ?? 0;

  // Qui joue à quel créneau, sur quel terrain ; dans quel groupe par étape.
  const playsAt = new Map<string, Map<number, string | null>>(); // team → slot → court
  const groupOf = new Map<string, string>(); // `${stageKey}|${team}` → groupKey
  const stageTeams = new Map<string, Set<string>>(); // stageKey → équipes
  for (const m of matches) {
    for (const t of [m.teamAId, m.teamBId]) {
      if (!t) continue;
      if (!playsAt.has(t)) playsAt.set(t, new Map());
      playsAt.get(t)!.set(slotOf(m), m.courtName);
      if (m.groupKey) groupOf.set(`${m.stageKey}|${t}`, m.groupKey);
      if (!stageTeams.has(m.stageKey)) stageTeams.set(m.stageKey, new Set());
      stageTeams.get(m.stageKey)!.add(t);
    }
  }

  // Charge déjà acquise (désignations conservées), pour équilibrer.
  const load = new Map<string, number>(teamIds.map((t) => [t, 0]));
  const assignments = new Map<string, string>();
  const conflicts: RefConflict[] = [];

  const toAssign = (m: RefMatch) => {
    const rule = rules[m.stageKey] ?? "manual";
    if (rule === "manual") return false;
    if (m.status !== "SCHEDULED" || !m.teamAId || !m.teamBId) return false;
    if (!m.refereeTeamId) return true;
    return mode === "recompute" && m.refereeAuto;
  };
  const pending = matches.filter(toAssign).sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || (a.courtName ?? "").localeCompare(b.courtName ?? ""));
  const pendingIds = new Set(pending.map((m) => m.id));
  for (const m of matches) {
    if (m.refereeTeamId && !pendingIds.has(m.id)) load.set(m.refereeTeamId, (load.get(m.refereeTeamId) ?? 0) + 1);
  }

  // Une équipe n'arbitre qu'un match par créneau.
  const busyRef = new Map<number, Set<string>>();
  for (const m of matches) {
    if (m.refereeTeamId && !pendingIds.has(m.id)) {
      const s = slotOf(m);
      if (!busyRef.has(s)) busyRef.set(s, new Set());
      busyRef.get(s)!.add(m.refereeTeamId);
    }
  }

  for (const m of pending) {
    const rule = rules[m.stageKey];
    const s = slotOf(m);
    const myGroup = m.groupKey;
    const inStage = stageTeams.get(m.stageKey) ?? new Set<string>();
    const candidates: { team: string; score: number; load: number }[] = [];
    for (const team of teamIds) {
      if (team === m.teamAId || team === m.teamBId) continue;
      const plays = playsAt.get(team) ?? new Map<number, string | null>();
      if (plays.has(s)) continue; // joue au même créneau
      if (busyRef.get(s)?.has(team)) continue; // arbitre déjà à ce créneau
      if (rule === "cross_groups") {
        const g = groupOf.get(`${m.stageKey}|${team}`);
        // Doit appartenir à l'étape, dans un AUTRE groupe.
        if (!g || !myGroup || g === myGroup) continue;
      }
      let score = 0;
      if (plays.has(s - 1)) score -= 6; // sort de match : il faut du repos
      if (plays.has(s + 1)) score -= 3; // enchaîne ensuite sur un match
      if (plays.has(s - 2)) score += 4; // jouer → repos → arbitrer
      if (plays.get(s - 2) === m.courtName || plays.get(s - 1) === m.courtName) score += 1; // déjà sur ce terrain
      if (inStage.has(team)) score += 2; // équipe de l'étape
      candidates.push({ team, score, load: load.get(team) ?? 0 });
    }
    // Équité d'abord : parmi les équipes libres, seulement les moins chargées
    // (sinon une équipe qui joue un créneau sur deux, jamais « reposée »,
    // n'arbitrerait jamais et les autres arbitreraient 3 fois). Le confort
    // (repos, terrain) départage ensuite.
    // Exception : si toutes les moins chargées sortent de match, une équipe
    // reposée avec UN arbitrage de plus est préférée (écart toujours ≤ 1).
    const minLoad = Math.min(...candidates.map((c) => c.load));
    const pick = (pool: typeof candidates) => pool.reduce<(typeof candidates)[number] | null>(
      (b, c) => (!b || c.score > b.score || (c.score === b.score && c.team < b.team) ? c : b), null);
    let chosen = pick(candidates.filter((c) => c.load === minLoad));
    if (chosen && (playsAt.get(chosen.team)?.has(s - 1) ?? false)) {
      const rested = pick(candidates.filter((c) => c.load === minLoad + 1 && !(playsAt.get(c.team)?.has(s - 1) ?? false)));
      if (rested) chosen = rested;
    }
    const best = chosen ? { team: chosen.team, score: chosen.score } : null;

    if (!best) {
      conflicts.push({ matchId: m.id, reason: "no_candidate" });
      continue;
    }
    assignments.set(m.id, best.team);
    load.set(best.team, (load.get(best.team) ?? 0) + 1);
    if (!busyRef.has(s)) busyRef.set(s, new Set());
    busyRef.get(s)!.add(best.team);
  }

  // Conflits sur les désignations conservées (choix manuels incohérents…).
  for (const m of matches) {
    if (!m.refereeTeamId || pendingIds.has(m.id) || m.status === "FINISHED") continue;
    if (m.refereeTeamId === m.teamAId || m.refereeTeamId === m.teamBId) conflicts.push({ matchId: m.id, reason: "own_match" });
    else if (playsAt.get(m.refereeTeamId)?.has(slotOf(m))) conflicts.push({ matchId: m.id, reason: "plays_same_slot" });
  }
  return { assignments, conflicts };
}
