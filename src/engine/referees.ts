/**
 * Désignation des équipes arbitres (fonction pure, sans base de données —
 * utilisable aussi côté client pour le sélecteur de l'orga).
 *
 * Dans un tournoi de bike polo, ce sont les équipes qui arbitrent : l'équipe
 * désignée s'organise en interne. On désigne donc une ÉQUIPE par match.
 *
 * LE TEMPS : on ne raisonne pas à la minute près (le planning glisse en
 * permanence : chaque fin de match recale la suite du terrain).
 *  - Sur un même terrain, c'est l'ORDRE des matchs qui compte (match n−1,
 *    n+1…) — insensible aux retards.
 *  - Entre deux terrains, on compare les heures estimées (recalées à chaque
 *    fin de match) avec la marge d'un créneau entier : deux matchs à moins
 *    d'un créneau d'écart sont « en même temps ».
 *
 * Règle INVIOLABLE : une équipe n'arbitre jamais pendant qu'elle joue (ni son
 * propre match, ni deux matchs à la fois).
 * Puis, dans l'ordre :
 *  1. le repos choisi par l'orga (jamais juste après avoir joué ; ou ni juste
 *     avant ni juste après) — relâché seulement si personne d'autre n'est
 *     libre, et signalé à l'orga ;
 *  2. les équipes qui n'ont plus de match (éliminées, poule finie) d'abord ;
 *  3. l'équité (les moins chargées) ;
 *  4. le confort : jouer → repos → arbitrer, rester sur son terrain, pas
 *     deux arbitrages d'affilée.
 *
 * Règles (au choix de l'orga, par étape) :
 *  - "rotation"     : automatique, toutes les équipes libres.
 *  - "cross_groups" : les équipes d'un AUTRE groupe de l'étape (le groupe de
 *                     l'après-midi arbitre le matin, et inversement). Sans
 *                     au moins deux groupes dans l'étape : comme "rotation".
 *  - "manual"       : rien d'automatique.
 */

export type RefereeRule = "rotation" | "cross_groups" | "manual";
export const REFEREE_RULES: RefereeRule[] = ["rotation", "cross_groups", "manual"];

/** Repos garanti : aucun ; jamais juste après avoir joué ; ni juste avant ni juste après. */
export type RestPolicy = "none" | "after" | "both";
export const REST_POLICIES: RestPolicy[] = ["after", "both", "none"];

export const DEFAULT_SLOT_MS = 16 * 60_000;

export type RefMatch = {
  id: string;
  startAt: Date;
  courtName: string | null;
  teamAId: string | null;
  teamBId: string | null;
  stageKey: string; // id de l'étape, ou "default" (tournoi sans étapes)
  groupKey: string | null;
  status: string; // SCHEDULED | LIVE | FINISHED
  /** Le jeu a commencé (chrono lancé) ou le match est fini. Par défaut : statut ≠ SCHEDULED. */
  started?: boolean;
  refereeTeamId: string | null;
  refereeAuto: boolean; // désigné par l'algorithme (recalculable)
};

export type RefOptions = {
  rules: Record<string, RefereeRule>; // par stageKey ; absent = "manual"
  rest?: RestPolicy; // défaut "after"
  excluded?: string[]; // équipes dispensées d'arbitrage
  slotMs?: number; // durée d'un créneau (match + battement)
};

export type RefConflictReason =
  | "no_candidate" // personne de libre
  | "own_match" // l'équipe joue ce match
  | "plays_same_slot" // l'équipe joue en même temps
  | "double_duty" // l'équipe arbitre déjà un autre match en même temps
  | "excluded" // équipe dispensée (ou plus sélectionnée)
  | "rest"; // repos choisi par l'orga non respecté (faute de mieux)
export type RefConflict = { matchId: string; reason: RefConflictReason };

/** État d'une équipe vis-à-vis d'un match à arbitrer (du pire au meilleur). */
export type CandidateState = "own" | "excluded" | "plays" | "refs" | "just_played" | "plays_next" | "ok";
const HARD: CandidateState[] = ["own", "excluded", "plays", "refs"];
export const isHardBlocked = (s: CandidateState) => HARD.includes(s);

