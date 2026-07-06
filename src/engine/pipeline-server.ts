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
import { resolveEntries, type EntryRules } from "./transitions";
import { pointsStandings, placementStandings, bracketStandings, type MatchLite, type ScoringConfig } from "./stage-standings";
import { rrRounds, swissPairings, crossPoolPairings, pairKey, type Pairing } from "./rounds";
import { planSE } from "./se";
import { planDE } from "./de";
import { persistBracketPlan } from "./persist-plan";
import { scheduleRounds } from "./scheduler";

// ─── Types de config par étape (stockés dans Stage.config) ──────────────────

export type StageConfigByType = {
  RR: { groups?: number; doubleRound?: boolean; maxRounds?: number };
  SWISS: { rounds: number; inheritFrom?: number };
  CROSS_POOL: { opponents: number };
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
      return pointsStandings(entryIds, matches, scoringOf(t));
    case "SWISS": {
      const cfg = stage.config as StageConfigByType["SWISS"];
      let all = [...matches];
      if (cfg.inheritFrom !== undefined) {
        const src = t.stages.find((s) => s.order === cfg.inheritFrom);
        if (src) {
          const entrySet = new Set(entryIds);
          const inherited = (src.matches as unknown as MatchLite[]).filter(
            (m) => m.teamAId && m.teamBId && entrySet.has(m.teamAId) && entrySet.has(m.teamBId)
          );
          all = [...inherited, ...matches];
        }
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
  // Rounds globaux : round r = tous les groupes confondus
  const rounds = new Map<number, Pairing[]>();
  for (const p of pairings) {
    const arr = rounds.get(p.roundIndex) ?? [];
    arr.push(p);
    rounds.set(p.roundIndex, arr);
  }
  const roundIdxs = [...rounds.keys()].sort((a, b) => a - b);
  const slots = scheduleRounds(
    roundIdxs.map((r) => rounds.get(r)!.length),
    { courtNames: courtNamesOf(t), slotMinutes: t.gameDurationMin + 5, startAt }
  );

  for (let ri = 0; ri < roundIdxs.length; ri++) {
    const roundPairings = rounds.get(roundIdxs[ri])!;
    for (let i = 0; i < roundPairings.length; i++) {
      const p = roundPairings[i];
      await tx.match.create({
        data: {
          tournamentId: t.id,
          phase: "STAGE",
          stageId: stage.id,
          groupKey: p.groupKey || null,
          poolId: poolIdByGroup.get(p.groupKey) ?? null,
          roundIndex: p.roundIndex,
          positionInRound: p.positionInRound,
          courtName: slots[ri][i].courtName,
          startAt: slots[ri][i].startAt,
          dayIndex: "SAT",
          status: p.teamBId === null ? "FINISHED" : "SCHEDULED", // BYE = terminé
          teamAId: p.teamAId,
          teamBId: p.teamBId,
        },
      });
    }
  }
}

export async function launchStage(tournamentId: string, stageOrder: number): Promise<{ ok?: boolean; error?: string }> {
  const t = await getPipeline(tournamentId);
  if (!t) return { error: "Tournoi introuvable." };
  const stage = t.stages.find((s) => s.order === stageOrder);
  if (!stage) return { error: `Étape ${stageOrder} introuvable.` };
  if (stage.status !== "PENDING") return { error: `L'étape "${stage.name}" est déjà ${stage.status}.` };
  const blocking = t.stages.find((s) => s.order < stageOrder && s.status !== "DONE" && s.status !== "SKIPPED");
  if (blocking) return { error: `L'étape "${blocking.name}" doit être terminée d'abord.` };

  const entries = resolveEntries(stage.entryRules as unknown as EntryRules, {
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

      switch (stage.type) {
        case "RR": {
          const cfg = stage.config as StageConfigByType["RR"];
          const pairings = rrRounds(groups.map((g) => ({ key: g, teamIds: byGroup(g) })), {
            doubleRound: cfg.doubleRound,
            maxRounds: cfg.maxRounds,
          });
          const poolIdByGroup = await ensurePoolsForStage(tx, t.id, stage, teamIdsBySlot);
          await persistPairings(tx, t, stage, pairings, startAt, poolIdByGroup);
          break;
        }
        case "SWISS": {
          // Round 1 : appariement par ordre d'entrée (seed du stage)
          const pairings = groups.flatMap((g) =>
            swissPairings(byGroup(g), new Set(), new Set(), 1, g)
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

  // Swiss : round terminé → round suivant
  if (stage.type === "SWISS" && unfinished.length === 0 && stage.matches.length > 0) {
    const cfg = stage.config as StageConfigByType["SWISS"];
    const maxRound = Math.max(...stage.matches.map((m) => m.roundIndex));
    if (maxRound < cfg.rounds) {
      const groups = [...new Set(stage.entries.map((e) => e.groupKey))].sort();
      const played = new Set<string>();
      const hadBye = new Set<string>();
      for (const m of stage.matches) {
        if (m.teamAId && m.teamBId) played.add(pairKey(m.teamAId, m.teamBId));
        if (m.teamAId && !m.teamBId) hadBye.add(m.teamAId);
      }
      const pairings = groups.flatMap((g) =>
        swissPairings(stageStandings(t, stage.order, g === "" ? undefined : g), played, hadBye, maxRound + 1, g)
      );
      const startAt = nextStartAt(t);
      // Réutilise les Pool déjà créés au lancement (retrouvés via un match existant par groupKey)
      const poolIdByGroup = new Map<string, string>();
      for (const g of groups) {
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
    done = stage.type !== "SWISS" || Math.max(...stage.matches.map((m) => m.roundIndex)) >= (stage.config as StageConfigByType["SWISS"]).rounds;
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
