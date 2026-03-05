import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isRateLimited, getIp } from "@/lib/rate-limit";
import { z } from "zod";
import { toSlug } from "@/lib/utils";

const playerSlotSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("existing"), playerId: z.string(), needsAccommodation: z.boolean().optional() }),
  z.object({
    type: z.literal("manual"),
    name: z.string().min(2),
    city: z.string().optional().nullable(),
    country: z.string().min(2),
    diets: z.array(z.enum(["OMNIVORE", "VEGETARIAN", "VEGAN", "GLUTEN_FREE"])).optional(),
    needsAccommodation: z.boolean().optional(),
  })
]);

const registerSchema = z.object({
  teamName: z.string().min(2),
  city: z.string().optional().nullable(),
  country: z.string().min(2),
  players: z.array(playerSlotSchema).min(1).max(3),
  captainIndex: z.number().int().min(0).optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  // Auth requise pour s'inscrire
  const session = await auth();
  if (!session?.user?.playerId) {
    return Response.json({ error: "Vous devez être connecté pour inscrire une équipe." }, { status: 401 });
  }

  // Rate limit : 10 inscriptions / 10 min par IP
  if (isRateLimited(getIp(request), 10, 10 * 60 * 1000)) {
    return Response.json({ error: "Trop de tentatives, réessayez dans quelques minutes." }, { status: 429 });
  }

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return Response.json({ error: "Tournoi introuvable" }, { status: 404 });
  if (!tournament.approved) return Response.json({ error: "Tournoi non encore approuvé" }, { status: 403 });

  const now = new Date();
  if (tournament.registrationStart && now < tournament.registrationStart) {
    return Response.json({ error: "Les inscriptions ne sont pas encore ouvertes." }, { status: 403 });
  }
  if (tournament.registrationEnd && now > tournament.registrationEnd) {
    return Response.json({ error: "Les inscriptions sont clôturées pour ce tournoi." }, { status: 403 });
  }

  const json = await request.json();
  const parsed = registerSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { teamName, city, country, players, captainIndex = 0 } = parsed.data;

  const existingCount = await prisma.team.count({ where: { tournamentId: params.id } });
  const seed = existingCount + 1;

  // Check: no duplicate playerIds in the same submission
  const existingSlots = players.filter((s) => s.type === "existing") as { type: "existing"; playerId: string }[];
  const uniqueIds = new Set(existingSlots.map((s) => s.playerId));
  if (uniqueIds.size < existingSlots.length) {
    return Response.json({ error: "Un même joueur ne peut pas apparaître deux fois dans la même équipe." }, { status: 400 });
  }

  // Resolve players (existing or create manual)
  const resolvedPlayerIds: string[] = [];
  const accommodationFlags: boolean[] = [];
  for (const slot of players) {
    if (slot.type === "existing") {
      const player = await prisma.player.findUnique({ where: { id: slot.playerId } });
      if (!player) return Response.json({ error: `Joueur ${slot.playerId} introuvable` }, { status: 400 });

      // Check: player already in a team for this tournament?
      const alreadyInTeam = await prisma.teamPlayer.findFirst({
        where: { playerId: slot.playerId, team: { tournamentId: params.id } }
      });
      if (alreadyInTeam) {
        return Response.json({ error: `${player.name} est déjà inscrit·e dans une équipe de ce tournoi.` }, { status: 400 });
      }

      resolvedPlayerIds.push(player.id);
      accommodationFlags.push(slot.needsAccommodation ?? false);
    } else {
      // Create a new player record (PENDING) with slug
      const base = toSlug(slot.name);
      let slug = base;
      let si = 2;
      while (await prisma.player.findUnique({ where: { slug } })) {
        slug = `${base}-${si++}`;
      }
      const created = await prisma.player.create({
        data: {
          name: slot.name,
          city: slot.city ?? null,
          country: slot.country,
          slug,
          status: "PENDING",
          badges: [],
          diets: slot.diets ?? [],
        }
      });
      resolvedPlayerIds.push(created.id);
      accommodationFlags.push(slot.needsAccommodation ?? false);
    }
  }

  // Create team + team players
  const team = await prisma.team.create({
    data: {
      tournamentId: params.id,
      name: teamName,
      city: city ?? null,
      country: country,
      seed,
      players: {
        create: resolvedPlayerIds.map((playerId, i) => ({
          playerId,
          isCaptain: i === captainIndex,
          needsAccommodation: accommodationFlags[i] ?? false,
        }))
      }
    },
    include: {
      players: { include: { player: true } }
    }
  });

  return Response.json(team, { status: 201 });
}
