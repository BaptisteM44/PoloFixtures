/**
 * Cerveau du pipeline (côté serveur) — LA logique unique de déroulé d'un
 * tournoi, quel que soit le format :
 *
 *   launchStage()   : résout les entrées, génère les matchs de l'étape
 *   applyScore()    : enregistre un score, propage vainqueur/perdant,
 *                     déclenche l'avancement (round Swiss suivant, fin d'étape,
 *                     fin de tournoi) — remplace les branches par format
 *   resetStages()   : reset d'une étape et de toutes les suivantes
 *   simulate*()     : moteur de simulation du bac à sable
 *
 * Toute la génération est déléguée aux moteurs purs de src/engine.
 */
import { prisma } from "@/lib/db";
import type { Prisma, Stage, StageEntry, Match, StageType } from "@prisma/client";
import { resolveEntries, type EntryRules, type ResolvedEntry } from "./transitions";
import { pointsStandings, placementStandings, bracketStandings, type MatchLite, type ScoringConfig } from "./stage-standings";
import { rrRounds, swissPairings, crossPoolPairings, pairKey, type Pairing } from "./rounds";
import { planSE } from "./se";
import { planDE } from "./de";
import { persistBracketPlan } from "./persist-plan";
import { scheduleRounds } from "./scheduler";

// ─── Types de config par étape (stockés dans Stage.config) ──────────────────

/**
 * Répartition des terrains pour une étape multi-groupes :
 * - "sequential" (défaut) : groupe A joue d'abord (tous terrains), puis B —
 *   le pattern bike polo classique où un groupe arbitre l'autre
 * - "dedicated" : chaque groupe a son/ses terrain(s), les groupes jouent en parallèle
 * - "mixed" : tous les groupes mélangés sur tous les terrains (remplissage maximal)
 */
export type CourtMode = "sequential" | "dedicated" | "mixed";

export type StageConfigByType = {
  RR: { groups?: number; doubleRound?: boolean; maxRounds?: number; courtMode?: CourtMode; groupStartAt?: Record<string, string>; carryPoints?: boolean };
  SWISS: { rounds: number; inheritFrom?: number; carryPoints?: boolean; courtMode?: CourtMode; groupStartAt?: Record<string, string> };
  CROSS_POOL: { opponents: number; carryPoints?: boolean };
  PLACEMENT: { count?: number };
  SE: { thirdPlace?: boolean };
  DE: { gfReset?: boolean };
};

export type StageDef = {
  name: string;
  type: StageType;
  config: StageConfigByType[StageType];
  entryRules: EntryRules;
};

type StageFull = Stage & { entries: StageEntry[]; matches: Match[] };
type PipelineTournament = NonNullable<Awaited<ReturnType<typeof getPipeline>>>;

// ─── Lecture ─────────────────────────────────────────────────────────────────

export async function getPipeline(tournamentId: string) {
  return prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      teams: { where: { selected: true } },
      stages: {
        orderBy: { order: "asc" },
        include: { entries: true, matches: true },
      },
    },
  });
}

function scoringOf(t: { scoringSystem?: string | null }): ScoringConfig {
  return t.scoringSystem === "1/0.5" ? { win: 1, draw: 0.5, loss: 0 } : { win: 3, draw: 1, loss: 0 };
}

/** Classement d'une étape (teamIds triés). group=undefined → toutes équipes confondues. */
export function stageStandings(t: PipelineTournament, stageOrder: number, group?: string): string[] {
  const stage = t.stages.find((s) => s.order === stageOrder);
  if (!stage) return [];
  const entries = stage.entries
    .filter((e) => (group === undefined ? true : e.groupKey === group))
    .sort((a, b) => (a.groupKey === b.groupKey ? a.slot - b.slot : a.groupKey.localeCompare(b.groupKey)));
  const entryIds = entries.map((e) => e.teamId).filter((id): id is string => !!id);
  const matches = stage.matches.filter((m) => (group === undefined ? true : m.groupKey === group)) as unknown as MatchLite[];

  switch (stage.type) {
    case "RR":
    case "CROSS_POOL":
    case "SWISS": {
      // Classement à points, avec cumul optionnel des étapes précédentes
      // (carryPoints = depuis l'étape juste avant ; inheritFrom = depuis une
      // étape précise, gardé pour la rétrocompat du Swiss).
      const cfg = stage.config as { carryPoints?: boolean; inheritFrom?: number };
      const sourceOrder = cfg.inheritFrom ?? (cfg.carryPoints ? stage.order - 1 : undefined);
      let all = [...matches];
      if (sourceOrder !== undefined && sourceOrder >= 0) {
        const entrySet = new Set(entryIds);
        // Si deux équipes se réaffrontent dans CETTE étape (rematch forcé,
        // faute d'adversaires "frais" disponibles), leur duel hérité ne doit
        // pas être compté en plus du nouveau — on ne garde que le plus récent
        // pour chaque paire, sinon le même résultat est compté deux fois
        // (points/victoires fantômes, nombre de matchs incohérent).
        const rematchedPairs = new Set(
          matches.filter((m) => m.teamAId && m.teamBId).map((m) => pairKey(m.teamAId!, m.teamBId!)),
        );
        // On remonte toutes les étapes ≤ sourceOrder (cumul en cascade) et on
        // ne garde que les matchs entre équipes présentes dans CETTE étape.
        const inherited = t.stages
          .filter((s) => s.order <= sourceOrder)
          .flatMap((s) => s.matches as unknown as MatchLite[])
          .filter(
            (m) =>
              m.teamAId &&
              m.teamBId &&
              entrySet.has(m.teamAId) &&
              entrySet.has(m.teamBId) &&
              !rematchedPairs.has(pairKey(m.teamAId, m.teamBId)),
          );
        all = [...inherited, ...matches];
      }
      return pointsStandings(entryIds, all, scoringOf(t));
    }
    case "PLACEMENT":
      return placementStandings(matches);
    case "SE":
    case "DE":
      return bracketStandings(matches);
    default:
      return entryIds;
  }
}

/** Classement final du tournoi (1→N) : dernière étape DONE, complété par les précédentes. */
export function finalStandings(t: PipelineTournament): string[] {
  const out: string[] = [];
  const push = (id: string) => { if (!out.includes(id)) out.push(id); };
  for (const stage of [...t.stages].sort((a, b) => b.order - a.order)) {
    if (stage.status === "SKIPPED") continue;
    for (const id of stageStandings(t, stage.order)) push(id);
  }
  for (const team of t.teams) push(team.id);
  return out;
}

// ─── Création du pipeline ────────────────────────────────────────────────────

export async function createStages(tournamentId: string, defs: StageDef[]): Promise<void> {
  await prisma.$transaction(
    defs.map((def, i) =>
      prisma.stage.create({
        data: {
          tournamentId,
          order: i,
          name: def.name,
          type: def.type,
          config: def.config as Prisma.InputJsonValue,
          entryRules: def.entryRules as unknown as Prisma.InputJsonValue,
        },
      })
    )
  );
}