export type Candidate = {
  teamId: string;
  state: CandidateState;
  load: number; // arbitrages déjà attribués
  done: boolean; // plus aucun match à jouer après celui-ci (éliminée…)
  rested: boolean; // a joué deux matchs plus tôt et se repose (idéal)
  score: number; // confort
};

const isStarted = (m: RefMatch) => m.started ?? m.status !== "SCHEDULED";
/** Match à désigner : pas encore commencé, les deux équipes connues. */
export const isAssignable = (m: RefMatch) => !isStarted(m) && m.status !== "FINISHED" && !!m.teamAId && !!m.teamBId;

/**
 * Contexte de calcul : ordre des matchs par terrain, matchs de chaque équipe,
 * groupes par étape. `rel(a, b)` = position de b par rapport à a, en créneaux :
 * 0 = en même temps, −1 = juste avant, +1 = juste après, null = loin.
 */
export function buildContext(matches: RefMatch[], options: RefOptions) {
  const slotMs = options.slotMs ?? DEFAULT_SLOT_MS;
  const byStart = (a: RefMatch, b: RefMatch) => a.startAt.getTime() - b.startAt.getTime() || a.id.localeCompare(b.id);

  const rank = new Map<string, number>();
  const courts = new Map<string, RefMatch[]>();
  for (const m of matches) {
    const k = m.courtName ?? "";
    if (!courts.has(k)) courts.set(k, []);
    courts.get(k)!.push(m);
  }
  for (const list of courts.values()) list.sort(byStart).forEach((m, i) => rank.set(m.id, i));

  const rel = (a: RefMatch, b: RefMatch): number | null => {
    if (a.id === b.id) return 0;
    const dt = (b.startAt.getTime() - a.startAt.getTime()) / slotMs;
    if (a.courtName && a.courtName === b.courtName) {
      const d = rank.get(b.id)! - rank.get(a.id)!;
      // Une vraie pause entre les deux (déjeuner, autre jour) : sans lien.
      if (Math.abs(dt) > Math.abs(d) + 1.5) return null;
      return d;
    }
    if (Math.abs(dt) < 1) return 0;
    if (Math.abs(dt) >= 3) return null;
    return Math.sign(dt) * Math.floor(Math.abs(dt));
  };

  const plays = new Map<string, RefMatch[]>();
  const stageGroups = new Map<string, Set<string>>();
  const groupOf = new Map<string, string>(); // `${stage}|${team}` → groupe
  for (const m of matches) {
    for (const t of [m.teamAId, m.teamBId]) {
      if (!t) continue;
      if (!plays.has(t)) plays.set(t, []);
      plays.get(t)!.push(m);
      if (m.groupKey) groupOf.set(`${m.stageKey}|${t}`, m.groupKey);
    }
    if (m.groupKey) {
      if (!stageGroups.has(m.stageKey)) stageGroups.set(m.stageKey, new Set());
      stageGroups.get(m.stageKey)!.add(m.groupKey);
    }
  }
  return { slotMs, rank, rel, plays, groupOf, stageGroups, rest: options.rest ?? "after", excluded: new Set(options.excluded ?? []) };
}
type Ctx = ReturnType<typeof buildContext>;

/** Règle effective d'une étape (« groupes croisés » sans groupes = rotation). */
export function effectiveRule(ctx: Ctx, options: RefOptions, stageKey: string): RefereeRule {
  const r = options.rules[stageKey] ?? "manual";
  if (r === "cross_groups" && (ctx.stageGroups.get(stageKey)?.size ?? 0) < 2) return "rotation";
  return r;
}

