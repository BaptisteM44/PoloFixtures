/**
 * Adaptateur de persistance du moteur DE : transforme un BracketPlan en
 * matchs Prisma (phase BRACKET) avec planning terrains/horaires et liens
 * nextMatchWin/Lose câblés.
 *
 * Utilisé par generateBracketAction (et à terme par tous les formats à DE).
 */
import type { Prisma } from "@prisma/client";
import { planDE, type DEOptions } from "./de";

export type PersistDEParams = {
  tournamentId: string;
  /** Équipes classées : index 0 = seed 1. */
  seededTeamIds: string[];
  courtNames: string[];
  startAt: Date;
  gameDurationMin: number;
  options?: DEOptions;
};

/**
 * Crée tous les matchs du bracket DE dans la transaction donnée.
 * Deux passes : création (avec seeds directs pré-placés), puis liens.
 */
export async function createDEBracket(
  tx: Prisma.TransactionClient,
  params: PersistDEParams
): Promise<{ created: number }> {
  const { tournamentId, seededTeamIds, courtNames, startAt, gameDurationMin } = params;
  const plan = planDE(seededTeamIds.length, params.options);

  const slotMin = gameDurationMin + 5;
  const courts = Math.max(courtNames.length, 1);

  // ── Planning : les matchs sont émis en ordre chronologique par le moteur.
  // On avance le curseur de temps à chaque changement de (side, roundIndex).
  const idByKey = new Map<string, string>();
  let roundStart = new Date(startAt);
  let prevGroup = "";
  let indexInRound = 0;
  let roundSize = 0;

  // Pré-calcule la taille de chaque round pour avancer le curseur correctement
  const groupSizes = new Map<string, number>();
  for (const m of plan.matches) {
    const g = `${m.side}${m.roundIndex}`;
    groupSizes.set(g, (groupSizes.get(g) ?? 0) + 1);
  }

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
        phase: "BRACKET",
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

  // ── Passe 2 : liens vainqueur/perdant ──
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
