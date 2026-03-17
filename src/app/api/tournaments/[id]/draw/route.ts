import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";

const LEVEL_SCORE: Record<string, number> = {
  "C": 1, "C+": 2, "B-": 3, "B": 4, "B+": 5, "A-": 6, "A": 7, "A+": 8,
};

function getTier(level: string): "A" | "B" | "C" {
  const score = LEVEL_SCORE[level] ?? 4;
  if (score >= 6) return "A";
  if (score >= 3) return "B";
  return "C";
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = session?.user?.role;
  const playerId = (session?.user as { playerId?: string } | undefined)?.playerId;
  if (!playerId) return Response.json({ error: "Non connecté" }, { status: 401 });

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    include: { coOrganizers: true },
  });
  if (!tournament) return Response.json({ error: "Tournoi introuvable" }, { status: 404 });

  const isOrga =
    (role && hasAtLeastRole(role, "ORGA") && (session?.user as { tournamentId?: string }).tournamentId === params.id) ||
    role === "ADMIN" ||
    tournament.creatorId === playerId ||
    tournament.coOrganizers.some((co) => co.playerId === playerId);

  if (!isOrga) return Response.json({ error: "Accès refusé" }, { status: 403 });

  if (tournament.format !== "ABC Chapeau") {
    return Response.json({ error: "Ce tournoi ne supporte pas le tirage ABC Chapeau." }, { status: 400 });
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

  // Trier par score décroissant
  const sorted = [...entries].sort((a, b) => (LEVEL_SCORE[b.level] ?? 4) - (LEVEL_SCORE[a.level] ?? 4));

  // Séparer en tiers
  const tierA = sorted.filter((e) => getTier(e.level) === "A");
  const tierB = sorted.filter((e) => getTier(e.level) === "B");
  const tierC = sorted.filter((e) => getTier(e.level) === "C");

  // Former des triplets (snake draft équilibré)
  // Nombre d'équipes = floor(total / 3)
  const teamCount = Math.floor(entries.length / 3);
  const triplets: Array<typeof entries> = [];

  // On essaie de former teamCount équipes avec 1A + 1B + 1C
  // Si un tier est insuffisant, on comble avec le tier suivant
  const poolA = [...tierA];
  const poolB = [...tierB];
  const poolC = [...tierC];
  // Pool de surplus pour remplir
  const surplus: typeof entries = [];

  for (let i = 0; i < teamCount; i++) {
    const team: typeof entries = [];
    // Prendre 1 de chaque tier si disponible, sinon depuis surplus
    if (poolA.length > 0) team.push(poolA.shift()!);
    else if (surplus.length > 0) team.push(surplus.shift()!);

    if (poolB.length > 0) team.push(poolB.shift()!);
    else if (surplus.length > 0) team.push(surplus.shift()!);

    if (poolC.length > 0) team.push(poolC.shift()!);
    else if (surplus.length > 0) team.push(surplus.shift()!);

    // Compléter depuis les pools restants si équipe incomplète
    while (team.length < 3) {
      const fill = poolA.shift() ?? poolB.shift() ?? poolC.shift() ?? surplus.shift();
      if (!fill) break;
      team.push(fill);
    }

    if (team.length > 0) triplets.push(team);
  }

  // Supprimer les anciennes équipes formées par tirage (teamId set sur les soloEntries)
  // On crée de nouvelles équipes Team
  const existingCount = await prisma.team.count({ where: { tournamentId: params.id } });

  const createdTeams: Array<{ id: string; name: string; players: Array<{ playerId: string; name: string; level: string }> }> = [];

  for (let i = 0; i < triplets.length; i++) {
    const triplet = triplets[i];
    const teamName = `Équipe ${existingCount + i + 1}`;
    const team = await prisma.team.create({
      data: {
        tournamentId: params.id,
        name: teamName,
        seed: existingCount + i + 1,
        players: {
          create: triplet.map((e) => ({
            playerId: e.playerId,
            isCaptain: false,
          })),
        },
      },
    });

    // Mettre à jour teamId sur les soloEntries
    await prisma.tournamentSoloEntry.updateMany({
      where: {
        tournamentId: params.id,
        playerId: { in: triplet.map((e) => e.playerId) },
      },
      data: { teamId: team.id },
    });

    createdTeams.push({
      id: team.id,
      name: teamName,
      players: triplet.map((e) => ({
        playerId: e.playerId,
        name: e.player.name,
        level: e.level,
      })),
    });
  }

  return Response.json({ teams: createdTeams });
}