/** Évalue une équipe pour arbitrer `m`, compte tenu des autres arbitrages `refsOf(team)`. */
function evaluate(ctx: Ctx, m: RefMatch, team: string, refsOf: (t: string) => RefMatch[], load: number): Candidate {
  const mk = (state: CandidateState, done = false, rested = false, score = 0): Candidate => ({ teamId: team, state, load, done, rested, score });
  if (team === m.teamAId || team === m.teamBId) return mk("own");
  if (ctx.excluded.has(team)) return mk("excluded");
  const mine = ctx.plays.get(team) ?? [];
  const rels = mine.filter((p) => p.id !== m.id).map((p) => ({ p, r: ctx.rel(m, p) }));
  if (rels.some((x) => x.r === 0)) return mk("plays");
  const duties = refsOf(team).filter((r) => r.id !== m.id).map((r) => ctx.rel(m, r));
  if (duties.some((r) => r === 0)) return mk("refs");

  const justPlayed = rels.some((x) => x.r === -1);
  const playsNext = rels.some((x) => x.r === 1);
  const rested = !justPlayed && rels.some((x) => x.r === -2);
  // Plus aucun match connu à partir de celui-ci : éliminée, poule terminée…
  const done = !mine.some((p) => p.id !== m.id && p.startAt.getTime() >= m.startAt.getTime() && p.status !== "FINISHED");
  let score = 0;
  if (rested) score += 4; // jouer → repos → arbitrer
  if (rels.some((x) => (x.r === -1 || x.r === -2) && x.p.courtName === m.courtName)) score += 1; // déjà sur ce terrain
  if (playsNext) score -= 3;
  if (duties.some((r) => r === -1 || r === 1)) score -= 2; // deux arbitrages d'affilée
  const state: CandidateState = justPlayed ? "just_played" : playsNext ? "plays_next" : "ok";
  return mk(state, done, rested, score);
}

/** Respecte le repos choisi par l'orga ? */
const restOk = (rest: RestPolicy, s: CandidateState) =>
  rest === "none" ? true : rest === "after" ? s !== "just_played" : s !== "just_played" && s !== "plays_next";

/**
 * Meilleur candidat : éliminées d'abord, puis les moins chargées, puis le
 * confort. Jouer juste après compte comme un arbitrage de plus : on ne choisit
 * une équipe qui enchaîne que si l'équité l'exige vraiment.
 */
const effLoad = (c: Candidate) => c.load + (c.state === "plays_next" ? 1 : 0) + (c.state === "just_played" ? 2 : 0);
const better = (a: Candidate, b: Candidate) =>
  (a.done === b.done ? 0 : a.done ? -1 : 1) || effLoad(a) - effLoad(b) || b.score - a.score || a.teamId.localeCompare(b.teamId);

/**
 * Désigne une équipe arbitre pour les matchs à pourvoir.
 * `mode` :
 *  - "fill"      : seulement les matchs sans arbitre ;
 *  - "repair"    : + les désignations automatiques devenues impossibles
 *                  (l'équipe joue désormais en même temps, dispensée…) ;
 *  - "recompute" : + toutes les désignations automatiques.
 * Les choix manuels de l'orga ne sont JAMAIS modifiés.
 */
