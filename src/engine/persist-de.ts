/**
 * Adaptateur de persistance du moteur DE : transforme un BracketPlan en
 * matchs Prisma (phase BRACKET) avec planning terrains/horaires et liens
 * nextMatchWin/Lose câblés.
 *
 * Utilisé par generateBracketAction (et à terme par tous les formats à DE).
 */
import type { Prisma } from "@prisma/client";
import { planDE, type DEOptions } from "./de";
import { persistBracketPlan } from "./persist-plan";

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
 * Crée tous les matchs du bracket DE (legacy, phase BRACKET) dans la
 * transaction donnée. Délègue à persistBracketPlan.
 */
export async function createDEBracket(
  tx: Prisma.TransactionClient,
  params: PersistDEParams
): Promise<{ created: number }> {
  return persistBracketPlan(tx, {
    tournamentId: params.tournamentId,
    plan: planDE(params.seededTeamIds.length, params.options),
    seededTeamIds: params.seededTeamIds,
    phase: "BRACKET",
    courtNames: params.courtNames,
    startAt: params.startAt,
    gameDurationMin: params.gameDurationMin,
  });
}
