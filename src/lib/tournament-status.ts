import { TournamentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

type TournamentLite = {
  id: string;
  status: TournamentStatus;
  dateEnd: Date;
  usesPipeline?: boolean;
};

/**
 * Seuil horaire de fin : on ne considère un tournoi terminé qu'à partir de 21h
 * (heure locale du lieu) le jour de `dateEnd`. Évite qu'un tournoi bascule en
 * FINISHED en plein après-midi juste parce que tous les matchs sont saisis
 * (parties jouées en avance, bac à sable enchaîné, etc.).
 */
const END_HOUR_LOCAL = 21;
export function isAfterEndThreshold(dateEnd: Date, timezone: string | null, now: Date): boolean {
  // Composantes calendaires de dateEnd DANS le fuseau du tournoi (à défaut UTC).
  const tz = timezone || "UTC";
  let y: number, mo: number, d: number;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(dateEnd);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    y = get("year"); mo = get("month"); d = get("day");
  } catch {
    // Fuseau invalide → fallback UTC
    y = dateEnd.getUTCFullYear(); mo = dateEnd.getUTCMonth() + 1; d = dateEnd.getUTCDate();
  }
  // Instant "21h00 local" ce jour-là = on cherche l'UTC correspondant. On calcule
  // le décalage du fuseau à cette date via une sonde à midi UTC (stable, hors DST
  // edge de minuit), puis on pose l'heure cible.
  const probe = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  const offsetMin = tzOffsetMinutes(probe, tz);
  const thresholdUtcMs = Date.UTC(y, mo - 1, d, END_HOUR_LOCAL, 0, 0) - offsetMin * 60_000;
  return now.getTime() >= thresholdUtcMs;
}

// Décalage (minutes) du fuseau `tz` à l'instant `at` : (heure locale - UTC).
function tzOffsetMinutes(at: Date, tz: string): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const parts = dtf.formatToParts(at);
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
    return Math.round((asUtc - at.getTime()) / 60_000);
  } catch {
    return 0;
  }
}

/**
 * Pipeline (refonte formats) : terminé quand TOUTES ses étapes sont DONE/SKIPPED
 * ET qu'on a dépassé 21h (heure locale) le dernier jour. Sans le seuil horaire,
 * un tournoi dont tous les matchs sont saisis en avance basculait en FINISHED
 * en plein tournoi — retour terrain. Un format peut aussi déborder après 21h,
 * mais on garde le statut LIVE tant que les étapes ne sont pas toutes finies.
 */
async function isPipelineComplete(tournamentId: string, dateEnd: Date, timezone: string | null, now: Date): Promise<boolean> {
  const stages = await prisma.stage.findMany({
    where: { tournamentId },
    select: { status: true },
  });
  if (stages.length === 0) return false;
  const allStagesDone = stages.every((s) => s.status === "DONE" || s.status === "SKIPPED");
  return allStagesDone && isAfterEndThreshold(dateEnd, timezone, now);
}

export async function syncTournamentCompletionById(tournamentId: string): Promise<TournamentStatus | null> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, status: true, dateEnd: true, usesPipeline: true, timezone: true } as never,
  }) as (TournamentLite & { usesPipeline: boolean; timezone: string | null }) | null;

  if (!tournament) return null;
  if (tournament.status !== "LIVE") return tournament.status;

  const now = new Date();
  let shouldComplete: boolean;
  if (tournament.usesPipeline) {
    shouldComplete = await isPipelineComplete(tournamentId, tournament.dateEnd, tournament.timezone, now);
  } else {
    // Legacy : on ne passe COMPLETED qu'après 21h (heure locale) le jour de
    // dateEnd — jamais dès qu'un bracket final est joué. Un tournoi sur 2 jours
    // dont la finale du samedi est saisie ne doit pas basculer en « Terminé »
    // alors qu'il reste le dimanche. L'orga garde le bouton « Terminer » manuel.
    shouldComplete = isAfterEndThreshold(tournament.dateEnd, tournament.timezone, now);
  }
  if (!shouldComplete) return tournament.status;

  await prisma.tournament.update({
    where: { id: tournament.id },
    data: { status: "COMPLETED" },
  });

  return "COMPLETED";
}

export async function syncLiveTournamentsCompletion(): Promise<string[]> {
  const liveTournaments = await prisma.tournament.findMany({
    where: { status: "LIVE" },
    select: { id: true, status: true, dateEnd: true, usesPipeline: true, timezone: true } as never,
  }) as unknown as Array<TournamentLite & { usesPipeline: boolean; timezone: string | null }>;

  if (liveTournaments.length === 0) return [];

  const now = new Date();
  const pipelineTournaments = liveTournaments.filter((t) => t.usesPipeline);
  const pipelineIds = pipelineTournaments.map((t) => t.id);
  const legacyTournaments = liveTournaments.filter((t) => !t.usesPipeline);

  // Pipeline : terminé quand toutes les étapes sont DONE/SKIPPED ET qu'on a
  // dépassé 21h (heure locale) le dernier jour — pas avant (retour terrain).
  const pipelineIdsToComplete: string[] = [];
  if (pipelineIds.length > 0) {
    const stages = await prisma.stage.findMany({
      where: { tournamentId: { in: pipelineIds } },
      select: { tournamentId: true, status: true },
    });
    const stagesByTournament = new Map<string, { status: string }[]>();
    for (const s of stages) {
      const arr = stagesByTournament.get(s.tournamentId) ?? [];
      arr.push(s);
      stagesByTournament.set(s.tournamentId, arr);
    }
    for (const tm of pipelineTournaments) {
      const tmStages = stagesByTournament.get(tm.id) ?? [];
      const allDone = tmStages.length > 0 && tmStages.every((s) => s.status === "DONE" || s.status === "SKIPPED");
      if (allDone && isAfterEndThreshold(tm.dateEnd, tm.timezone, now)) {
        pipelineIdsToComplete.push(tm.id);
      }
    }
  }

  // Legacy : comme les pipelines, on ne termine qu'après 21h (heure locale) le
  // jour de dateEnd — jamais dès qu'un bracket final est joué (un tournoi sur 2
  // jours resterait LIVE le dimanche même si la finale du samedi est saisie).
  const legacyIdsToComplete = legacyTournaments
    .filter((t) => isAfterEndThreshold(t.dateEnd, t.timezone, now))
    .map((t) => t.id);

  const idsToComplete = [...pipelineIdsToComplete, ...legacyIdsToComplete];
  if (idsToComplete.length === 0) return [];

  await prisma.tournament.updateMany({
    where: { id: { in: idsToComplete }, status: "LIVE" },
    data: { status: "COMPLETED" },
  });

  return idsToComplete;
}
