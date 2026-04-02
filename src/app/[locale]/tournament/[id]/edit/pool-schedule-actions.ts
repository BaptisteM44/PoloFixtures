"use server";

import { prisma } from "@/lib/db";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { addMinutes } from "date-fns";

async function requireTournamentOrgaAccess(tournamentId: string): Promise<{ error: string } | null> {
  const playerId = await getOrgaPlayerId(tournamentId);
  if (!playerId) return { error: "Accès refusé." };
  return null;
}

/**
 * Recalculate pool match start times based on pool session start times
 * Takes into account: gameDurationMin + 4min break between matches
 */
export async function reschedulePoolMatchesAction(
  tournamentId: string,
  saturdayPoolAStart?: string | null,
  saturdayPoolBStart?: string | null
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      matches: {
        where: { phase: "POOL" },
        orderBy: [{ poolSessionIndex: "asc" }, { roundIndex: "asc" }, { startAt: "asc" }],
      },
    },
  });
  if (!tournament) return { error: "Tournoi introuvable." };

  const poolAStart = saturdayPoolAStart ? new Date(saturdayPoolAStart) : tournament.saturdayPoolAStart;
  const poolBStart = saturdayPoolBStart ? new Date(saturdayPoolBStart) : tournament.saturdayPoolBStart;

  if (!poolAStart && !poolBStart) return { error: "Aucune heure de début fournie." };

  const slotDuration = tournament.gameDurationMin + 4; // match + 4min break

  // Group matches by poolSessionIndex
  const matchesBySession = new Map<number, typeof tournament.matches>();
  for (const match of tournament.matches) {
    const sessionIdx = match.poolSessionIndex ?? 0;
    if (!matchesBySession.has(sessionIdx)) matchesBySession.set(sessionIdx, []);
    matchesBySession.get(sessionIdx)!.push(match);
  }

  // Recalculate startAt for each match
  const updates: Array<{ id: string; startAt: Date }> = [];
  for (const [sessionIdx, matches] of matchesBySession) {
    const sessionStart = sessionIdx === 0 ? poolAStart : poolBStart;
    if (!sessionStart) continue;

    let currentTime = new Date(sessionStart);
    for (const match of matches) {
      updates.push({ id: match.id, startAt: new Date(currentTime) });
      currentTime = addMinutes(currentTime, slotDuration);
    }
  }

  // Update all matches in transaction
  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      await tx.match.update({
        where: { id: update.id },
        data: { startAt: update.startAt },
      });
    }
  }, { timeout: 15000 });

  // Also update tournament start times
  if (saturdayPoolAStart || saturdayPoolBStart) {
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        ...(saturdayPoolAStart && { saturdayPoolAStart: new Date(saturdayPoolAStart) }),
        ...(saturdayPoolBStart && { saturdayPoolBStart: new Date(saturdayPoolBStart) }),
      },
    });
  }

  revalidatePath(`/tournament/${tournamentId}/edit`);
  return { ok: true };
}
