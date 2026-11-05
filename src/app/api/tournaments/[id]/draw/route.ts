import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { apiMsg } from "@/lib/api-messages";
import { buildTriplets, nextTeamName } from "@/lib/abc-draw";
import { deleteAbcTeam } from "@/lib/abc-teams";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = session?.user?.role;
  const playerId = (session?.user as { playerId?: string } | undefined)?.playerId;
  if (!playerId) return Response.json({ error: apiMsg("not_logged_in") }, { status: 401 });

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    include: { coOrganizers: true },
  });
  if (!tournament) return Response.json({ error: apiMsg("tournament_not_found") }, { status: 404 });

  const isOrga =
    role === "ADMIN" ||
    tournament.creatorId === playerId ||
    tournament.coOrganizers.some((co) => co.playerId === playerId && co.role === "ORGA") ||
    (role === "ORGA" && (session?.user as { tournamentId?: string }).tournamentId === params.id);

  if (!isOrga) return Response.json({ error: apiMsg("access_denied") }, { status: 403 });

  if (tournament.format !== "ABC Chapeau") {
    return Response.json({ error: "Ce tournoi ne supporte pas le tirage ABC Chapeau." }, { status: 400 });
  }
  // Équipes validées : plus de relance possible (il faut déverrouiller d'abord)
  if (tournament.selectionLocked) {
    return Response.json({ error: apiMsg("draw_locked") }, { status: 409 });
  }

  // Récupérer tous les inscrits non-waitlisted
  const entries = await prisma.tournamentSoloEntry.findMany({
    where: { tournamentId: params.id, waitlisted: false },
    include: { player: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (entries.length < 3) {
    return Response.json({ error: "Il faut au moins 3 joueurs pour lancer un tirage." }, { status: 400 });
  }

  const triplets = buildTriplets(entries);

  // Relancer remplace toute la composition : on supprime les équipes déjà
  // tirées ou composées à la main (celles qui ont un inscrit solo), et les
  // équipes vides créées à la main (sinon elles restent en trop).
  await prisma.$transaction(async (tx) => {
    const previous = await tx.team.findMany({
      where: { tournamentId: params.id, OR: [{ soloEntries: { some: {} } }, { players: { none: {} } }] },
      select: { id: true },
    });
    for (const t of previous) await deleteAbcTeam(tx, t.id);

    const names = (await tx.team.findMany({ where: { tournamentId: params.id }, select: { name: true } })).map((t) => t.name);
    const maxSeed = (await tx.team.aggregate({ where: { tournamentId: params.id }, _max: { seed: true } }))._max.seed ?? 0;

    for (let i = 0; i < triplets.length; i++) {
      const triplet = triplets[i];
      const name = nextTeamName(names);
      names.push(name);
      const team = await tx.team.create({
        data: {
          tournamentId: params.id,
          name,
          seed: maxSeed + i + 1,
          players: { create: triplet.map((e) => ({ playerId: e.playerId, isCaptain: false })) },
        },
      });
      await tx.tournamentSoloEntry.updateMany({
        where: { id: { in: triplet.map((e) => e.id) } },
        data: { teamId: team.id },
      });
    }
  }, { timeout: 30_000 }); // une requête par équipe : la base distante dépasse vite les 5 s par défaut

  // Liste complète renvoyée : le panneau remplace ses équipes (avant, il
  // ajoutait les nouvelles aux anciennes déjà supprimées).
  const teams = await prisma.team.findMany({
    where: { tournamentId: params.id },
    select: { id: true, name: true },
    orderBy: { seed: "asc" },
  });
  const assigned = await prisma.tournamentSoloEntry.findMany({
    where: { tournamentId: params.id },
    select: { id: true, teamId: true },
  });

  return Response.json({ teams, entries: assigned });
}
