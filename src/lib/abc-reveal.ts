/**
 * ABC Chapeau — les équipes restent cachées au public tant que l'orga ne les
 * a pas dévoilées (Tournament.teamsRevealedAt). Lancer le tournoi les dévoile
 * aussi : jamais de matchs dont les équipes seraient cachées.
 * Seuls les orgas voient la composition avant le dévoilement.
 */
import type { Prisma } from "@prisma/client";
import { ABC_HAT_FORMAT } from "@/lib/format-label";

export function abcTeamsHidden(t: { format?: string | null; teamsRevealedAt?: Date | string | null; status?: string | null }): boolean {
  return t.format === ABC_HAT_FORMAT && !t.teamsRevealedAt && t.status !== "LIVE" && t.status !== "COMPLETED";
}

/** Filtre Prisma : tournois dont les équipes sont publiques (à combiner dans un `where` sur Tournament). */
export const teamsPublicWhere: Prisma.TournamentWhereInput = {
  OR: [
    { format: { not: ABC_HAT_FORMAT } },
    { teamsRevealedAt: { not: null } },
    { status: { in: ["LIVE", "COMPLETED"] } },
  ],
};
