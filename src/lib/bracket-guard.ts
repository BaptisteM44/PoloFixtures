/**
 * Corriger un résultat de tableau après coup : si le vainqueur (ou le perdant,
 * en double élimination) doit aller à une place du match suivant déjà occupée
 * par une AUTRE équipe, et que ce match suivant a commencé ou est joué, on
 * refuse. Sinon le tableau devenait incohérent sans rien dire (la demie
 * gardait son score avec une équipe qui ne l'avait pas jouée).
 * L'orga remet d'abord le match suivant à zéro, puis corrige.
 */
import { prisma } from "@/lib/db";

type Linked = {
  teamAId: string | null; teamBId: string | null;
  nextMatchWinId: string | null; nextSlotWin: string | null;
  nextMatchLoseId: string | null; nextSlotLose: string | null;
};

export async function downstreamConflict(match: Linked, winnerId: string | null): Promise<boolean> {
  if (!winnerId || !match.teamAId || !match.teamBId) return false;
  const loserId = winnerId === match.teamAId ? match.teamBId : match.teamAId;
  const targets: Array<[string | null, string | null, string]> = [
    [match.nextMatchWinId, match.nextSlotWin, winnerId],
    [match.nextMatchLoseId, match.nextSlotLose, loserId],
  ];
  for (const [nextId, slot, team] of targets) {
    if (!nextId || !slot) continue;
    const next = await prisma.match.findUnique({
      where: { id: nextId },
      select: { teamAId: true, teamBId: true, status: true, events: { where: { type: "START" }, select: { id: true }, take: 1 } },
    });
    if (!next) continue;
    const current = slot === "A" ? next.teamAId : next.teamBId;
    const started = next.status === "FINISHED" || (next.status === "LIVE" && next.events.length > 0);
    if (current && current !== team && started) return true;
  }
  return false;
}
