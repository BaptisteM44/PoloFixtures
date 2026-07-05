/**
 * Persistance générique d'un BracketPlan (SE ou DE) en matchs Prisma,
 * avec planning multi-terrains et liens vainqueur/perdant câblés.
 * Sert au legacy (phase BRACKET) comme au pipeline (phase STAGE + stageId).
 */
import type { MatchPhase, Prisma } from "@prisma/client";
import type { BracketPlan } from "./bracket-core";

export type PersistPlanParams = {
  tournamentId: string;
  plan: BracketPlan;
  /** Équipes classées : index 0 = seed 1. */
  seededTeamIds: string[];
  phase: MatchPhase;
  stageId?: string | null;
  courtNames: string[];
  startAt: Date;
  gameDurationMin: number;
};

export async function persistBracketPlan(
  tx: Prisma.TransactionClient,
  params: PersistPlanParams
): Promise<{ created: number }> {
  const { tournamentId, plan, seededTeamIds, courtNames, startAt, gameDurationMin } = params;
  const slotMin = gameDurationMin + 5;
  const courts = Math.max(courtNames.length, 1);

  // Planning : matchs émis en ordre chronologique ; curseur avancé par round.
  const idByKey = new Map<string, string>();
  const groupSizes = new Map<string, number>();
  for (const m of plan.matches) {
    const g = `${m.side}${m.roundIndex}`;
    groupSizes.set(g, (groupSizes.get(g) ?? 0) + 1);
  }

  let roundStart = new Date(startAt);
  let prevGroup = "";
  let indexInRound = 0;
  let roundSize = 0;

  for (const m of plan.matches) {
    const group = `${m.side}${m.roundIndex}`;
    if (group !== prevGroup) {
      if (prevGroup !== "") {
        const prevRows = Math.ceil(roundSize / courts);
        roundStart = new Date(roundStart.getTime() + prevRows * slotMin * 60_000);
      }
      prevGroup = group;
      indexInRound = 0;
      roundSize = groupSizes.get(group) ?? 1;
    }

    const courtIdx = indexInRound % courts;
    const matchStart = new Date(roundStart.getTime() + Math.floor(indexInRound / courts) * slotMin * 60_000);
    indexInRound++;

    const created = await tx.match.create({
      data: {
        tournamentId,
        phase: params.phase,
        stageId: params.stageId ?? null,
        bracketSide: m.side,
        roundIndex: m.roundIndex,
        positionInRound: m.positionInRound,
        courtName: courtNames[courtIdx] ?? "Court 1",
        startAt: matchStart,
        dayIndex: "SUN",
        status: "SCHEDULED",
        teamAId: m.seedA !== null ? seededTeamIds[m.seedA - 1] ?? null : null,
        teamBId: m.seedB !== null ? seededTeamIds[m.seedB - 1] ?? null : null,
      },
    });
    idByKey.set(m.key, created.id);
  }

  for (const m of plan.matches) {
    if (!m.winTo && !m.loseTo) continue;
    const data: Record<string, unknown> = {};
    if (m.winTo) {
      data.nextMatchWinId = idByKey.get(m.winTo.key);
      data.nextSlotWin = m.winTo.slot;
    }
    if (m.loseTo) {
      data.nextMatchLoseId = idByKey.get(m.loseTo.key);
      data.nextSlotLose = m.loseTo.slot;
    }
    await tx.match.update({ where: { id: idByKey.get(m.key)! }, data });
  }

  return { created: plan.matches.length };
}