/**
 * Définit (ou redéfinit) le format pipeline d'un tournoi RÉEL : bascule
 * usesPipeline=true et remplace ses étapes par la composition fournie.
 * Refuse si un match a déjà été joué (protège les tournois en cours/terminés).
 * Réutilise la même validation zod que le builder sandbox.
 */
export async function setTournamentPipeline(
  tournamentId: string,
  stagesInput: unknown,
): Promise<{ ok?: boolean; error?: string }> {
  const { validateCustomPipeline } = await import("./pipeline-validation");
  const validated = validateCustomPipeline(stagesInput);
  if (!validated.ok) return { error: validated.error };

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true },
  });
  if (!tournament) return { error: "Tournoi introuvable." };

  // Garde-fou : aucun match joué (sinon on casserait des résultats)
  const playedCount = await prisma.match.count({
    where: { tournamentId, status: "FINISHED" },
  });
  if (playedCount > 0) {
    return { error: "Des matchs ont déjà été joués : le format ne peut plus être modifié." };
  }

  await prisma.$transaction(async (tx) => {
    // Purge de l'ancien format (étapes pipeline OU matchs legacy non joués)
    await tx.matchEvent.deleteMany({ where: { match: { tournamentId } } });
    await tx.match.deleteMany({ where: { tournamentId } });
    await tx.poolTeam.deleteMany({ where: { pool: { tournamentId } } });
    await tx.pool.deleteMany({ where: { tournamentId } });
    await tx.stageEntry.deleteMany({ where: { stage: { tournamentId } } });
    await tx.stage.deleteMany({ where: { tournamentId } });

    await tx.tournament.update({
      where: { id: tournamentId },
      data: { usesPipeline: true, format: "pipeline" } as never,
    });

    for (let i = 0; i < validated.stages.length; i++) {
      const def = validated.stages[i];
      await tx.stage.create({
        data: {
          tournamentId,
          order: i,
          name: def.name,
          type: def.type,
          config: def.config as Prisma.InputJsonValue,
          entryRules: def.entryRules as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }, { timeout: 30000 });

  return { ok: true };
}

// ─── Lancement d'une étape ───────────────────────────────────────────────────

function nextStartAt(t: PipelineTournament): Date {
  const all = t.stages.flatMap((s) => s.matches);
  if (all.length === 0) return t.dateStart < new Date() ? new Date(Date.now() + 10 * 60_000) : new Date(t.dateStart);
  const lastMs = Math.max(...all.map((m) => new Date(m.startAt).getTime()));
  return new Date(Math.max(lastMs + (t.gameDurationMin + 5) * 60_000, Date.now()));
}

function courtNamesOf(t: PipelineTournament): string[] {
  return Array.from({ length: Math.max(t.courtsCount, 1) }, (_, i) => `Court ${i + 1}`);
}

/**
 * Crée un vrai enregistrement Pool par groupe du stage (+ ses PoolTeam), pour
 * que PoolTables/ScheduleBoard (composants réels de la page publique) affichent
 * les étapes à groupes du pipeline sans aucune adaptation de leur côté.
 * Le Stage reste la source de vérité (config/entryRules/status) — le Pool est
 * une simple vue "legacy-compatible" dessus, régénérée à chaque lancement.
 */
async function ensurePoolsForStage(
  tx: Prisma.TransactionClient,
  tournamentId: string,
  stage: Stage,
  entries: Array<{ groupKey: string; teamId: string }>
): Promise<Map<string, string>> {
  const groups = [...new Set(entries.map((e) => e.groupKey))].sort();
  const poolIdByGroup = new Map<string, string>();
  for (const g of groups) {
    const name = g ? `${stage.name} — Groupe ${g}` : stage.name;
    const pool = await tx.pool.create({ data: { tournamentId, name, stageId: stage.id } });
    poolIdByGroup.set(g, pool.id);
    const teamIds = entries.filter((e) => e.groupKey === g).map((e) => e.teamId);
    await tx.poolTeam.createMany({ data: teamIds.map((teamId) => ({ poolId: pool.id, teamId })) });
  }
  return poolIdByGroup;
}

async function persistPairings(
  tx: Prisma.TransactionClient,
  t: PipelineTournament,
  stage: Stage,
  pairings: Pairing[],
  startAt: Date,
  poolIdByGroup: Map<string, string>
): Promise<void> {
  const allCourts = courtNamesOf(t);
  const slotMinutes = t.gameDurationMin + 5;
  const groups = [...new Set(pairings.map((p) => p.groupKey))].sort();
  const stageConfig = stage.config as Record<string, unknown> | null;
  const courtMode: CourtMode = (stageConfig?.courtMode as CourtMode | undefined) ?? "sequential";
  // Heure de début optionnelle par groupe (ISO UTC), saisie dans l'onglet Étapes.
  const groupStartAt = (stageConfig?.groupStartAt ?? {}) as Record<string, string>;
  const groupStart = (g: string): Date | null => {
    const raw = groupStartAt[g];
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  };

  // Planifie un lot de pairings (rounds séquentiels) sur un jeu de terrains ;
  // retourne l'heure de fin (pour enchaîner un autre lot derrière).
  type Slotted = { p: Pairing; courtName: string; startAt: Date };
  const slotted: Slotted[] = [];
  const scheduleLot = (lot: Pairing[], courts: string[], from: Date): Date => {
    const rounds = new Map<number, Pairing[]>();
    for (const p of lot) {
      const arr = rounds.get(p.roundIndex) ?? [];
      arr.push(p);
      rounds.set(p.roundIndex, arr);
    }
    const idxs = [...rounds.keys()].sort((a, b) => a - b);
    const slots = scheduleRounds(idxs.map((r) => rounds.get(r)!.length), { courtNames: courts, slotMinutes, startAt: from });
    let end = from;
    idxs.forEach((r, ri) => {
      rounds.get(r)!.forEach((p, i) => {
        slotted.push({ p, courtName: slots[ri][i].courtName, startAt: slots[ri][i].startAt });
        const e = new Date(slots[ri][i].startAt.getTime() + slotMinutes * 60_000);
        if (e > end) end = e;
      });
    });
    return end;
  };

  if (groups.length <= 1 || courtMode === "mixed") {
    // Tous groupes confondus, round par round, sur tous les terrains.
    // Lot mono-groupe (ex: lancement séquentiel du groupe B seul) : son
    // horaire de début dédié s'applique quand même.
    const gs = groups.length === 1 ? groupStart(groups[0]) : null;
    scheduleLot(pairings, allCourts, gs && gs > startAt ? gs : startAt);
  } else if (courtMode === "dedicated") {
    // Chaque groupe a son/ses terrain(s) ; les groupes jouent en parallèle.
    // Si moins de terrains que de groupes, ceux qui partagent un terrain s'enchaînent.
    const courtCursor = new Map<string, Date>(); // clé = 1er terrain du groupe
    groups.forEach((g, gi) => {
      const myCourts = allCourts.length >= groups.length
        ? allCourts.filter((_, ci) => ci % groups.length === gi)
        : [allCourts[gi % allCourts.length]];
      const key = myCourts[0];
      const base = courtCursor.get(key) ?? startAt;
      const gs = groupStart(g);
      const from = gs && gs > base ? gs : base;
      const end = scheduleLot(pairings.filter((p) => p.groupKey === g), myCourts, from);
      courtCursor.set(key, end);
    });
  } else {
    // "sequential" (défaut) : groupe A d'abord (tous terrains), puis B, etc.
    let cursor = new Date(startAt);
    for (const g of groups) {
      const gs = groupStart(g);
      if (gs && gs > cursor) cursor = gs;
      cursor = scheduleLot(pairings.filter((p) => p.groupKey === g), allCourts, cursor);
    }
  }

  for (const { p, courtName, startAt: matchStart } of slotted) {
    await tx.match.create({
      data: {
        tournamentId: t.id,
        phase: "STAGE",
        stageId: stage.id,
        groupKey: p.groupKey || null,
        poolId: poolIdByGroup.get(p.groupKey) ?? null,
        roundIndex: p.roundIndex,
        positionInRound: p.positionInRound,
        courtName,
        startAt: matchStart,
        dayIndex: "SAT",
        status: p.teamBId === null ? "FINISHED" : "SCHEDULED", // BYE = terminé
        teamAId: p.teamAId,
        teamBId: p.teamBId,
      },
    });
  }
}

/**
 * Résout les entrées d'un cross-pool en préservant deux poules distinctes
 * (A et B), quelle que soit la façon dont l'orga a composé l'étape :
 *  - 2 sources (une par poule) → source 0 = A, source 1 = B ;
 *  - 1 source sans groupe précisé, venant d'une étape à plusieurs groupes →
 *    on récupère chaque poule d'origine séparément ;
 *  - 1 source d'un seul groupe → on coupe le classement en deux moitiés.
 * Renvoie [] si on ne peut pas former deux poules.
 */
function resolveCrossPoolEntries(t: PipelineTournament, rules: EntryRules): ResolvedEntry[] {
  const ctx = {
    registrationSeeds: [...t.teams].sort((a, b) => a.seed - b.seed).map((x) => x.id),
    stageStandings: (o: number, g?: string) => stageStandings(t, o, g),
  };

  // Cas 1 : plusieurs sources → une source = une poule.
  if (rules.sources.length > 1) {
    return resolveEntries(rules, ctx, { sourcesAsGroups: true });
  }

  // Cas 2 : une seule source. Si elle pointe une étape à plusieurs groupes
  // sans préciser lequel, on récupère chaque groupe d'origine.
  const src = rules.sources[0];
  if (src?.kind === "stageRanks" && !src.group) {
    const srcStage = t.stages.find((s) => s.order === src.stageOrder);
    const groupKeys = [...new Set((srcStage?.entries ?? []).map((e) => e.groupKey))]
      .filter((g) => g !== "")
      .sort();
    if (groupKeys.length >= 2) {
      const out: ResolvedEntry[] = [];
      const seen = new Set<string>();
      groupKeys.slice(0, 8).forEach((g, gi) => {
        const ranked = stageStandings(t, src.stageOrder, g).slice(src.from - 1, src.to);
        let slot = 1;
        for (const teamId of ranked) {
          if (seen.has(teamId)) continue;
          seen.add(teamId);
          out.push({ groupKey: GROUP_KEYS_CP[gi] ?? String(gi), slot: slot++, teamId });
        }
      });
      return out;
    }
  }

  // Cas 3 : une source mono-groupe → on coupe le classement en deux moitiés.
  const flat = resolveEntries({ ...rules, groups: 1 }, ctx).map((e) => e.teamId);
  if (flat.length < 2) return [];
  const half = Math.ceil(flat.length / 2);
  return flat.map((teamId, i) => ({
    groupKey: i < half ? "A" : "B",
    slot: (i < half ? i : i - half) + 1,
    teamId,
  }));
}

const GROUP_KEYS_CP = ["A", "B", "C", "D", "E", "F", "G", "H"];

/**
 * Historique des affrontements des étapes PRÉCÉDENTES, pour qu'un Swiss
 * cumulatif (carryPoints) n'apparie pas deux équipes qui se sont déjà
 * rencontrées en poules/croisement. Renvoie l'ensemble des pairKey.
 */
function priorMatchups(t: PipelineTournament, beforeOrder: number): Set<string> {
  const played = new Set<string>();
  for (const s of t.stages) {
    if (s.order >= beforeOrder) continue;
    for (const m of s.matches as unknown as Array<{ teamAId: string | null; teamBId: string | null }>) {
      if (m.teamAId && m.teamBId) played.add(pairKey(m.teamAId, m.teamBId));
    }
  }
  return played;
}

export async function launchStage(tournamentId: string, stageOrder: number): Promise<{ ok?: boolean; error?: string }> {
  const t = await getPipeline(tournamentId);
  if (!t) return { error: "Tournoi introuvable." };
  const stage = t.stages.find((s) => s.order === stageOrder);
  if (!stage) return { error: `Étape ${stageOrder} introuvable.` };
  if (stage.status !== "PENDING") return { error: `L'étape "${stage.name}" est déjà ${stage.status}.` };
  // On ne bloque que sur les étapes DONT celle-ci dépend (ses sources
  // stageRanks). Deux étapes indépendantes (ex: DE Top 8 et DE Bottom 8, qui
  // prennent chacune une moitié du Swiss) peuvent tourner EN PARALLÈLE.
  const rules = stage.entryRules as unknown as EntryRules;
  const dependsOn = new Set(
    rules.sources
      .filter((s): s is Extract<typeof s, { kind: "stageRanks" }> => s.kind === "stageRanks")
      .map((s) => s.stageOrder),
  );
  const blocking = t.stages.find(
    (s) => dependsOn.has(s.order) && s.status !== "DONE" && s.status !== "SKIPPED",
  );
  if (blocking) return { error: `L'étape "${blocking.name}" doit être terminée d'abord.` };

  const entries =
    stage.type === "CROSS_POOL"
      ? resolveCrossPoolEntries(t, rules)
      : resolveEntries(rules, {
          registrationSeeds: [...t.teams].sort((a, b) => a.seed - b.seed).map((x) => x.id),
          stageStandings: (o, g) => stageStandings(t, o, g),
        });
  if (entries.length < 2) return { error: "Pas assez d'équipes pour cette étape." };

  const startAt = stage.startAt ?? nextStartAt(t);
  const teamIdsBySlot = entries.sort((a, b) => (a.groupKey === b.groupKey ? a.slot - b.slot : a.groupKey.localeCompare(b.groupKey)));

  try {
    await prisma.$transaction(async (tx) => {
      await tx.stageEntry.deleteMany({ where: { stageId: stage.id } });
      await tx.stageEntry.createMany({
        data: teamIdsBySlot.map((e) => ({ stageId: stage.id, slot: e.slot, groupKey: e.groupKey, teamId: e.teamId })),
      });

      const groups = [...new Set(teamIdsBySlot.map((e) => e.groupKey))].sort();
      const byGroup = (g: string) => teamIdsBySlot.filter((e) => e.groupKey === g).map((e) => e.teamId);
      // Sessions séquentielles : le lancement ne génère QUE le premier groupe.
      // Les suivants se lancent explicitement (launchNextGroup) quand le
      // groupe en cours a terminé — le pattern "un groupe joue, l'autre arbitre".
      // Ne concerne que RR/SWISS (le cross-pool oppose les deux poules d'un bloc).
      const sequential =
        (stage.type === "RR" || stage.type === "SWISS") &&
        ((stage.config as { courtMode?: CourtMode } | null)?.courtMode ?? "sequential") === "sequential";
      const launchGroups = sequential && groups.length > 1 ? [groups[0]] : groups;

      switch (stage.type) {
        case "RR": {
          const cfg = stage.config as StageConfigByType["RR"];
          const pairings = rrRounds(launchGroups.map((g) => ({ key: g, teamIds: byGroup(g) })), {
            doubleRound: cfg.doubleRound,
            maxRounds: cfg.maxRounds,
          });
          const poolIdByGroup = await ensurePoolsForStage(tx, t.id, stage, teamIdsBySlot);
          await persistPairings(tx, t, stage, pairings, startAt, poolIdByGroup);
          break;
        }
        case "SWISS": {
          // Round 1 : appariement par ordre d'entrée (seed du stage). Si le
          // Swiss cumule les points (carryPoints), on évite aussi de rejouer
          // les matchs des étapes précédentes (poules, croisement…).
          const swissCfg = stage.config as StageConfigByType["SWISS"];
          const prior = swissCfg.carryPoints ? priorMatchups(t, stage.order) : new Set<string>();
          const pairings = launchGroups.flatMap((g) =>
            swissPairings(byGroup(g), new Set(prior), new Set(), 1, g)
          );
          const poolIdByGroup = await ensurePoolsForStage(tx, t.id, stage, teamIdsBySlot);
          await persistPairings(tx, t, stage, pairings, startAt, poolIdByGroup);
          break;
        }
        case "CROSS_POOL": {
          const cfg = stage.config as StageConfigByType["CROSS_POOL"];
          if (groups.length < 2) throw new Error("Cross-pool requiert 2 groupes en entrée.");
          const pairings = crossPoolPairings(byGroup(groups[0]), byGroup(groups[1]), cfg.opponents ?? 1);
          await persistPairings(tx, t, stage, pairings, startAt, new Map());
          break;
        }
        case "PLACEMENT": {
          const cfg = stage.config as StageConfigByType["PLACEMENT"];
          // Slots consécutifs appariés : (1v2), (3v4)… → places 1/2, 3/4…
          const flat = teamIdsBySlot.map((e) => e.teamId);
          const count = Math.min(cfg.count ?? Math.floor(flat.length / 2), Math.floor(flat.length / 2));
          const pairings: Pairing[] = [];
          for (let i = 0; i < count; i++) {
            pairings.push({ roundIndex: 1, positionInRound: i, groupKey: "", teamAId: flat[2 * i], teamBId: flat[2 * i + 1] });
          }
          await persistPairings(tx, t, stage, pairings, startAt, new Map());
          break;
        }
        case "SE": {
          const cfg = stage.config as StageConfigByType["SE"];
          const seeds = teamIdsBySlot.map((e) => e.teamId);
          await persistBracketPlan(tx, {
            tournamentId: t.id,
            plan: planSE(seeds.length, { thirdPlace: cfg.thirdPlace }),
            seededTeamIds: seeds,
            phase: "STAGE",
            stageId: stage.id,
            courtNames: courtNamesOf(t),
            startAt,
            gameDurationMin: t.gameDurationMin,
          });
          break;
        }
        case "DE": {
          const cfg = stage.config as StageConfigByType["DE"];
          const seeds = teamIdsBySlot.map((e) => e.teamId);
          await persistBracketPlan(tx, {
            tournamentId: t.id,
            plan: planDE(seeds.length, { gfReset: cfg.gfReset }),
            seededTeamIds: seeds,
            phase: "STAGE",
            stageId: stage.id,
            courtNames: courtNamesOf(t),
            startAt,
            gameDurationMin: t.gameDurationMin,
          });
          break;
        }
      }

      await tx.stage.update({ where: { id: stage.id }, data: { status: "ACTIVE", startAt } });
      if (t.status === "UPCOMING") {
        await tx.tournament.update({ where: { id: t.id }, data: { status: "LIVE" } });
      }
    }, { timeout: 30000 });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true };
}

// ─── Score + avancement ──────────────────────────────────────────────────────

export async function applyScore(
  matchId: string,
  scoreA: number,
  scoreB: number
): Promise<{ ok?: boolean; error?: string }> {
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: { stage: true } });
  if (!match || !match.stageId || !match.stage) return { error: "Match pipeline introuvable." };
  if (!match.teamAId || !match.teamBId) return { error: "Les deux équipes ne sont pas encore connues." };

  const isBracket = match.stage.type === "SE" || match.stage.type === "DE";
  if (isBracket && scoreA === scoreB) return { error: "Égalité interdite en bracket : un vainqueur est obligatoire." };

  const winnerId = scoreA > scoreB ? match.teamAId : scoreB > scoreA ? match.teamBId : null;
  const loserId = winnerId === null ? null : winnerId === match.teamAId ? match.teamBId : match.teamAId;

  await prisma.$transaction(async (tx) => {
    await tx.match.update({
      where: { id: matchId },
      data: { scoreA, scoreB, status: "FINISHED", winnerTeamId: winnerId },
    });

    // Propagation vainqueur/perdant (liens posés à la génération)
    if (winnerId && match.nextMatchWinId) {
      await tx.match.update({
        where: { id: match.nextMatchWinId },
        data: match.nextSlotWin === "A" ? { teamAId: winnerId } : { teamBId: winnerId },
      });
    }
    if (loserId && match.nextMatchLoseId && match.nextSlotLose) {
      await tx.match.update({
        where: { id: match.nextMatchLoseId },
        data: match.nextSlotLose === "A" ? { teamAId: loserId } : { teamBId: loserId },
      });
    }

    // Activation du GF reset : le joueur du LB (slot B) gagne la grande finale
    if (match.stage!.type === "DE" && match.bracketSide === "G" && winnerId === match.teamBId) {
      const bg = await tx.match.findFirst({ where: { stageId: match.stageId!, bracketSide: "BG" } });
      if (bg) {
        await tx.match.update({ where: { id: bg.id }, data: { teamAId: match.teamAId, teamBId: match.teamBId } });
      }
    }
  });

  return advanceStage(match.stageId);
}

/** Vérifie fin de round Swiss (génère le suivant), fin d'étape, fin de tournoi. */
export async function advanceStage(stageId: string): Promise<{ ok?: boolean; error?: string }> {
  const stage = await prisma.stage.findUnique({ where: { id: stageId }, include: { matches: true, entries: true } });
  if (!stage) return { error: "Étape introuvable." };
  const t = await getPipeline(stage.tournamentId);
  if (!t) return { error: "Tournoi introuvable." };

  const unfinished = stage.matches.filter((m) => m.status !== "FINISHED");

  // Swiss : round terminé → round suivant, PAR GROUPE (un groupe peut avancer
  // pendant que l'autre joue encore, ou n'est même pas lancé en mode séquentiel)
  if (stage.type === "SWISS" && stage.matches.length > 0) {
    const cfg = stage.config as StageConfigByType["SWISS"];
    // Swiss cumulatif : l'historique des rematchs part des étapes précédentes
    const played = cfg.carryPoints ? priorMatchups(t, stage.order) : new Set<string>();
    const hadBye = new Set<string>();
    for (const m of stage.matches) {
      if (m.teamAId && m.teamBId) played.add(pairKey(m.teamAId, m.teamBId));
      if (m.teamAId && !m.teamBId) hadBye.add(m.teamAId);
    }
    const launchedGroups = [...new Set(stage.matches.map((m) => m.groupKey ?? ""))].sort();
    const pairings: Pairing[] = [];
    for (const g of launchedGroups) {
      const gm = stage.matches.filter((m) => (m.groupKey ?? "") === g);
      if (gm.some((m) => m.status !== "FINISHED")) continue;
      const maxRound = Math.max(...gm.map((m) => m.roundIndex));
      if (maxRound >= cfg.rounds) continue;
      pairings.push(...swissPairings(stageStandings(t, stage.order, g === "" ? undefined : g), played, hadBye, maxRound + 1, g));
    }
    if (pairings.length > 0) {
      const startAt = nextStartAt(t);
      // Réutilise les Pool déjà créés au lancement (retrouvés via un match existant par groupKey)
      const poolIdByGroup = new Map<string, string>();
      for (const g of launchedGroups) {
        const withPool = stage.matches.find((m) => (m.groupKey ?? "") === g && m.poolId);
        if (withPool?.poolId) poolIdByGroup.set(g, withPool.poolId);
      }
      await prisma.$transaction(async (tx) => {
        await persistPairings(tx, t, stage, pairings, startAt, poolIdByGroup);
      }, { timeout: 20000 });
      return { ok: true };
    }
  }

  // Fin d'étape ?
  let done = false;
  if (stage.matches.length > 0 && unfinished.length === 0) {
    if (stage.type === "SWISS" || stage.type === "RR") {
      // Tous les groupes prévus doivent être lancés ET terminés (mode
      // séquentiel : le groupe B peut ne pas encore exister en matchs)
      const entryGroups = [...new Set(stage.entries.map((e) => e.groupKey))];
      const matchGroups = new Set(stage.matches.map((m) => m.groupKey ?? ""));
      const allGroupsLaunched = entryGroups.every((g) => matchGroups.has(g));
      if (stage.type === "SWISS") {
        const cfg = stage.config as StageConfigByType["SWISS"];
        done = allGroupsLaunched && entryGroups.every((g) => {
          const gm = stage.matches.filter((m) => (m.groupKey ?? "") === g);
          return gm.length > 0 && Math.max(...gm.map((m) => m.roundIndex)) >= cfg.rounds;
        });
      } else {
        done = allGroupsLaunched;
      }
    } else {
      done = true;
    }
  } else if (stage.type === "SE" || stage.type === "DE") {
    // Bracket : terminé quand la finale décisive est jouée (BG dormant ignoré)
    const g = stage.matches.find((m) => m.bracketSide === "G");
    const bg = stage.matches.find((m) => m.bracketSide === "BG");
    if (g?.status === "FINISHED") {
      const bgDormant = bg && !bg.teamAId && !bg.teamBId && g.winnerTeamId === g.teamAId;
      const bgDone = !bg || bg.status === "FINISHED" || bgDormant;
      const others = stage.matches.filter((m) => m.id !== g.id && m.id !== bg?.id);
      done = !!bgDone && others.every((m) => m.status === "FINISHED");
    }
  }

  if (done && stage.status === "ACTIVE") {
    await prisma.stage.update({ where: { id: stage.id }, data: { status: "DONE" } });
    const remaining = t.stages.filter((s) => s.id !== stage.id && s.status !== "DONE" && s.status !== "SKIPPED");
    if (remaining.length === 0) {
      await prisma.tournament.update({ where: { id: t.id }, data: { status: "COMPLETED" } });
    }
  }
  return { ok: true };
}

/**
 * Lance le prochain groupe non lancé d'une étape RR/SWISS active (mode
 * sessions séquentielles : le groupe A a été généré au lancement, les
 * suivants se lancent un par un quand l'orga le décide).
 */
export async function launchNextGroup(tournamentId: string, stageOrder: number): Promise<{ ok?: boolean; error?: string; group?: string }> {
  const t = await getPipeline(tournamentId);
  if (!t) return { error: "Tournoi introuvable." };
  const stage = t.stages.find((s) => s.order === stageOrder);
  if (!stage) return { error: `Étape ${stageOrder} introuvable.` };
  if (stage.status !== "ACTIVE") return { error: "L'étape doit être active." };
  if (stage.type !== "RR" && stage.type !== "SWISS") return { error: "Lancement par groupe réservé aux étapes Poules/Swiss." };

  const entryGroups = [...new Set(stage.entries.map((e) => e.groupKey))].sort();
  const matchGroups = new Set(stage.matches.map((m) => m.groupKey ?? ""));
  const next = entryGroups.find((g) => !matchGroups.has(g));
  if (!next) return { error: "Tous les groupes sont déjà lancés." };

  const teamIds = stage.entries
    .filter((e) => e.groupKey === next && e.teamId)
    .sort((a, b) => a.slot - b.slot)
    .map((e) => e.teamId as string);
  if (teamIds.length < 2) return { error: `Groupe ${next} : pas assez d'équipes.` };

  const carryPrior =
    stage.type === "SWISS" && (stage.config as StageConfigByType["SWISS"]).carryPoints
      ? priorMatchups(t, stage.order)
      : new Set<string>();
  const pairings: Pairing[] =
    stage.type === "RR"
      ? rrRounds([{ key: next, teamIds }], {
          doubleRound: (stage.config as StageConfigByType["RR"]).doubleRound,
          maxRounds: (stage.config as StageConfigByType["RR"]).maxRounds,
        })
      : swissPairings(teamIds, new Set(carryPrior), new Set(), 1, next);

  // Pool créée au lancement de l'étape (ensurePoolsForStage couvre tous les groupes)
  const pool = await prisma.pool.findFirst({
    where: { stageId: stage.id, teams: { some: { teamId: teamIds[0] } } },
    select: { id: true },
  });
  const poolIdByGroup = new Map<string, string>();
  if (pool) poolIdByGroup.set(next, pool.id);

  const startAt = nextStartAt(t);
  try {
    await prisma.$transaction(async (tx) => {
      await persistPairings(tx, t, stage, pairings, startAt, poolIdByGroup);
    }, { timeout: 20000 });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true, group: next };
}

// ─── Composition manuelle des groupes (avant lancement) ─────────────────────

/**
 * Prévisualise les entrées d'une étape PENDING : qui entrerait, dans quel
 * groupe, avec la répartition actuelle. Sert à l'UI de composition manuelle.
 */
export async function previewStageEntries(
  tournamentId: string,
  stageOrder: number
): Promise<{ entries?: Array<{ teamId: string; name: string; groupKey: string; slot: number }>; groups?: number; error?: string }> {
  const t = await getPipeline(tournamentId);
  if (!t) return { error: "Tournoi introuvable." };
  const stage = t.stages.find((s) => s.order === stageOrder);
  if (!stage) return { error: `Étape ${stageOrder} introuvable.` };

  const rules = stage.entryRules as unknown as EntryRules;
  const entries = resolveEntries(
    rules,
    {
      registrationSeeds: [...t.teams].sort((a, b) => a.seed - b.seed).map((x) => x.id),
      stageStandings: (o, g) => stageStandings(t, o, g),
    },
    { sourcesAsGroups: stage.type === "CROSS_POOL" },
  );
  const nameById = new Map(t.teams.map((x) => [x.id, x.name]));
  return {
    groups: Math.max(rules.groups ?? 1, 1),
    entries: entries.map((e) => ({ teamId: e.teamId, name: nameById.get(e.teamId) ?? "?", groupKey: e.groupKey, slot: e.slot })),
  };
}

/**
 * Enregistre la composition manuelle des groupes d'une étape PENDING
 * (teamId → lettre de groupe). Bascule groupAssign en "manual".
 */
export async function setStageManualGroups(
  tournamentId: string,
  stageOrder: number,
  assignments: Record<string, string>
): Promise<{ ok?: boolean; error?: string }> {
  const t = await getPipeline(tournamentId);
  if (!t) return { error: "Tournoi introuvable." };
  const stage = t.stages.find((s) => s.order === stageOrder);
  if (!stage) return { error: `Étape ${stageOrder} introuvable.` };
  if (stage.status !== "PENDING") return { error: "La composition ne peut être modifiée que sur une étape non lancée." };

  const rules = stage.entryRules as unknown as EntryRules;
  const updated: EntryRules = { ...rules, groupAssign: "manual", manualAssignments: assignments };
  await prisma.stage.update({
    where: { id: stage.id },
    data: { entryRules: updated as unknown as Prisma.InputJsonValue },
  });
  return { ok: true };
}

// ─── Édition des étapes (onglet Étapes du dashboard orga) ────────────────────
// Toutes ces mutations ne touchent que des étapes PENDING et revalident le
// pipeline COMPLET (zod + cohérence des références inter-étapes) avant d'écrire.

/** Défs candidates du pipeline courant, dans l'ordre. */
function pipelineDefs(t: PipelineTournament): Array<{ name: string; type: StageType; config: unknown; entryRules: unknown }> {
  return [...t.stages].sort((a, b) => a.order - b.order)
    .map((s) => ({ name: s.name, type: s.type, config: s.config, entryRules: s.entryRules }));
}

async function revalidateDefs(defs: Array<{ name: string; type: StageType; config: unknown; entryRules: unknown }>): Promise<string | null> {
  const { validateCustomPipeline } = await import("./pipeline-validation");
  const v = validateCustomPipeline(defs);
  return v.ok ? null : v.error;
}

/**
 * Modifie une étape non lancée : nom, type, config, règles d'entrée, horaire.
 * `startAt` : ISO UTC, ou null pour revenir à l'enchaînement automatique.
 */
export async function updateStageDef(
  tournamentId: string,
  stageOrder: number,
  patch: {
    name?: string;
    type?: StageType;
    config?: Record<string, unknown>;
    entryRules?: EntryRules;
    startAt?: string | null;
  }
): Promise<{ ok?: boolean; error?: string }> {
  const t = await getPipeline(tournamentId);
  if (!t) return { error: "Tournoi introuvable." };
  const stage = t.stages.find((s) => s.order === stageOrder);
  if (!stage) return { error: `Étape ${stageOrder} introuvable.` };
  if (stage.status !== "PENDING") return { error: "Seule une étape non lancée peut être modifiée — reset d'abord." };

  const defs = pipelineDefs(t);
  const idx = [...t.stages].sort((a, b) => a.order - b.order).findIndex((s) => s.id === stage.id);
  defs[idx] = {
    name: patch.name ?? stage.name,
    type: patch.type ?? stage.type,
    config: patch.config ?? stage.config,
    entryRules: patch.entryRules ?? stage.entryRules,
  };
  const err = await revalidateDefs(defs);
  if (err) return { error: err };

  let startAt: Date | null | undefined = undefined;
  if (patch.startAt !== undefined) {
    startAt = patch.startAt === null ? null : new Date(patch.startAt);
    if (startAt && isNaN(startAt.getTime())) return { error: "Horaire invalide." };
  }

  await prisma.stage.update({
    where: { id: stage.id },
    data: {
      name: defs[idx].name,
      type: defs[idx].type,
      config: defs[idx].config as Prisma.InputJsonValue,
      entryRules: defs[idx].entryRules as Prisma.InputJsonValue,
      ...(startAt !== undefined ? { startAt } : {}),
    },
  });
  return { ok: true };
}

/** Ajoute une étape (fournie par le client, comme dans le builder) en fin de pipeline. */
export async function addStageDef(
  tournamentId: string,
  def: { name: string; type: StageType; config: Record<string, unknown>; entryRules: EntryRules }
): Promise<{ ok?: boolean; error?: string }> {
  const t = await getPipeline(tournamentId);
  if (!t) return { error: "Tournoi introuvable." };

  const defs = [...pipelineDefs(t), def];
  const err = await revalidateDefs(defs);
  if (err) return { error: err };

  await prisma.stage.create({
    data: {
      tournamentId,
      order: t.stages.length,
      name: def.name,
      type: def.type,
      config: def.config as Prisma.InputJsonValue,
      entryRules: def.entryRules as unknown as Prisma.InputJsonValue,
    },
  });
  return { ok: true };
}

/**
 * Supprime une étape non lancée. Les références des étapes suivantes sont
 * renumérotées ; si une étape dépend de celle supprimée → erreur.
 */
export async function removeStageDef(tournamentId: string, stageOrder: number): Promise<{ ok?: boolean; error?: string }> {
  const t = await getPipeline(tournamentId);
  if (!t) return { error: "Tournoi introuvable." };
  const sorted = [...t.stages].sort((a, b) => a.order - b.order);
  const stage = sorted.find((s) => s.order === stageOrder);
  if (!stage) return { error: `Étape ${stageOrder} introuvable.` };
  if (stage.status !== "PENDING") return { error: "Seule une étape non lancée peut être supprimée — reset d'abord." };
  if (sorted.length <= 1) return { error: "Impossible de supprimer la dernière étape du pipeline." };

  // Décale les références stageOrder des étapes suivantes ; bloque si dépendance directe.
  const remaining = sorted.filter((s) => s.id !== stage.id);
  const shiftedRules: Array<EntryRules> = [];
  for (const s of remaining) {
    const rules = s.entryRules as unknown as EntryRules;
    const sources = rules.sources.map((src) => {
      if (src.kind !== "stageRanks") return src;
      if (src.stageOrder === stageOrder) return null;
      return src.stageOrder > stageOrder ? { ...src, stageOrder: src.stageOrder - 1 } : src;
    });
    if (sources.some((x) => x === null)) {
      return { error: `Impossible : l'étape "${s.name}" prend ses équipes dans "${stage.name}". Modifie ses sources d'abord.` };
    }
    shiftedRules.push({ ...rules, sources: sources as EntryRules["sources"] });
  }

  const defs = remaining.map((s, i) => ({ name: s.name, type: s.type, config: s.config, entryRules: shiftedRules[i] as unknown }));
  const err = await revalidateDefs(defs);
  if (err) return { error: err };

  await prisma.$transaction(async (tx) => {
    await tx.stage.delete({ where: { id: stage.id } });
    for (let i = 0; i < remaining.length; i++) {
      await tx.stage.update({
        where: { id: remaining[i].id },
        data: { order: i, entryRules: shiftedRules[i] as unknown as Prisma.InputJsonValue },
      });
    }
  });
  return { ok: true };
}

/** Échange une étape non lancée avec sa voisine (dir -1 = monter, +1 = descendre). */
export async function moveStageDef(tournamentId: string, stageOrder: number, dir: -1 | 1): Promise<{ ok?: boolean; error?: string }> {
  const t = await getPipeline(tournamentId);
  if (!t) return { error: "Tournoi introuvable." };
  const sorted = [...t.stages].sort((a, b) => a.order - b.order);
  const i = sorted.findIndex((s) => s.order === stageOrder);
  const j = i + dir;
  if (i < 0) return { error: `Étape ${stageOrder} introuvable.` };
  if (j < 0 || j >= sorted.length) return { error: "Déplacement impossible." };
  if (sorted[i].status !== "PENDING" || sorted[j].status !== "PENDING") {
    return { error: "Seules des étapes non lancées peuvent être déplacées." };
  }

  // Échange les positions puis remappe les références i↔j de toutes les étapes.
  const swapped = [...sorted];
  [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
  const remap = (o: number) => (o === i ? j : o === j ? i : o);
  const newRules = swapped.map((s) => {
    const rules = s.entryRules as unknown as EntryRules;
    return {
      ...rules,
      sources: rules.sources.map((src) => (src.kind === "stageRanks" ? { ...src, stageOrder: remap(src.stageOrder) } : src)),
    };
  });

  const defs = swapped.map((s, k) => ({ name: s.name, type: s.type, config: s.config, entryRules: newRules[k] as unknown }));
  const err = await revalidateDefs(defs);
  if (err) return { error: err };

  await prisma.$transaction(
    swapped.map((s, k) =>
      prisma.stage.update({
        where: { id: s.id },
        data: { order: k, entryRules: newRules[k] as unknown as Prisma.InputJsonValue },
      })
    )
  );
  return { ok: true };
}

// ─── Reset (étape N et toutes les suivantes) ─────────────────────────────────

export async function resetStages(tournamentId: string, fromOrder: number): Promise<{ ok?: boolean; error?: string }> {
  const t = await getPipeline(tournamentId);
  if (!t) return { error: "Tournoi introuvable." };
  const targets = t.stages.filter((s) => s.order >= fromOrder);

  await prisma.$transaction(async (tx) => {
    for (const s of targets) {
      await tx.matchEvent.deleteMany({ where: { match: { stageId: s.id } } });
      await tx.match.deleteMany({ where: { stageId: s.id } });
      await tx.poolTeam.deleteMany({ where: { pool: { stageId: s.id } } });
      await tx.pool.deleteMany({ where: { stageId: s.id } });
      await tx.stageEntry.deleteMany({ where: { stageId: s.id } });
      await tx.stage.update({ where: { id: s.id }, data: { status: "PENDING" } });
    }
    if (t.status === "COMPLETED") {
      await tx.tournament.update({ where: { id: tournamentId }, data: { status: "LIVE" } });
    }
  }, { timeout: 20000 });
  return { ok: true };
}

// ─── Rattrapage en cours de tournoi (onglet Étapes) ─────────────────────────

/**
 * Revient au round N d'une étape RR/SWISS active : efface les scores du round
 * N et supprime tous les rounds > N (Swiss les régénérera via advanceStage au
 * prochain score). Les Pool/StageEntry sont conservés (l'étape reste ACTIVE).
 * Pour un groupe donné (mode séquentiel) ou tous les groupes.
 */
export async function resetToRound(
  tournamentId: string,
  stageOrder: number,
  round: number,
  group?: string,
): Promise<{ ok?: boolean; error?: string }> {
  const t = await getPipeline(tournamentId);
  if (!t) return { error: "Tournoi introuvable." };
  const stage = t.stages.find((s) => s.order === stageOrder);
  if (!stage) return { error: `Étape ${stageOrder} introuvable.` };
  if (stage.type !== "RR" && stage.type !== "SWISS") {
    return { error: "Retour à un round réservé aux étapes Poules/Swiss (pour un bracket, utilise le reset de match)." };
  }
  if (stage.status !== "ACTIVE" && stage.status !== "DONE") {
    return { error: "L'étape n'est pas en cours." };
  }
  if (round < 1) return { error: "Numéro de round invalide." };

  const inScope = (m: { groupKey: string | null; roundIndex: number }) =>
    (group === undefined || (m.groupKey ?? "") === group);

  await prisma.$transaction(async (tx) => {
    // Rounds strictement après N : supprimés (Swiss/RR régénèrent au besoin)
    const toDelete = stage.matches.filter((m) => inScope(m) && m.roundIndex > round);
    if (toDelete.length > 0) {
      const ids = toDelete.map((m) => m.id);
      await tx.matchEvent.deleteMany({ where: { matchId: { in: ids } } });
      await tx.match.deleteMany({ where: { id: { in: ids } } });
    }
    // Round N : scores effacés, remis "à jouer" (BYE reste FINISHED)
    const toClear = stage.matches.filter((m) => inScope(m) && m.roundIndex === round && m.teamBId);
    for (const m of toClear) {
      await tx.matchEvent.deleteMany({ where: { matchId: m.id } });
      await tx.match.update({
        where: { id: m.id },
        data: { status: "SCHEDULED", scoreA: 0, scoreB: 0, winnerTeamId: null },
      });
    }
    // L'étape (et le tournoi) repassent en cours si besoin
    if (stage.status === "DONE") {
      await tx.stage.update({ where: { id: stage.id }, data: { status: "ACTIVE" } });
    }
    if (t.status === "COMPLETED") {
      await tx.tournament.update({ where: { id: tournamentId }, data: { status: "LIVE" } });
    }
  }, { timeout: 20000 });

  return { ok: true };
}

/**
 * Replanifie les matchs NON JOUÉS d'une étape active à partir de maintenant
 * (ou d'une heure donnée), sans toucher aux scores. Utile quand un tournoi
 * prend du retard. Conserve terrains et ordre logique (round/position).
 */
export async function rescheduleStage(
  tournamentId: string,
  stageOrder: number,
  fromISO?: string,
): Promise<{ ok?: boolean; error?: string }> {
  const t = await getPipeline(tournamentId);
  if (!t) return { error: "Tournoi introuvable." };
  const stage = t.stages.find((s) => s.order === stageOrder);
  if (!stage) return { error: `Étape ${stageOrder} introuvable.` };

  const from = fromISO ? new Date(fromISO) : new Date();
  if (isNaN(from.getTime())) return { error: "Horaire invalide." };

  const pending = stage.matches
    .filter((m) => m.status !== "FINISHED")
    .sort((a, b) => a.roundIndex - b.roundIndex || a.positionInRound - b.positionInRound);
  if (pending.length === 0) return { error: "Aucun match à replanifier (tous joués)." };

  const courts = courtNamesOf(t);
  const slotMinutes = t.gameDurationMin + 5;
  // Regroupe par round pour caler chaque round sur des créneaux successifs.
  const byRound = new Map<number, typeof pending>();
  for (const m of pending) {
    const arr = byRound.get(m.roundIndex) ?? [];
    arr.push(m);
    byRound.set(m.roundIndex, arr);
  }
  const rounds = [...byRound.keys()].sort((a, b) => a - b);

  await prisma.$transaction(async (tx) => {
    let cursor = new Date(from);
    for (const r of rounds) {
      const ms = byRound.get(r)!;
      for (let i = 0; i < ms.length; i++) {
        const court = courts[i % courts.length] ?? "Court 1";
        const start = new Date(cursor.getTime() + Math.floor(i / courts.length) * slotMinutes * 60_000);
        await tx.match.update({ where: { id: ms[i].id }, data: { courtName: court, startAt: start } });
      }
      const rows = Math.ceil(ms.length / courts.length);
      cursor = new Date(cursor.getTime() + rows * slotMinutes * 60_000);
    }
  }, { timeout: 20000 });

  return { ok: true };
}

// ─── Simulation (bac à sable) ────────────────────────────────────────────────

function randScore(allowDraw: boolean): [number, number] {
  let a = Math.floor(Math.random() * 6);
  let b = Math.floor(Math.random() * 6);
  if (!allowDraw && a === b) a += 1;
  return [a, b];
}

/** Joue tous les matchs actuellement jouables de l'étape active (une passe). */
export async function simulateOnePass(tournamentId: string): Promise<{ ok?: boolean; error?: string; played?: number }> {
  const t = await getPipeline(tournamentId);
  if (!t) return { error: "Tournoi introuvable." };
  const active = t.stages.find((s) => s.status === "ACTIVE");
  if (!active) return { error: "Aucune étape active — lance une étape d'abord." };

  const playable = active.matches
    .filter((m) => m.status !== "FINISHED" && m.teamAId && m.teamBId)
    .sort((a, b) => a.roundIndex - b.roundIndex || a.positionInRound - b.positionInRound);
  const isBracket = active.type === "SE" || active.type === "DE";

  let played = 0;
  for (const m of playable) {
    const fresh = await prisma.match.findUnique({ where: { id: m.id }, select: { status: true, teamAId: true, teamBId: true } });
    if (!fresh || fresh.status === "FINISHED" || !fresh.teamAId || !fresh.teamBId) continue;
    const [a, b] = randScore(!isBracket);
    const res = await applyScore(m.id, a, b);
    if (res.error) return { error: res.error, played };
    played++;
  }
  return { ok: true, played };
}

/** Simule l'étape active jusqu'à sa fin (lance la suivante en attente si aucune active). */
export async function simulateStage(tournamentId: string): Promise<{ ok?: boolean; error?: string }> {
  for (let guard = 0; guard < 60; guard++) {
    const t = await getPipeline(tournamentId);
    if (!t) return { error: "Tournoi introuvable." };
    let active = t.stages.find((s) => s.status === "ACTIVE");
    if (!active) {
      const next = t.stages.find((s) => s.status === "PENDING");
      if (!next) return { ok: true }; // tout est fini
      const launched = await launchStage(tournamentId, next.order);
      if (launched.error) return launched;
      continue;
    }
    const before = active.matches.filter((m) => m.status !== "FINISHED").length;
    const pass = await simulateOnePass(tournamentId);
    if (pass.error) return pass;
    const after = await prisma.stage.findUnique({ where: { id: active.id }, include: { matches: true } });
    if (after?.status === "DONE") return { ok: true };
    const stillUnfinished = after?.matches.filter((m) => m.status !== "FINISHED").length ?? 0;
    if ((pass.played ?? 0) === 0 && stillUnfinished >= before) {
      // Sessions séquentielles : le groupe en cours est fini, le suivant
      // attend son lancement — la simulation joue le rôle de l'orga.
      const nextGroup = await launchNextGroup(tournamentId, active.order);
      if (nextGroup.ok) continue;
      return { error: `Étape "${active.name}" bloquée : plus de matchs jouables mais pas terminée.` };
    }
  }
  return { error: "Simulation interrompue (garde de boucle)." };
}

/** Simule tout le tournoi jusqu'à COMPLETED. */
export async function simulateAll(tournamentId: string): Promise<{ ok?: boolean; error?: string }> {
  for (let guard = 0; guard < 30; guard++) {
    const t = await getPipeline(tournamentId);
    if (!t) return { error: "Tournoi introuvable." };
    if (t.status === "COMPLETED") return { ok: true };
    const res = await simulateStage(tournamentId);
    if (res.error) return res;
    const t2 = await getPipeline(tournamentId);
    if (t2?.status === "COMPLETED") return { ok: true };
    if (t2 && !t2.stages.some((s) => s.status === "PENDING" || s.status === "ACTIVE")) return { ok: true };
  }
  return { error: "Simulation interrompue (garde de boucle)." };
}