export function assignRefereeTeams(input: {
  matches: RefMatch[]; // TOUS les matchs du tournoi (pour savoir qui joue quand)
  teamIds: string[]; // équipes pouvant arbitrer (sélectionnées)
  options: RefOptions;
  mode: "fill" | "repair" | "recompute";
}): { assignments: Map<string, string>; conflicts: RefConflict[] } {
  const { matches, teamIds, options, mode } = input;
  const ctx = buildContext(matches, options);
  const selected = new Set(teamIds);

  const current = new Map<string, string>(); // matchId → équipe (état courant)
  for (const m of matches) if (m.refereeTeamId) current.set(m.id, m.refereeTeamId);
  const byId = new Map(matches.map((m) => [m.id, m]));
  const refsOf = (team: string) => [...current].filter(([, t]) => t === team).map(([id]) => byId.get(id)!);
  const loadOf = (team: string) => [...current.values()].filter((t) => t === team).length;

  const eligible = (m: RefMatch) => isAssignable(m) && effectiveRule(ctx, options, m.stageKey) !== "manual";
  const broken = (m: RefMatch) => {
    const t = m.refereeTeamId!;
    return !selected.has(t) || isHardBlocked(evaluate(ctx, m, t, refsOf, 0).state);
  };
  const pending = matches
    .filter((m) => eligible(m) && (!m.refereeTeamId
      || (m.refereeAuto && (mode === "recompute" || (mode === "repair" && broken(m))))))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || (ctx.rank.get(a.id)! - ctx.rank.get(b.id)!) || (a.courtName ?? "").localeCompare(b.courtName ?? ""));
  for (const m of pending) current.delete(m.id);

  const assignments = new Map<string, string>();
  const conflicts: RefConflict[] = [];
  for (const m of pending) {
    const rule = effectiveRule(ctx, options, m.stageKey);
    let pool = teamIds
      .map((team) => evaluate(ctx, m, team, refsOf, loadOf(team)))
      .filter((c) => !isHardBlocked(c.state));
    if (rule === "cross_groups") {
      pool = pool.filter((c) => {
        const g = ctx.groupOf.get(`${m.stageKey}|${c.teamId}`);
        return !!g && !!m.groupKey && g !== m.groupKey;
      });
    }
    // Repos : relâché seulement si personne d'autre (d'abord « juste avant de
    // jouer », puis « juste après avoir joué »), et signalé à l'orga.
    let ok = pool.filter((c) => restOk(ctx.rest, c.state));
    let restBroken = false;
    if (ok.length === 0 && ctx.rest === "both") { ok = pool.filter((c) => c.state !== "just_played"); restBroken = ok.length > 0; }
    if (ok.length === 0) { ok = pool; restBroken = ok.length > 0 && ctx.rest !== "none"; }
    const best = ok.sort(better)[0];
    if (!best) {
      conflicts.push({ matchId: m.id, reason: "no_candidate" });
      continue;
    }
    if (restBroken) conflicts.push({ matchId: m.id, reason: "rest" });
    assignments.set(m.id, best.teamId);
    current.set(m.id, best.teamId);
  }

  // Désignations conservées : signaler les incohérences (choix manuels…).
  const pendingIds = new Set(pending.map((m) => m.id));
  for (const c of checkRefereeAssignments({ matches, teamIds, options })) {
    if (!pendingIds.has(c.matchId)) conflicts.push(c);
  }
  return { assignments, conflicts };
}

/** Problèmes des désignations actuelles (matchs pas encore commencés). */
export function checkRefereeAssignments(input: { matches: RefMatch[]; teamIds: string[]; options: RefOptions }): RefConflict[] {
  const { matches, teamIds, options } = input;
  const ctx = buildContext(matches, options);
  const selected = new Set(teamIds);
  const byId = new Map(matches.map((m) => [m.id, m]));
  const refsOf = (team: string) => matches.filter((x) => x.refereeTeamId === team).map((x) => byId.get(x.id)!);
  const out: RefConflict[] = [];
  for (const m of matches) {
    if (!m.refereeTeamId || isStarted(m)) continue;
    if (!selected.has(m.refereeTeamId)) { out.push({ matchId: m.id, reason: "excluded" }); continue; }
    const s = evaluate(ctx, m, m.refereeTeamId, refsOf, 0).state;
    const reason: RefConflictReason | null =
      s === "own" ? "own_match" : s === "plays" ? "plays_same_slot" : s === "refs" ? "double_duty"
        : s === "excluded" ? "excluded" : !restOk(ctx.rest, s) ? "rest" : null;
    if (reason) out.push({ matchId: m.id, reason });
  }
  return out;
}

/**
 * Pour le sélecteur de l'orga : chaque équipe, son état pour ce match et sa
 * charge, de la plus recommandée à la plus déconseillée.
 */
export function rankCandidates(input: { matches: RefMatch[]; teamIds: string[]; options: RefOptions; matchId: string }): Candidate[] {
  const { matches, teamIds, options, matchId } = input;
  const ctx = buildContext(matches, options);
  const m = matches.find((x) => x.id === matchId);
  if (!m) return [];
  const byId = new Map(matches.map((x) => [x.id, x]));
  const refsOf = (team: string) => matches.filter((x) => x.refereeTeamId === team && x.id !== matchId).map((x) => byId.get(x.id)!);
  const load = (team: string) => matches.filter((x) => x.refereeTeamId === team && x.id !== matchId).length;
  const order = (c: Candidate) => (isHardBlocked(c.state) ? 2 : restOk(ctx.rest, c.state) ? 0 : 1);
  return teamIds
    .map((t) => evaluate(ctx, m, t, refsOf, load(t)))
    .sort((a, b) => order(a) - order(b) || better(a, b));
}
